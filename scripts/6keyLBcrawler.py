#!/usr/bin/env python3
"""
6keyLBcrawler.py — Qwilight IR leaderboard scraper (Async version).

Reads the enriched U_E table (UEtable_enriched.json), fetches each chart's
leaderboard from the Qwilight IR API, and saves the raw JSON to
6Kleaderboards/{sha512}.json.

Features:
  - Async concurrency with polite semaphore (5-6 concurrent connections)
  - Automatic retry with exponential backoff on network errors
  - Incremental mode by default, or --force to refresh all leaderboards

Usage:
    python3 scripts/6keyLBcrawler.py              # incremental (skip existing)
    python3 scripts/6keyLBcrawler.py --force      # refresh all leaderboards

Paths are resolved relative to the project root (two levels up from scripts/).
"""

import argparse
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
ENRICHED_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"
SAVE_DIR = _PROJECT_ROOT / "upload" / "6Kleaderboards"

CONCURRENCY_LIMIT = 6
MAX_RETRIES = 3
TIMEOUT_SECONDS = 20.0


async def fetch_chart_leaderboard(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    sha512: str,
    title: str,
    save_path: Path,
    index: int,
    total: int,
    stats: dict,
):
    url = f"https://taehui.net/qwilight/www/comment?noteID={sha512}:0"

    async with semaphore:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    # Write to file
                    with open(save_path, "w", encoding="utf-8") as out_f:
                        json.dump(data, out_f, ensure_ascii=False)
                    stats["fetched"] += 1
                    break
                elif response.status_code in (429, 500, 502, 503, 504):
                    # Server busy or rate limited, back off
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(1.5 * attempt)
                    else:
                        stats["errors"] += 1
                else:
                    stats["errors"] += 1
                    break
            except (httpx.RequestError, httpx.TimeoutException):
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(1.0 * attempt)
                else:
                    stats["errors"] += 1
            except Exception:
                stats["errors"] += 1
                break

    done = stats["fetched"] + stats["skipped"] + stats["errors"]
    if done % 50 == 0 or done == total:
        elapsed = time.time() - stats["start_time"]
        rate = done / max(elapsed, 0.1)
        remaining = (total - done) / max(rate, 0.01)
        print(
            f"[{done:>4}/{total}] fetched={stats['fetched']:<4} skipped={stats['skipped']:<4} "
            f"errors={stats['errors']:<2} | {rate:.1f} charts/s (ETA: {int(remaining)}s)"
        )


async def run_crawler(force: bool):
    try:
        with open(ENRICHED_PATH, "r", encoding="utf-8") as f:
            ue_table = json.load(f)
    except FileNotFoundError:
        print(f"Error: '{ENRICHED_PATH.name}' not found. Run UE6Kmd5tosha512.py first.")
        sys.exit(1)

    SAVE_DIR.mkdir(parents=True, exist_ok=True)

    total_charts = len(ue_table)
    print(f"Loaded {total_charts} charts from {ENRICHED_PATH.name}")
    print(f"Mode: {'FORCE (refresh all)' if force else 'INCREMENTAL (skip existing)'}")
    print(f"Concurrency: {CONCURRENCY_LIMIT} concurrent workers")
    print(f"Saving to {SAVE_DIR}/")
    print("-" * 60)

    stats = {
        "fetched": 0,
        "skipped": 0,
        "errors": 0,
        "start_time": time.time(),
    }

    # Identify which charts need downloading
    tasks_to_run = []
    for index, chart in enumerate(ue_table, start=1):
        sha512 = chart.get("sha512")
        title = chart.get("title", "Unknown Title")
        if not sha512:
            stats["skipped"] += 1
            continue

        save_path = SAVE_DIR / f"{sha512}.json"
        if save_path.exists() and not force:
            stats["skipped"] += 1
            continue

        tasks_to_run.append((sha512, title, save_path, index))

    print(f"Charts to fetch: {len(tasks_to_run)} (Already present / skipped: {stats['skipped']})")
    if not tasks_to_run:
        print("All leaderboards are already up to date!")
        return

    semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)
    headers = {"User-Agent": "QUEstimator Data Pipeline / 1.0"}

    limits = httpx.Limits(max_keepalive_connections=10, max_connections=20)
    async with httpx.AsyncClient(headers=headers, timeout=TIMEOUT_SECONDS, limits=limits) as client:
        tasks = [
            fetch_chart_leaderboard(
                client=client,
                semaphore=semaphore,
                sha512=sha512,
                title=title,
                save_path=save_path,
                index=idx,
                total=total_charts,
                stats=stats,
            )
            for (sha512, title, save_path, idx) in tasks_to_run
        ]
        await asyncio.gather(*tasks)

    elapsed = time.time() - stats["start_time"]
    print("-" * 60)
    print(
        f"Completed in {elapsed:.1f}s | Fetched: {stats['fetched']}, "
        f"Skipped: {stats['skipped']}, Errors: {stats['errors']}"
    )


def main():
    parser = argparse.ArgumentParser(description="Qwilight IR 6K Leaderboard Scraper")
    parser.add_argument("--force", action="store_true", help="Re-fetch all leaderboards (refresh mode)")
    parser.add_argument("--incremental", action="store_true", help="Fetch only missing leaderboards (default)")
    args = parser.parse_args()

    asyncio.run(run_crawler(force=args.force))


if __name__ == "__main__":
    main()
