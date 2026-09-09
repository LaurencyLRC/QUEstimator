#!/usr/bin/env python3
"""
UE6Kmd5tosha512.py — MD5 → SHA-512 hash enrichment.

Reads the base U_E table (UEtable.json), checks for existing SHA-512 hashes
already cached in UEtable_enriched.json, and queries the EZ2PATTERN Rosetta Stone
API only for new or unmapped charts. Writes the enriched table (UEtable_enriched.json).

This script is idempotent: re-running it with an unchanged input produces an
identical output. New charts added to the base table get enriched automatically.

Usage:
    python3 scripts/UE6Kmd5tosha512.py

Paths are resolved relative to the project root (two levels up from scripts/).
"""

import json
import sys
import time
from pathlib import Path

import httpx

# Ensure UTF-8 output on Windows console
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable.json"
OUTPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"


def main():
    if not INPUT_PATH.exists():
        print(f"Error: '{INPUT_PATH.name}' not found. Run fetch step first.")
        sys.exit(1)

    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        ue_table = json.load(f)

    print(f"Loaded {len(ue_table)} charts from {INPUT_PATH.name}")

    # Load existing SHA-512 cache if available
    sha512_cache = {}
    if OUTPUT_PATH.exists():
        try:
            with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
            for c in existing_data:
                md5 = c.get("md5")
                sha512 = c.get("sha512")
                if md5 and sha512:
                    sha512_cache[md5] = sha512
            print(f"Found {len(sha512_cache)} cached SHA-512 mappings from existing {OUTPUT_PATH.name}")
        except Exception as e:
            print(f"Warning: Could not read existing enriched table cache: {e}")

    enriched_table = []
    mapped = 0
    cached = 0
    newly_mapped = 0
    failed = 0

    to_query = [c for c in ue_table if c.get("md5") and c["md5"] not in sha512_cache]
    print(f"Charts to query from EZ2PATTERN API: {len(to_query)}")

    with httpx.Client(timeout=15.0, headers={"User-Agent": "QUEstimator Data Pipeline / 1.0"}) as client:
        for index, chart in enumerate(ue_table, start=1):
            md5_hash = chart.get("md5")
            chart["sha512"] = ""

            if not md5_hash:
                enriched_table.append(chart)
                failed += 1
                continue

            if md5_hash in sha512_cache:
                chart["sha512"] = sha512_cache[md5_hash]
                mapped += 1
                cached += 1
            else:
                try:
                    url = f"https://ez2pattern.kr/api/bms/v1/_internal_/md5_or_sha256_to_sha512.json?md5={md5_hash}"
                    response = client.get(url)

                    if response.status_code == 200:
                        data = response.json()
                        sha = data.get("sha512", "")
                        chart["sha512"] = sha
                        if sha:
                            mapped += 1
                            newly_mapped += 1
                            sha512_cache[md5_hash] = sha
                            title_display = chart.get("title", "?")[:30].encode("ascii", "replace").decode("ascii")
                            print(f"  [New] Mapped {title_display} -> {sha[:16]}...")
                        else:
                            failed += 1
                    else:
                        failed += 1
                except Exception as e:
                    title_display = chart.get("title", "?")[:30].encode("ascii", "replace").decode("ascii")
                    print(f"  [{index}/{len(ue_table)}] Failed to map {title_display}: {e}")
                    failed += 1

                # Polite rate limiting for external API
                time.sleep(0.05)

            enriched_table.append(chart)

    # Save the enriched data
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(enriched_table, f, indent=4, ensure_ascii=False)

    print(f"\nDone! Total charts: {len(enriched_table)} | Mapped: {mapped} (Cached: {cached}, New: {newly_mapped}) | Failed: {failed}")
    print(f"Enriched table saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
