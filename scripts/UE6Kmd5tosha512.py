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

import asyncio
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


async def fetch_sha512_batch(to_query: list, sha512_cache: dict) -> int:
    semaphore = asyncio.Semaphore(8)
    newly_mapped = 0

    async with httpx.AsyncClient(
        timeout=15.0, headers={"User-Agent": "QUEstimator Data Pipeline / 1.0"}
    ) as client:
        async def fetch_single(chart: dict, idx: int, total: int):
            nonlocal newly_mapped
            md5_hash = chart.get("md5", "")
            url = f"https://ez2pattern.kr/api/bms/v1/_internal_/md5_or_sha256_to_sha512.json?md5={md5_hash}"
            title_display = chart.get("title", "?")[:30].encode("ascii", "replace").decode("ascii")
            async with semaphore:
                for attempt in range(1, 4):
                    try:
                        resp = await client.get(url)
                        if resp.status_code == 200:
                            data = resp.json()
                            sha = data.get("sha512", "")
                            if sha:
                                sha512_cache[md5_hash] = sha
                                newly_mapped += 1
                                print(f"  [New] Mapped {title_display} -> {sha[:16]}...")
                            break
                        elif resp.status_code in (429, 500, 502, 503, 504):
                            await asyncio.sleep(0.5 * attempt)
                        else:
                            break
                    except Exception as e:
                        if attempt < 3:
                            await asyncio.sleep(0.5 * attempt)
                        else:
                            print(f"  [{idx}/{total}] Failed to map {title_display}: {e}")

        tasks = [fetch_single(chart, i, len(to_query)) for i, chart in enumerate(to_query, start=1)]
        await asyncio.gather(*tasks)

    return newly_mapped


def main():
    if not INPUT_PATH.exists():
        print(f"Error: '{INPUT_PATH.name}' not found. Run fetch step first.")
        sys.exit(1)

    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        ue_table = json.load(f)

    print(f"Loaded {len(ue_table)} charts from {INPUT_PATH.name}")

    # Load existing SHA-512 cache and persistent monotonic integer IDs if available
    sha512_cache = {}
    id_cache = {}
    if OUTPUT_PATH.exists():
        try:
            with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
            for c in existing_data:
                md5 = c.get("md5")
                sha512 = c.get("sha512")
                cid = c.get("id")
                if md5:
                    if sha512:
                        sha512_cache[md5] = sha512
                    if cid is not None:
                        id_cache[md5] = int(cid)
            print(f"Found {len(sha512_cache)} cached SHA-512 mappings and {len(id_cache)} chart IDs from existing {OUTPUT_PATH.name}")
        except Exception as e:
            print(f"Warning: Could not read existing enriched table cache: {e}")

    max_id = max(id_cache.values(), default=-1)

    to_query = [c for c in ue_table if c.get("md5") and c["md5"] not in sha512_cache]
    print(f"Charts to query from EZ2PATTERN API: {len(to_query)}")

    newly_mapped = 0
    if to_query:
        newly_mapped = asyncio.run(fetch_sha512_batch(to_query, sha512_cache))

    enriched_table = []
    mapped = 0
    cached = 0
    failed = 0

    for index, chart in enumerate(ue_table, start=1):
        md5_hash = chart.get("md5")
        chart["sha512"] = ""

        # Preserve existing persistent integer ID or assign next monotonic ID
        if md5_hash and md5_hash in id_cache:
            chart["id"] = id_cache[md5_hash]
        else:
            max_id += 1
            chart["id"] = max_id
            if md5_hash:
                id_cache[md5_hash] = max_id

        if not md5_hash:
            enriched_table.append(chart)
            failed += 1
            continue

        if md5_hash in sha512_cache:
            chart["sha512"] = sha512_cache[md5_hash]
            mapped += 1
            if chart in to_query:
                pass
            else:
                cached += 1
        else:
            failed += 1

        enriched_table.append(chart)

    # Save the enriched data
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(enriched_table, f, indent=2, ensure_ascii=False)

    print(f"\nDone! Total charts: {len(enriched_table)} | Mapped: {mapped} (Cached: {cached}, New: {newly_mapped}) | Failed: {failed}")
    print(f"Enriched table saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
