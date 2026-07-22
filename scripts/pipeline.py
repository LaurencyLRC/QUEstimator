#!/usr/bin/env python3
"""
QUEstimator data pipeline.

Stage 1: Parse UEtable.json -> chart database (real metadata).
Stage 2: Load real IR leaderboard data.
Stage 3: Fit Bayesian Graded Response Model via MCMC (NUTS) using numpyro.
         This jointly estimates player abilities, chart difficulties, and discrimination,
         incorporating the U_E nominal levels as an informative prior.
         Uses 4 chains with convergence diagnostics (R̂, ESS).
         Identifiability is enforced via a tight Normal(0, 0.5) prior on θ
         and deterministic initialization across all chains.
Stage 4: Extract posterior means and standard errors.
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

# Configure JAX to use multiple CPU threads for parallel chains.
# Must be called before any numpyro/jax operations.
import numpyro
numpyro.set_host_device_count(min(4, os.cpu_count() or 1))

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"
OUT_DIR = _PROJECT_ROOT / "public" / "data"

# MCMC settings — generous for a weekly batch job where time is not a concern.
# 4 chains enable R̂ convergence diagnostics.
# 2000 warmup gives NUTS enough steps to adapt step size + mass matrix
# across ~6000 chart parameters + player θ's.
# 4000 samples/chain → 16000 total draws → high ESS even with slow mixing.
MCMC_WARMUP = 2000
MCMC_SAMPLES = 4000
MCMC_CHAINS = 4

# Convergence thresholds
R_HAT_THRESHOLD = 1.05
ESS_THRESHOLD = 200

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
# Stage 3 - Bayesian GRM with MCMC
# --------------------------------------------------------------------------- #
def run_mcmc(clears: np.ndarray, df: pd.DataFrame, n_players: int):
    import jax
    import jax.numpy as jnp
    import numpyro
    import numpyro.distributions as dist
    from numpyro.infer import MCMC, NUTS, init_to_value

    n_charts = len(df)

    chart_idx = clears[:, 0]
    player_idx = clears[:, 1]
    y = clears[:, 2]

    level_num = np.zeros(n_charts)
    is_gimmick = np.zeros(n_charts, dtype=bool)

    for i, row in df.iterrows():
        lvl = row["level"]
        if lvl == "Ω":
            level_num[i] = 31.0
        elif lvl.isdigit():
            level_num[i] = float(lvl)
        else:
            is_gimmick[i] = True

    def model(player_idx, chart_idx, y, level_num, is_gimmick, n_players, n_charts):
        # Hyperparameters for the linear prior mapping
        # Maps [1, 31] roughly to [-3, +3] standard deviations on the ability axis
        a = numpyro.sample("prior_a", dist.Normal(-3.0, 2.0))
        b = numpyro.sample("prior_b", dist.Normal(0.2, 0.2))

        # Prior location anchored to numerical rank
        loc = a + b * level_num
        loc = jnp.where(is_gimmick, 0.0, loc)
        scale = jnp.where(is_gimmick, 3.0, 0.4)  # Tight adherence for 1-31 scale, loose for gimmicks

        with numpyro.plate("charts", n_charts):
            # The primary difficulty anchor for the chart (V-HARD)
            delta = numpyro.sample("delta", dist.Normal(loc, scale))

            # Chart discrimination (gatekeeping severity)
            alpha = numpyro.sample("alpha", dist.LogNormal(0, 0.5))

            # Distance bounds for intermediate gauges
            tau1 = numpyro.sample("tau1", dist.HalfNormal(1.0))
            tau2 = numpyro.sample("tau2", dist.HalfNormal(1.0))

        with numpyro.plate("players", n_players):
            # Player skill — Normal(0, 0.5) pins the θ scale firmly.
            # This breaks the alpha-theta multiplicative degeneracy:
            # the sampler cannot compensate small α with large θ (or vice versa)
            # without paying a steep prior cost.
            theta = numpyro.sample("theta", dist.Normal(0, 0.5))

        # Unroll into respective cutpoints
        beta3 = delta
        beta2 = delta - tau2
        beta1 = delta - tau2 - tau1

        # Subset parameters by index
        theta_obs = theta[player_idx]
        alpha_obs = alpha[chart_idx]
        beta1_obs = beta1[chart_idx]
        beta2_obs = beta2[chart_idx]
        beta3_obs = beta3[chart_idx]

        c1 = alpha_obs * beta1_obs
        c2 = alpha_obs * beta2_obs
        c3 = alpha_obs * beta3_obs
        cutpoints = jnp.stack([c1, c2, c3], axis=-1)

        with numpyro.plate("data", len(y)):
            numpyro.sample("obs", dist.OrderedLogistic(alpha_obs * theta_obs, cutpoints), obs=y)

    # Deterministic initialization: all 4 chains start at the same point.
    # This ensures they explore the same mode of the posterior.
    # They still sample independently (different PRNG keys per chain),
    # but they won't diverge into different scaling basins.
    init_delta = -3.0 + 0.2 * level_num
    init_strategy = init_to_value(values={
        "prior_a": -3.0,
        "prior_b": 0.2,
        "delta": init_delta,
        "alpha": np.ones(n_charts) * 1.0,
        "tau1": np.ones(n_charts) * 0.8,
        "tau2": np.ones(n_charts) * 0.8,
        "theta": np.zeros(n_players),
    })

    print(f"      compiling and running NUTS MCMC ({MCMC_CHAINS} chains, "
          f"{MCMC_WARMUP} warmup, {MCMC_SAMPLES} samples/chain)...")
    mcmc = MCMC(
        NUTS(model, init_strategy=init_strategy),
        num_warmup=MCMC_WARMUP,
        num_samples=MCMC_SAMPLES,
        num_chains=MCMC_CHAINS,
        chain_method="sequential",  # Explicit: run chains one after another on CPU
        progress_bar=True
    )

    mcmc.run(
        jax.random.PRNGKey(42),
        player_idx=jnp.array(player_idx),
        chart_idx=jnp.array(chart_idx),
        y=jnp.array(y),
        level_num=jnp.array(level_num),
        is_gimmick=jnp.array(is_gimmick),
        n_players=n_players,
        n_charts=n_charts
    )

    return mcmc


def check_convergence(mcmc) -> dict:
    """
    Compute convergence diagnostics (R̂ and ESS) from multi-chain samples.
    Returns a dict with diagnostics and per-parameter flags.
    """
    import numpyro.diagnostics as diag

    samples = mcmc.get_samples(group_by_chain=True)

    # Compute R̂ and ESS for each parameter
    diagnostics = {}
    bad_rhat = {}
    low_ess = {}

    for param_name, param_samples in samples.items():
        # param_samples shape: (n_chains, n_samples, ...)
        original_shape = param_samples.shape[2:]  # event dimensions
        if len(original_shape) == 0:
            # Scalar parameter
            rhat = float(diag.gelman_rubin(param_samples))
            ess = float(diag.effective_sample_size(param_samples))
            diagnostics[param_name] = {"r_hat": rhat, "n_eff": ess}
            if rhat > R_HAT_THRESHOLD:
                bad_rhat[param_name] = rhat
            if ess < ESS_THRESHOLD:
                low_ess[param_name] = ess
        else:
            # Vector parameter (e.g., delta[1476], theta[2818])
            n_chains, n_samp = param_samples.shape[:2]
            flat = param_samples.reshape(n_chains, n_samp, -1)
            n_elements = flat.shape[2]

            # Compute R̂ and ESS for each element
            rhats = np.array([
                float(diag.gelman_rubin(flat[:, :, i:i+1].squeeze(-1)))
                for i in range(n_elements)
            ])
            esses = np.array([
                float(diag.effective_sample_size(flat[:, :, i:i+1].squeeze(-1)))
                for i in range(n_elements)
            ])

            diagnostics[param_name] = {
                "r_hat_max": float(rhats.max()),
                "r_hat_mean": float(rhats.mean()),
                "n_eff_min": float(esses.min()),
                "n_eff_mean": float(esses.mean()),
                "n_elements": n_elements,
                "n_bad_rhat": int((rhats > R_HAT_THRESHOLD).sum()),
                "n_low_ess": int((esses < ESS_THRESHOLD).sum()),
            }

            # Track worst offenders
            for i in range(n_elements):
                if rhats[i] > R_HAT_THRESHOLD:
                    bad_rhat[f"{param_name}[{i}]"] = float(rhats[i])
                if esses[i] < ESS_THRESHOLD:
                    low_ess[f"{param_name}[{i}]"] = float(esses[i])

    # Overall convergence assessment
    r_hat_max = max(
        (d.get("r_hat_max", d.get("r_hat", 0.0)) for d in diagnostics.values()),
        default=1.0
    )
    ess_min = min(
        (d.get("n_eff_min", d.get("n_eff", float("inf"))) for d in diagnostics.values()),
        default=float("inf")
    )
    convergence_ok = (r_hat_max < R_HAT_THRESHOLD) and (ess_min >= ESS_THRESHOLD)

    # Print summary
    print(f"      convergence diagnostics:")
    print(f"        R̂ max:  {r_hat_max:.4f}  (threshold: {R_HAT_THRESHOLD})")
    print(f"        ESS min: {ess_min:.0f}  (threshold: {ESS_THRESHOLD})")
    print(f"        Convergence: {'✅ OK' if convergence_ok else '⚠️  POOR'}")

    if bad_rhat:
        print(f"        Parameters with R̂ > {R_HAT_THRESHOLD}: {len(bad_rhat)}")
        for k, v in list(bad_rhat.items())[:5]:
            print(f"          {k}: R̂ = {v:.4f}")
        if len(bad_rhat) > 5:
            print(f"          ... and {len(bad_rhat) - 5} more")

    if low_ess:
        print(f"        Parameters with ESS < {ESS_THRESHOLD}: {len(low_ess)}")
        for k, v in list(low_ess.items())[:5]:
            print(f"          {k}: ESS = {v:.0f}")
        if len(low_ess) > 5:
            print(f"          ... and {len(low_ess) - 5} more")

    return {
        "r_hat_max": r_hat_max,
        "ess_min": ess_min,
        "convergence_ok": convergence_ok,
        "n_bad_rhat": len(bad_rhat),
        "n_low_ess": len(low_ess),
        "diagnostics": diagnostics,
    }


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

    print("[1/6] Loading UEtable_enriched.json ...")
    df = load_charts()
    print(f"      loaded {len(df)} charts across {df['level'].nunique()} levels")

    print("[2/6] Loading real IR leaderboard data ...")
    import sys
    sys.path.insert(0, str(_PROJECT_ROOT / "scripts"))
    from load_ir_clears import load_ir_clears, print_stats as print_ir_stats
    clears, player_map, ir_stats = load_ir_clears(df)
    print_ir_stats(ir_stats)

    print(f"[3/6] Fitting Bayesian GRM via MCMC (numpyro NUTS, {MCMC_CHAINS} chains) ...")
    mcmc = run_mcmc(clears, df, len(player_map))

    # --- Convergence diagnostics ---
    print("[4/6] Checking convergence (R̂, ESS) ...")
    convergence = check_convergence(mcmc)

    # Extract samples (flatten chains)
    samples = mcmc.get_samples()

    a_mean = np.array(samples["alpha"].mean(axis=0))
    a_se = np.array(samples["alpha"].std(axis=0))

    delta_mean = np.array(samples["delta"].mean(axis=0))
    delta_se = np.array(samples["delta"].std(axis=0))

    tau1_mean = np.array(samples["tau1"].mean(axis=0))
    tau2_mean = np.array(samples["tau2"].mean(axis=0))

    b_vhard = delta_mean
    b_hard = delta_mean - tau2_mean
    b_normal = delta_mean - tau2_mean - tau1_mean

    se_b_vhard = delta_se
    b_hard_samples = samples["delta"] - samples["tau2"]
    se_b_hard = np.array(b_hard_samples.std(axis=0))

    df["a"] = a_mean
    df["b_normal"] = b_normal
    df["b_hard"] = b_hard
    df["b_vhard"] = b_vhard
    df["se_a"] = a_se
    df["se_b_hard"] = se_b_hard
    df["se_b_vhard"] = se_b_vhard

    chart_idx = clears[:, 0]
    statuses = clears[:, 2]
    grp = pd.DataFrame({"chart": chart_idx, "status": statuses}).groupby("chart")

    chart_cat_counts: dict[int, dict[str, int]] = {}
    for ci in grp.groups.keys():
        st = grp.get_group(ci)["status"].to_numpy()
        chart_cat_counts[ci] = {
            "n_failed": int(np.sum(st == 0)),
            "n_normal": int(np.sum(st == 1)),
            "n_hard":   int(np.sum(st == 2)),
            "n_vhard":  int(np.sum(st == 3)),
            "n_total":  len(st)
        }

    df["n_failed"] = [chart_cat_counts.get(ci, {}).get("n_failed", 0) for ci in df.index]
    df["n_normal"] = [chart_cat_counts.get(ci, {}).get("n_normal", 0) for ci in df.index]
    df["n_hard"]   = [chart_cat_counts.get(ci, {}).get("n_hard", 0) for ci in df.index]
    df["n_vhard"]  = [chart_cat_counts.get(ci, {}).get("n_vhard", 0) for ci in df.index]
    df["n"]        = [chart_cat_counts.get(ci, {}).get("n_total", 0) for ci in df.index]

    PROVISIONAL_MIN_N = 10
    PROVISIONAL_MAX_SE = 1.0

    df["provisional"] = (
        (df["n"] < PROVISIONAL_MIN_N) |
        (df["se_b_hard"] > PROVISIONAL_MAX_SE) |
        (df["se_b_hard"].isna())
    )

    df["b_hard_display"] = df["b_hard"]
    df["b_vhard_display"] = df["b_vhard"]

    print(f"      fits complete. provisional charts: {int(df['provisional'].sum())} / {len(df)}")

    print("[5/6] Extracting player theta values ...")
    theta_mean = np.array(samples["theta"].mean(axis=0))
    theta_std = float(np.std(theta_mean))
    player_data = {}
    inv_player_map = {v: k for k, v in player_map.items()}

    p_clears = pd.DataFrame({"chart": clears[:, 0], "player": clears[:, 1], "status": clears[:, 2]}).groupby("player")

    for pid, group in p_clears:
        avatar_id = inv_player_map[pid]
        p_c = {str(int(row["chart"])): int(row["status"]) for _, row in group.iterrows()}
        player_data[avatar_id] = {
            "t": round(float(theta_mean[pid]), 3),
            "c": p_c
        }

    print("[6/6] Aggregating per U_E level & emitting JSON artifacts ...")
    level_summary = aggregate_by_level(df)

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
                                   -(c["b_hard_display"] if c["b_hard_display"] is not None else -999)))

    meta = {
        "generated_at": pd.Timestamp.now("UTC").isoformat(),
        "n_charts_total": int(len(df)),
        "n_charts_valid": int((~df["provisional"]).sum()),
        "n_charts_provisional": int(df["provisional"].sum()),
        "n_players": int(len(player_map)),
        "n_clears": int(len(clears)),
        "model": "Bayesian Graded Response Model (MCMC NUTS)",
        "categories": ["FAILED", "NORMAL", "HARD", "V-HARD"],
        "provisional_rule": f"n < {PROVISIONAL_MIN_N} OR se_b_hard > {PROVISIONAL_MAX_SE}",
        "player_theta_mean": float(np.mean(theta_mean)),
        "player_theta_std": theta_std,
        "data_source": "Qwilight IR leaderboards (real player data)",
        "runtime_sec": round(time.time() - t0, 2),
        # MCMC configuration
        "mcmc_chains": MCMC_CHAINS,
        "mcmc_warmup": MCMC_WARMUP,
        "mcmc_samples_per_chain": MCMC_SAMPLES,
        # Convergence diagnostics
        "convergence": {
            "r_hat_max": round(convergence["r_hat_max"], 4),
            "ess_min": int(convergence["ess_min"]),
            "convergence_ok": convergence["convergence_ok"],
            "n_params_bad_rhat": convergence["n_bad_rhat"],
            "n_params_low_ess": convergence["n_low_ess"],
            "r_hat_threshold": R_HAT_THRESHOLD,
            "ess_threshold": ESS_THRESHOLD,
        },
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
    print(f"  MCMC:           {MCMC_CHAINS} chains × ({MCMC_WARMUP} warmup + {MCMC_SAMPLES} samples)")
    print(f"  R̂ max:         {convergence['r_hat_max']:.4f} ({'✅' if convergence['convergence_ok'] else '⚠️'})")
    print(f"  ESS min:        {convergence['ess_min']:.0f}")
    print(f"  Outputs in:     {OUT_DIR}/")

    if not convergence["convergence_ok"]:
        print()
        print("  ⚠️  WARNING: Convergence diagnostics indicate potential issues.")
        print(f"      {convergence['n_bad_rhat']} parameters have R̂ > {R_HAT_THRESHOLD}")
        print(f"      {convergence['n_low_ess']} parameters have ESS < {ESS_THRESHOLD}")
        print("      Consider increasing num_warmup or num_samples.")


if __name__ == "__main__":
    main()
