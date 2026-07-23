#!/usr/bin/env python3
"""
QUEstimator data pipeline.

Stage 1: Parse UEtable.json -> chart database (real metadata).
Stage 2: Load real IR leaderboard data.
Stage 3: Fit Bayesian Graded Response Model via MCMC (NUTS) using numpyro.
         Identifiability is enforced by fixing one well-observed, typical
         chart's discrimination to α=1, breaking the α-θ scaling degeneracy
         without a dense all-chart centering transform.
         δ uses a *centered* parameterization (δ ~ Normal(loc, scale))
         which gives better gradient geometry than the non-centered form
         for this model.
Stage 4: Extract posterior means and standard errors.
Stage 5: Aggregate per U_E level (median + IQR).
Stage 6: Emit static JSON artifacts for the Next.js dashboard.
"""

from __future__ import annotations
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

# ── tqdm with graceful fallback ──────────────────────────────────────────────
try:
    from tqdm import tqdm
except ImportError:
    class _FallbackTqdm:
        def __init__(self, iterable=None, total=None, **kw):
            self.iterable = iterable
            self.total = total
            self.n = 0
        def __iter__(self):
            yield from (self.iterable or [])
        def update(self, n=1):
            self.n += n
        def set_description(self, *a, **kw):
            pass
        def close(self):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *_):
            self.close()
    def tqdm(iterable=None, **kw):          # noqa: E303
        if iterable is not None:
            return iterable
        return _FallbackTqdm(total=kw.get("total"))

import numpyro
numpyro.set_host_device_count(min(4, os.cpu_count() or 1))

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"
OUT_DIR = _PROJECT_ROOT / "public" / "data"

# 4 chains × (1500 warmup + 2000 samples) = 14 000 iterations.
# With centered δ the per-iteration cost matches the original model
# (~1.7 h for 24 k iters), so 14 k iters ≈ ~1 h.
MCMC_WARMUP = 1500
MCMC_SAMPLES = 2000
MCMC_CHAINS = 4

R_HAT_THRESHOLD = 1.05
ESS_THRESHOLD = 200

# Deterministic transforms — skipped in convergence diagnostics.
_DETERMINISTIC_PARAMS = frozenset({"alpha"})

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
    return pd.DataFrame(rows).drop_duplicates(subset="md5").reset_index(drop=True)


def level_sort_key(level: str):
    specials_order = {"-_-": 100, "?!": 101, "◆": 102, "Ω": 103}
    if level.isdigit():
        return (0, int(level))
    return (1, specials_order.get(level, 999))


# --------------------------------------------------------------------------- #
# Stage 3 - Bayesian GRM with MCMC
# --------------------------------------------------------------------------- #
#
# IDENTIFICATION STRATEGY
# ───────────────────────
# The GRM likelihood P*(θ, βₖ) = logistic(α·(θ−βₖ)) is invariant under
# (α→cα, θ→θ/c, βₖ→βₖ/c).  We use the standard θ ~ Normal(0, 1) scale and
# set α=1 for ONE fixed, well-observed, representative chart.  Every other
# log(α) is independently sampled.  This removes the scaling ridge without
# the dense J×J dependence introduced by
# `log_alpha_dev - mean(log_alpha_dev)`.
#
# The reference chart only defines the unit of the latent skill/difficulty
# scale; it does not fix its difficulty or thresholds.  To avoid anchoring to
# an unusual or data-poor chart, it is selected deterministically from regular
# charts with at least median coverage, preferring a median-level chart with a
# high-entropy (mixed) distribution of clear outcomes.  The selected ID and
# metadata are emitted in meta.json for auditability.
#
# δ is CENTERED: δ ~ Normal(loc, scale).  Non-centering was empirically worse
# for this model because its small prior scale attenuated the gradient.
# --------------------------------------------------------------------------- #
def select_reference_chart(clears: np.ndarray, df: pd.DataFrame) -> int:
    """Choose a stable scale anchor, without using fitted parameters.

    A reference chart fixes only α=1.  It must be well observed, non-gimmick,
    near the middle of the regular-level range, and have varied outcomes so
    that it informs a slope rather than an almost deterministic response.
    """
    n_charts = len(df)
    counts = np.bincount(clears[:, 0], minlength=n_charts).astype(float)
    category_counts = np.zeros((n_charts, 4), dtype=float)
    np.add.at(category_counts, (clears[:, 0], clears[:, 2]), 1)
    proportions = category_counts / np.maximum(counts[:, None], 1.0)
    entropy = -(proportions * np.log(np.maximum(proportions, 1e-12))).sum(axis=1)

    numeric_levels = pd.to_numeric(df["level"], errors="coerce").to_numpy(dtype=float)
    regular = np.isfinite(numeric_levels)
    if not np.any(regular):
        # Defensive fallback for a metadata-only test fixture.
        return int(np.argmax(counts))

    median_count = np.median(counts[regular])
    candidates = regular & (counts >= max(1.0, median_count))
    if not np.any(candidates):
        candidates = regular & (counts > 0)
    if not np.any(candidates):
        candidates = regular

    level_midpoint = np.median(numeric_levels[candidates])
    # Lexicographic ranking: typical level, informative outcomes, coverage,
    # then chart index.  The fixed order keeps weekly runs reproducible.
    candidate_indices = np.flatnonzero(candidates)
    return int(sorted(
        candidate_indices,
        key=lambda i: (
            abs(numeric_levels[i] - level_midpoint),
            -entropy[i],
            -counts[i],
            i,
        ),
    )[0])


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

    # Pre-compute prior locations for initialization
    init_loc = -3.0 + 0.2 * level_num
    init_loc = np.where(is_gimmick, 0.0, init_loc)
    reference_chart_idx = select_reference_chart(clears, df)

    def model(player_idx, chart_idx, y, level_num, is_gimmick, n_players, n_charts):
        # ── Hyperparameters ────────────────────────────────────────────
        prior_a = numpyro.sample("prior_a", dist.Normal(-3.0, 2.0))
        prior_b = numpyro.sample("prior_b", dist.Normal(0.2, 0.2))

        loc = prior_a + prior_b * level_num
        loc = jnp.where(is_gimmick, 0.0, loc)
        delta_scale = jnp.where(is_gimmick, 3.0, 0.5)

        # ── Chart parameters ───────────────────────────────────────────
        with numpyro.plate("charts", n_charts):
            # CENTERED difficulty: δ ~ Normal(loc, scale)
            # This is the original parameterization — gradients are
            # unscaled so NUTS adapts well.
            delta = numpyro.sample("delta", dist.Normal(loc, delta_scale))

            # Threshold spacings
            tau1 = numpyro.sample("tau1", dist.HalfNormal(1.0))
            tau2 = numpyro.sample("tau2", dist.HalfNormal(1.0))

        # ── Identify α scale with one reference chart ──────────────────
        # α_ref is exactly 1.  Unlike mean-centering, each free log(α) has
        # a local independent prior and no all-chart deterministic coupling.
        with numpyro.plate("non_reference_charts", n_charts - 1):
            log_alpha_free = numpyro.sample("log_alpha_free", dist.Normal(0, 0.3))
        log_alpha = jnp.concatenate((
            log_alpha_free[:reference_chart_idx],
            jnp.zeros(1),
            log_alpha_free[reference_chart_idx:],
        ))
        alpha = numpyro.deterministic("alpha", jnp.exp(log_alpha))

        # ── Player skill ───────────────────────────────────────────────
        with numpyro.plate("players", n_players):
            theta = numpyro.sample("theta", dist.Normal(0, 1))

        # ── Likelihood ─────────────────────────────────────────────────
        beta3 = delta
        beta2 = delta - tau2
        beta1 = delta - tau2 - tau1

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
            numpyro.sample(
                "obs",
                dist.OrderedLogistic(alpha_obs * theta_obs, cutpoints),
                obs=y,
            )

    # ── Initialization ─────────────────────────────────────────────────
    init_strategy = init_to_value(values={
        "prior_a": -3.0,
        "prior_b": 0.2,
        "delta": init_loc,                     # at prior mean
        "log_alpha_free": np.zeros(n_charts - 1),  # α = 1 initially
        "tau1": np.ones(n_charts) * 0.8,
        "tau2": np.ones(n_charts) * 0.8,
        "theta": np.zeros(n_players),
    })

    total_iters = MCMC_CHAINS * (MCMC_WARMUP + MCMC_SAMPLES)
    print(f"      compiling and running NUTS MCMC ({MCMC_CHAINS} chains, "
          f"{MCMC_WARMUP} warmup, {MCMC_SAMPLES} samples/chain "
          f"= {total_iters:,} total iterations)...")
    ref = df.iloc[reference_chart_idx]
    print("      selected reference chart (its discrimination is fixed at α = 1):")
    print(f"        id={reference_chart_idx}, title={ref['title']!r}, "
          f"level={ref['level']!r}, md5={ref['md5']}")
    print("      identification: reference-chart α=1, centered δ, θ ~ N(0,1)")

    mcmc = MCMC(
        NUTS(model, init_strategy=init_strategy),
        num_warmup=MCMC_WARMUP,
        num_samples=MCMC_SAMPLES,
        num_chains=MCMC_CHAINS,
        chain_method="sequential",
        progress_bar=True,
    )

    mcmc.run(
        jax.random.PRNGKey(42),
        player_idx=jnp.array(player_idx),
        chart_idx=jnp.array(chart_idx),
        y=jnp.array(y),
        level_num=jnp.array(level_num),
        is_gimmick=jnp.array(is_gimmick),
        n_players=n_players,
        n_charts=n_charts,
    )

    # Keep the selection with the fitted object so output metadata describes
    # the exact identification used by this run.
    mcmc.reference_chart_idx = reference_chart_idx
    return mcmc


# --------------------------------------------------------------------------- #
# Stage 4 - Convergence diagnostics
# --------------------------------------------------------------------------- #
def _rhat_numpy(z):
    """Vectorized Gelman–Rubin R̂ in pure NumPy.
    z: (n_chains, n_samples, ...) → R̂ with shape z.shape[2:]
    """
    n_chains, n_samples = z.shape[:2]
    flat = z.reshape(n_chains, n_samples, -1)
    W = np.var(flat, axis=1, ddof=1).mean(axis=0)
    B = n_samples * np.var(flat.mean(axis=1), axis=0, ddof=1)
    var_plus = ((n_samples - 1) / n_samples) * W + B / n_samples
    rhat = np.sqrt(var_plus / np.maximum(W, 1e-10))
    return rhat.reshape(z.shape[2:]) if z.ndim > 2 else float(rhat.squeeze())


def check_convergence(mcmc) -> dict:
    import numpyro.diagnostics as diag

    samples_by_chain = mcmc.get_samples(group_by_chain=True)
    raw_params = {k: v for k, v in samples_by_chain.items()
                  if k not in _DETERMINISTIC_PARAMS}

    total_elements = sum(
        int(np.prod(s.shape[2:])) if s.ndim > 2 else 1
        for s in raw_params.values()
    )

    diagnostics = {}
    bad_rhat = {}
    low_ess = {}

    pbar = tqdm(
        total=total_elements,
        desc="      Computing R̂ / ESS",
        unit="param",
        bar_format="{desc}: {n_fmt}/{total_fmt} [{elapsed}<{remaining}]",
    )

    for param_name, param_samples in raw_params.items():
        original_shape = param_samples.shape[2:]
        if len(original_shape) == 0:
            rhat = float(diag.gelman_rubin(param_samples))
            ess = float(diag.effective_sample_size(param_samples))
            diagnostics[param_name] = {"r_hat": rhat, "n_eff": ess}
            if rhat > R_HAT_THRESHOLD:
                bad_rhat[param_name] = rhat
            if ess < ESS_THRESHOLD:
                low_ess[param_name] = ess
            pbar.update(1)
        else:
            n_chains, n_samp = param_samples.shape[:2]
            flat = np.array(param_samples.reshape(n_chains, n_samp, -1))
            n_elements = flat.shape[2]

            # Vectorized R̂
            rhats = np.asarray(_rhat_numpy(flat), dtype=float).ravel()

            # ESS: try batch via numpyro, fallback to loop
            try:
                import jax.numpy as jnp
                esses = np.asarray(
                    diag.effective_sample_size(jnp.array(flat))
                ).ravel()
                if esses.shape != (n_elements,):
                    raise ValueError("shape mismatch")
            except Exception:
                esses = np.empty(n_elements)
                for i in range(n_elements):
                    esses[i] = float(diag.effective_sample_size(flat[:, :, i]))

            diagnostics[param_name] = {
                "r_hat_max": float(rhats.max()),
                "r_hat_mean": float(rhats.mean()),
                "n_eff_min": float(esses.min()),
                "n_eff_mean": float(esses.mean()),
                "n_elements": n_elements,
                "n_bad_rhat": int((rhats > R_HAT_THRESHOLD).sum()),
                "n_low_ess": int((esses < ESS_THRESHOLD).sum()),
            }

            for i in range(n_elements):
                if rhats[i] > R_HAT_THRESHOLD:
                    bad_rhat[f"{param_name}[{i}]"] = float(rhats[i])
                if esses[i] < ESS_THRESHOLD:
                    low_ess[f"{param_name}[{i}]"] = float(esses[i])

            pbar.update(n_elements)

    pbar.close()

    r_hat_max = max(
        (d.get("r_hat_max", d.get("r_hat", 0.0)) for d in diagnostics.values()),
        default=1.0,
    )
    ess_min = min(
        (d.get("n_eff_min", d.get("n_eff", float("inf")))
         for d in diagnostics.values()),
        default=float("inf"),
    )
    convergence_ok = (r_hat_max < R_HAT_THRESHOLD) and (ess_min >= ESS_THRESHOLD)

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
# Main
# --------------------------------------------------------------------------- #
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()

    print("[1/6] Loading UEtable_enriched.json ...")
    df = load_charts()
    print(f"      loaded {len(df)} charts across {df['level'].nunique()} levels")

    print("[2/6] Loading real IR leaderboard data ...")
    sys.path.insert(0, str(_PROJECT_ROOT / "scripts"))
    from load_ir_clears import load_ir_clears, print_stats as print_ir_stats
    clears, player_map, ir_stats = load_ir_clears(df)
    print_ir_stats(ir_stats)

    total_iters = MCMC_CHAINS * (MCMC_WARMUP + MCMC_SAMPLES)
    print(f"[3/6] Fitting Bayesian GRM via MCMC "
          f"(numpyro NUTS, {MCMC_CHAINS} chains, {total_iters:,} iters) ...")
    mcmc = run_mcmc(clears, df, len(player_map))

    print("[4/6] Checking convergence (R̂, ESS) ...")
    convergence = check_convergence(mcmc)

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

    print(f"      fits complete. provisional charts: "
          f"{int(df['provisional'].sum())} / {len(df)}")

    print("[5/6] Extracting player theta values ...")
    theta_mean = np.array(samples["theta"].mean(axis=0))
    theta_std = float(np.std(theta_mean))
    player_data = {}
    inv_player_map = {v: k for k, v in player_map.items()}

    p_clears = pd.DataFrame({
        "chart": clears[:, 0], "player": clears[:, 1], "status": clears[:, 2]
    }).groupby("player")

    for pid, group in tqdm(
        p_clears, desc="      Extracting player θ",
        total=len(p_clears),
        bar_format="{desc}: {n_fmt}/{total_fmt} [{elapsed}<{remaining}]",
    ):
        avatar_id = inv_player_map[pid]
        p_c = {str(int(row["chart"])): int(row["status"])
               for _, row in group.iterrows()}
        player_data[avatar_id] = {
            "t": round(float(theta_mean[pid]), 3),
            "c": p_c,
        }

    print("[6/6] Aggregating per U_E level & emitting JSON artifacts ...")
    level_summary = aggregate_by_level(df)

    charts_out = []
    for i, r in tqdm(
        df.iterrows(), total=len(df),
        desc="      Building charts.json",
        bar_format="{desc}: {n_fmt}/{total_fmt} [{elapsed}<{remaining}]",
    ):
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
    charts_out.sort(
        key=lambda c: (level_sort_key(c["level"]),
                       -(c["b_hard_display"] if c["b_hard_display"] is not None else -999))
    )

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
        "mcmc_chains": MCMC_CHAINS,
        "mcmc_warmup": MCMC_WARMUP,
        "mcmc_samples_per_chain": MCMC_SAMPLES,
        "convergence": {
            "r_hat_max": round(convergence["r_hat_max"], 4),
            "ess_min": int(convergence["ess_min"]),
            "convergence_ok": convergence["convergence_ok"],
            "n_params_bad_rhat": convergence["n_bad_rhat"],
            "n_params_low_ess": convergence["n_low_ess"],
            "r_hat_threshold": R_HAT_THRESHOLD,
            "ess_threshold": ESS_THRESHOLD,
        },
        "identification": {
            "method": "reference-chart discrimination fixed at α = 1",
            "theta_prior": "Normal(0, 1)",
            "delta_parameterization": "centered (δ ~ Normal(loc, scale))",
            "reference_chart": {
                "id": int(mcmc.reference_chart_idx),
                "md5": str(df.iloc[mcmc.reference_chart_idx]["md5"]),
                "title": str(df.iloc[mcmc.reference_chart_idx]["title"]),
                "level": str(df.iloc[mcmc.reference_chart_idx]["level"]),
                "selection": "regular chart with at least median coverage; median-level, high-outcome-entropy tie-break",
            },
        },
    }

    print("      Writing JSON artifacts ...")
    with open(os.path.join(OUT_DIR, "charts.json"), "w", encoding="utf-8") as f:
        json.dump(charts_out, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "level-summary.json"), "w", encoding="utf-8") as f:
        json.dump(level_summary, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT_DIR, "players.json"), "w", encoding="utf-8") as f:
        json.dump(player_data, f, separators=(",", ":"))

    print()
    print("=== Pipeline complete (real IR data) ===")
    print(f"  Runtime:        {meta['runtime_sec']}s")
    print(f"  Charts:         {meta['n_charts_total']} "
          f"(valid {meta['n_charts_valid']}, "
          f"provisional {meta['n_charts_provisional']})")
    print(f"  Players:        {meta['n_players']:,}")
    print(f"  Clears:         {meta['n_clears']:,}")
    print(f"  MCMC:           {MCMC_CHAINS} chains × "
          f"({MCMC_WARMUP} warmup + {MCMC_SAMPLES} samples)")
    reference = meta["identification"]["reference_chart"]
    print(f"  Identification: reference-chart α=1, centered δ, θ ~ N(0,1)")
    print(f"  Reference:      chart {reference['id']} — {reference['title']} "
          f"[{reference['level']}] (α fixed at 1)")
    print(f"  R̂ max:         {convergence['r_hat_max']:.4f} "
          f"({'✅' if convergence['convergence_ok'] else '⚠️'})")
    print(f"  ESS min:        {convergence['ess_min']:.0f}")
    print(f"  Outputs in:     {OUT_DIR}/")

    if not convergence["convergence_ok"]:
        print()
        print("  ⚠️  WARNING: Convergence diagnostics indicate potential issues.")
        print(f"      {convergence['n_bad_rhat']} parameters have R̂ > {R_HAT_THRESHOLD}")
        print(f"      {convergence['n_low_ess']} parameters have ESS < {ESS_THRESHOLD}")


if __name__ == "__main__":
    main()
         
