"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, User, Target, Sparkles, TrendingUp } from "lucide-react";
import { useLang } from "@/lib/i18n";
import {
  type Chart,
  type PlayerData,
  type PlayersDict,
  type SamplePlayers,
  pStar,
  levelSortKey,
  levelLabel,
  isSpecialLevel,
} from "@/lib/questimator-types";
import { PlayerSkillHistogram } from "@/components/questimator/PlayerSkillHistogram";

interface Props {
  charts: Chart[];
  samplePlayers: SamplePlayers | null;
  playerThetaMean: number;
  playerThetaStd: number;
  /** Called when the user clicks a chart row (opens the shared detail dialog). */
  onSelectChart: (c: Chart) => void;
  /**
   * Called whenever the loaded player changes (including null when no player
   * is loaded). The parent uses this to annotate the main Chart Tables.
   */
  onPlayerChange: (avatarID: string | null, player: PlayerData | null) => void;
}

// Status integer → label, matching the pipeline convention.
const STATUS_LABELS: Record<number, { short: string; color: string }> = {
  0: { short: "F",  color: "oklch(0.55 0 0)"        }, // FAILED
  1: { short: "N",  color: "oklch(0.72 0.16 95)"    }, // NORMAL
  2: { short: "H",  color: "oklch(0.70 0.22 25)"    }, // HARD
  3: { short: "VH", color: "oklch(0.70 0.22 305)"   }, // V-HARD
};

// Recommendation sweet spot: P(V-HARD) between these thresholds.
// Charts in this range are challenging but achievable — the ideal "next target".
const REC_MIN_PROB = 0.30;
const REC_MAX_PROB = 0.70;
const REC_LIMIT = 24;

// For the "Your Clear Probabilities" section, show all uncompleted charts
// with at least this much V-HARD probability, sorted descending.
const PROB_MIN_THRESHOLD = 0.05;
const PROB_LIMIT = 60;

function fmtTheta(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(3)}`;
}

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

/**
 * Compute P(V-HARD clear | θ, chart) = P*(θ, a, b_vhard).
 * Returns null if the chart lacks valid GRM parameters.
 */
function pVhard(theta: number, c: Chart): number | null {
  if (c.a == null || c.b_vhard == null) return null;
  return pStar(theta, c.a, c.b_vhard);
}

export function PlayerTab({
  charts,
  samplePlayers,
  playerThetaMean,
  playerThetaStd,
  onSelectChart,
  onPlayerChange,
}: Props) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [submittedID, setSubmittedID] = useState("");
  const [players, setPlayers] = useState<PlayersDict | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Cache the on-demand fetch of players.json. This file is ~1.8 MB so we
  // don't want to fetch it on initial page load — only when the user first
  // submits a search. Once loaded, it stays cached for the session.
  const fetchPlayers = useRef<( () => Promise<PlayersDict | null> ) | null>(null);

  useEffect(() => {
    fetchPlayers.current = async () => {
      if (players) return players;
      setLoadingPlayers(true);
      setLoadError(null);
      try {
        const res = await fetch("data/players.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PlayersDict;
        setPlayers(data);
        return data;
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setLoadingPlayers(false);
      }
    };
  }, [players]);

  const currentPlayer = useMemo<PlayerData | null>(() => {
    if (!players || !submittedID) return null;
    return players[submittedID] ?? null;
  }, [players, submittedID]);

  // Notify parent whenever the loaded player changes so it can annotate the
  // main Chart Tables with the player's clear history.
  useEffect(() => {
    onPlayerChange(currentPlayer ? submittedID : null, currentPlayer);
  }, [currentPlayer, submittedID, onPlayerChange]);

  const handleSearch = async () => {
    const id = query.trim();
    if (!id) return;
    const data = await fetchPlayers.current?.();
    if (!data) {
      setSubmittedID("");
      setNotFound(false);
      return;
    }
    // Player IDs in the source data are case-sensitive — preserve user input.
    if (data[id]) {
      setSubmittedID(id);
      setNotFound(false);
    } else {
      setSubmittedID("");
      setNotFound(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  // ----- Derived analytics for the loaded player -----
  const analytics = useMemo(() => {
    if (!currentPlayer) return null;

    // Build a chart_id → Chart lookup so we can resolve clears quickly.
    const chartById = new Map<number, Chart>();
    for (const c of charts) chartById.set(c.id, c);

    // Tally clears by status.
    const statusCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const s of Object.values(currentPlayer.c)) {
      if (s >= 0 && s <= 3) statusCounts[s as 0 | 1 | 2 | 3] += 1;
    }
    const totalClears = statusCounts[0] + statusCounts[1] + statusCounts[2] + statusCounts[3];

    // Compute P(V-HARD) for every chart the player has NOT V-HARD cleared.
    // We sort by descending probability and bucket into:
    //   - recommendations: P in [REC_MIN_PROB, REC_MAX_PROB]
    //   - allProbabilities: P >= PROB_MIN_THRESHOLD
    const theta = currentPlayer.t;
    type Rec = { chart: Chart; p: number };
    const recommendations: Rec[] = [];
    const allProbabilities: Rec[] = [];

    for (const c of charts) {
      if (c.provisional) continue; // skip unreliable charts for recommendations
      const p = pVhard(theta, c);
      if (p == null) continue;
      // Skip charts the player has already V-HARD cleared.
      const status = currentPlayer.c[String(c.id)];
      if (status === 3) continue;

      if (p >= PROB_MIN_THRESHOLD) {
        allProbabilities.push({ chart: c, p });
      }
      if (p >= REC_MIN_PROB && p <= REC_MAX_PROB) {
        recommendations.push({ chart: c, p });
      }
    }

    // Recommendations: sort by closeness to 50% (the "ideal challenge" point),
    // then by descending difficulty to favour harder charts at the same distance.
    recommendations.sort((a, b) => {
      const da = Math.abs(a.p - 0.5);
      const db = Math.abs(b.p - 0.5);
      if (Math.abs(da - db) > 1e-6) return da - db;
      return (b.chart.b_vhard_display ?? -99) - (a.chart.b_vhard_display ?? -99);
    });
    const recommendationsLimited = recommendations.slice(0, REC_LIMIT);

    // All probabilities: sort by descending P(V-HARD).
    allProbabilities.sort((a, b) => b.p - a.p);
    const allProbabilitiesLimited = allProbabilities.slice(0, PROB_LIMIT);

    // Player's already-V-HARD-cleared charts (for the "Your Clears" summary).
    // Just used for a count breakdown by level.
    const clearedByLevel = new Map<string, number>();
    for (const [idStr, status] of Object.entries(currentPlayer.c)) {
      if (status !== 3) continue;
      const c = chartById.get(Number(idStr));
      if (!c) continue;
      clearedByLevel.set(c.level, (clearedByLevel.get(c.level) ?? 0) + 1);
    }
    const clearedLevels = [...clearedByLevel.entries()].sort((a, b) => {
      const [ax, ay] = levelSortKey(a[0]);
      const [bx, by] = levelSortKey(b[0]);
      return ax - bx || ay - by;
    });

    return {
      statusCounts,
      totalClears,
      recommendations: recommendationsLimited,
      allProbabilities: allProbabilitiesLimited,
      clearedLevels,
    };
  }, [currentPlayer, charts]);

  // Population percentile: where does this player sit relative to others?
  // Computed from sample-players histogram by integrating bins up to θ.
  const percentile = useMemo(() => {
    if (!currentPlayer || !samplePlayers) return null;
    const edges = samplePlayers.theta_edges;
    const hist = samplePlayers.theta_histogram;
    const theta = currentPlayer.t;
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
        // Partial bin — linear interpolation.
        const frac = (theta - lo) / (hi - lo);
        below += hist[i] * frac;
      }
    }
    return total > 0 ? below / total : null;
  }, [currentPlayer, samplePlayers]);

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" />
            {t.playerProfile}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t.playerProfileDesc}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t.playerIdPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={loadingPlayers || !query.trim()}
              size="sm"
            >
              {loadingPlayers ? "…" : t.search}
            </Button>
          </div>
          {notFound && (
            <p className="text-xs text-rose-400 mt-2">{t.playerNotFound}</p>
          )}
          {loadError && (
            <p className="text-xs text-rose-400 mt-2">
              {t.loadFailed}: {loadError}
            </p>
          )}
          {currentPlayer && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{submittedID}</span>
              <span className="mx-1.5">·</span>
              {t.clearsCount(analytics?.totalClears ?? 0)}
            </div>
          )}
        </CardContent>
      </Card>

      {currentPlayer && analytics && (
        <>
          {/* Skill panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {t.estimatedSkill}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="font-mono text-3xl font-bold">
                    θ = <span className="text-cyan-400">{fmtTheta(currentPlayer.t)}</span>
                  </div>
                  {percentile != null && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {t.lang === "en"
                        ? `Top ${(100 - percentile * 100).toFixed(1)}% of tracked players`
                        : `추적 대상 플레이어 중 상위 ${(100 - percentile * 100).toFixed(1)}%`}
                    </div>
                  )}
                </div>
                {samplePlayers && (
                  <PlayerSkillHistogram
                    data={{
                      ...samplePlayers,
                      // Override mean marker with the loaded player's θ so the
                      // dashed line points at where they sit on the curve.
                      theta_mean: currentPlayer.t,
                    }}
                  />
                )}
                {/* Clear-tier breakdown */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {([3, 2, 1, 0] as const).map((s) => {
                    const meta = STATUS_LABELS[s];
                    const n = analytics.statusCounts[s];
                    return (
                      <div
                        key={s}
                        className="flex items-center gap-1.5 rounded-md border border-border/50 px-2 py-1 text-xs"
                        title={`Status ${s}: ${meta.short}`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: meta.color }}
                        />
                        <span className="font-mono">{meta.short}</span>
                        <span className="text-muted-foreground">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Cleared-by-level summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {t.lang === "en" ? "V-HARD Clears by Level" : "레벨별 V-HARD 클리어"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.clearedLevels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t.lang === "en"
                      ? "No V-HARD clears logged yet."
                      : "V-HARD 클리어 기록이 없습니다."}
                  </p>
                ) : (
                  <ScrollArea className="h-[220px] pr-2">
                    <div className="flex flex-wrap gap-1.5">
                      {analytics.clearedLevels.map(([lvl, n]) => (
                        <Badge
                          key={lvl}
                          variant="outline"
                          className="font-mono text-xs"
                        >
                          <span className={isSpecialLevel(lvl) ? "text-amber-400 mr-1" : "text-muted-foreground mr-1"}>
                            {lvl}
                          </span>
                          <span className="text-foreground">{n}</span>
                        </Badge>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                <p className="text-[11px] text-muted-foreground mt-3">
                  {t.lang === "en"
                    ? `Population: μ=${fmtTheta(playerThetaMean)}, σ=${playerThetaStd.toFixed(3)} (n=${samplePlayers?.n_players ?? 0}).`
                    : `모집단: μ=${fmtTheta(playerThetaMean)}, σ=${playerThetaStd.toFixed(3)} (n=${samplePlayers?.n_players ?? 0}).`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recommended targets */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                {t.recommendedCharts}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t.lang === "en"
                  ? `Charts you haven't V-HARD cleared where P(V-HARD) ∈ [${fmtPct(REC_MIN_PROB)}, ${fmtPct(REC_MAX_PROB)}] — challenging but achievable. Top ${REC_LIMIT} shown.`
                  : `V-HARD 클리어 미달성 채보 중 P(V-HARD) ∈ [${fmtPct(REC_MIN_PROB)}, ${fmtPct(REC_MAX_PROB)}]인 도전 가능한 채보. 상위 ${REC_LIMIT}개.`}
              </p>
            </CardHeader>
            <CardContent>
              {analytics.recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t.noRecommendations}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analytics.recommendations.map(({ chart, p }) => (
                    <RecommendationCard
                      key={chart.md5}
                      chart={chart}
                      p={p}
                      onClick={() => onSelectChart(chart)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* All clear probabilities */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-400" />
                {t.yourProbabilities}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t.lang === "en"
                  ? `All uncompleted charts with P(V-HARD) ≥ ${fmtPct(PROB_MIN_THRESHOLD)}, sorted by descending probability. Top ${PROB_LIMIT} shown.`
                  : `P(V-HARD) ≥ ${fmtPct(PROB_MIN_THRESHOLD)}인 미클리어 채보, 확률 내림차순. 상위 ${PROB_LIMIT}개.`}
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/60 overflow-hidden">
                <ScrollArea className="h-[480px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="border-b border-border/60 text-left">
                        <th className="px-3 py-2 font-medium text-muted-foreground text-xs">{t.chart}</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-center w-[60px]">{t.level}</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right w-[80px]">P(V-HARD)</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right w-[80px]">{t.bVhard}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.allProbabilities.map(({ chart, p }) => (
                        <tr
                          key={chart.md5}
                          onClick={() => onSelectChart(chart)}
                          className="border-b border-border/30 hover:bg-muted/40 cursor-pointer"
                        >
                          <TableCell className="font-medium font-jp">
                            <div className="flex flex-col">
                              <span className="text-sm leading-snug line-clamp-1">{chart.title}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {chart.artist || "unknown"}
                                {chart.name_diff && ` · ${chart.name_diff}`}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            <span className={isSpecialLevel(chart.level) ? "text-amber-400" : "text-muted-foreground"}>
                              {chart.level}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <ProbabilityBadge p={p} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span style={{ color: "oklch(0.78 0.18 305)" }}>
                              {fmtTheta(chart.b_vhard_display ?? 0)}
                            </span>
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// Re-export TableCell from the table primitives so we can use it inline above
// without an extra import dance.
// (Table primitives are imported at the top of the file.)

function RecommendationCard({
  chart,
  p,
  onClick,
}: {
  chart: Chart;
  p: number;
  onClick: () => void;
}) {
  const { t } = useLang();
  return (
    <button
      onClick={onClick}
      className="text-left rounded-md border border-border/60 hover:border-border hover:bg-muted/30 transition-colors p-2.5 flex flex-col gap-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium font-jp line-clamp-2 leading-snug">
          {chart.title}
        </span>
        <Badge variant="outline" className="font-mono text-[10px] shrink-0">
          {levelLabel(chart.level)}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground font-jp line-clamp-1">
          {chart.artist || "unknown"}
          {chart.name_diff && ` · ${chart.name_diff}`}
        </span>
        <span className="font-mono font-semibold" style={{ color: "oklch(0.78 0.18 305)" }}>
          {fmtPct(p)}
        </span>
      </div>
      {/* Probability bar */}
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full"
          style={{
            width: `${Math.min(100, p * 100)}%`,
            background: "oklch(0.70 0.22 305)",
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>
          {t.bVhard}: <span style={{ color: "oklch(0.78 0.18 305)" }}>{fmtTheta(chart.b_vhard_display ?? 0)}</span>
        </span>
        <span>a: {chart.a != null ? chart.a.toFixed(2) : "–"}</span>
      </div>
    </button>
  );
}

function ProbabilityBadge({ p }: { p: number }) {
  // Color by probability band.
  //   < 0.20 → muted   (long shot)
  //  < 0.50 → amber    (tough)
  //  < 0.80 → cyan     (achievable)
  //  ≥ 0.80 → emerald  (likely)
  let color = "oklch(0.55 0 0)";
  if (p >= 0.80) color = "oklch(0.70 0.18 145)";
  else if (p >= 0.50) color = "oklch(0.70 0.18 200)";
  else if (p >= 0.20) color = "oklch(0.70 0.18 75)";
  return (
    <span className="font-mono font-semibold" style={{ color }}>
      {fmtPct(p)}
    </span>
  );
}
