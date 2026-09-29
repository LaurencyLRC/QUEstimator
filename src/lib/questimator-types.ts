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

// 101-point Gauss-Hermite quadrature for N(0,1): theta_q = sqrt(2)*z, w_q = wz/sqrt(pi).
const EAP_NODES = [
  -19.060978, -18.238377, -17.559602, -16.955581, -16.399941, -15.879099, -15.384909, -14.912007, -14.456625, -14.015989,
  -13.587983, -13.170944, -12.763538, -12.364670, -11.973430, -11.589050, -11.210873, -10.838334, -10.470938, -10.108252,
  -9.749891, -9.395514, -9.044813, -8.697512, -8.353357, -8.012122, -7.673595, -7.337582, -7.003907, -6.672402,
  -6.342914, -6.015299, -5.689420, -5.365150, -5.042370, -4.720964, -4.400824, -4.081847, -3.763933, -3.446987,
  -3.130918, -2.815636, -2.501056, -2.187094, -1.873668, -1.560699, -1.248108, -0.935819, -0.623754, -0.311840,
  0.000000, 0.311840, 0.623754, 0.935819, 1.248108, 1.560699, 1.873668, 2.187094, 2.501056, 2.815636,
  3.130918, 3.446987, 3.763933, 4.081847, 4.400824, 4.720964, 5.042370, 5.365150, 5.689420, 6.015299,
  6.342914, 6.672402, 7.003907, 7.337582, 7.673595, 8.012122, 8.353357, 8.697512, 9.044813, 9.395514,
  9.749891, 10.108252, 10.470938, 10.838334, 11.210873, 11.589050, 11.973430, 12.364670, 12.763538, 13.170944,
  13.587983, 14.015989, 14.456625, 14.912007, 15.384909, 15.879099, 16.399941, 16.955581, 17.559602, 18.238377,
  19.060978,
];
const EAP_WEIGHTS = [
  0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000,
  0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000,
  0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000,
  0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000002, 0.000008, 0.000031, 0.000106, 0.000332,
  0.000937, 0.002386, 0.005494, 0.011447, 0.021597, 0.036915, 0.057200, 0.080376, 0.102458, 0.118511,
  0.124401, 0.118511, 0.102458, 0.080376, 0.057200, 0.036915, 0.021597, 0.011447, 0.005494, 0.002386,
  0.000937, 0.000332, 0.000106, 0.000031, 0.000008, 0.000002, 0.000000, 0.000000, 0.000000, 0.000000,
  0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000,
  0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000,
  0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000,
  0.000000,
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
  const logL = new Array<number>(EAP_NODES.length).fill(0);
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
      logL[q] += Math.log(Math.max(p, 1e-30));
    }
  }

  // EAP = Σ theta_q w_q exp(logL_q) / Σ w_q exp(logL_q), numerically stabilized.
  const maxLog = Math.max(...logL);
  let num = 0;
  let den = 0;
  for (let q = 0; q < EAP_NODES.length; q++) {
    const w = EAP_WEIGHTS[q] * Math.exp(logL[q] - maxLog);
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
