#!/usr/bin/env python3
"""
refresh_data.py — Data refresh orchestrator.

This script orchestrates the three data-acquisition steps:
  1. Fetch the latest U_E table from classmaterma.github.io
  2. Enrich it with SHA-512 hashes (via EZ2PATTERN API with local caching)
  3. Scrape Qwilight IR leaderboards (incremental by default, or --force for full refresh)

It detects changes (new charts, removed charts, level reassignments),
prunes stale leaderboards, and ensures the local dataset is fully synchronized.

Usage:
    python3 scripts/refresh_data.py              # incremental refresh
    python3 scripts/refresh_data.py --force      # full refresh of all leaderboards

Paths are resolved relative to the project root (two levels up from scripts/).
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

# Ensure UTF-8 output on Windows console
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_DIR = _PROJECT_ROOT / "upload"
SCORE_JSON_URL = "https://classmaterma.github.io/UE/score.json"
UE_TABLE_PATH = UPLOAD_DIR / "UEtable.json"
ENRICHED_PATH = UPLOAD_DIR / "UEtable_enriched.json"
LEADERBOARD_DIR = UPLOAD_DIR / "6Kleaderboards"

SCRIPTS_DIR = Path(__file__).resolve().parent
PYTHON = sys.executable


def fetch_ue_table() -> bool:
    """Fetch the latest U_E table from classmaterma.github.io. Returns True if changed."""
    print("=" * 60)
    print("STEP 1: Fetching latest U_E table")
    print("=" * 60)

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(SCORE_JSON_URL)
            response.raise_for_status()
            new_data = response.json()
    except Exception as e:
        print(f"  ERROR: Failed to fetch U_E table: {e}")
        return False

    new_count = len(new_data)
    print(f"  Fetched {new_count} charts from {SCORE_JSON_URL}")

    # Compare with existing
    comparison_source = UE_TABLE_PATH if UE_TABLE_PATH.exists() else ENRICHED_PATH
    if comparison_source.exists():
        with open(comparison_source, "r", encoding="utf-8") as f:
            old_data = json.load(f)
        old_count = len(old_data)

        old_md5s = {c["md5"] for c in old_data if c.get("md5")}
        new_md5s = {c["md5"] for c in new_data if c.get("md5")}
        added = new_md5s - old_md5s
        removed = old_md5s - new_md5s

        # Check for level changes on common charts
        old_levels = {c["md5"]: c.get("level") for c in old_data if c.get("md5")}
        new_levels = {c["md5"]: c.get("level") for c in new_data if c.get("md5")}
        level_changes = []
        for md5 in old_md5s & new_md5s:
            if old_levels.get(md5) != new_levels.get(md5):
                level_changes.append((md5, old_levels.get(md5), new_levels.get(md5)))

        if not added and not removed and not level_changes:
            print(f"  No table differences detected (still {old_count} charts)")
        else:
            print(f"  Changes detected relative to {comparison_source.name}:")
            print(f"    Added charts:         {len(added)}")
            print(f"    Removed charts:       {len(removed)}")
            print(f"    Level reassignments:  {len(level_changes)}")
    else:
        print(f"  No existing table found — fresh download ({new_count} charts)")

    # Write the new table
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with open(UE_TABLE_PATH, "w", encoding="utf-8") as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)
    print(f"  Saved raw table to {UE_TABLE_PATH}")
    return True


def enrich_hashes():
    """Run the MD5 → SHA-512 enrichment script."""
    print()
    print("=" * 60)
    print("STEP 2: Enriching with SHA-512 hashes")
    print("=" * 60)

    result = subprocess.run(
        [PYTHON, str(SCRIPTS_DIR / "UE6Kmd5tosha512.py")],
        cwd=str(_PROJECT_ROOT),
    )
    if result.returncode != 0:
        print(f"  ERROR: Enrichment script failed with code {result.returncode}")
        sys.exit(1)


def prune_stale_leaderboards():
    """Clean up leaderboard files for charts that no longer exist in the enriched table."""
    if not (ENRICHED_PATH.exists() and LEADERBOARD_DIR.exists()):
        return

    with open(ENRICHED_PATH, "r", encoding="utf-8") as f:
        enriched = json.load(f)
    valid_sha512s = {c["sha512"] for c in enriched if c.get("sha512")}

    removed = 0
    for lb_file in LEADERBOARD_DIR.glob("*.json"):
        sha512 = lb_file.stem
        if sha512 not in valid_sha512s:
            lb_file.unlink()
            removed += 1
    if removed:
        print(f"  Pruned {removed} stale leaderboard file(s) (charts removed from U_E table)")


def scrape_leaderboards(force: bool):
    """Run the leaderboard scraper."""
    print()
    print("=" * 60)
    print("STEP 3: Scraping Qwilight IR leaderboards")
    print("=" * 60)

    prune_stale_leaderboards()

    cmd = [PYTHON, str(SCRIPTS_DIR / "6keyLBcrawler.py")]
    if force:
        cmd.append("--force")

    result = subprocess.run(cmd, cwd=str(_PROJECT_ROOT))
    if result.returncode != 0:
        print(f"  ERROR: Scraper script failed with code {result.returncode}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="QUEstimator Data Refresh Orchestrator")
    parser.add_argument("--force", action="store_true", help="Force re-fetch of all IR leaderboards")
    parser.add_argument("--incremental", action="store_true", help="Only fetch new/missing leaderboards")
    args = parser.parse_args()

    print(f"QUEstimator Data Refresh")
    print(f"Started: {datetime.now(timezone.utc).isoformat()}")
    print()

    # Step 1: Fetch latest U_E table
    fetch_ue_table()

    # Step 2: Enrich with SHA-512 hashes
    enrich_hashes()

    # Step 3: Scrape leaderboards (force or incremental)
    scrape_leaderboards(force=args.force)

    print()
    print("=" * 60)
    print("Data refresh complete!")
    print(f"Finished: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)


if __name__ == "__main__":
    main()
