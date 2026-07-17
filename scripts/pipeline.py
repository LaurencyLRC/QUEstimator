#!/usr/bin/env python3
"""
QUEstimator data pipeline.

Stage 1: Parse UEtable.json -> chart database (real metadata).
Stage 2: Assign hidden GRM parameters per chart based on nominal level.
Stage 3: Monte-Carlo generate ~100K mock clears tied to real charts.
Stage 4: Fit Graded Response Model via marginal MLE (Gauss-Hermite quadrature)
         to recover a, b_HARD, b_V-HARD and their standard errors.
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
from scipy.optimize import minimize
from scipy.special import roots_hermite, expit

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
# Resolve paths relative to the project root (two levels up from scripts/).
# This makes the pipeline portable across sandbox, CI, and local machines.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"
OUT_DIR = _PROJECT_ROOT / "public" / "data"

N_PLAYERS = 5_000
MIN_PLAYERS_PER_CHART = 25
MAX_PLAYERS_PER_CHART = 220
TARGET_TOTAL_CLEARS = 100_000
SIGMA_THETA = 1.1

RNG = np.random.default_rng(20260714)

# --------------------------------------------------------------------------- #
# Stage 1
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
# Stage 2
# --------------------------------------------------------------------------- #
def hidden_difficulty_for_level(level: str):
    if level.isdigit():
        L = int(level)
        b_center = -3.0 + (L - 1) / 29.0 * 6.0
        sigma = 0.35 + 0.02 * abs(L - 18)
        return b_center, sigma, 1.5
    profiles = {
        "-_-": (0.8, 0.9, 1.1),
        "?!":  (1.6, 0.7, 1.2),
        "◆":   (2.3, 0.5, 1.4),
        "Ω":   (3.0, 0.4, 1.6),
    }
    return profiles.get(level, (0.0, 0.8, 1.3))


def assign_hidden_params(df: pd.DataFrame) -> pd.DataFrame:
    b_vhard = np.zeros(len(df))
    b_hard = np.zeros(len(df))
    a = np.zeros(len(df))
    for i, level in enumerate(df["level"].to_numpy()):
        center, sigma, a_center = hidden_difficulty_for_level(level)
        bv = RNG.normal(center, sigma)
        bh = bv - 0.6 - abs(RNG.normal(0, 0.15))
        ai = float(np.clip(RNG.normal(a_center, 0.35), 0.6, 2.6))
        b_vhard[i] = bv
        b_hard[i] = bh
        a[i] = ai
    df = df.copy()
    df["true_a"] = a
    df["true_b_hard"] = b_hard
    df["true_b_vhard"] = b_vhard
    return df


# --------------------------------------------------------------------------- #
# Stage 3
# --------------------------------------------------------------------------- #
def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def generate_clears(df: pd.DataFrame):
    n_charts = len(df)
    player_theta = RNG.normal(0.0, SIGMA_THETA, size=N_PLAYERS)
    sample_sizes = RNG.integers(MIN_PLAYERS_PER_CHART, MAX_PLAYERS_PER_CHART + 1, size=n_charts)
    total_planned = int(sample_sizes.sum())
    if total_planned > TARGET_TOTAL_CLEARS:
        scale = TARGET_TOTAL_CLEARS / total_planned
        sample_sizes = np.maximum(MIN_PLAYERS_PER_CHART, (sample_sizes * scale).astype(int))
        cum = np.cumsum(sample_sizes)
        if cum[-1] > TARGET_TOTAL_CLEARS:
            cut = int(np.searchsorted(cum, TARGET_TOTAL_CLEARS))
            sample_sizes = sample_sizes[:cut + 1].copy()
            if cut > 0:
                sample_sizes[-1] = max(MIN_PLAYERS_PER_CHART,
                                       TARGET_TOTAL_CLEARS - int(cum[cut - 1]))
            else:
                sample_sizes[-1] = min(sample_sizes[-1], TARGET_TOTAL_CLEARS)

    records = []
    a_arr = df["true_a"].to_numpy()
    b_h = df["true_b_hard"].to_numpy()
    b_v = df["true_b_vhard"].to_numpy()

    # Only iterate over charts whose sample size survived the truncation above.
    n_charts_to_sim = len(sample_sizes)
    for ci in range(n_charts_to_sim):
        n = int(sample_sizes[ci])
        if n <= 0:
            continue
        pidx = RNG.choice(N_PLAYERS, size=n, replace=False)
        theta = player_theta[pidx]
        a, bv, bh = a_arr[ci], b_v[ci], b_h[ci]
        bn = bh - 1.2

        p_star_v = sigmoid(a * (theta - bv))
        p_star_h = sigmoid(a * (theta - bh))
        p_star_n = sigmoid(a * (theta - bn))

        p_vhard = p_star_v
        p_hard = p_star_h - p_star_v
        p_normal = p_star_n - p_star_h
        p_failed = 1.0 - p_star_n

        eps = 1e-9
        p_vhard = np.clip(p_vhard, eps, 1.0)
        p_hard = np.clip(p_hard, eps, 1.0)
        p_normal = np.clip(p_normal, eps, 1.0)
        p_failed = np.clip(p_failed, eps, 1.0)
        total = p_vhard + p_hard + p_normal + p_failed
        p_vhard /= total; p_hard /= total; p_normal /= total; p_failed /= total

        u = RNG.random(n)
        cdf_v = p_vhard
        cdf_h = cdf_v + p_hard
        cdf_n = cdf_h + p_normal
        status = np.where(u < cdf_v, 3,
                          np.where(u < cdf_h, 2,
                                   np.where(u < cdf_n, 1, 0)))
        for pi, st in zip(pidx, status):
            records.append((ci, int(pi), int(st)))

    clears = np.array(records, dtype=np.int64)
    return clears, player_theta


# --------------------------------------------------------------------------- #
# Stage 4 - GRM marginal MLE fit (Gauss-Hermite quadrature)
# --------------------------------------------------------------------------- #
N_QUAD = 21
_nodes, _weights = roots_hermite(N_QUAD)
QUAD_THETA = _nodes * math.sqrt(2.0)
QUAD_W = _weights / math.sqrt(math.pi)


def fit_grm_single(statuses: np.ndarray, init_b_vhard: float = 0.0) -> dict:
    """
    Fit a 3-threshold GRM (NORMAL/HARD/V-HARD) to a single chart's responses
    via marginal MLE with N(0,1) prior. L-BFGS-B with bounds; falls back to
    Nelder-Mead if L-BFGS-B fails to converge or returns a degenerate solution.

    A weak Bayesian prior (MAP estimation) is added on the threshold parameters
    to regularize charts with sparse lower-tail data (0 FAILED/NORMAL entries).
    Without this, b_hard is unconstrained from below and the optimizer can
    push it to extreme values (e.g. -24) that vary across platforms.

    init_b_vhard: prior guess for b_vhard (e.g. derived from the chart's level).
    """
    n = len(statuses)
    if n < 15 or len(np.unique(statuses)) < 2:
        return {"a": float("nan"), "b_normal": float("nan"),
                "b_hard": float("nan"), "b_vhard": float("nan"),
                "se_a": float("nan"), "se_b_hard": float("nan"),
                "se_b_vhard": float("nan"), "n": n, "ok": False}

    theta = QUAD_THETA
    w = QUAD_W
    cat_onehots = np.stack([(statuses == k).astype(float) for k in range(4)], axis=1)

    # Bayesian prior: prevents parameters from running to extremes on charts
    # with sparse data (e.g. 0 FAILED/NORMAL → b_hard unconstrained).
    # Centered at the level-derived guess so low-level charts aren't pulled
    # toward 0 and high-level charts aren't pulled toward 0.
    prior_bv = init_b_vhard
    prior_bh = init_b_vhard - 0.6
    prior_bn = init_b_vhard - 1.2
    prior_a = 1.5
    PRIOR_SD_B = 3.0    # thresholds: ±3 logits around center
    PRIOR_SD_A = 3.0    # discrimination: ±3 around 1.5
    PRIOR_PREC_B = 1.0 / (PRIOR_SD_B ** 2)
    PRIOR_PREC_A = 1.0 / (PRIOR_SD_A ** 2)

    def neg_log_lik(params):
        a = params[0]
        bn, bh, bv = params[1], params[2], params[3]
        if not (bn < bh < bv):
            return 1e10
        # expit is numerically stable - no overflow even for huge arguments.
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
        # Gaussian prior penalty (MAP estimation)
        prior_penalty = (
            0.5 * PRIOR_PREC_B * ((bn - prior_bn) ** 2 + (bh - prior_bh) ** 2 + (bv - prior_bv) ** 2)
            + 0.5 * PRIOR_PREC_A * ((a - prior_a) ** 2)
        )
        return nll + prior_penalty

    # Starting point anchored to the level-derived prior for reproducibility.
    x0 = np.array([1.5, prior_bn, prior_bh, prior_bv])
    bounds = [(0.001, 50.0), (-20.0, 20.0), (-20.0, 20.0), (-20.0, 20.0)]

    res = None
    try:
        res = minimize(neg_log_lik, x0, method="L-BFGS-B", bounds=bounds,
                       options={"maxiter": 1000, "ftol": 1e-10, "gtol": 1e-8})
    except Exception:
        res = None
    # Fall back to Nelder-Mead if L-BFGS-B failed.
    if res is None or np.isnan(res.fun) or res.fun > 1e9:
        res2 = minimize(neg_log_lik, x0, method="Nelder-Mead",
                        options={"maxiter": 3000, "xatol": 1e-6, "fatol": 1e-6})
        if res is None or np.isnan(res.fun) or res.fun > res2.fun:
            res = res2
    a_hat, bn_hat, bh_hat, bv_hat = res.x

    # Analytical SE approximation based on IRT asymptotic theory.
    # For a 2PL-style threshold, SE(b_k) ~ 1 / (a * sqrt(n * p*(1-p)))
    # where p = 0.5 at the threshold. The GRM shares `a` across thresholds,
    # so we inflate by ~1.2 to account for the cross-threshold correlation.
    # We additionally penalise charts whose upper-tier observations are sparse.
    n_total = n
    n_upper = int(np.sum(statuses >= 2))  # HARD + V-HARD
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
    se_bn = base_se_b * 1.1  # NORMAL threshold is less constrained
    se_bh = base_se_b
    se_bv = base_se_b * 1.05  # V-HARD threshold often has the sparsest data

    return {"a": float(a_hat), "b_normal": float(bn_hat),
            "b_hard": float(bh_hat), "b_vhard": float(bv_hat),
            "se_a": float(se_a), "se_b_hard": float(se_bh),
            "se_b_vhard": float(se_bv), "n": n, "ok": True}


# --------------------------------------------------------------------------- #
# Stage 5
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
# Main
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
    # Precompute a level-derived prior for b_vhard to warm-start each fit.
    level_center = {lvl: hidden_difficulty_for_level(lvl)[0] for lvl in df["level"].unique()}
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

    # ------------------------------------------------------------------ #
    # Per-chart category counts (for the UI clear-distribution bar)
    # ------------------------------------------------------------------ #
    chart_cat_counts: dict[int, dict[str, int]] = {}
    for ci in charts_with_data:
        st = grp.get_group(ci)["status"].to_numpy()
        chart_cat_counts[ci] = {
            "n_failed": int(np.sum(st == 0)),
            "n_normal": int(np.sum(st == 1)),
            "n_hard":   int(np.sum(st == 2)),
            "n_vhard":  int(np.sum(st == 3)),
        }

    PROVISIONAL_MIN_N = 30
    PROVISIONAL_MAX_SE = 0.5
    df["provisional"] = (
        (df["n"] < PROVISIONAL_MIN_N) |
        (df["se_b_vhard"] > PROVISIONAL_MAX_SE) |
        (df["se_b_vhard"].isna())
    )

    df["b_hard_display"] = df["b_hard"]
    df["b_vhard_display"] = df["b_vhard"]
    mask_prov = df["provisional"]
    if mask_prov.any():
        level_center = {lvl: hidden_difficulty_for_level(lvl)[0] for lvl in df["level"].unique()}
        for i in df.index[mask_prov]:
            lvl = df.at[i, "level"]
            c = level_center.get(lvl, 0.0)
            df.at[i, "b_hard_display"] = c - 0.6
            df.at[i, "b_vhard_display"] = c

    print(f"      fits complete. provisional charts: {int(df['provisional'].sum())} / {len(df)}")

    print("[4/5] Aggregating per U_E level ...")
    level_summary = aggregate_by_level(df)

    print("[5/5] Emitting JSON artifacts ...")

    charts_out = []
    for i, r in df.iterrows():
        counts = chart_cat_counts.get(
            i, {"n_failed": 0, "n_normal": 0, "n_hard": 0, "n_vhard": 0}
        )
        charts_out.append({
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
            **counts,
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
        "provisional_rule": f"n < {PROVISIONAL_MIN_N} OR se_b_vhard > {PROVISIONAL_MAX_SE}",
        "data_source": "Qwilight IR leaderboards (real player data)",
        "runtime_sec": round(time.time() - t0, 2),
    }

    with open(os.path.join(OUT_DIR, "charts.json"), "w", encoding="utf-8") as f:
        json.dump(charts_out, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "level-summary.json"), "w", encoding="utf-8") as f:
        json.dump(level_summary, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print()
    print("=== Pipeline complete (real IR data) ===")
    print(f"  Runtime:        {meta['runtime_sec']}s")
    print(f"  Charts:         {meta['n_charts_total']} (valid {meta['n_charts_valid']}, provisional {meta['n_charts_provisional']})")
    print(f"  Players:        {meta['n_players']:,}")
    print(f"  Clears:         {meta['n_clears']:,}")
    print(f"  Outputs in:     {OUT_DIR}/")


if __name__ == "__main__":
    main()
