#!/usr/bin/env python3
"""
refresh_data.py — Weekly data refresh orchestrator.

This script orchestrates the three data-acquisition steps:
  1. Fetch the latest U_E table from classmaterma.github.io
  2. Enrich it with SHA-512 hashes (via EZ2PATTERN API)
  3. Re-scrape all Qwilight IR leaderboards

It detects changes (new charts, removed charts, level reassignments) and
ensures the local data stays in sync with the upstream sources.

Usage:
    python3 scripts/refresh_data.py

Paths are resolved relative to the project root (two levels up from scripts/).
"""

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_DIR = _PROJECT_ROOT / "upload"
SCORE_JSON_URL = "https://classmaterma.github.io/UE/score.json"
UE_TABLE_PATH = UPLOAD_DIR / "UEtable.json"
ENRICHED_PATH = UPLOAD_DIR / "UEtable_enriched.json"
LEADERBOARD_DIR = UPLOAD_DIR / "6Kleaderboards"

# Scripts (in the same directory as this file)
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
    if UE_TABLE_PATH.exists():
        with open(UE_TABLE_PATH, "r", encoding="utf-8") as f:
            old_data = json.load(f)
        old_count = len(old_data)

        old_md5s = {c["md5"] for c in old_data}
        new_md5s = {c["md5"] for c in new_data}
        added = new_md5s - old_md5s
        removed = old_md5s - new_md5s

        # Check for level changes on common charts
        old_levels = {c["md5"]: c.get("level") for c in old_data}
        new_levels = {c["md5"]: c.get("level") for c in new_data}
        level_changes = []
        for md5 in old_md5s & new_md5s:
            if old_levels[md5] != new_levels[md5]:
                level_changes.append((md5, old_levels[md5], new_levels[md5]))

        if not added and not removed and not level_changes:
            print(f"  No changes detected (still {old_count} charts)")
            return False

        print(f"  Changes detected:")
        print(f"    Added:   {len(added)} charts")
        print(f"    Removed: {len(removed)} charts")
        print(f"    Level changes: {len(level_changes)} charts")
        if added:
            print(f"    New chart titles: {[c['title'][:30] for c in new_data if c['md5'] in added][:5]}")
    else:
        print(f"  No existing table found — fresh download")

    # Write the new table
    with open(UE_TABLE_PATH, "w", encoding="utf-8") as f:
        json.dump(new_data, f, ensure_ascii=False)
    print(f"  Saved to {UE_TABLE_PATH}")
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


def scrape_leaderboards():
    """Run the leaderboard scraper with --force (re-fetch all)."""
    print()
    print("=" * 60)
    print("STEP 3: Scraping Qwilight IR leaderboards")
    print("=" * 60)

    # Clean up leaderboards for charts that were removed from the U_E table
    if ENRICHED_PATH.exists() and LEADERBOARD_DIR.exists():
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
            print(f"  Cleaned up {removed} stale leaderboard files (charts removed from U_E table)")

    # Run the scraper with --force
    result = subprocess.run(
        [PYTHON, str(SCRIPTS_DIR / "6keyLBcrawler.py"), "--force"],
        cwd=str(_PROJECT_ROOT),
    )
    if result.returncode != 0:
        print(f"  ERROR: Scraper script failed with code {result.returncode}")
        sys.exit(1)


def main():
    print(f"QUEstimator Weekly Data Refresh")
    print(f"Started: {datetime.now(timezone.utc).isoformat()}")
    print()

    # Step 1: Fetch latest U_E table
    fetch_ue_table()

    # Step 2: Enrich with SHA-512 hashes (always run — catches new charts)
    enrich_hashes()

    # Step 3: Scrape all leaderboards (force re-fetch)
    scrape_leaderboards()

    print()
    print("=" * 60)
    print("Data refresh complete!")
    print(f"Finished: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)


if __name__ == "__main__":
    main()
