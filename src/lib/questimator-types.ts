// Shared types for QUEstimator dashboard data.

export type ClearStatus = "FAILED" | "NORMAL" | "HARD" | "V-HARD";

export interface Chart {
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
}

export interface SamplePlayers {
  theta_histogram: number[];
  theta_edges: number[];
  theta_mean: number;
  theta_std: number;
  n_players: number;
}

// Special-folder ordering helper.
// Ω is featured first (as the flagship non-numeral tier), then the others
// retain their original relative order.
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

// Compute category probabilities for a chart given theta.
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
