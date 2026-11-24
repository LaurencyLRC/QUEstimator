import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  categoryProbabilities,
  computeBaseLogLik,
  computeLeaderboard,
  computePlayerDiagnostics,
  computeSamplePlayers,
  eapFromLogLik,
  estimateTheta,
  estimateThetaWithBase,
  estimateThetaWithSe,
  getCensoredDisplayBound,
  itemInformation,
  levelSortKey,
  provisionalReason,
  pStar,
  type Chart,
  type PlayersDict,
} from "@/lib/questimator-types";

function makeChart(overrides: Partial<Chart> = {}): Chart {
  return {
    id: 1,
    md5: "00000000000000000000000000000001",
    title: "Test Chart",
    artist: "Tester",
    level: "20",
    name_diff: "Author",
    video2: "",
    url: "",
    url_diff: "",
    comment: "",
    state: "",
    n: 100,
    n_failed: 10,
    n_normal: 20,
    n_hard: 40,
    n_vhard: 30,
    a: 1.2,
    b_normal: -1.5,
    b_hard: 0.0,
    b_vhard: 1.0,
    b_hard_display: 0.0,
    b_vhard_display: 1.0,
    se_a: 0.1,
    se_b_hard: 0.12,
    se_b_vhard: 0.14,
    provisional: false,
    ...overrides,
  };
}

describe("GRM survival & category probabilities", () => {
  test("pStar equals 0.5 at theta === b and increases monotonically", () => {
    expect(pStar(0.5, 1.4, 0.5)).toBeCloseTo(0.5, 10);
    expect(pStar(-2, 1.2, 0)).toBeLessThan(pStar(0, 1.2, 0));
    expect(pStar(0, 1.2, 0)).toBeLessThan(pStar(2, 1.2, 0));
  });

  test("categoryProbabilities sum to 1 across all categories", () => {
    for (const theta of [-4, -1, 0, 1.5, 4]) {
      const p = categoryProbabilities(theta, 1.3, -1.5, 0.2, 1.4);
      const total = p.failed + p.normal + p.hard + p.vhard;
      expect(total).toBeCloseTo(1.0, 12);
      expect(p.failed).toBeGreaterThanOrEqual(0);
      expect(p.normal).toBeGreaterThanOrEqual(0);
      expect(p.hard).toBeGreaterThanOrEqual(0);
      expect(p.vhard).toBeGreaterThanOrEqual(0);
    }
  });

  test("itemInformation is strictly positive and respects explicit b_normal", () => {
    const infoExplicit = itemInformation(-2.0, 1.2, 0.0, 1.0, -2.0);
    const infoFallback = itemInformation(-2.0, 1.2, 0.0, 1.0);
    expect(infoExplicit).toBeGreaterThan(0);
    expect(infoFallback).toBeGreaterThan(0);
    // Explicit b_normal at -2.0 places more Fisher information at theta = -2.0 than fallback (-1.0)
    expect(infoExplicit).toBeGreaterThan(infoFallback);
  });
});

describe("EAP theta estimation & incremental updates", () => {
  const sampleCharts: Chart[] = [
    makeChart({ id: 1, b_normal: -2.0, b_hard: -1.0, b_vhard: 0.0 }),
    makeChart({ id: 2, b_normal: -1.0, b_hard: 0.0, b_vhard: 1.0 }),
    makeChart({ id: 3, b_normal: 0.0, b_hard: 1.0, b_vhard: 2.0 }),
    makeChart({ id: 4, b_normal: 1.0, b_hard: 2.0, b_vhard: 3.0 }),
  ];

  test("higher clear lamps yield strictly higher estimated theta", () => {
    const failed = estimateTheta(sampleCharts, { "1": 0, "2": 0, "3": 0, "4": 0 });
    const hard = estimateTheta(sampleCharts, { "1": 2, "2": 2, "3": 2, "4": 2 });
    const vhard = estimateTheta(sampleCharts, { "1": 3, "2": 3, "3": 3, "4": 3 });
    expect(failed).toBeLessThan(hard);
    expect(hard).toBeLessThan(vhard);
  });

  test("estimateThetaWithBase matches full recomputation exactly", () => {
    const clears: Record<string, number> = { "1": 3, "2": 2, "3": 0 };
    const base = computeBaseLogLik(sampleCharts, clears);
    expect(eapFromLogLik(base)).toBeCloseTo(estimateTheta(sampleCharts, clears), 10);

    // Upgrade chart 3 from FAILED (0) -> HARD (2)
    const fastUpgrade = estimateThetaWithBase(base, sampleCharts[2], 2, 0);
    const exactUpgrade = estimateTheta(sampleCharts, { ...clears, "3": 2 });
    expect(fastUpgrade).toBeCloseTo(exactUpgrade, 10);

    // Add brand-new clear on chart 4 (V-HARD)
    const fastNew = estimateThetaWithBase(base, sampleCharts[3], 3, undefined);
    const exactNew = estimateTheta(sampleCharts, { ...clears, "4": 3 });
    expect(fastNew).toBeCloseTo(exactNew, 10);
  });

  test("estimateThetaWithSe produces decreasing SE with more observations and matches C11 players.json", () => {
    const onePlay = estimateThetaWithSe(sampleCharts, { "2": 2 });
    const fourPlays = estimateThetaWithSe(sampleCharts, { "1": 3, "2": 2, "3": 2, "4": 0 });
    expect(onePlay.se).toBeGreaterThan(0);
    expect(fourPlays.se).toBeGreaterThan(0);
    expect(fourPlays.se).toBeLessThan(onePlay.se);

    // Verify exact parity between cancellation-free TS EAP and C11 EAP on real production players
    const prodCharts = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "charts.json"), "utf-8")
    ) as Chart[];
    const prodPlayers = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "players.json"), "utf-8")
    ) as PlayersDict;
    const sample = Object.values(prodPlayers).slice(0, 25);
    for (const p of sample) {
      const { theta, se } = estimateThetaWithSe(prodCharts, p.c);
      expect(Math.abs(theta - p.t)).toBeLessThan(0.003);
      if (p.se != null) {
        expect(Math.abs(se - p.se)).toBeLessThan(0.003);
      }
    }
  });
});

describe("Leaderboard, censored bounds, diagnostics & sorting", () => {
  test("getCensoredDisplayBound prefers the larger of GRM b and max_played_theta", () => {
    expect(getCensoredDisplayBound(3.2, 4.1)).toBe(4.1);
    expect(getCensoredDisplayBound(4.5, 4.1)).toBe(4.5);
    expect(getCensoredDisplayBound(null, 3.0)).toBe(3.0);
    expect(getCensoredDisplayBound(null, null)).toBeNull();
  });

  test("provisionalReason distinguishes low-N, ceiling-saturation, and wide-SE", () => {
    const lowN = makeChart({ n: 4, se_b_hard: 0.4, provisional: true });
    const ceiling = makeChart({ n: 100, n_vhard: 92, n_hard: 5, n_normal: 2, n_failed: 1, se_b_hard: 1.35, provisional: true });
    const wideSe = makeChart({ n: 80, n_vhard: 20, n_hard: 20, n_normal: 20, n_failed: 20, se_b_hard: 1.4, provisional: true });
    expect(provisionalReason(lowN, "en")).toContain("4 plays");
    expect(provisionalReason(ceiling, "en")).toContain("92% V-HARD");
    expect(provisionalReason(wideSe, "en")).toContain("SE(b_hard) > 1.0");
  });

  test("levelSortKey orders numeric folders, then Ω, then gimmick folders", () => {
    const levels = ["Ω", "◆", "?!", "-_-", "30", "1", "10"];
    levels.sort((a, b) => {
      const [ax, ay] = levelSortKey(a);
      const [bx, by] = levelSortKey(b);
      return ax - bx || ay - by;
    });
    expect(levels).toEqual(["1", "10", "30", "Ω", "-_-", "?!", "◆"]);
  });

  test("computeLeaderboard filters unqualified players and ranks by theta descending", () => {
    const charts = Array.from({ length: 12 }, (_, i) =>
      makeChart({ id: i + 1, md5: `m${i + 1}`, level: "22" })
    );
    const fullClears = Object.fromEntries(charts.map((c) => [String(c.id), 2]));
    const players: PlayersDict = {
      top: { t: 2.5, n: "Top", c: fullClears },
      mid: { t: 1.0, n: "Mid", c: fullClears },
      unqualified_few: { t: 4.0, n: "Few", c: { "1": 3 } },
      unqualified_no_hard: {
        t: 0.5,
        n: "OnlyNormal",
        c: Object.fromEntries(charts.map((c) => [String(c.id), 1])),
      },
    };
    const lb = computeLeaderboard(players, charts);
    expect(lb.totalEligible).toBe(2);
    expect(lb.ranked.filter((r) => r.eligible).map((r) => r.id)).toEqual(["top", "mid"]);
    expect(lb.rankMap.get("top")).toBe(1);
    expect(lb.rankMap.get("mid")).toBe(2);
    expect(lb.rankMap.has("unqualified_few")).toBe(false);
    expect(lb.rankMap.has("unqualified_no_hard")).toBe(false);

    const dist = computeSamplePlayers(players);
    expect(dist.n_players).toBe(4);
    expect(dist.theta_histogram.reduce((a, b) => a + b, 0)).toBe(4);
  });

  test("computePlayerDiagnostics identifies signature upsets and rating drags", () => {
    const charts: Chart[] = [
      makeChart({ id: 1, md5: "easy", b_normal: -3.0, b_hard: -1.5, b_vhard: -0.5 }),
      makeChart({ id: 2, md5: "mid", b_normal: -1.0, b_hard: 0.0, b_vhard: 1.0 }),
      makeChart({ id: 3, md5: "boss", b_normal: 1.5, b_hard: 2.5, b_vhard: 3.5 }),
    ];
    const clears: Record<string, number> = { "1": 0, "2": 2, "3": 3 };
    const base = computeBaseLogLik(charts, clears);
    const theta = eapFromLogLik(base);
    const diag = computePlayerDiagnostics(charts, clears, theta, base);
    expect(diag.signatureClears[0]?.chart.id).toBe(3);
    expect(diag.ratingDrags[0]?.chart.id).toBe(1);
    expect(diag.ratingDrags[0]?.recoveryGain).toBeGreaterThan(0);
  });
});
