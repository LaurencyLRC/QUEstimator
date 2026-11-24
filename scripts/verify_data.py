#!/usr/bin/env python3
"""
verify_data.py - Automated post-calibration smell test for public/data/*.json.

Zero external dependencies (Python 3 standard library only) so it runs cleanly in
local shells and GitHub Actions CI without installing numpy/scipy.

Validates schema integrity, MCMC convergence gates, 31-level anchor monotonicity,
Whittaker+PCHIP U_E scale slope bounds, provisional rates, and player ratings.
Exits 0 if all checks pass, 1 if any critical invariant fails.
"""

from __future__ import annotations
import bisect
import json
import math
import statistics
import sys
from pathlib import Path

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"


def solve_linear(A: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with partial pivoting for small dense systems (n ~ 31)."""
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        if abs(M[piv][col]) < 1e-12:
            continue
        if piv != col:
            M[col], M[piv] = M[piv], M[col]
        diag = M[col][col]
        for r in range(col + 1, n):
            factor = M[r][col] / diag
            if factor == 0.0:
                continue
            for c in range(col, n + 1):
                M[r][c] -= factor * M[col][c]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = M[i][n]
        for j in range(i + 1, n):
            s -= M[i][j] * x[j]
        x[i] = s / M[i][i] if abs(M[i][i]) > 1e-12 else 0.0
    return x


def build_scale_curve(level_summary: list[dict], lam: float = 0.5):
    """Replicates src/lib/value-scale.tsx (Weighted Whittaker + PAVA + PCHIP)."""
    raw = []
    for l in level_summary:
        lvl = l["level"]
        num = 31 if lvl == "Ω" else (int(lvl) if lvl.isdigit() else None)
        if num is not None and l.get("hard_median") is not None:
            raw.append((float(num), float(l["hard_median"]), max(1.0, float(l.get("n_charts_total", 1)))))
    raw.sort(key=lambda x: x[0])

    nums = [r[0] for r in raw]
    y = [r[1] for r in raw]
    w_raw = [r[2] for r in raw]
    n = len(y)
    mean_w = sum(w_raw) / max(1, n)
    w = [wi / mean_w for wi in w_raw]

    if n >= 3 and lam > 0:
        A = [[0.0] * n for _ in range(n)]
        for i in range(n):
            A[i][i] = w[i]
        # Add lam * (D2^T D2) where each row of D2 has [1, -2, 1] at (i, i+1, i+2)
        for i in range(n - 2):
            coeffs = ((i, 1.0), (i + 1, -2.0), (i + 2, 1.0))
            for r_idx, r_val in coeffs:
                for c_idx, c_val in coeffs:
                    A[r_idx][c_idx] += lam * r_val * c_val
        rhs = [w[i] * y[i] for i in range(n)]
        v = solve_linear(A, rhs)
    else:
        v = y[:]

    # PAVA isotonic pooling
    blocks: list[list[float]] = []
    for i in range(n):
        blocks.append([nums[i], v[i], 1.0])
        while len(blocks) >= 2 and blocks[-1][1] / blocks[-1][2] <= blocks[-2][1] / blocks[-2][2]:
            b = blocks.pop()
            blocks[-1][0] += b[0]
            blocks[-1][1] += b[1]
            blocks[-1][2] += b[2]

    pts_num = [b[0] / b[2] for b in blocks]
    pts_val = [b[1] / b[2] for b in blocks]

    k = len(pts_val)
    h = [max(pts_val[i + 1] - pts_val[i], 1e-4) for i in range(k - 1)]
    delta = [(pts_num[i + 1] - pts_num[i]) / h[i] for i in range(k - 1)]
    slopes = [0.0] * k
    if k == 2:
        slopes[0] = slopes[1] = delta[0]
    elif k > 2:
        for i in range(1, k - 1):
            if delta[i - 1] * delta[i] > 0:
                w1 = 2.0 * h[i] + h[i - 1]
                w2 = h[i] + 2.0 * h[i - 1]
                slopes[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
        m0 = ((2.0 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1])
        slopes[0] = 0.0 if m0 * delta[0] <= 0 else max(-3.0 * abs(delta[0]), min(3.0 * abs(delta[0]), m0))
        mn = ((2.0 * h[-1] + h[-2]) * delta[-1] - h[-1] * delta[-2]) / (h[-1] + h[-2])
        slopes[-1] = 0.0 if mn * delta[-1] <= 0 else max(-3.0 * abs(delta[-1]), min(3.0 * abs(delta[-1]), mn))

    def to_scale(val: float) -> float:
        if val <= pts_val[0]:
            ri = 1
            while ri < k - 1 and pts_val[ri] - pts_val[0] < 0.5:
                ri += 1
            dv = pts_val[ri] - pts_val[0]
            sl = (pts_num[ri] - pts_num[0]) / dv if dv > 0.05 else 1.5
            return float(pts_num[0] + (val - pts_val[0]) * sl)
        if val >= pts_val[-1]:
            ri = k - 2
            while ri > 0 and pts_val[-1] - pts_val[ri] < 0.5:
                ri -= 1
            dv = pts_val[-1] - pts_val[ri]
            sl = (pts_num[-1] - pts_num[ri]) / dv if dv > 0.05 else 1.5
            return float(pts_num[-1] + (val - pts_val[-1]) * sl)
        i = max(0, min(k - 2, bisect.bisect_right(pts_val, val) - 1))
        t = (val - pts_val[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return float(
            (2.0 * t3 - 3.0 * t2 + 1.0) * pts_num[i]
            + (t3 - 2.0 * t2 + t) * h[i] * slopes[i]
            + (-2.0 * t3 + 3.0 * t2) * pts_num[i + 1]
            + (t3 - t2) * h[i] * slopes[i + 1]
        )

    return raw, pts_num, pts_val, delta, to_scale


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    def check(cond: bool, msg: str, warn_only: bool = False):
        if not cond:
            (warnings if warn_only else errors).append(msg)

    charts = json.loads((DATA_DIR / "charts.json").read_text(encoding="utf-8"))
    lsum = json.loads((DATA_DIR / "level-summary.json").read_text(encoding="utf-8"))
    meta = json.loads((DATA_DIR / "meta.json").read_text(encoding="utf-8"))
    players = json.loads((DATA_DIR / "players.json").read_text(encoding="utf-8"))
    s2i = json.loads((DATA_DIR / "sha512-to-id.json").read_text(encoding="utf-8"))

    print("=== QUEstimator Post-Calibration Smell Test ===")
    print(f"Loaded: {len(charts)} charts | {len(lsum)} levels | {len(players)} players | {len(s2i)} sha512s")

    # 1. Schema & counts consistency
    check(len(charts) == meta["n_charts_total"], f"charts.json count ({len(charts)}) != meta.n_charts_total ({meta['n_charts_total']})")
    check(len(players) == meta["n_players"], f"players.json count ({len(players)}) != meta.n_players ({meta['n_players']})")
    check(len(s2i) == len(charts), f"sha512-to-id count ({len(s2i)}) != charts count ({len(charts)})")
    bn_count = sum(1 for c in charts if c.get("b_normal") is not None)
    check(bn_count == len(charts), f"b_normal missing on {len(charts) - bn_count} charts")
    cov_count = sum(1 for c in charts if c.get("cov_a_bh") is not None and c.get("cov_a_bv") is not None)
    check(cov_count == len(charts), f"cov_a_bh/cov_a_bv missing on {len(charts) - cov_count} charts", warn_only=True)
    pdist = meta.get("player_distribution")
    check(
        isinstance(pdist, dict) and sum(pdist.get("theta_histogram", [])) == len(players),
        "meta.player_distribution missing or histogram sum != n_players",
        warn_only=True,
    )

    # 2. Convergence gate
    conv = meta.get("convergence", {})
    divs = conv.get("nuts", {}).get("divergences", 0)
    check(conv.get("convergence_ok") is True, f"meta convergence_ok is not True: {conv.get('convergence_ok')}")
    check(divs == 0, f"post-warmup divergences > 0: {divs}")
    check((conv.get("r_hat_max") or 99) < 1.05, f"r_hat_max >= 1.05: {conv.get('r_hat_max')}")
    check((conv.get("ess_min") or 0) >= 200, f"ess_min < 200: {conv.get('ess_min')}")

    # 3. Anchor coverage, monotonicity, and smoothed scale slope
    raw, pts_num, pts_val, seg_slopes, to_scale = build_scale_curve(lsum, lam=0.5)
    check(len(raw) == 31, f"Expected 31 ordered level anchors (1..30, Ω), got {len(raw)}")
    raw_diffs = [raw[i + 1][1] - raw[i][1] for i in range(len(raw) - 1)]
    non_mono = [(raw[i][0], raw[i + 1][0], raw_diffs[i]) for i in range(len(raw_diffs)) if raw_diffs[i] <= 0]
    check(len(non_mono) == 0, f"Non-monotonic raw folder medians: {non_mono}", warn_only=True)
    max_slope = max(seg_slopes)
    min_dv = min(pts_val[i + 1] - pts_val[i] for i in range(len(pts_val) - 1))
    check(max_slope <= 3.5, f"Smoothed scale max slope too steep: {max_slope:.2f} lvl/logit")
    print(f"Anchors: {len(raw)}/31 ordered | PAVA blocks: {len(pts_num)} | smoothed min_dv={min_dv:.3f}, max_slope={max_slope:.2f}")

    # 4. Chart U_E range and provisional sanity
    ue_hard = [to_scale(c["b_hard"]) for c in charts if c.get("b_hard") is not None]
    check(0.0 <= min(ue_hard) <= 2.5, f"Unexpected min chart HARD U_E: {min(ue_hard):.2f}")
    check(30.0 <= max(ue_hard) <= 34.0, f"Unexpected max chart HARD U_E: {max(ue_hard):.2f}")

    n_prov = sum(1 for c in charts if c.get("provisional"))
    check(n_prov == meta["n_charts_provisional"], f"provisional count mismatch: {n_prov} vs meta {meta['n_charts_provisional']}")
    core_charts = [c for c in charts if c["level"].isdigit() and 12 <= int(c["level"]) <= 26]
    core_valid_rate = sum(1 for c in core_charts if not c["provisional"]) / max(1, len(core_charts))
    check(core_valid_rate >= 0.90, f"Core Lv 12-26 valid rate too low: {core_valid_rate:.1%}")
    print(f"Charts: HARD U_E [{min(ue_hard):.2f}, {max(ue_hard):.2f}] | valid={len(charts)-n_prov}, prov={n_prov} | core(12-26) valid={core_valid_rate:.1%}")

    # 5. Player ratings sanity
    p_thetas = [p["t"] for p in players.values() if isinstance(p.get("t"), (int, float)) and math.isfinite(p["t"])]
    check(len(p_thetas) == len(players), "Some players have non-finite theta")
    p_ues = [to_scale(t) for t in p_thetas]
    check(29.0 <= max(p_ues) <= 35.0, f"Unexpected top player U_E: {max(p_ues):.2f}")
    print(f"Players: theta [{min(p_thetas):+.2f}, {max(p_thetas):+.2f}] | U_E [{min(p_ues):.2f}, {max(p_ues):.2f}] (med {statistics.median(p_ues):.2f})")

    if warnings:
        print("\nWARNINGS:")
        for w in warnings:
            print(f"  - {w}")

    if errors:
        print("\nFAILED CHECKS:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("\nALL SMELL TESTS PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
