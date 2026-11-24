import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { buildScaleCurve, evaluateScaleCurve } from "@/lib/value-scale";
import type { LevelSummary } from "@/lib/questimator-types";

describe("Weighted Whittaker + PAVA + PCHIP U_E scale transform", () => {
  test("guarantees strict monotonicity even when raw folder medians invert", () => {
    const invertedLevels: LevelSummary[] = [
      { level: "10", n_charts_total: 15, n_charts_valid: 15, hard_median: -1.2, hard_q1: null, hard_q3: null, vhard_median: null, vhard_q1: null, vhard_q3: null },
      { level: "11", n_charts_total: 15, n_charts_valid: 15, hard_median: -0.4, hard_q1: null, hard_q3: null, vhard_median: null, vhard_q1: null, vhard_q3: null },
      { level: "12", n_charts_total: 15, n_charts_valid: 15, hard_median: -0.9, hard_q1: null, hard_q3: null, vhard_median: null, vhard_q1: null, vhard_q3: null },
      { level: "13", n_charts_total: 40, n_charts_valid: 40, hard_median: 0.2, hard_q1: null, hard_q3: null, vhard_median: null, vhard_q1: null, vhard_q3: null },
      { level: "14", n_charts_total: 40, n_charts_valid: 40, hard_median: 0.8, hard_q1: null, hard_q3: null, vhard_median: null, vhard_q1: null, vhard_q3: null },
    ];
    const curve = buildScaleCurve(invertedLevels, 0.5);
    let prev = -Infinity;
    for (let x = -3.0; x <= 3.0; x += 0.1) {
      const y = evaluateScaleCurve(curve, x, "lerp")!;
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
  });

  test("raw mode is an exact identity transform and null/NaN return null", () => {
    const levels: LevelSummary[] = [
      { level: "1", n_charts_total: 10, n_charts_valid: 10, hard_median: -2.0, hard_q1: null, hard_q3: null, vhard_median: null, vhard_q1: null, vhard_q3: null },
      { level: "30", n_charts_total: 10, n_charts_valid: 10, hard_median: 4.0, hard_q1: null, hard_q3: null, vhard_median: null, vhard_q1: null, vhard_q3: null },
    ];
    const curve = buildScaleCurve(levels, 0.5);
    expect(evaluateScaleCurve(curve, 1.234, "raw")).toBe(1.234);
    expect(evaluateScaleCurve(curve, null, "lerp")).toBeNull();
    expect(evaluateScaleCurve(curve, Number.NaN, "lerp")).toBeNull();
  });

  test("production level-summary.json builds 31 monotonic anchors with smooth bounds", () => {
    const jsonPath = join(process.cwd(), "public", "data", "level-summary.json");
    const levels = JSON.parse(readFileSync(jsonPath, "utf-8")) as LevelSummary[];
    const curve = buildScaleCurve(levels, 0.5);
    expect(curve.pts.length).toBe(31);

    let prev = -Infinity;
    for (let x = -6.0; x <= 8.0; x += 0.05) {
      const y = evaluateScaleCurve(curve, x, "lerp")!;
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }

    // Check Lv 1 and Ω endpoints stay anchored near 1 and 31
    expect(evaluateScaleCurve(curve, curve.pts[0].val, "lerp")!).toBeCloseTo(1.0, 2);
    expect(evaluateScaleCurve(curve, curve.pts[curve.pts.length - 1].val, "lerp")!).toBeCloseTo(31.0, 2);
  });
});
