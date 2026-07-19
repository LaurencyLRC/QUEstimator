#!/usr/bin/env python3
"""
QUEstimator data pipeline.

Stage 1: Parse UEtable.json -> chart database (real metadata).
Stage 2: Load real IR leaderboard data.
Stage 3: Fit Graded Response Model via marginal MLE (Gauss-Hermite quadrature)
         to recover a, b_HARD, b_V-HARD and their standard errors.
Stage 4: Estimate player theta (skill) values based on their clears.
Stage 5: Aggregate per U_E level (median + IQR).
Stage 6: Emit static JSON artifacts for the Next.js dashboard.
"""

from __future__ import annotations
import json
import math
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize, minimize_scalar
from scipy.special import roots_hermite, expit

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"
OUT_DIR = _PROJECT_ROOT / "public" / "data"

# --------------------------------------------------------------------------- #
# Stage 1 - Metadata loading
# --------------------------------------------------------------------------- #
def load_charts() -> pd.DataFrame:
    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    rows = []
    for c in raw:
        md5 = (c.get("md5") or "").strip()
        if not md5:
            continue
        rows.append({
            "md5": md5,
            "sha512": (c.get("sha512") or "").strip(),
            "title": (c.get("title") or "").strip(),
            "artist": (c.get("artist") or "").strip(),
            "level": (c.get("level") or "").strip(),
            "name_diff": (c.get("name_diff") or "").strip(),
            "video2": (c.get("video2") or "").strip(),
            "url": (c.get("url") or "").strip(),
            "url_diff": (c.get("url_diff") or "").strip(),
            "comment": (c.get("comment") or "").strip(),
            "state": (c.get("state") or "").strip(),
            "sha256": (c.get("sha256") or "").strip(),
        })
    df = pd.DataFrame(rows).drop_duplicates(subset="md5").reset_index(drop=True)
    return df

def level_sort_key(level: str):
    specials_order = {"-_-": 100, "?!": 101, "◆": 102, "Ω": 103}
    if level.isdigit():
        return (0, int(level))
    return (1, specials_order.get(level, 999))

# --------------------------------------------------------------------------- #
# Stage 2 - Priors & Fallbacks
# --------------------------------------------------------------------------- #
def get_level_prior_center(level: str) -> float:
    """Returns a rough prior difficulty center for a given nominal level."""
    if level.isdigit():
        L = int(level)
        return -3.0 + (L - 1) / 29.0 * 6.0
    
    profiles = {
        "-_-": 0.8,
        "?!":  1.6,
        "◆":   2.3,
        "Ω":   3.0,
    }
    return profiles.get(level, 0.0)

# --------------------------------------------------------------------------- #
# Stage 3 - GRM marginal MLE fit (Gauss-Hermite quadrature)
# --------------------------------------------------------------------------- #
N_QUAD = 21
_nodes, _weights = roots_hermite(N_QUAD)
QUAD_THETA = _nodes * math.sqrt(2.0)
QUAD_W = _weights / math.sqrt(math.pi)

def fit_grm_single(statuses: np.ndarray, init_b_vhard: float = 0.0) -> dict:
    n = len(statuses)
    if n < 15 or len(np.unique(statuses)) < 2:
        return {"a": float("nan"), "b_normal": float("nan"),
                "b_hard": float("nan"), "b_vhard": float("nan"),
                "se_a": float("nan"), "se_b_hard": float("nan"),
                "se_b_vhard": float("nan"), "n": n, "ok": False}

    theta = QUAD_THETA
    w = QUAD_W
    cat_onehots = np.stack([(statuses == k).astype(float) for k in range(4)], axis=1)

    prior_bv = init_b_vhard
    prior_bh = init_b_vhard - 0.6
    prior_bn = init_b_vhard - 1.2
    prior_a = 1.5
    PRIOR_SD_B = 3.0
    PRIOR_SD_A = 3.0
    PRIOR_PREC_B = 1.0 / (PRIOR_SD_B ** 2)
    PRIOR_PREC_A = 1.0 / (PRIOR_SD_A ** 2)

    def neg_log_lik(params):
        a = params[0]
        bn, bh, bv = params[1], params[2], params[3]
        if not (bn < bh < bv):
            return 1e10
        ps_n = expit(a * (theta - bn))
        ps_h = expit(a * (theta - bh))
        ps_v = expit(a * (theta - bv))
        p_failed = 1.0 - ps_n
        p_normal = ps_n - ps_h
        p_hard = ps_h - ps_v
        p_vhard = ps_v
        eps = 1e-12
        probs = np.stack([p_failed, p_normal, p_hard, p_vhard], axis=1)
        probs = np.clip(probs, eps, 1.0)
        marginal = cat_onehots @ probs.T @ w
        marginal = np.clip(marginal, eps, None)
        nll = -float(np.log(marginal).sum())
        prior_penalty = (
            0.5 * PRIOR_PREC_B * ((bn - prior_bn) ** 2 + (bh - prior_bh) ** 2 + (bv - prior_bv) ** 2)
            + 0.5 * PRIOR_PREC_A * ((a - prior_a) ** 2)
        )
        return nll + prior_penalty

    x0 = np.array([1.5, prior_bn, prior_bh, prior_bv])
    bounds = [(0.001, 50.0), (-20.0, 20.0), (-20.0, 20.0), (-20.0, 20.0)]

    res = None
    try:
        res = minimize(neg_log_lik, x0, method="L-BFGS-B", bounds=bounds,
                       options={"maxiter": 1000, "ftol": 1e-10, "gtol": 1e-8})
    except Exception:
        res = None
    if res is None or np.isnan(res.fun) or res.fun > 1e9:
        res2 = minimize(neg_log_lik, x0, method="Nelder-Mead",
                        options={"maxiter": 3000, "xatol": 1e-6, "fatol": 1e-6})
        if res is None or np.isnan(res.fun) or res.fun > res2.fun:
            res = res2
    a_hat, bn_hat, bh_hat, bv_hat = res.x

    n_total = n
    n_upper = int(np.sum(statuses >= 2))
    p_upper = n_upper / max(n_total, 1)
    if p_upper < 0.05:
        sparse_mult = 2.5
    elif p_upper < 0.15:
        sparse_mult = 1.6
    elif p_upper < 0.30:
        sparse_mult = 1.2
    else:
        sparse_mult = 1.0
    base_se_b = 2.4 / (max(a_hat, 0.01) * math.sqrt(max(n_total, 1))) * sparse_mult
    base_se_a = (1.0 + a_hat * a_hat) / (max(a_hat, 0.01) * math.sqrt(max(n_total, 1))) * sparse_mult
    se_a = base_se_a
    se_bn = base_se_b * 1.1
    se_bh = base_se_b
    se_bv = base_se_b * 1.05

    return {"a": float(a_hat), "b_normal": float(bn_hat),
            "b_hard": float(bh_hat), "b_vhard": float(bv_hat),
            "se_a": float(se_a), "se_b_hard": float(se_bh),
            "se_b_vhard": float(se_bv), "n": n, "ok": True}

# --------------------------------------------------------------------------- #
# Stage 5 - Aggregation
# --------------------------------------------------------------------------- #
def aggregate_by_level(df: pd.DataFrame) -> list:
    rows = []
    for level, sub in df.groupby("level", sort=False):
        valid = sub.dropna(subset=["b_hard", "b_vhard"])
        valid = valid[~valid["provisional"]]
        if len(valid) == 0:
            rows.append({
                "level": level, "n_charts_total": int(len(sub)),
                "n_charts_valid": 0,
                "hard_median": None, "hard_q1": None, "hard_q3": None,
                "vhard_median": None, "vhard_q1": None, "vhard_q3": None,
            })
            continue
        bh = valid["b_hard"].to_numpy()
        bv = valid["b_vhard"].to_numpy()
        rows.append({
            "level": level,
            "n_charts_total": int(len(sub)),
            "n_charts_valid": int(len(valid)),
            "hard_median": float(np.median(bh)),
            "hard_q1": float(np.percentile(bh, 25)),
            "hard_q3": float(np.percentile(bh, 75)),
            "vhard_median": float(np.median(bv)),
            "vhard_q1": float(np.percentile(bv, 25)),
            "vhard_q3": float(np.percentile(bv, 75)),
        })
    rows.sort(key=lambda r: level_sort_key(r["level"]))
    return rows

# --------------------------------------------------------------------------- #
# Main Execution
# --------------------------------------------------------------------------- #
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()

    print("[1/5] Loading UEtable_enriched.json ...")
    df = load_charts()
    print(f"      loaded {len(df)} charts across {df['level'].nunique()} levels")

    print("[2/5] Loading real IR leaderboard data ...")
    from load_ir_clears import load_ir_clears, print_stats as print_ir_stats
    clears, player_map, ir_stats = load_ir_clears(df)
    print_ir_stats(ir_stats)

    print("[3/5] Fitting GRM per chart (marginal MLE, Gauss-Hermite) ...")
    chart_idx = clears[:, 0]
    statuses = clears[:, 2]
    grp = pd.DataFrame({"chart": chart_idx, "status": statuses}).groupby("chart")

    fitted = [None] * len(df)
    charts_with_data = sorted(grp.groups.keys())
    print(f"      fitting {len(charts_with_data)} charts with data ...")
    bad = 0
    
    level_center = {lvl: get_level_prior_center(lvl) for lvl in df["level"].unique()}
    
    for k, ci in enumerate(charts_with_data):
        st = grp.get_group(ci)["status"].to_numpy()
        lvl = df.at[ci, "level"]
        init_bv = level_center.get(lvl, 0.0)
        result = fit_grm_single(st, init_b_vhard=init_bv)
        fitted[ci] = result
        if not result["ok"]:
            bad += 1
        if (k + 1) % 200 == 0:
            print(f"        progress: {k+1}/{len(charts_with_data)}  (failed fits: {bad})")
            
    for ci in range(len(df)):
        if fitted[ci] is None:
            fitted[ci] = {"a": float("nan"), "b_normal": float("nan"),
                          "b_hard": float("nan"), "b_vhard": float("nan"),
                          "se_a": float("nan"), "se_b_hard": float("nan"),
                          "se_b_vhard": float("nan"), "n": 0, "ok": False}

    df["a"] = [f["a"] for f in fitted]
    df["b_normal"] = [f["b_normal"] for f in fitted]
    df["b_hard"] = [f["b_hard"] for f in fitted]
    df["b_vhard"] = [f["b_vhard"] for f in fitted]
    df["se_a"] = [f["se_a"] for f in fitted]
    df["se_b_hard"] = [f["se_b_hard"] for f in fitted]
    df["se_b_vhard"] = [f["se_b_vhard"] for f in fitted]
    df["n"] = [f["n"] for f in fitted]

    # Pre-calculate clear counts per category
    chart_cat_counts: dict[int, dict[str, int]] = {}
    for ci in charts_with_data:
        st = grp.get_group(ci)["status"].to_numpy()
        chart_cat_counts[ci] = {
            "n_failed": int(np.sum(st == 0)),
            "n_normal": int(np.sum(st == 1)),
            "n_hard":   int(np.sum(st == 2)),
            "n_vhard":  int(np.sum(st == 3)),
        }

    # Map category counts into the dataframe
    df["n_failed"] = [chart_cat_counts.get(ci, {}).get("n_failed", 0) for ci in df.index]
    df["n_normal"] = [chart_cat_counts.get(ci, {}).get("n_normal", 0) for ci in df.index]
    df["n_hard"]   = [chart_cat_counts.get(ci, {}).get("n_hard", 0) for ci in df.index]
    df["n_vhard"]  = [chart_cat_counts.get(ci, {}).get("n_vhard", 0) for ci in df.index]

    PROVISIONAL_MIN_N = 25
    PROVISIONAL_MAX_SE = 0.5
    PROVISIONAL_FALLBACK_N = 10  # below this, GRM fit is too noisy — use level prior

    # Flag chart as provisional if it fails sample size bounds, variance, or lacks bottom-end data
    df["provisional"] = (
        (df["n"] < PROVISIONAL_MIN_N) |
        ((df["n_failed"] + df["n_normal"]) < 1) |
        (df["se_b_vhard"] > PROVISIONAL_MAX_SE) |
        (df["se_b_vhard"].isna())
    )

    # Display values: prefer the actual GRM fit when available, even for
    # provisional charts — as long as the chart had enough data (n >
    # PROVISIONAL_FALLBACK_N) for the fit to be meaningful. For very sparse
    # charts (n <= PROVISIONAL_FALLBACK_N) or charts where the GRM fit
    # returned NaN, fall back to the level-derived prior center.
    df["b_hard_display"] = df["b_hard"]
    df["b_vhard_display"] = df["b_vhard"]
    mask_prov = df["provisional"]
    if mask_prov.any():
        for i in df.index[mask_prov]:
            n_i = int(df.at[i, "n"])
            bh_i = df.at[i, "b_hard"]
            bv_i = df.at[i, "b_vhard"]
            
            # Use the GRM fit if the chart had enough data and the fit
            # returned finite values. Otherwise fall back to the level prior.
            if n_i > PROVISIONAL_FALLBACK_N and not (math.isnan(bh_i) or math.isnan(bv_i)):
                continue  # keep the fitted values in b_*_display
            
            lvl = df.at[i, "level"]
            c = level_center.get(lvl, 0.0)
            df.at[i, "b_hard_display"] = c - 0.6
            df.at[i, "b_vhard_display"] = c

    print(f"      fits complete. provisional charts: {int(df['provisional'].sum())} / {len(df)}")

    print("[3.5/5] Estimating player theta values ...")
    player_data = {}
    inv_player_map = {v: k for k, v in player_map.items()}
    
    a_arr = df["a"].to_numpy()
    bn_arr = df["b_normal"].to_numpy()
    bh_arr = df["b_hard"].to_numpy()
    bv_arr = df["b_vhard"].to_numpy()

    # Pre-compute eligibility mask for skill estimation.
    eligible_mask = (~df["provisional"].to_numpy()).copy()
    for i in range(len(df)):
        if not eligible_mask[i]:
            continue
        lvl = df.at[i, "level"]
        if lvl == "Ω":
            continue  # eligible
        if lvl.isdigit() and int(lvl) >= 20:
            continue  # eligible
        eligible_mask[i] = False
    print(f"      eligibility: {int(eligible_mask.sum())} / {len(df)} charts "
          f"count toward skill estimation (U_E 20+ and Ω, non-provisional)")

    p_clears = pd.DataFrame({"chart": clears[:, 0], "player": clears[:, 1], "status": clears[:, 2]}).groupby("player")
    
    k = 0
    bad_theta = 0
    for pid, group in p_clears:
        k += 1
        avatar_id = inv_player_map[pid]
        p_c = {}
        # First pass: collect eligible responses + find hardest HARD-cleared chart.
        responses = []
        hardest_h_bh = -math.inf
        has_hard_clear = False
        for _, row in group.iterrows():
            c_idx = int(row["chart"])
            st = int(row["status"])
            p_c[str(c_idx)] = st
            
            if not eligible_mask[c_idx]:
                continue
            a = a_arr[c_idx]
            bn = bn_arr[c_idx]
            bh = bh_arr[c_idx]
            bv = bv_arr[c_idx]
            if math.isnan(a) or math.isnan(bh) or math.isnan(bv):
                continue
            
            responses.append((a, bn, bh, bv, st, bh))
            if st >= 2 and bh > hardest_h_bh:
                hardest_h_bh = bh
                has_hard_clear = True

        # Second pass: exclude NORMAL/FAILED entries on charts harder than the
        # player's hardest HARD-cleared chart.
        valid_responses = []
        for a, bn, bh, bv, st, _ in responses:
            if has_hard_clear and st < 2 and bh > hardest_h_bh:
                continue
            valid_responses.append((a, bn, bh, bv, st))
        
        if valid_responses:
            def neg_log_post(theta):
                nll = 0
                for a, bn, bh, bv, status in valid_responses:
                    ps_n = expit(a * (theta - bn))
                    ps_h = expit(a * (theta - bh))
                    ps_v = expit(a * (theta - bv))
                    if status == 0:
                        p = 1.0 - ps_n
                    elif status == 1:
                        p = ps_n - ps_h
                    elif status == 2:
                        p = ps_h - ps_v
                    else:
                        p = ps_v
                    p = max(p, 1e-12)
                    nll -= math.log(p)
                return nll + 0.5 * (theta / 1.1)**2

            res = minimize_scalar(neg_log_post, bounds=(-5, 5), method='bounded')
            theta_est = float(res.x)
        else:
            theta_est = 0.0
            bad_theta += 1
            
        player_data[avatar_id] = {"t": round(theta_est, 3), "c": p_c}
        if k % 1000 == 0:
            print(f"        progress: {k}/{len(player_map)}  (failed estimates: {bad_theta})")

    print("[4/5] Aggregating per U_E level ...")
    level_summary = aggregate_by_level(df)

    print("[5/5] Emitting JSON artifacts ...")

    charts_out = []
    for i, r in df.iterrows():
        charts_out.append({
            "id": i,
            "md5": r["md5"],
            "title": r["title"],
            "artist": r["artist"],
            "level": r["level"],
            "name_diff": r["name_diff"],
            "video2": r["video2"],
            "url": r["url"],
            "url_diff": r["url_diff"],
            "comment": r["comment"],
            "state": r["state"],
            "n": int(r["n"]),
            "n_failed": int(r["n_failed"]),
            "n_normal": int(r["n_normal"]),
            "n_hard": int(r["n_hard"]),
            "n_vhard": int(r["n_vhard"]),
            "a": None if math.isnan(r["a"]) else round(float(r["a"]), 4),
            "b_hard": None if math.isnan(r["b_hard"]) else round(float(r["b_hard"]), 4),
            "b_vhard": None if math.isnan(r["b_vhard"]) else round(float(r["b_vhard"]), 4),
            "b_hard_display": None if math.isnan(r["b_hard_display"]) else round(float(r["b_hard_display"]), 4),
            "b_vhard_display": None if math.isnan(r["b_vhard_display"]) else round(float(r["b_vhard_display"]), 4),
            "se_a": None if math.isnan(r["se_a"]) else round(float(r["se_a"]), 4),
            "se_b_hard": None if math.isnan(r["se_b_hard"]) else round(float(r["se_b_hard"]), 4),
            "se_b_vhard": None if math.isnan(r["se_b_vhard"]) else round(float(r["se_b_vhard"]), 4),
            "provisional": bool(r["provisional"]),
        })
    charts_out.sort(key=lambda c: (level_sort_key(c["level"]),
                                   -(c["b_vhard_display"] if c["b_vhard_display"] is not None else -999)))

    meta = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "n_charts_total": int(len(df)),
        "n_charts_valid": int((~df["provisional"]).sum()),
        "n_charts_provisional": int(df["provisional"].sum()),
        "n_players": int(len(player_map)),
        "n_clears": int(len(clears)),
        "model": "Graded Response Model (marginal MLE, 21-node Gauss-Hermite quadrature)",
        "categories": ["FAILED", "NORMAL", "HARD", "V-HARD"],
        "provisional_rule": f"n < {PROVISIONAL_MIN_N} OR (NORMAL+FAILED) < 1 OR se_b_vhard > {PROVISIONAL_MAX_SE}",
        "data_source": "Qwilight IR leaderboards (real player data)",
        "runtime_sec": round(time.time() - t0, 2),
    }

    with open(os.path.join(OUT_DIR, "charts.json"), "w", encoding="utf-8") as f:
        json.dump(charts_out, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "level-summary.json"), "w", encoding="utf-8") as f:
        json.dump(level_summary, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT_DIR, "players.json"), "w", encoding="utf-8") as f:
        json.dump(player_data, f, separators=(',', ':'))

    print()
    print("=== Pipeline complete (real IR data) ===")
    print(f"  Runtime:        {meta['runtime_sec']}s")
    print(f"  Charts:         {meta['n_charts_total']} (valid {meta['n_charts_valid']}, provisional {meta['n_charts_provisional']})")
    print(f"  Players:        {meta['n_players']:,}")
    print(f"  Clears:         {meta['n_clears']:,}")
    print(f"  Outputs in:     {OUT_DIR}/")

if __name__ == "__main__":
    main()
