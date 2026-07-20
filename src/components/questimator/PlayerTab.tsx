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
import { useScale } from "@/lib/value-scale";
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
  onSelectChart: (c: Chart) => void;
  activePlayerExternal?: { id: string; data: PlayerData } | null;
  onPlayerChange: (avatarID: string | null, player: PlayerData | null) => void;
}

const STATUS_LABELS: Record<number, { short: string; color: string }> = {
  0: { short: "F",  color: "oklch(0.55 0 0)"        },
  1: { short: "N",  color: "oklch(0.72 0.16 95)"    },
  2: { short: "H",  color: "oklch(0.70 0.22 25)"    },
  3: { short: "VH", color: "oklch(0.70 0.22 305)"   },
};

const REC_MIN_PROB = 0.30;
const REC_MAX_PROB = 0.70;
const REC_LIMIT = 24;

const PROB_MIN_THRESHOLD = 0.05;
const PROB_LIMIT = 60;

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

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
  activePlayerExternal,
  onPlayerChange,
}: Props) {
  const { t } = useLang();
  const { mode, format } = useScale();
  const [query, setQuery] = useState("");
  const [submittedID, setSubmittedID] = useState("");
  const [players, setPlayers] = useState<PlayersDict | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

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
    if (activePlayerExternal) return activePlayerExternal.data;
    if (!players || !submittedID) return null;
    return players[submittedID] ?? null;
  }, [players, submittedID, activePlayerExternal]);

  useEffect(() => {
    onPlayerChange(currentPlayer ? (activePlayerExternal?.id ?? submittedID) : null, currentPlayer);
  }, [currentPlayer, submittedID, activePlayerExternal, onPlayerChange]);

  const handleSearch = async () => {
    const id = query.trim();
    if (!id) return;
    const data = await fetchPlayers.current?.();
    if (!data) {
      setSubmittedID("");
      setNotFound(false);
      return;
    }
    const foundId = Object.keys(data).find(k => k.toLowerCase() === id.toLowerCase());
    if (foundId) {
      setSubmittedID(foundId);
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

  const analytics = useMemo(() => {
    if (!currentPlayer) return null;

    const chartById = new Map<number, Chart>();
    for (const c of charts) chartById.set(c.id, c);

    const statusCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const s of Object.values(currentPlayer.c)) {
      if (s >= 0 && s <= 3) statusCounts[s as 0 | 1 | 2 | 3] += 1;
    }
    const totalClears = statusCounts[0] + statusCounts[1] + statusCounts[2] + statusCounts[3];

    const theta = currentPlayer.t;
    type Rec = { chart: Chart; p: number };
    const recommendations: Rec[] = [];
    const allProbabilities: Rec[] = [];

    for (const c of charts) {
      if (c.provisional) continue;
      const p = pVhard(theta, c);
      if (p == null) continue;
      const status = currentPlayer.c[String(c.id)];
      if (status === 3) continue;

      if (p >= PROB_MIN_THRESHOLD) {
        allProbabilities.push({ chart: c, p });
      }
      if (p >= REC_MIN_PROB && p <= REC_MAX_PROB) {
        recommendations.push({ chart: c, p });
      }
    }

    recommendations.sort((a, b) => {
      const da = Math.abs(a.p - 0.5);
      const db = Math.abs(b.p - 0.5);
      if (Math.abs(da - db) > 1e-6) return da - db;
      return (b.chart.b_vhard_display ?? -99) - (a.chart.b_vhard_display ?? -99);
    });
    const recommendationsLimited = recommendations.slice(0, REC_LIMIT);

    allProbabilities.sort((a, b) => b.p - a.p);
    const allProbabilitiesLimited = allProbabilities.slice(0, PROB_LIMIT);

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
        const frac = (theta - lo) / (hi - lo);
        below += hist[i] * frac;
      }
    }
    return total > 0 ? below / total : null;
  }, [currentPlayer, samplePlayers]);

  return (
    <div className="space-y-6">
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
              <span className="font-mono text-foreground">{activePlayerExternal?.id ?? submittedID}</span>
              <span className="mx-1.5">·</span>
              {t.clearsCount(analytics?.totalClears ?? 0)}
            </div>
          )}
        </CardContent>
      </Card>

      {currentPlayer && analytics && (
        <>
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
                    <span className="text-cyan-400">{format(currentPlayer.t, mode === "lerp" ? 2 : 3)}</span>
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
                  <div>
                  <PlayerSkillHistogram
                    data={{
                      ...samplePlayers,
                      theta_mean: currentPlayer.t,
                    }}
                  />
                  <div className="text-[10px] text-muted-foreground text-center mt-1">
                    {t.histogramXAxis}
                  </div>
                  </div>
                )}
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
                    ? `Population: μ=${format(playerThetaMean)}, σ=${playerThetaStd.toFixed(3)} (n=${samplePlayers?.n_players ?? 0}).`
                    : `모집단: μ=${format(playerThetaMean)}, σ=${playerThetaStd.toFixed(3)} (n=${samplePlayers?.n_players ?? 0}).`}
                </p>
              </CardContent>
            </Card>
          </div>

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
                      formatFn={format}
                      t={t}
                      mode={mode}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
                        <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right w-[80px]">{t.bVhard(mode === "lerp")}</th>
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
                              {format(chart.b_vhard_display)}
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

function RecommendationCard({
  chart,
  p,
  onClick,
  formatFn,
  t,
  mode
}: {
  chart: Chart;
  p: number;
  onClick: () => void;
  formatFn: (val: number | null | undefined) => string;
  t: any;
  mode: string;
}) {
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
          {t.bVhard(mode === "lerp")}: <span style={{ color: "oklch(0.78 0.18 305)" }}>{formatFn(chart.b_vhard_display)}</span>
        </span>
        <span>a: {chart.a != null ? chart.a.toFixed(2) : "–"}</span>
      </div>
    </button>
  );
}

function ProbabilityBadge({ p }: { p: number }) {
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