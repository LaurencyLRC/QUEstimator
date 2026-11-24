#!/usr/bin/env python3
"""
update_all.py - End-to-end QUEstimator refresh, native C11 calibration, and verification.

Runs:
  1. scripts/refresh_data.py (--force by default, or --incremental)
  2. Builds native/questimator_calc if missing and runs full C11 NUTS calibration
  3. scripts/verify_data.py post-calibration smell test

Usage:
    python scripts/update_all.py                   # full refresh + C11 MCMC + verify
    python scripts/update_all.py --incremental     # incremental leaderboard scrape + MCMC + verify
    python scripts/update_all.py --skip-refresh    # skip scraping, run C11 MCMC + verify
    python scripts/update_all.py --recover-only    # refresh + fast EAP player recovery + verify
"""

from __future__ import annotations
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ROOT / "scripts"
NATIVE_DIR = ROOT / "native"
BINARY = NATIVE_DIR / ("questimator_calc.exe" if os.name == "nt" else "questimator_calc")


def run_step(cmd: list[str], label: str) -> None:
    print(f"\n{'=' * 60}\n{label}\n{'=' * 60}", flush=True)
    res = subprocess.run(cmd, cwd=str(ROOT))
    if res.returncode != 0:
        print(f"ERROR: '{label}' failed with exit code {res.returncode}", file=sys.stderr)
        sys.exit(res.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description="QUEstimator End-to-End Update Pipeline")
    parser.add_argument("--incremental", action="store_true", help="Incremental leaderboard scrape (missing charts only)")
    parser.add_argument("--skip-refresh", action="store_true", help="Skip U_E table & leaderboard refresh")
    parser.add_argument("--recover-only", action="store_true", help="Only run fast EAP player theta recovery (skip MCMC)")
    parser.add_argument("--rebuild", action="store_true", help="Force rebuild of native/questimator_calc")
    args = parser.parse_args()

    if not args.skip_refresh:
        cmd = [sys.executable, str(SCRIPTS_DIR / "refresh_data.py")]
        if not args.incremental:
            cmd.append("--force")
        run_step(cmd, "STEP 1: Refreshing U_E table & Qwilight IR leaderboards")

    if args.rebuild or not BINARY.exists():
        make_bin = shutil.which("make") or shutil.which("mingw32-make")
        if make_bin:
            if args.rebuild:
                run_step([make_bin, "-C", str(NATIVE_DIR), "clean"], "STEP 2a: Cleaning native C11 build artifacts")
            run_step([make_bin, "-C", str(NATIVE_DIR)], "STEP 2b: Building native C11 calibration engine")
        else:
            gcc_bin = shutil.which("gcc") or shutil.which("clang")
            if not gcc_bin:
                print("ERROR: Neither 'make' nor 'gcc'/'clang' found on PATH.", file=sys.stderr)
                sys.exit(1)
            srcs = [str(NATIVE_DIR / f) for f in ("main.c", "json.c", "data.c", "grm.c", "nuts.c", "diag.c")]
            run_step(
                [gcc_bin, "-O3", "-march=native", "-fopenmp", "-std=c11", "-Wall", "-Wextra",
                 "-fno-math-errno", "-o", str(BINARY), *srcs, "-fopenmp", "-lm"],
                "STEP 2a: Building native C11 calibration engine (direct compiler fallback)",
            )

    calc_cmd = [str(BINARY)]
    if args.recover_only:
        calc_cmd.append("--recover-theta-only")
    run_step(calc_cmd, "STEP 2: Running native C11 Bayesian GRM calibration")

    run_step([sys.executable, str(SCRIPTS_DIR / "verify_data.py")], "STEP 3: Running post-calibration smell test")
    print("\nPipeline finished cleanly. Ready to review and commit.")


if __name__ == "__main__":
    main()
