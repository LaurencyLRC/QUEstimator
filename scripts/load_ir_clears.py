#!/usr/bin/env python3
"""
QUEstimator IR data loader.

Loads pre-scraped Qwilight leaderboard JSONs and converts them to the
(chart_idx, player_idx, clear_status) tuple format expected by the GRM fitter.

Filtering rules:
  - audioMultiplier >= 1     (no speed-rate manipulation)
  - inputFavorMode == 0      (no keymode override/convert)
  - longNoteMode == 0        (no LN mode change)
  - not isPaused             (no pauses)
  - handled in {4,1,5,6,2,8} (FAILED, NORMAL, HARD, V-HARD, FC, PFC)
    — ASSIST (7) and unused (3) are excluded
    — FC (2) and PFC (8) are mapped to V-HARD (category 3) because they
      represent "zero gauge health loss", which is strictly harder than
      V-HARD survival.

Deduplication:
  Per (chart, player), keep only the BEST clear status. A player may have
  multiple leaderboard entries from different plays; the GRM needs the peak
  achievement.

Output:
  np.array of shape (n_records, 3): [chart_idx, player_idx, clear_status]
  dict mapping avatarID → player_idx
"""

from __future__ import annotations
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

# ── Configuration ────────────────────────────────────────────────────────────
IR_DIR = Path(__file__).resolve().parent.parent / "upload" / "6Kleaderboards"
ENRICHED_PATH = Path(__file__).resolve().parent.parent / "upload" / "UEtable_enriched.json"

# Lamp (handled) → GRM category mapping
HANDLED_TO_GRM = {
    4: 0,   # FAILED
    1: 1,   # NORMAL
    5: 2,   # HARD
    6: 3,   # V-HARD
    2: 3,   # FULL COMBO  → treated as V-HARD-or-better
    8: 3,   # PERFECT     → treated as V-HARD-or-better
}
# Excluded: 7 (ASSIST), 3 (unused)

# Fields that must pass the filter
def is_valid_entry(entry: dict) -> bool:
    """Return True if this leaderboard entry is a valid clear attempt."""
    if entry.get("audioMultiplier", 1) < 1:
        return False
    if entry.get("inputFavorMode", 0) != 0:
        return False
    if entry.get("longNoteMode", 0) != 0:
        return False
    if entry.get("isPaused", False):
        return False
    if entry.get("handled") not in HANDLED_TO_GRM:
        return False
    return True


def load_ir_clears(charts_df: pd.DataFrame):
    """
    Load pre-scraped leaderboard JSONs and convert to clear-status tuples.

    Args:
        charts_df: DataFrame with columns ['md5', 'sha512', 'level', ...]
                   as produced by load_charts() in pipeline.py.

    Returns:
        clears: np.ndarray of shape (n_records, 3), dtype int64
                columns: [chart_idx, player_idx, clear_status]
        player_map: dict mapping avatarID → player_idx
        stats: dict with diagnostic statistics
    """
    # Build SHA-512 → chart_idx lookup
    sha512_to_idx = {}
    for idx, row in charts_df.iterrows():
        sha = row.get("sha512", "")
        if sha:
            sha512_to_idx[sha] = idx

    records = []  # list of (chart_idx, player_idx, clear_status)
    player_map = {}  # avatarID → player_idx
    next_player_idx = 0

    # Diagnostics
    stats = {
        "total_files": 0,
        "matched_files": 0,
        "total_entries": 0,
        "valid_entries": 0,
        "filtered_out": 0,
        "unique_players": 0,
        "per_chart_valid": [],
    }

    for fname in sorted(os.listdir(IR_DIR)):
        if not fname.endswith(".json"):
            continue
        stats["total_files"] += 1

        sha512 = fname.replace(".json", "")
        if sha512 not in sha512_to_idx:
            continue
        stats["matched_files"] += 1
        chart_idx = sha512_to_idx[sha512]

        filepath = IR_DIR / fname
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        comments = data.get("comments", [])
        chart_valid = 0

        for entry in comments:
            stats["total_entries"] += 1

            if not is_valid_entry(entry):
                stats["filtered_out"] += 1
                continue

            avatar_id = entry["avatarID"]
            if avatar_id not in player_map:
                player_map[avatar_id] = next_player_idx
                next_player_idx += 1
            player_idx = player_map[avatar_id]

            clear_status = HANDLED_TO_GRM[entry["handled"]]
            records.append((chart_idx, player_idx, clear_status))
            chart_valid += 1

        stats["per_chart_valid"].append(chart_valid)

    stats["unique_players"] = len(player_map)

    if not records:
        raise RuntimeError("No valid clear records found in IR leaderboards")

    # Convert to DataFrame for deduplication
    df = pd.DataFrame(records, columns=["chart_idx", "player_idx", "clear_status"])

    # Deduplicate: per (chart, player), keep the MAX clear_status (best achievement)
    df = df.groupby(["chart_idx", "player_idx"])["clear_status"].max().reset_index()

    clears = df.to_numpy(dtype=np.int64)
    stats["valid_entries"] = len(clears)  # after dedup
    stats["per_chart_valid"] = np.array(stats["per_chart_valid"])

    return clears, player_map, stats


def print_stats(stats: dict):
    """Print diagnostic statistics to stdout."""
    print(f"  IR files found:        {stats['total_files']}")
    print(f"  Matched to charts:     {stats['matched_files']}")
    print(f"  Total entries:         {stats['total_entries']:,}")
    print(f"  Filtered out:          {stats['filtered_out']:,}")
    print(f"  Unique players:        {stats['unique_players']:,}")
    print(f"  Valid records (dedup): {stats['valid_entries']:,}")
    pc = stats["per_chart_valid"]
    print(f"  Per-chart valid entries:")
    print(f"    Mean:   {pc.mean():.1f}")
    print(f"    Median: {np.median(pc):.0f}")
    print(f"    Min:    {pc.min()}, Max: {pc.max()}")
    print(f"    Charts with <30: {(pc < 30).sum()}")
    print(f"    Charts with 0:    {(pc == 0).sum()}")


if __name__ == "__main__":
    # Quick test: load charts and run the loader
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from pipeline import load_charts

    print("Loading chart metadata...")
    charts_df = load_charts()
    print(f"  {len(charts_df)} charts loaded")

    print("\nLoading IR clears...")
    clears, player_map, stats = load_ir_clears(charts_df)
    print_stats(stats)

    # Show category distribution
    from collections import Counter
    cat_dist = Counter(clears[:, 2])
    print(f"\n  GRM category distribution:")
    for cat in sorted(cat_dist.keys()):
        names = {0: "FAILED", 1: "NORMAL", 2: "HARD", 3: "V-HARD+"}
        print(f"    {cat} ({names[cat]:>8}): {cat_dist[cat]:>8,}")
