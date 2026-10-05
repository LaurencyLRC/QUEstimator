// Shared types for QUEstimator dashboard data.

export type ClearStatus = "FAILED" | "NORMAL" | "HARD" | "V-HARD";

export interface Chart {
  id: number;
  md5: string;
  title: string;
  artist: string;
  level: string; // "1".."30" or "-_-", "?!", "◆", "Ω"
  name_diff: string;
  video2: string;
  url: string;
  url_diff: string;
  comment: string;
  state: string;
  n: number;
  n_failed: number;
  n_normal: number;
  n_hard: number;
  n_vhard: number;
  a: number | null;
  b_hard: number | null;
  b_vhard: number | null;
  b_hard_display: number | null;
  b_vhard_display: number | null;
  se_a: number | null;
  se_b_hard: number | null;
  se_b_vhard: number | null;
  provisional: boolean;
}

export interface PlayerData {
  t: number; // theta (estimated skill level)
  n?: string;  // display name (avatarName from Qwilight)
  c: Record<string, number>; // map of chart_id (string) -> status
}

export interface PlayersDict {
  [avatarID: string]: PlayerData;
}

export interface LevelSummary {
  level: string;
  n_charts_total: number;
  n_charts_valid: number;
  hard_median: number | null;
  hard_q1: number | null;
  hard_q3: number | null;
  vhard_median: number | null;
  vhard_q1: number | null;
  vhard_q3: number | null;
}

export interface Meta {
  generated_at: string;
  n_charts_total: number;
  n_charts_valid: number;
  n_charts_provisional: number;
  n_players: number;
  n_clears: number;
  model: string;
  categories: ClearStatus[];
  provisional_rule: string;
  player_theta_mean: number;
  player_theta_std: number;
  runtime_sec: number;
  mcmc_chains?: number;
  mcmc_warmup?: number;
  mcmc_samples_per_chain?: number;
  convergence?: {
    r_hat_max?: number;
    ess_min?: number;
    convergence_ok?: boolean;
    n_params_bad_rhat?: number;
    n_params_low_ess?: number;
    r_hat_threshold?: number;
    ess_threshold?: number;
  };
}

export interface SamplePlayers {
  theta_histogram: number[];
  theta_edges: number[];
  theta_mean: number;
  theta_std: number;
  n_players: number;
}

export function computeSamplePlayers(players: PlayersDict): SamplePlayers {
  const thetas: number[] = [];
  for (const p of Object.values(players)) {
    if (typeof p.t === "number" && Number.isFinite(p.t)) {
      thetas.push(p.t);
    }
  }
  const n = thetas.length;
  if (n === 0) {
    return {
      theta_histogram: [],
      theta_edges: [],
      theta_mean: 0,
      theta_std: 1,
      n_players: 0,
    };
  }

  const binMin = -6.0;
  const binMax = 8.0;
  const numBins = 35;
  const step = (binMax - binMin) / numBins;
  const edges: number[] = [];
  for (let i = 0; i <= numBins; i++) {
    edges.push(Number((binMin + i * step).toFixed(2)));
  }

  const histogram = new Array(numBins).fill(0);
  let sum = 0;
  for (const t of thetas) {
    sum += t;
    if (t < binMin) {
      histogram[0]++;
    } else if (t >= binMax) {
      histogram[numBins - 1]++;
    } else {
      const idx = Math.min(numBins - 1, Math.max(0, Math.floor((t - binMin) / step)));
      histogram[idx]++;
    }
  }

  const mean = sum / n;
  let varianceSum = 0;
  for (const t of thetas) {
    varianceSum += (t - mean) ** 2;
  }
  const std = Math.sqrt(varianceSum / n);

  return {
    theta_histogram: histogram,
    theta_edges: edges,
    theta_mean: mean,
    theta_std: std,
    n_players: n,
  };
}

export interface RankRow {
  id: string;
  data: PlayerData;
  nClears: number;
  nVhard: number;
  nHard: number;
  eligible: boolean;
}

export const MIN_RANKING_PLAYS = 10;
export const MIN_RANKING_HARD_OR_BETTER = 1;
export const EXCLUDED_RANKING_LEVELS = new Set(["-_-", "?!", "◆"]);

export function isValidRankingChart(c: Chart): boolean {
  if (c.provisional) return false;
  if (EXCLUDED_RANKING_LEVELS.has(c.level)) return false;
  if (/^\d+$/.test(c.level)) return parseInt(c.level, 10) >= 20;
  return c.level === "Ω";
}

export interface LeaderboardResult {
  ranked: RankRow[];
  rankMap: Map<string, number>;
  totalEligible: number;
  totalPlayers: number;
  sortedThetas: number[];
}

export function computeLeaderboard(players: PlayersDict, charts: Chart[]): LeaderboardResult {
  const rankingChartIds = new Set<number>();
  for (const c of charts) {
    if (isValidRankingChart(c)) rankingChartIds.add(c.id);
  }

  const rows: RankRow[] = Object.entries(players).map(([id, data]) => {
    let nVhard = 0;
    let nHard = 0;
    let nNormal = 0;
    let nFailed = 0;
    let eligPlays = 0;
    let eligHardOrBetter = 0;

    for (const [cidStr, s] of Object.entries(data.c || {})) {
      if (s === 3) nVhard += 1;
      else if (s === 2) nHard += 1;
      else if (s === 1) nNormal += 1;
      else if (s === 0) nFailed += 1;

      if (rankingChartIds.has(Number(cidStr))) {
        eligPlays += 1;
        if (s >= 2) eligHardOrBetter += 1;
      }
    }

    const nClears = nVhard + nHard + nNormal + nFailed;
    const eligible =
      eligPlays >= MIN_RANKING_PLAYS && eligHardOrBetter >= MIN_RANKING_HARD_OR_BETTER;

    return { id, data, nClears, nVhard, nHard, eligible };
  });

  rows.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.data.t !== b.data.t) return b.data.t - a.data.t;
    return b.nClears - a.nClears;
  });

  const rankMap = new Map<string, number>();
  let totalEligible = 0;
  rows.forEach((r, i) => {
    if (r.eligible) {
      rankMap.set(r.id, i + 1);
      totalEligible += 1;
    }
  });

  const sortedThetas = Object.values(players)
    .map((p) => p.t)
    .filter((t) => typeof t === "number" && Number.isFinite(t))
    .sort((a, b) => a - b);

  return {
    ranked: rows,
    rankMap,
    totalEligible,
    totalPlayers: rows.length,
    sortedThetas,
  };
}

/**
 * Calculates a player's top-percentile based on their latent skill θ.
 * If sortedThetas is provided, calculates the exact empirical percentile across all players.
 * If fallback SamplePlayers histogram is provided, calculates interpolated percentile.
 *
 * Returns a number between 0 and 100 (e.g. 1.8 for Top 1.8%).
 */
export function computeTopPercentile(
  theta: number,
  sortedThetas?: number[] | null,
  samplePlayers?: SamplePlayers | null
): number | null {
  if (typeof theta !== "number" || !Number.isFinite(theta)) return null;

  if (sortedThetas && sortedThetas.length > 0) {
    const N = sortedThetas.length;
    let low = 0;
    let high = N;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (sortedThetas[mid] <= theta) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    const strictlyBetter = N - low;
    const topPct = ((strictlyBetter + 1) / N) * 100;
    return Math.min(100, Math.max(0.01, topPct));
  }

  if (samplePlayers && samplePlayers.theta_edges.length > 1) {
    const edges = samplePlayers.theta_edges;
    const hist = samplePlayers.theta_histogram;
    let total = 0;
    let below = 0;
    for (let i = 0; i < hist.length; i++) {
      const lo = edges[i];
      const hi = edges[i + 1];
      total += hist[i];
      if (theta <= lo) continue;
      if (theta >= hi) {
        below += hist[i];
      } else {
        const frac = (theta - lo) / (hi - lo);
        below += hist[i] * frac;
      }
    }
    if (total <= 0) return null;
    const topPct = ((total - below) / total) * 100;
    return Math.min(100, Math.max(0.01, topPct));
  }

  return null;
}

export function formatTopPercentile(topPct: number | null | undefined): string {
  if (topPct == null) return "–";
  if (topPct <= 0.05) return "<0.1%";
  return `${topPct.toFixed(1)}%`;
}

// Special-folder ordering helper.
const SPECIAL_ORDER: Record<string, number> = {
  "Ω": 100,
  "-_-": 101,
  "?!": 102,
  "◆": 103,
};

export function levelSortKey(level: string): [number, number] {
  if (/^\d+$/.test(level)) return [0, parseInt(level, 10)];
  return [1, SPECIAL_ORDER[level] ?? 999];
}

export function isSpecialLevel(level: string): boolean {
  return !/^\d+$/.test(level);
}

export function levelLabel(level: string): string {
  if (/^\d+$/.test(level)) return `U_E ${level}`;
  return level;
}

// Compute P*(theta, k) = logistic(a * (theta - b_k)) for the GRM.
export function pStar(theta: number, a: number, b: number): number {
  const z = a * (theta - b);
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

// ── Offline-profile θ estimation (marginalized EAP) ─────────────────────
// Uses the SAME method as the backend pipeline: only the player's played
// charts, with the Normal(0,1) prior integrated by Gauss–Hermite quadrature.
// This replaces the old O/E-matching estimator which summed expected clears
// over ALL ~1400 charts (treating un-played as failed → collapsed to -10).

// 101-point Gauss-Hermite quadrature for N(0,1): theta_q = sqrt(2)*z, log(w_q) = log(wz / sqrt(pi)).
const EAP_NODES: number[] = [
  -19.06097760, -18.23837689, -17.55960220, -16.95558126, -16.39994144,
  -15.87909884, -15.38490870, -14.91200665, -14.45662477, -14.01598919,
  -13.58798307, -13.17094442, -12.76353788, -12.36466978, -11.97342980,
  -11.58904968, -11.21087317, -10.83833378, -10.47093787, -10.10825171,
  -9.74989126, -9.39551416, -9.04481329, -8.69751152, -8.35335742,
  -8.01212175, -7.67359450, -7.33758243, -7.00390695, -6.67240237,
  -6.34291434, -6.01529858, -5.68941970, -5.36515020, -5.04236965,
  -4.72096385, -4.40082419, -4.08184706, -3.76393323, -3.44698746,
  -3.13091796, -2.81563606, -2.50105578, -2.18709352, -1.87366775,
  -1.56069868, -1.24810799, -0.93581860, -0.62375435, -0.31183981,
  0.00000000, 0.31183981, 0.62375435, 0.93581860, 1.24810799,
  1.56069868, 1.87366775, 2.18709352, 2.50105578, 2.81563606,
  3.13091796, 3.44698746, 3.76393323, 4.08184706, 4.40082419,
  4.72096385, 5.04236965, 5.36515020, 5.68941970, 6.01529858,
  6.34291434, 6.67240237, 7.00390695, 7.33758243, 7.67359450,
  8.01212175, 8.35335742, 8.69751152, 9.04481329, 9.39551416,
  9.74989126, 10.10825171, 10.47093787, 10.83833378, 11.21087317,
  11.58904968, 11.97342980, 12.36466978, 12.76353788, 13.17094442,
  13.58798307, 14.01598919, 14.45662477, 14.91200665, 15.38490870,
  15.87909884, 16.39994144, 16.95558126, 17.55960220, 18.23837689,
  19.06097760,
];

// log(w_q) = log(wz / sqrt(pi)) for N(0,1) prior integration
const LOG_EAP_WEIGHTS: number[] = [
  -182.62852347, -167.55014672, -155.54253817, -145.21491840, -136.02055685,
  -127.67216848, -119.99477536, -112.87161875, -106.21977236, -99.97760007,
  -94.09767670, -88.54250442, -83.28177650, -78.29055180, -73.54799270,
  -69.03646604, -64.74088639, -60.64822565, -56.74713989, -53.02768076,
  -49.48106884, -46.09951346, -42.87606770, -39.80451051, -36.87924993,
  -34.09524301, -31.44792901, -28.93317322, -26.54721956, -24.28665020,
  -22.14835104, -20.12948214, -18.22745211, -16.43989607, -14.76465635,
  -13.19976586, -11.74343342, -10.39403107, -9.15008288, -8.01025520,
  -6.97334811, -6.03828799, -5.20412104, -4.47000764, -3.83521753,
  -3.29912569, -2.86120887, -2.52104272, -2.27829951, -2.13274638,
  -2.08424411, -2.13274638, -2.27829951, -2.52104272, -2.86120887,
  -3.29912569, -3.83521753, -4.47000764, -5.20412104, -6.03828799,
  -6.97334811, -8.01025520, -9.15008288, -10.39403107, -11.74343342,
  -13.19976586, -14.76465635, -16.43989607, -18.22745211, -20.12948214,
  -22.14835104, -24.28665020, -26.54721956, -28.93317322, -31.44792901,
  -34.09524301, -36.87924993, -39.80451051, -42.87606770, -46.09951346,
  -49.48106884, -53.02768076, -56.74713989, -60.64822565, -64.74088639,
  -69.03646604, -73.54799270, -78.29055180, -83.28177650, -88.54250442,
  -94.09767670, -99.97760007, -106.21977236, -112.87161875, -119.99477536,
  -127.67216848, -136.02055685, -145.21491840, -155.54253817, -167.55014672,
  -182.62852347,
];

const _sigmoid = (x: number) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

export function estimateTheta(
  charts: Chart[],
  clears: Record<string, number>
): number {
  // Only charts the player actually played AND that have valid item estimates.
  // (No "all charts" assumption — matches the backend's played-only EAP.)
  const played = charts.filter(
    (c) =>
      c.a != null &&
      c.b_hard != null &&
      c.b_vhard != null &&
      clears[String(c.id)] != null
  );
  if (played.length === 0) return 0; // prior mean — no information yet

  // log P(player's clears | theta) at each quadrature node.
  const logLik = new Array<number>(EAP_NODES.length).fill(0);
  for (const c of played) {
    const a = c.a as number;
    const s = clears[String(c.id)];
    // tau2 = b_vhard - b_hard; tau1 assumed = tau2 (NORMAL spacing not stored).
    const tau2 = (c.b_vhard as number) - (c.b_hard as number);
    const cp1 = a * ((c.b_hard as number) - tau2); // a * beta1 (beta1 = b_hard - tau1)
    const cp2 = a * (c.b_hard as number);          // a * beta2
    const cp3 = a * (c.b_vhard as number);         // a * beta3
    for (let q = 0; q < EAP_NODES.length; q++) {
      const loc = a * EAP_NODES[q];
      const c1 = _sigmoid(cp1 - loc);
      const c2 = _sigmoid(cp2 - loc);
      const c3 = _sigmoid(cp3 - loc);
      let p: number;
      if (s === 0) p = c1;            // FAILED
      else if (s === 1) p = c2 - c1;  // NORMAL
      else if (s === 2) p = c3 - c2;  // HARD
      else p = 1 - c3;                // V-HARD
      logLik[q] += Math.log(Math.max(p, 1e-30));
    }
  }

  // Combine likelihood with N(0,1) prior weight in log space: log_L = logLik + log(w_q)
  const logL = new Array<number>(EAP_NODES.length);
  let maxLogL = -Infinity;
  for (let q = 0; q < EAP_NODES.length; q++) {
    logL[q] = logLik[q] + LOG_EAP_WEIGHTS[q];
    if (logL[q] > maxLogL) maxLogL = logL[q];
  }

  // EAP = Σ theta_q exp(logL_q - maxLogL) / Σ exp(logL_q - maxLogL)
  let num = 0;
  let den = 0;
  for (let q = 0; q < EAP_NODES.length; q++) {
    const w = Math.exp(logL[q] - maxLogL);
    num += EAP_NODES[q] * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

export function categoryProbabilities(
  theta: number,
  a: number,
  b_normal: number,
  b_hard: number,
  b_vhard: number
): { failed: number; normal: number; hard: number; vhard: number } {
  const psN = pStar(theta, a, b_normal);
  const psH = pStar(theta, a, b_hard);
  const psV = pStar(theta, a, b_vhard);
  return {
    failed: 1 - psN,
    normal: psN - psH,
    hard: psH - psV,
    vhard: psV,
  };
}

/**
 * Cycle forward lamp status: NONE (-1) -> FAILED (0) -> HARD (2) -> V-HARD (3) -> NONE (-1)
 * Note: Skips NORMAL (1) as the gauge is obsolete in Qwilight 2.0.
 */
export function getNextLampStatus(current?: number | null): number {
  if (current == null || current < 0) return 0;
  if (current === 0) return 2;
  if (current === 1) return 2;
  if (current === 2) return 3;
  return -1;
}

/**
 * Cycle backward lamp status (e.g. right-click): NONE (-1) -> V-HARD (3) -> HARD (2) -> FAILED (0) -> NONE (-1)
 */
export function getPrevLampStatus(current?: number | null): number {
  if (current == null || current < 0) return 3;
  if (current === 3) return 2;
  if (current === 2) return 0;
  if (current === 1) return 0;
  return -1;
}

