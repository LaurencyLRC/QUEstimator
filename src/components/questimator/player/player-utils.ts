import {
  type Chart,
  getCensoredDisplayBound,
  pStar,
} from "@/lib/questimator-types";

export type HorizonSortKey =
  | "p"
  | "b"
  | "a"
  | "level"
  | "title"
  | "lamp"
  | "delta"
  | "expected"
  | "rival";

export interface HorizonCandidate {
  chart: Chart;
  p: number;
  lamp: number | null;
  deltaTheta: number;
  expectedGain: number;
  rivalLamp: number | null;
  isRivalAhead: boolean;
}

export interface LevelStatRow {
  level: string;
  total: number;
  vhard: number;
  hard: number;
  normal: number;
  failed: number;
  cleared: number;
  played: number;
}

export interface PlayerAnalytics {
  statusCounts: { 0: number; 1: number; 2: number; 3: number };
  totalClears: number;
  totalUncompleted: number;
  inRangeCount: number;
  filteredCandidates: HorizonCandidate[];
  recommendations: HorizonCandidate[];
  clearedLevels: [string, number][];
  levelStats: LevelStatRow[];
  targetStatus: "HARD" | "V-HARD";
  rivalAheadCount: number;
}

export const STATUS_LABELS: Record<
  number,
  { short: string; color: string; bgClass: string; textClass: string }
> = {
  0: { short: "F", color: "var(--color-lamp-failed)", bgClass: "bg-lamp-failed", textClass: "text-muted-foreground" },
  1: { short: "N", color: "var(--color-lamp-normal)", bgClass: "bg-lamp-normal", textClass: "text-lamp-normal" },
  2: { short: "H", color: "var(--color-lamp-hard)", bgClass: "bg-lamp-hard", textClass: "text-lamp-hard" },
  3: { short: "VH", color: "var(--color-lamp-vhard)", bgClass: "bg-lamp-vhard", textClass: "text-lamp-vhard" },
};

export const LAMP_LABEL: Record<
  number,
  { text: string; bgClass: string; textClass: string; borderClass: string }
> = {
  2: { text: "H", bgClass: "bg-lamp-hard/15", textClass: "text-lamp-hard", borderClass: "border-lamp-hard/40" },
  1: { text: "N", bgClass: "bg-lamp-normal/15", textClass: "text-lamp-normal", borderClass: "border-lamp-normal/40" },
  0: { text: "F", bgClass: "bg-lamp-failed/15", textClass: "text-muted-foreground", borderClass: "border-lamp-failed/40" },
};

export function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function formatSkillGain(gain: number): string {
  if (gain <= 0.00005) return "+0.00";
  if (gain < 0.005) return `+${gain.toFixed(4)}`;
  if (gain < 0.05) return `+${gain.toFixed(3)}`;
  return `+${gain.toFixed(2)}`;
}

export function pHard(
  theta: number,
  c: Chart,
  chartMaxTheta?: Map<number, number> | null
): number | null {
  if (c.a == null || c.b_hard == null) return null;
  const isHardCensored = c.n_hard + c.n_vhard === 0;
  const effB = isHardCensored
    ? (getCensoredDisplayBound(c.b_hard_display, chartMaxTheta?.get(c.id)) ?? c.b_hard)
    : c.b_hard;
  return pStar(theta, c.a, effB);
}

export function pVHard(
  theta: number,
  c: Chart,
  chartMaxTheta?: Map<number, number> | null
): number | null {
  if (c.a == null || c.b_vhard == null) return null;
  const isVhardCensored = c.n_vhard === 0;
  const effB = isVhardCensored
    ? (getCensoredDisplayBound(c.b_vhard_display, chartMaxTheta?.get(c.id)) ?? c.b_vhard)
    : c.b_vhard;
  return pStar(theta, c.a, effB);
}

export function matchesLevel(
  level: string,
  minLevel: number,
  maxLevel: number,
  showMinus: boolean,
  showExclamation: boolean,
  showDiamond: boolean
): boolean {
  if (level === "-_-") return showMinus;
  if (level === "?!") return showExclamation;
  if (level === "◆") return showDiamond;

  let num: number | null = null;
  if (level === "Ω") {
    num = 31;
  } else if (/^\d+$/.test(level)) {
    num = parseInt(level, 10);
  }

  if (num != null) {
    const lo = Math.min(minLevel, maxLevel);
    const hi = Math.max(minLevel, maxLevel);
    return num >= lo && num <= hi;
  }

  return false;
}
