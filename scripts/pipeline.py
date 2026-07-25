#!/usr/bin/env python3
"""
QUEstimator GRM pipeline — marginalized-θ, production version.

Fits a Bayesian Graded Response Model to Qwilight IR clear data and writes the
static JSON the dashboard consumes.  No environment variables are required;
all settings live in the Configuration block below.

Model
-----
    P*(θ, β_k) = logistic( α · (θ − β_k) ),   k ∈ {normal, hard, v-hard}
    β3 = δ,   β2 = δ − τ2,   β1 = δ − τ2 − τ1      (β3 > β2 > β1)

Identification
--------------
θ ~ Normal(0,1) is NOT sampled.  It is marginalized out per player by
Gauss–Hermite quadrature, so only the item parameters (δ, τ1, τ2, α and the
level-regression hyperparameters prior_a, prior_b) are sampled.  This removes
the ~thousands of player parameters and the θ↔item coupling that made the joint
model diverge on the full dataset; each player's θ is recovered afterwards by
EAP (expected a posteriori).

α is identified by an orthonormal zero-sum (Σ log α = 0) Householder contrast —
no privileged reference chart and no dense J×J transform.  δ is centered:
    δ ~ Normal(loc, δ_scale),   loc = prior_a + prior_b·level   (0 for gimmicks)
                                δ_scale = 0.5 normal, 3.0 gimmick folders

Outputs (frontend-compatible schemas, unchanged)
------------------------------------------------
    public/data/charts.json, level-summary.json, meta.json, players.json

Safety
------
The pipeline refuses to write any posterior-derived artifact if the sampler
produced even one post-warmup divergence.
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

# tqdm is optional (the pipeline works without it; bars just disappear).
try:
    from tqdm import tqdm
except ImportError:
    def tqdm(iterable=None, total=None, **kw):
        if iterable is not None:
            return iterable
        class _Dummy:
            def __init__(self):
                self.n = 0
            def update(self, n=1):
                self.n += n
            def set_description(self, *a, **k):
                pass
            def close(self):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *_):
                self.close()
        return _Dummy()

# JAX/XLA must be configured before JAX imports.
os.environ.setdefault("JAX_PLATFORMS", "cpu")
os.environ.setdefault("XLA_FLAGS", "--xla_cpu_multi_thread_eigen=true")
import numpyro  # noqa: E402

# --------------------------------------------------------------------------- #
# Configuration  (edit here — no env vars needed)
# --------------------------------------------------------------------------- #
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"
OUT_DIR = _PROJECT_ROOT / "public" / "data"

# Tuned for a 2-vCPU GitHub Actions runner (6 h budget): ~4–5 h on 2 vCPU,
# leaving room for data refresh + build.  Raise these on a bigger/local machine.
MCMC_WARMUP = 500           # per chain
MCMC_SAMPLES = 500          # per chain
N_QUAD = 11                 # Gauss–Hermite nodes for the θ integral (validated; 15–21 if time allows)
TARGET_ACCEPT = 0.90
MAX_TREE_DEPTH = 8

_NUM_CPU = max(1, os.cpu_count() or 1)
MCMC_CHAINS = 4 if _NUM_CPU >= 8 else 2
_NUM_HOST_DEVICES = MCMC_CHAINS if _NUM_CPU >= 2 * MCMC_CHAINS else 1
CHAIN_METHOD = "sequential"
numpyro.set_host_device_count(_NUM_HOST_DEVICES)

R_HAT_THRESHOLD = 1.05
ESS_THRESHOLD = 200
_DETERMINISTIC_PARAMS = frozenset({"alpha"})


# --------------------------------------------------------------------------- #
# Stage 1 — chart metadata
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
        })
    return pd.DataFrame(rows).drop_duplicates(subset="md5").reset_index(drop=True)


def level_sort_key(level: str):
    specials = {"-_-": 100, "?!": 101, "◆": 102, "Ω": 103}
    if level.isdigit():
        return (0, int(level))
    return (1, specials.get(level, 999))


# --------------------------------------------------------------------------- #
# Stage 3 — Bayesian GRM with θ marginalized out
# --------------------------------------------------------------------------- #
def run_mcmc(clears: np.ndarray, df: pd.DataFrame, n_players: int):
    import jax
    import jax.numpy as jnp
    import numpyro.distributions as dist
    from numpyro.infer import MCMC, NUTS, init_to_value
    from jax.ops import segment_sum

    n_charts = len(df)

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

    init_loc = -3.0 + 0.2 * level_num
    init_loc = np.where(is_gimmick, 0.0, init_loc)

    # Sort observations by player so segment_sum sees non-decreasing ids.
    order = np.argsort(clears[:, 1], kind="stable")
    clears_s = clears[order]
    chart_idx = clears_s[:, 0]
    y = clears_s[:, 2]
    player_seg = clears_s[:, 1]              # 0..n_players-1, non-decreasing

    # Gauss–Hermite quadrature for the N(0,1) prior on θ.
    z, wz = np.polynomial.hermite.hermgauss(N_QUAD)
    theta_q = jnp.asarray(np.sqrt(2.0) * z)
    log_w_q = jnp.asarray(np.log(wz / np.sqrt(np.pi)))

    def model(chart_idx, y, player_seg, level_num, is_gimmick, n_charts, n_players):
        prior_a = numpyro.sample("prior_a", dist.Normal(-3.0, 2.0))
        prior_b = numpyro.sample("prior_b", dist.Normal(0.2, 0.2))
        loc = prior_a + prior_b * level_num
        loc = jnp.where(is_gimmick, 0.0, loc)
        delta_scale = jnp.where(is_gimmick, 3.0, 0.5)

        with numpyro.plate("charts", n_charts):
            delta = numpyro.sample("delta", dist.Normal(loc, delta_scale))
            tau1 = numpyro.sample("tau1", dist.HalfNormal(1.0))
            tau2 = numpyro.sample("tau2", dist.HalfNormal(1.0))

        # Orthonormal zero-sum (Σ log α = 0) Householder contrast on α.
        with numpyro.plate("alpha_contrasts", n_charts - 1):
            q = numpyro.sample("log_alpha_contrast", dist.Normal(0, 0.3))
        x = jnp.concatenate((q, jnp.zeros(1)))
        u = jnp.ones(n_charts) / jnp.sqrt(n_charts)
        v = jnp.zeros(n_charts).at[-1].set(1.0) - u
        log_alpha = x - 2.0 * v * jnp.vdot(v, x) / jnp.vdot(v, v)
        alpha = numpyro.deterministic("alpha", jnp.exp(log_alpha))

        # Marginal likelihood: each player's θ is averaged over its N(0,1) prior
        # by quadrature (no θ plate, no θ parameters sampled).
        cp1 = alpha * (delta - tau2 - tau1)
        cp2 = alpha * (delta - tau2)
        cp3 = alpha * delta
        a_obs = alpha[chart_idx]
        cp1o, cp2o, cp3o = cp1[chart_idx], cp2[chart_idx], cp3[chart_idx]

        loc_q = a_obs[:, None] * theta_q[None, :]                       # (n_obs, n_quad)
        c1 = jax.nn.sigmoid(cp1o[:, None] - loc_q)
        c2 = jax.nn.sigmoid(cp2o[:, None] - loc_q)
        c3 = jax.nn.sigmoid(cp3o[:, None] - loc_q)
        logP = jnp.log(jnp.clip(
            jnp.stack([c1, c2 - c1, c3 - c2, 1.0 - c3], axis=-1), 1e-30, 1.0))
        log_p_obs = jnp.take_along_axis(logP, y[:, None, None], axis=-1).squeeze(-1)
        log_lik_pq = segment_sum(log_p_obs, player_seg, num_segments=n_players)
        log_L_player = jax.scipy.special.logsumexp(log_lik_pq + log_w_q[None, :], axis=1)
        numpyro.factor("obs", jnp.sum(log_L_player))

    init_strategy = init_to_value(values={
        "prior_a": -3.0,
        "prior_b": 0.2,
        "delta": init_loc,
        "log_alpha_contrast": np.zeros(n_charts - 1),
        "tau1": np.ones(n_charts) * 0.8,
        "tau2": np.ones(n_charts) * 0.8,
    })

    print(f"      NUTS: {MCMC_CHAINS} chains ({CHAIN_METHOD}), {MCMC_WARMUP} warmup + "
          f"{MCMC_SAMPLES} samples, quad={N_QUAD}, target_accept={TARGET_ACCEPT}, "
          f"max_tree_depth={MAX_TREE_DEPTH}", flush=True)
    mcmc = MCMC(
        NUTS(model, init_strategy=init_strategy,
             target_accept_prob=TARGET_ACCEPT, max_tree_depth=MAX_TREE_DEPTH),
        num_warmup=MCMC_WARMUP, num_samples=MCMC_SAMPLES, num_chains=MCMC_CHAINS,
        chain_method=CHAIN_METHOD, progress_bar=True,
    )

    t0 = time.time()
    mcmc.run(
        jax.random.PRNGKey(42),
        chart_idx=jnp.asarray(chart_idx), y=jnp.asarray(y),
        player_seg=jnp.asarray(player_seg),
        level_num=jnp.asarray(level_num), is_gimmick=jnp.asarray(is_gimmick),
        n_charts=n_charts, n_players=n_players,
    )
    print(f"      NUTS: sampling finished in {(time.time() - t0) / 60:.1f} min.", flush=True)

    return mcmc, {
        "theta_q": np.asarray(theta_q), "log_w_q": np.asarray(log_w_q),
        "chart_idx": np.asarray(chart_idx), "y": np.asarray(y),
        "player_seg": np.asarray(player_seg), "n_players": n_players,
    }


def eap_theta(alpha, delta, tau1, tau2, chart_idx, y, player_seg, n_players,
              theta_q, log_w_q):
    """Recover each player's θ by EAP given point-estimate items, via quadrature.
    Returns (theta_eap, theta_se) as float arrays of length n_players."""
    cp1 = alpha * (delta - tau2 - tau1)
    cp2 = alpha * (delta - tau2)
    cp3 = alpha * delta
    a_obs = alpha[chart_idx]
    cp1o, cp2o, cp3o = cp1[chart_idx], cp2[chart_idx], cp3[chart_idx]

    loc_q = a_obs[:, None] * theta_q[None, :]
    c1 = 1.0 / (1.0 + np.exp(-(cp1o[:, None] - loc_q)))
    c2 = 1.0 / (1.0 + np.exp(-(cp2o[:, None] - loc_q)))
    c3 = 1.0 / (1.0 + np.exp(-(cp3o[:, None] - loc_q)))
    P = np.clip(np.stack([c1, c2 - c1, c3 - c2, 1.0 - c3], axis=-1), 1e-30, 1.0)
    log_p = np.log(P[np.arange(len(y)), :, y])

    log_lik = np.zeros((n_players, len(theta_q)))
    np.add.at(log_lik, player_seg, log_p)
    log_L = log_lik + log_w_q[None, :]
    log_L -= log_L.max(axis=1, keepdims=True)
    W = np.exp(log_L)
    W /= W.sum(axis=1, keepdims=True)
    theta_eap = (W * theta_q[None, :]).sum(axis=1)
    theta_se = np.sqrt((W * (theta_q[None, :] - theta_eap[:, None]) ** 2).sum(axis=1))
    return theta_eap, theta_se


# --------------------------------------------------------------------------- #
# Stage 4 — convergence diagnostics (pure NumPy; no per-element JAX recompiles)
# --------------------------------------------------------------------------- #
def _rhat_numpy(z):
    """Vectorized Gelman–Rubin R̂.  z: (n_chains, n_samples, ...) -> R̂.
    Returns NaN when n_chains < 2 (R̂ is undefined for a single chain)."""
    n_chains, n_samples = z.shape[:2]
    if n_chains < 2:
        return np.full(z.shape[2:], np.nan) if z.ndim > 2 else float("nan")
    flat = z.reshape(n_chains, n_samples, -1)
    W = np.var(flat, axis=1, ddof=1).mean(axis=0)
    B = n_samples * np.var(flat.mean(axis=1), axis=0, ddof=1)
    var_plus = ((n_samples - 1) / n_samples) * W + B / n_samples
    rhat = np.sqrt(var_plus / np.maximum(W, 1e-10))
    return rhat.reshape(z.shape[2:]) if z.ndim > 2 else float(rhat.squeeze())


def _ess_numpy(z):
    """Effective sample size for one scalar parameter (FFT autocovariance +
    Geyer initial-monotone-sequence).  z: (n_chains, n_samples) -> float."""
    z = np.asarray(z, dtype=float)
    m, n = z.shape
    if n < 4:
        return float(m * n)
    acov = np.empty((m, n))
    for c in range(m):
        x = z[c] - z[c].mean()
        nfft = 2
        while nfft < 2 * n:
            nfft *= 2
        fx = np.fft.rfft(x, n=nfft)
        acov[c] = np.fft.irfft(fx * np.conjugate(fx), n=nfft)[:n].real / n
    W = (acov[:, 0] * n / (n - 1.0)).mean()
    if not np.isfinite(W) or W <= 0:
        return float(m * n)
    B = n * z.mean(axis=1).var(ddof=1) if m > 1 else 0.0
    var_hat = ((n - 1.0) / n) * W + (B / n if m > 1 else 0.0)
    if var_hat <= 0:
        return float(m * n)
    rho = 1.0 - (W - acov.mean(axis=0)) / var_hat
    rho[0] = 1.0
    pairs, t = [], 0
    while 2 * t + 1 < n:
        p = rho[2 * t] + rho[2 * t + 1]
        if t > 0 and p < 0:
            break
        pairs.append(p)
        t += 1
    for i in range(1, len(pairs)):
        pairs[i] = min(pairs[i], pairs[i - 1])
    return float(m * n / max(1.0, -1.0 + 2.0 * sum(pairs)))


def check_convergence(mcmc) -> dict:
    import numpyro.diagnostics as diag

    samples_by_chain = mcmc.get_samples(group_by_chain=True)
    raw_params = {k: v for k, v in samples_by_chain.items()
                  if k not in _DETERMINISTIC_PARAMS}
    total_elements = sum(
        int(np.prod(s.shape[2:])) if s.ndim > 2 else 1 for s in raw_params.values())

    diagnostics, bad_rhat, low_ess = {}, {}, {}
    pbar = tqdm(total=total_elements, desc="      Computing R̂ / ESS", unit="param",
                bar_format="{desc}: {n_fmt}/{total_fmt} [{elapsed}<{remaining}]")

    for name, s in raw_params.items():
        if len(s.shape[2:]) == 0:
            nc = s.shape[0]
            rhat = float(diag.gelman_rubin(s)) if nc >= 2 else float("nan")
            ess = _ess_numpy(np.asarray(s))
            diagnostics[name] = {"r_hat": rhat, "n_eff": ess}
            if np.isfinite(rhat) and rhat > R_HAT_THRESHOLD:
                bad_rhat[name] = rhat
            if ess < ESS_THRESHOLD:
                low_ess[name] = ess
            pbar.update(1)
        else:
            nc, ns = s.shape[:2]
            flat = np.array(s.reshape(nc, ns, -1))
            n_el = flat.shape[2]
            rhats = np.asarray(_rhat_numpy(flat), dtype=float).ravel()
            esses = np.array([_ess_numpy(flat[:, :, i]) for i in range(n_el)])
            diagnostics[name] = {
                "r_hat_max": float(np.nanmax(rhats)),
                "r_hat_mean": float(np.nanmean(rhats)),
                "n_eff_min": float(np.nanmin(esses)),
                "n_eff_mean": float(np.nanmean(esses)),
                "n_elements": n_el,
                "n_bad_rhat": int(np.nansum(rhats > R_HAT_THRESHOLD)),
                "n_low_ess": int(np.sum(esses < ESS_THRESHOLD)),
            }
            for i in range(n_el):
                if np.isfinite(rhats[i]) and rhats[i] > R_HAT_THRESHOLD:
                    bad_rhat[f"{name}[{i}]"] = float(rhats[i])
                if esses[i] < ESS_THRESHOLD:
                    low_ess[f"{name}[{i}]"] = float(esses[i])
            pbar.update(n_el)
    pbar.close()

    all_rhats = [d.get("r_hat_max", d.get("r_hat", float("nan"))) for d in diagnostics.values()]
    finite = [r for r in all_rhats if np.isfinite(r)]
    r_hat_max = max(finite) if finite else float("nan")
    ess_min = min((d.get("n_eff_min", d.get("n_eff", float("inf")))
                   for d in diagnostics.values()), default=float("inf"))
    convergence_ok = ((r_hat_max < R_HAT_THRESHOLD) if np.isfinite(r_hat_max) else True) \
        and (ess_min >= ESS_THRESHOLD)

    block_names = ("prior_a", "prior_b", "delta", "tau1", "tau2", "log_alpha_contrast")
    block_summary = {}
    for block in block_names:
        entries = [d for n, d in diagnostics.items() if n == block or n.startswith(block + "[")]
        if not entries:
            continue
        rh = [d.get("r_hat_max", d.get("r_hat", float("nan"))) for d in entries]
        es = [d.get("n_eff_min", d.get("n_eff", float("inf"))) for d in entries]
        block_summary[block] = {
            "r_hat_max": float(np.nanmax(rh)),
            "n_eff_min": float(np.nanmin(es)),
            "n_bad_rhat": int(sum(d.get("n_bad_rhat", 0) for d in entries)),
            "n_low_ess": int(sum(d.get("n_low_ess", 0) for d in entries)),
        }

    nuts = {}
    try:
        extra = mcmc.get_extra_fields(group_by_chain=True)
        if "diverging" in extra:
            nuts["divergences"] = int(np.asarray(extra["diverging"]).sum())
        if "num_steps" in extra:
            steps = np.asarray(extra["num_steps"])
            nuts["num_steps_mean"] = float(steps.mean())
            nuts["num_steps_max"] = int(steps.max())
        if "tree_depth" in extra:
            depth = np.asarray(extra["tree_depth"])
            nuts["tree_depth_mean"] = float(depth.mean())
            nuts["tree_depth_max"] = int(depth.max())
    except Exception as exc:
        print(f"        NUTS transition diagnostics unavailable: {exc}")

    rhat_str = f"{r_hat_max:.4f}" if np.isfinite(r_hat_max) else "N/A (needs ≥2 chains)"
    print("      convergence diagnostics:")
    print(f"        R̂ max:  {rhat_str}  (threshold: {R_HAT_THRESHOLD})")
    print(f"        ESS min: {ess_min:.0f}  (threshold: {ESS_THRESHOLD})")
    print(f"        Convergence: {'✅ OK' if convergence_ok else '⚠️  POOR'}")
    if bad_rhat:
        print(f"        Parameters with R̂ > {R_HAT_THRESHOLD}: {len(bad_rhat)}")
        for k, v in list(bad_rhat.items())[:5]:
            print(f"          {k}: R̂ = {v:.4f}")
    if low_ess:
        print(f"        Parameters with ESS < {ESS_THRESHOLD}: {len(low_ess)}")
        for k, v in list(low_ess.items())[:5]:
            print(f"          {k}: ESS = {v:.0f}")
    if block_summary:
        print("        diagnostics by parameter block:")
        for b, v in block_summary.items():
            print(f"          {b}: R̂ max={v['r_hat_max']}, ESS min={v['n_eff_min']:.0f}, "
                  f"bad R̂={v['n_bad_rhat']}, low ESS={v['n_low_ess']}")
    if nuts:
        print(f"        NUTS transitions: {nuts}")

    return {
        "r_hat_max": r_hat_max, "ess_min": ess_min, "convergence_ok": convergence_ok,
        "n_bad_rhat": len(bad_rhat), "n_low_ess": len(low_ess),
        "diagnostics": diagnostics, "by_parameter_block": block_summary, "nuts": nuts,
    }


# --------------------------------------------------------------------------- #
# Stage 5 — per-level aggregation
# --------------------------------------------------------------------------- #
def aggregate_by_level(df: pd.DataFrame) -> list:
    rows = []
    for level, sub in df.groupby("level", sort=False):
        valid = sub.dropna(subset=["b_hard", "b_vhard"])
        valid = valid[~valid["provisional"]]
        if len(valid) == 0:
            rows.append({"level": level, "n_charts_total": int(len(sub)), "n_charts_valid": 0,
                         "hard_median": None, "hard_q1": None, "hard_q3": None,
                         "vhard_median": None, "vhard_q1": None, "vhard_q3": None})
            continue
        bh, bv = valid["b_hard"].to_numpy(), valid["b_vhard"].to_numpy()
        rows.append({
            "level": level, "n_charts_total": int(len(sub)), "n_charts_valid": int(len(valid)),
            "hard_median": float(np.median(bh)), "hard_q1": float(np.percentile(bh, 25)),
            "hard_q3": float(np.percentile(bh, 75)),
            "vhard_median": float(np.median(bv)), "vhard_q1": float(np.percentile(bv, 25)),
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

    print("[2/6] Loading IR leaderboard data ...")
    sys.path.insert(0, str(_PROJECT_ROOT / "scripts"))
    from load_ir_clears import load_ir_clears, print_stats as print_ir_stats
    clears, player_map, ir_stats = load_ir_clears(df)
    print_ir_stats(ir_stats)

    total_iters = MCMC_CHAINS * (MCMC_WARMUP + MCMC_SAMPLES)
    print(f"[3/6] Fitting Bayesian GRM via MCMC "
          f"(numpyro NUTS, {MCMC_CHAINS} chains, {total_iters:,} iters) ...")
    mcmc, marg = run_mcmc(clears, df, len(player_map))

    print("[4/6] Checking convergence (R̂, ESS, divergences) ...")
    convergence = check_convergence(mcmc)

    # Fail-closed: never emit posterior-derived artifacts from a divergent run.
    divergences = int(convergence.get("nuts", {}).get("divergences", 0))
    if divergences:
        raise RuntimeError(
            f"MCMC produced {divergences:,} divergent post-warmup transitions; "
            "refusing to emit posterior-derived JSON artifacts.")

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
    se_b_hard = np.array((samples["delta"] - samples["tau2"]).std(axis=0))

    df["a"] = a_mean
    df["b_normal"] = b_normal
    df["b_hard"] = b_hard
    df["b_vhard"] = b_vhard
    df["se_a"] = a_se
    df["se_b_hard"] = se_b_hard
    df["se_b_vhard"] = se_b_vhard

    grp = pd.DataFrame({"chart": clears[:, 0], "status": clears[:, 2]}).groupby("chart")
    counts = {}
    for ci in grp.groups:
        st = grp.get_group(ci)["status"].to_numpy()
        counts[ci] = {"n_failed": int(np.sum(st == 0)), "n_normal": int(np.sum(st == 1)),
                      "n_hard": int(np.sum(st == 2)), "n_vhard": int(np.sum(st == 3)),
                      "n_total": len(st)}
    df["n_failed"] = [counts.get(ci, {}).get("n_failed", 0) for ci in df.index]
    df["n_normal"] = [counts.get(ci, {}).get("n_normal", 0) for ci in df.index]
    df["n_hard"] = [counts.get(ci, {}).get("n_hard", 0) for ci in df.index]
    df["n_vhard"] = [counts.get(ci, {}).get("n_vhard", 0) for ci in df.index]
    df["n"] = [counts.get(ci, {}).get("n_total", 0) for ci in df.index]

    PROVISIONAL_MIN_N, PROVISIONAL_MAX_SE = 10, 1.0
    df["provisional"] = (
        (df["n"] < PROVISIONAL_MIN_N) | (df["se_b_hard"] > PROVISIONAL_MAX_SE)
        | (df["se_b_hard"].isna()))
    df["b_hard_display"] = df["b_hard"]
    df["b_vhard_display"] = df["b_vhard"]
    print(f"      provisional charts: {int(df['provisional'].sum())} / {len(df)}")

    print("[5/6] Recovering player θ via EAP ...")
    theta_eap, theta_se = eap_theta(
        a_mean, delta_mean, tau1_mean, tau2_mean,
        marg["chart_idx"], marg["y"], marg["player_seg"], marg["n_players"],
        marg["theta_q"], marg["log_w_q"])
    theta_std = float(np.std(theta_eap))
    inv_player_map = {v: k for k, v in player_map.items()}
    p_clears = pd.DataFrame({"chart": marg["chart_idx"], "player": marg["player_seg"],
                             "status": marg["y"]}).groupby("player")
    player_data = {}
    for pid, group in tqdm(p_clears, total=len(p_clears),
                           desc="      Building players.json",
                           bar_format="{desc}: {n_fmt}/{total_fmt} [{elapsed}<{remaining}]"):
        player_data[inv_player_map[pid]] = {
            "t": round(float(theta_eap[pid]), 3),
            "c": {str(int(r["chart"])): int(r["status"]) for _, r in group.iterrows()},
        }

    print("[6/6] Aggregating per U_E level & emitting JSON artifacts ...")
    level_summary = aggregate_by_level(df)

    charts_out = []
    for i, r in tqdm(df.iterrows(), total=len(df), desc="      Building charts.json",
                     bar_format="{desc}: {n_fmt}/{total_fmt} [{elapsed}<{remaining}]"):
        f = lambda v: None if (v is None or math.isnan(v)) else round(float(v), 4)
        charts_out.append({
            "id": i, "md5": r["md5"], "title": r["title"], "artist": r["artist"],
            "level": r["level"], "name_diff": r["name_diff"], "video2": r["video2"],
            "url": r["url"], "url_diff": r["url_diff"], "comment": r["comment"],
            "state": r["state"], "n": int(r["n"]),
            "n_failed": int(r["n_failed"]), "n_normal": int(r["n_normal"]),
            "n_hard": int(r["n_hard"]), "n_vhard": int(r["n_vhard"]),
            "a": f(r["a"]), "b_hard": f(r["b_hard"]), "b_vhard": f(r["b_vhard"]),
            "b_hard_display": f(r["b_hard_display"]), "b_vhard_display": f(r["b_vhard_display"]),
            "se_a": f(r["se_a"]), "se_b_hard": f(r["se_b_hard"]), "se_b_vhard": f(r["se_b_vhard"]),
            "provisional": bool(r["provisional"]),
        })
    charts_out.sort(key=lambda c: (level_sort_key(c["level"]),
                                   -(c["b_hard_display"] if c["b_hard_display"] is not None else -999)))

    final_rhat = convergence["r_hat_max"]
    meta = {
        "generated_at": pd.Timestamp.now("UTC").isoformat(),
        "n_charts_total": int(len(df)),
        "n_charts_valid": int((~df["provisional"]).sum()),
        "n_charts_provisional": int(df["provisional"].sum()),
        "n_players": int(len(player_map)),
        "n_clears": int(len(clears)),
        "model": "Bayesian Graded Response Model (MCMC NUTS, θ marginalized)",
        "categories": ["FAILED", "NORMAL", "HARD", "V-HARD"],
        "provisional_rule": f"n < {PROVISIONAL_MIN_N} OR se_b_hard > {PROVISIONAL_MAX_SE}",
        "player_theta_mean": float(np.mean(theta_eap)),
        "player_theta_std": theta_std,
        "data_source": "Qwilight IR leaderboards (real player data)",
        "runtime_sec": round(time.time() - t0, 2),
        "mcmc_chains": MCMC_CHAINS,
        "mcmc_warmup": MCMC_WARMUP,
        "mcmc_samples_per_chain": MCMC_SAMPLES,
        "convergence": {
            "r_hat_max": None if not np.isfinite(final_rhat) else round(final_rhat, 4),
            "ess_min": int(convergence["ess_min"]),
            "convergence_ok": convergence["convergence_ok"],
            "n_params_bad_rhat": convergence["n_bad_rhat"],
            "n_params_low_ess": convergence["n_low_ess"],
            "r_hat_threshold": R_HAT_THRESHOLD,
            "ess_threshold": ESS_THRESHOLD,
            "by_parameter_block": convergence.get("by_parameter_block", {}),
            "nuts": convergence.get("nuts", {}),
        },
        "identification": {
            "method": "orthonormal zero-sum Householder log-alpha contrasts",
            "theta_prior": "Normal(0, 1), marginalized out of the sampler (recovered by EAP)",
            "delta_parameterization": "centered (δ ~ Normal(loc, scale))",
            "tau_prior": "HalfNormal(1.0)",
            "log_alpha_prior": "isotropic Normal(0, 0.3) on the zero-sum subspace",
            "quadrature_nodes": N_QUAD,
        },
    }

    print("      Writing JSON artifacts ...")
    with open(OUT_DIR / "charts.json", "w", encoding="utf-8") as fh:
        json.dump(charts_out, fh, ensure_ascii=False)
    with open(OUT_DIR / "level-summary.json", "w", encoding="utf-8") as fh:
        json.dump(level_summary, fh, ensure_ascii=False)
    with open(OUT_DIR / "meta.json", "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
    with open(OUT_DIR / "players.json", "w", encoding="utf-8") as fh:
        json.dump(player_data, fh, separators=(",", ":"))

    rhat_disp = f"{final_rhat:.4f}" if np.isfinite(final_rhat) else "N/A (needs ≥2 chains)"
    print("\n=== Pipeline complete (real IR data) ===")
    print(f"  Runtime:        {meta['runtime_sec']}s")
    print(f"  Charts:         {meta['n_charts_total']} "
          f"(valid {meta['n_charts_valid']}, provisional {meta['n_charts_provisional']})")
    print(f"  Players:        {meta['n_players']:,}")
    print(f"  Clears:         {meta['n_clears']:,}")
    print(f"  MCMC:           {MCMC_CHAINS} chains × ({MCMC_WARMUP} warmup + {MCMC_SAMPLES} samples)")
    print(f"  Identification: zero-sum Householder log-α, centered δ, θ marginalized (EAP)")
    print(f"  R̂ max:         {rhat_disp} ({'✅' if convergence['convergence_ok'] else '⚠️'})")
    print(f"  ESS min:        {convergence['ess_min']:.0f}")
    print(f"  Outputs in:     {OUT_DIR}/")


if __name__ == "__main__":
    main()
