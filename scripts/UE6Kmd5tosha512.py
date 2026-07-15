#!/usr/bin/env python3
"""
UE6Kmd5tosha512.py — MD5 → SHA-512 hash enrichment.

Reads the base U_E table (UEtable.json), queries the EZ2PATTERN Rosetta Stone
API for each chart's SHA-512 hash, and writes the enriched table
(UEtable_enriched.json) with both hash types.

This script is idempotent: re-running it with an unchanged input produces an
identical output. New charts added to the base table get enriched automatically.

Usage:
    python3 scripts/UE6Kmd5tosha512.py

Paths are resolved relative to the project root (two levels up from scripts/).
"""

import json
import time
from pathlib import Path

import httpx

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable.json"
OUTPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"


def main():
    # Load the original U_E table
    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        ue_table = json.load(f)

    print(f"Loaded {len(ue_table)} charts from {INPUT_PATH.name}")
    print("Enriching with SHA-512 hashes via EZ2PATTERN API...")

    enriched_table = []
    mapped = 0
    failed = 0

    with httpx.Client(timeout=15.0, headers={"User-Agent": "QUEstimator Data Pipeline / 1.0"}) as client:
        for index, chart in enumerate(ue_table, start=1):
            md5_hash = chart.get("md5")
            chart["sha512"] = ""

            if md5_hash:
                try:
                    url = f"https://ez2pattern.kr/api/bms/v1/_internal_/md5_or_sha256_to_sha512.json?md5={md5_hash}"
                    response = client.get(url)

                    if response.status_code == 200:
                        data = response.json()
                        chart["sha512"] = data.get("sha512", "")
                        if chart["sha512"]:
                            mapped += 1
                        else:
                            failed += 1
                    else:
                        failed += 1
                except Exception as e:
                    print(f"  [{index}/{len(ue_table)}] Failed to map {chart.get('title', '?')[:30]}: {e}")
                    failed += 1

                # Polite rate limiting
                time.sleep(0.01)

            enriched_table.append(chart)

            if index % 200 == 0:
                print(f"  [{index}/{len(ue_table)}] mapped={mapped} failed={failed}")

    # Save the enriched data
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(enriched_table, f, indent=4, ensure_ascii=False)

    print(f"\nDone! Mapped: {mapped}, Failed: {failed}")
    print(f"Enriched table saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
