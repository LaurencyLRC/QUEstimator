#!/usr/bin/env python3
"""
6keyLBcrawler.py — Qwilight IR leaderboard scraper.

Reads the enriched U_E table (UEtable_enriched.json), fetches each chart's
leaderboard from the Qwilight IR API, and saves the raw JSON to
6Kleaderboards/{sha512}.json.

By default, skips files that already exist (resumable). Use --force to
re-fetch all leaderboards (for periodic refreshes).

Usage:
    python3 scripts/6keyLBcrawler.py           # incremental (skip existing)
    python3 scripts/6keyLBcrawler.py --force   # re-fetch all

Paths are resolved relative to the project root (two levels up from scripts/).
"""

import json
import os
import sys
from pathlib import Path

import httpx

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENRICHED_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"
SAVE_DIR = _PROJECT_ROOT / "upload" / "6Kleaderboards"


def main(force: bool = False):
    # Load the enriched data containing the SHA-512 hashes
    try:
        with open(ENRICHED_PATH, "r", encoding="utf-8") as f:
            ue_table = json.load(f)
    except FileNotFoundError:
        print(f"Error: '{ENRICHED_PATH.name}' not found. Run UE6Kmd5tosha512.py first.")
        sys.exit(1)

    SAVE_DIR.mkdir(parents=True, exist_ok=True)

    total_charts = len(ue_table)
    print(f"Loaded {total_charts} charts from {ENRICHED_PATH.name}")
    if force:
        print("Force mode: re-fetching all leaderboards")
    print(f"Saving to {SAVE_DIR}/")
    print()

    headers = {"User-Agent": "QUEstimator Data Pipeline / 1.0"}

    fetched = 0
    skipped = 0
    errors = 0

    with httpx.Client(timeout=15.0, headers=headers) as client:
        for index, chart in enumerate(ue_table, start=1):
            sha512 = chart.get("sha512")
            title = chart.get("title", "Unknown Title")

            # Skip if no sha512 was mapped
            if not sha512:
                print(f"[{index}/{total_charts}] SKIPPED (No SHA-512): {title[:40]}")
                skipped += 1
                continue

            save_path = SAVE_DIR / f"{sha512}.json"

            # Resumability: Skip if we already downloaded this chart's leaderboard
            if save_path.exists() and not force:
                skipped += 1
                continue

            # Fetch the data (Note the obligatory ':0' at the end)
            url = f"https://taehui.net/qwilight/www/comment?noteID={sha512}:0"

            try:
                response = client.get(url)

                if response.status_code == 200:
                    data = response.json()
                    with open(save_path, "w", encoding="utf-8") as out_f:
                        json.dump(data, out_f, ensure_ascii=False)
                    fetched += 1
                    if index % 100 == 0:
                        print(f"[{index}/{total_charts}] fetched={fetched} skipped={skipped} errors={errors}")
                else:
                    print(f"[{index}/{total_charts}] HTTP {response.status_code}: {title[:40]}")
                    errors += 1

            except Exception as e:
                print(f"[{index}/{total_charts}] ERROR fetching {title[:40]}: {e}")
                errors += 1

    print()
    print(f"Done! Fetched: {fetched}, Skipped: {skipped}, Errors: {errors}")
    print(f"Leaderboards saved in {SAVE_DIR}/")


if __name__ == "__main__":
    force = "--force" in sys.argv
    main(force=force)
