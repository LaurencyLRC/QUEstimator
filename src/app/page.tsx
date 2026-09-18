"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BoxPlot } from "@/components/questimator/BoxPlot";
import { ChartTable, type SortKey, type SortDir } from "@/components/questimator/ChartTable";
import { ChartDetailDialog } from "@/components/questimator/ChartDetailDialog";
import { LangToggle } from "@/components/questimator/LangToggle";
import { ScaleToggle } from "@/components/questimator/ScaleToggle";
import { RankingTab } from "@/components/questimator/RankingTab";
import { PlayerTab } from "@/components/questimator/PlayerTab";
import { fetchPlayersData } from "@/lib/players-cache";
import { useLang } from "@/lib/i18n";
import { ScaleProvider, useScale } from "@/lib/value-scale";
import { useCustomProfiles } from "@/hooks/use-custom-profiles";
import { estimateTheta } from "@/lib/questimator-types";
import type {
  Chart,
  LevelSummary,
  Meta,
  PlayerData,
  PlayersDict,
  SamplePlayers
} from "@/lib/questimator-types";
import {
  computeSamplePlayers,
  levelSortKey,
  levelLabel,
  isSpecialLevel
} from "@/lib/questimator-types";
import {
  BarChart3,
  Layers,
  ListTree,
  Sigma,
  Trophy,
  User
} from "lucide-react";

export default function Home() {
  const { t } = useLang();
  const [charts, setCharts] = useState<Chart[]>([]);
  const [levels, setLevels] = useState<LevelSummary[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedChart, setSelectedChart] = useState<Chart | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [sortKey, setSortKey] = useState<SortKey>("b_hard");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [playersData, setPlayersData] = useState<PlayersDict | null>(null);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlayersData()
      .then((data) => {
        setPlayersData(data);
        setPlayersError(null);
      })
      .catch((e) => {
        console.error("Failed to load players.json", e);
        setPlayersError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setPlayersLoading(false);
      });
  }, []);

  const chartMaxTheta = useMemo(() => {
    if (!playersData) return null;
    const max = new Map<number, number>();
    for (const player of Object.values(playersData)) {
      if (!player.c) continue;
      for (const id of Object.keys(player.c)) {
        const numId = Number(id);
        const currentMax = max.get(numId) ?? -Infinity;
        if (player.t > currentMax) {
          max.set(numId, player.t);
        }
      }
    }
    return max;
  }, [playersData]);

  const samplePlayers = useMemo<SamplePlayers | null>(() => {
    if (!playersData) return null;
    return computeSamplePlayers(playersData);
  }, [playersData]);

  const [activePlayer, setActivePlayer] = useState<{ id: string; data: PlayerData; isCustom?: boolean } | null>(null);
  const { profiles: customProfiles, saveProfile, deleteProfile } = useCustomProfiles();

  useEffect(() => {
    (async () => {
      try {
        const [c, l, m] = await Promise.all([
          fetch("data/charts.json").then((r) => r.json()),
          fetch("data/level-summary.json").then((r) => r.json()),
          fetch("data/meta.json").then((r) => r.json()),
        ]);
        setCharts(c);
        setLevels(l);
        setMeta(m);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sortedLevels = useMemo(
    () =>
      [...levels].sort((a, b) => {
        const [ax, ay] = levelSortKey(a.level);
        const [bx, by] = levelSortKey(b.level);
        return ax - bx || ay - by;
      }),
    [levels]
  );

  const plotLevels = useMemo(
    () =>
      sortedLevels.filter((l) => {
        if (isSpecialLevel(l.level)) return true;
        const n = parseInt(l.level, 10);
        return n >= 20;
      }),
    [sortedLevels]
  );

  const levelCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of charts) m.set(c.level, (m.get(c.level) ?? 0) + 1);
    return m;
  }, [charts]);

  const filteredCharts = useMemo(() => {
    if (selectedLevel === "all") return charts;
    return charts.filter((c) => c.level === selectedLevel);
  }, [charts, selectedLevel]);

  const handleSelectChart = (c: Chart) => {
    setSelectedChart(c);
    setDetailOpen(true);
  };

  const handleSelectLevelFromPlot = (level: string) => {
    setSelectedLevel(level);
    setTab("charts");
  };

  const handleSelectPlayerFromRanking = (id: string, data: PlayerData) => {
    setActivePlayer({ id, data });
    setTab("player");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">{t.computing}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-rose-400">
          <p className="font-semibold mb-2">{t.loadFailed}</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <ScaleProvider levels={levels}>
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b border-border/80 bg-background/90 backdrop-blur-md sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded border border-telemetry-cyan/40 bg-telemetry-cyan/10 flex items-center justify-center text-telemetry-cyan font-mono font-bold text-xs tracking-tighter">
                QE
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold tracking-tight text-foreground">
                    QUEstimator
                  </h1>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-telemetry-cyan/10 text-telemetry-cyan border border-telemetry-cyan/30">
                    U_E 6K
                  </span>
                </div>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {t.subtitle}
                </p>
              </div>
            </div>

            {/* Middle telemetry ticker */}
            <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-muted-foreground border-x border-border/60 px-5 py-1">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-foreground tabular-nums font-semibold">{charts.length}</span>
                <span>CHARTS</span>
              </div>
              <span className="w-px h-3.5 bg-border/80" />
              <div className="flex items-center gap-2">
                <span className="text-foreground tabular-nums font-semibold">{playersData ? Object.keys(playersData).length.toLocaleString() : "..."}</span>
                <span>PLAYERS</span>
              </div>
              <span className="w-px h-3.5 bg-border/80" />
              <div className="text-telemetry-cyan font-medium">
                MCMC NUTS (R-hat: {meta?.convergence?.r_hat_max ? meta.convergence.r_hat_max.toFixed(4) : "1.0040"})
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ScaleToggle />
              <LangToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="w-full flex justify-start items-center gap-1 p-1 bg-card border border-border/80 rounded-lg mb-6 overflow-x-auto no-scrollbar text-xs">
              <TabsTrigger
                value="overview"
                className="px-3.5 py-2 rounded-md transition-all data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <BarChart3 className="w-3.5 h-3.5 text-telemetry-cyan" />
                <span>{t.overview}</span>
              </TabsTrigger>
              <TabsTrigger
                value="charts"
                className="px-3.5 py-2 rounded-md transition-all data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <ListTree className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.chartsTab}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground font-mono tabular-nums">
                  {charts.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="player"
                className="px-3.5 py-2 rounded-md transition-all data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.player}</span>
                {activePlayer && (
                  <span className="w-1.5 h-1.5 rounded-full bg-telemetry-cyan" />
                )}
              </TabsTrigger>
              <TabsTrigger
                value="ranking"
                className="px-3.5 py-2 rounded-md transition-all data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                <span>{t.ranking}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground font-mono tabular-nums">
                  {playersData ? Object.keys(playersData).length : 0}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="about"
                className="px-3.5 py-2 rounded-md transition-all data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <Sigma className="w-3.5 h-3.5 text-violet-400" />
                <span>{t.about}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-0">
              {/* Unified Console Telemetry Strip */}
              <div className="rounded-lg border border-border/80 bg-card/60 divide-y lg:divide-y-0 lg:divide-x divide-border/60 grid grid-cols-2 lg:grid-cols-4">
                <div className="p-4 flex flex-col justify-between">
                  <div className="text-xs text-muted-foreground font-medium">
                    {t.lang === "en" ? "Valid Charts" : "유효 채보"}
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-foreground mt-2">
                    {meta?.n_charts_valid ?? charts.length}
                    <span className="text-xs text-muted-foreground font-normal ml-1.5">
                      (+{meta?.n_charts_provisional ?? 0} {t.lang === "en" ? "prov" : "잠정"})
                    </span>
                  </div>
                </div>

                <div className="p-4 flex flex-col justify-between">
                  <div className="text-xs text-muted-foreground font-medium">
                    {t.lang === "en" ? "Tracked Players" : "분석 플레이어"}
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-foreground mt-2">
                    {playersData ? Object.keys(playersData).length.toLocaleString() : "..."}
                    <span className="text-xs text-muted-foreground font-normal ml-1.5">
                      (μ={samplePlayers?.theta_mean.toFixed(2) ?? "0.05"})
                    </span>
                  </div>
                </div>

                <div className="p-4 flex flex-col justify-between">
                  <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
                    <span>{t.lang === "en" ? "MCMC Convergence" : "MCMC 수렴도"}</span>
                    <span className="text-[10px] text-emerald-400 font-mono font-semibold">PASS (≤ 1.05)</span>
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-400 mt-2">
                    R-hat = {meta?.convergence?.r_hat_max ? meta.convergence.r_hat_max.toFixed(4) : "1.0040"}
                  </div>
                </div>

                <div className="p-4 flex flex-col justify-between">
                  <div className="text-xs text-muted-foreground font-medium">
                    {t.lang === "en" ? "IRT Model" : "IRT 모델"}
                  </div>
                  <div className="text-sm font-bold font-mono text-telemetry-cyan mt-2">
                    Graded Response (GRM)
                  </div>
                </div>
              </div>

              {/* BoxPlot Console */}
              <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4 pb-3 border-b border-border/40">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-telemetry-cyan" />
                      {t.levelDistribution}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {meta
                        ? t.levelDistributionDesc(meta.n_charts_valid, meta.n_charts_provisional)
                        : t.levelDistributionDesc(0, 0)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted/40 border border-border/60">
                      <span className="w-2.5 h-2.5 rounded-sm bg-lamp-hard" />
                      <span className="text-foreground font-mono text-[11px]">HARD (b_hard)</span>
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted/40 border border-border/60">
                      <span className="w-2.5 h-2.5 rounded-sm bg-lamp-vhard" />
                      <span className="text-foreground font-mono text-[11px]">V-HARD (b_vhard)</span>
                    </span>
                  </div>
                </div>

                <BoxPlot
                  data={plotLevels}
                  onSelectLevel={handleSelectLevelFromPlot}
                />
              </div>

              {/* Level Aggregates Table Panel */}
              <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6">
                <div className="mb-4 pb-3 border-b border-border/40 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-foreground">
                      {t.perLevelAggregates}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t.perLevelDesc}
                    </p>
                  </div>
                </div>
                <LevelAggregatesTable levels={plotLevels} onSelectLevel={handleSelectLevelFromPlot} />
              </div>
            </TabsContent>

            <TabsContent value="charts" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
                <div className="h-fit md:sticky md:top-[74px] rounded-lg border border-border/80 bg-card p-3">
                  <div className="px-2 py-1.5 mb-2 border-b border-border/40 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">{t.levels}</span>
                    <span className="text-xs text-muted-foreground font-mono tabular-nums">{sortedLevels.length} folders</span>
                  </div>
                  <ScrollArea className="h-[65vh] pr-2">
                    <div className="space-y-1">
                      <button
                        onClick={() => setSelectedLevel("all")}
                        className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono transition-all flex items-center justify-between ${
                          selectedLevel === "all"
                            ? "bg-muted text-foreground border border-border font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                      >
                        <span>{t.allCharts}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-background/80 border border-border/40">
                          {charts.length}
                        </span>
                      </button>
                      {sortedLevels.map((l) => (
                        <button
                          key={l.level}
                          onClick={() => setSelectedLevel(l.level)}
                          className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono transition-all flex items-center justify-between ${
                            selectedLevel === l.level
                              ? "bg-muted text-foreground border border-border font-semibold"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            {isSpecialLevel(l.level) && (
                              <span className="text-amber-400 text-[10px]">●</span>
                            )}
                            <span>{l.level}</span>
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-background/80 border border-border/40">
                            {levelCounts.get(l.level) ?? 0}
                          </span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div>
                  <div className="mb-4 flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg border border-border/80 bg-card">
                    <div>
                      <h2 className="text-base font-bold font-mono tracking-tight text-foreground flex items-center gap-2">
                        <span>{selectedLevel === "all" ? t.allChartsTitle : `${levelLabel(selectedLevel)}`}</span>
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-muted border border-border/60 text-muted-foreground">
                          {t.chartsCount(filteredCharts.length)}
                        </span>
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {t.sortBy(t.sortKeys[sortKey], t.sortDirs[sortDir])}
                      </p>
                    </div>
                  </div>

                  <ChartTable
                    charts={filteredCharts}
                    onSelectChart={handleSelectChart}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
                    activePlayer={activePlayer}
                    chartMaxTheta={chartMaxTheta}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="player" className="mt-0 space-y-6">
              <PlayerTab
                charts={charts}
                samplePlayers={samplePlayers}
                playerThetaMean={samplePlayers?.theta_mean ?? meta?.player_theta_mean ?? 0}
                playerThetaStd={samplePlayers?.theta_std ?? meta?.player_theta_std ?? 1}
                onSelectChart={handleSelectChart}
                activePlayerExternal={activePlayer}
                customProfiles={customProfiles}
                onSaveCustomProfile={saveProfile}
                onDeleteCustomProfile={deleteProfile}
                players={playersData}
                loadingPlayers={playersLoading}
                loadError={playersError}
                chartMaxTheta={chartMaxTheta}
                onPlayerChange={(id, player, isCustom) => {
                  setActivePlayer((prev) => {
                    if (!player) return prev === null ? prev : null;
                    if (prev?.id === id) return prev;
                    return { id: id!, data: player, isCustom };
                  });
                }}
              />
            </TabsContent>

            <TabsContent value="ranking" className="mt-0">
              <RankingTab
                charts={charts}
                players={playersData}
                loading={playersLoading}
                error={playersError}
                onSelectPlayer={handleSelectPlayerFromRanking}
              />
            </TabsContent>

            <TabsContent value="about" className="mt-0">
              <AboutTab meta={meta} />
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <ChartDetailDialog
        chart={selectedChart}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        activePlayer={activePlayer}
        chartMaxTheta={chartMaxTheta}
        onClearStatusChange={activePlayer?.isCustom ? (chartId, status) => {
          const newData = { ...activePlayer.data, c: { ...(activePlayer.data.c || {}) } };
          if (status < 0) delete newData.c[String(chartId)];
          else newData.c[String(chartId)] = status;
          newData.t = estimateTheta(charts, newData.c);
          setActivePlayer({ id: activePlayer.id, data: newData, isCustom: true });
          saveProfile(activePlayer.id, newData);
        } : undefined}
      />
    </ScaleProvider>
  );
}

function LevelAggregatesTable({ levels, onSelectLevel }: { levels: LevelSummary[], onSelectLevel: (l: string) => void }) {
  const { t } = useLang();
  const { format } = useScale();

  return (
    <div className="max-h-[480px] overflow-y-auto rounded-md border border-border/80 font-mono text-xs">
      <table className="w-full">
        <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
          <tr className="border-b border-border text-left">
            <th className="px-3 py-2.5 font-semibold text-muted-foreground">{t.level}</th>
            <th className="px-3 py-2.5 font-semibold text-muted-foreground text-right">{t.chartsCol}</th>
            <th className="px-3 py-2.5 font-semibold text-right text-lamp-hard">{t.hardMed}</th>
            <th className="px-3 py-2.5 font-semibold text-muted-foreground text-right">{t.hardIQR}</th>
            <th className="px-3 py-2.5 font-semibold text-right text-lamp-vhard">{t.vhardMed}</th>
            <th className="px-3 py-2.5 font-semibold text-muted-foreground text-right">{t.vhardIQR}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {levels.map((l) => (
            <tr
              key={l.level}
              className="hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => onSelectLevel(l.level)}
            >
              <td className="px-3 py-2.5 font-semibold">
                <span className={isSpecialLevel(l.level) ? "text-amber-400" : "text-foreground"}>
                  {l.level}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                {l.n_charts_valid} <span className="text-xs text-muted-foreground/80">/ {l.n_charts_total}</span>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-lamp-hard tabular-nums">
                {format(l.hard_median)}
              </td>
              <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                {l.hard_q1 != null && l.hard_q3 != null
                  ? `[${format(l.hard_q1)}, ${format(l.hard_q3)}]`
                  : "–"}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-lamp-vhard tabular-nums">
                {format(l.vhard_median)}
              </td>
              <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                {l.vhard_q1 != null && l.vhard_q3 != null
                  ? `[${format(l.vhard_q1)}, ${format(l.vhard_q3)}]`
                  : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AboutTab({ meta }: { meta: Meta | null }) {
  const { t } = useLang();
  return (
    <div className="max-w-4xl space-y-6">
      {/* Overview panel */}
      <div className="rounded-lg border border-border/80 bg-card p-5 sm:p-6">
        <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <Sigma className="w-4 h-4 text-telemetry-cyan" />
          {t.projectOverview}
        </h3>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {t.lang === "en" ? (
            <>
              <p>
                <strong className="text-foreground">QUEstimator</strong> is an objective, data-driven difficulty estimation system for 6-key BMS charts on the U_E scale in <span className="text-foreground">Qwilight</span>. By fitting a Bayesian Graded Response Model (GRM), it evaluates the exact latent difficulty thresholds for HARD and V-HARD clears directly from actual Internet Ranking (IR) play logs.
              </p>
              <p>
                Qwilight is uniquely suited for IRT estimation due to its <strong className="text-foreground">Gauge Auto-Shift (GAS)</strong> system: a failed V-HARD play automatically continues on the HARD gauge. The clear status recorded on the IR therefore represents a player&apos;s genuine organic peak survival threshold without requiring artificial gauge conversion guesses.
              </p>
              <p className="text-xs pt-1 font-mono">
                Inspired by{" "}
                <a
                  href="https://github.com/HorieYuuka"
                  target="_blank"
                  rel="noreferrer"
                  className="text-telemetry-cyan hover:underline"
                >
                  HorieYuuka&apos;s Scale Analyzer
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <p>
                <strong className="text-foreground">QUEstimator</strong>는 <span className="text-foreground">Qwilight</span> U_E 단위인정(6키) 수록 채보를 대상으로 한 베이지안 문항반응이론(IRT) 기반 난이도 추정 대시보드입니다. 인터넷 랭킹(IR) 플레이 기록을 바탕으로 Graded Response Model(GRM)을 피팅하여 각 패턴의 HARD 및 V-HARD 클리어 한계 난이도를 산출합니다.
              </p>
              <p>
                Qwilight 특유의 <strong className="text-foreground">Gauge Auto-Shift(GAS)</strong> 시스템(V-HARD 폭사 시 HARD 게이지 자동 승계) 덕분에, IR에 기록된 클리어 상태는 별도의 추정 없이 유저의 유기적인 최고 게이지 생존 역치를 나타냅니다.
              </p>
              <p className="text-xs pt-1 font-mono">
                Inspired by{" "}
                <a
                  href="https://github.com/HorieYuuka"
                  target="_blank"
                  rel="noreferrer"
                  className="text-telemetry-cyan hover:underline"
                >
                  HorieYuuka&apos;s Scale Analyzer
                </a>
                .
              </p>
            </>
          )}
        </div>
      </div>

      {/* Math & Model Architecture */}
      <div className="rounded-lg border border-border/80 bg-card p-5 sm:p-6">
        <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          {t.methodology}
        </h3>
        <div className="space-y-4 text-xs">
          <div className="rounded border border-border/70 p-4 bg-muted/20">
            <div className="text-foreground font-semibold text-sm mb-2 font-mono">
              P*(θ, k) = 1 / (1 + exp(-a_i · (θ - b_ik)))
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {t.lang === "en"
                ? "Samejima's Graded Response Model parameterizes the cumulative survival probability P* that a player with latent skill ability θ clears chart i on gauge tier k or higher."
                : "Samejima의 Graded Response Model(GRM)을 채택하여, 잠재 실력 θ인 플레이어가 문항 i를 게이지 단계 k 이상으로 클리어할 누적 생존 확률 P*를 추정합니다."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded border border-border/60 bg-muted/20">
              <div className="text-foreground font-semibold mb-1">a_i (Discrimination)</div>
              <div className="text-muted-foreground text-xs">
                {t.lang === "en"
                  ? "Indicates how strictly the chart tests pure skill vs randomness."
                  : "패턴이 순수 실력을 얼마나 예리하게 판별하는지 나타냅니다."}
              </div>
            </div>
            <div className="p-3 rounded border border-border/60 bg-muted/20">
              <div className="text-foreground font-semibold mb-1">b_k (Difficulty)</div>
              <div className="text-muted-foreground text-xs">
                {t.lang === "en"
                  ? "Point where survival probability reaches 50%."
                  : "생존 확률이 50%에 도달하는 임계 난이도."}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline & Diagnostics panel */}
      <div className="rounded-lg border border-border/80 bg-card p-5 sm:p-6">
        <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          {t.pipelineState}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="rounded border border-border/60 p-3 bg-muted/20">
            <div className="text-muted-foreground text-xs">{t.model}</div>
            <div className="text-foreground font-semibold mt-1">{meta?.model}</div>
          </div>
          <div className="rounded border border-border/60 p-3 bg-muted/20">
            <div className="text-muted-foreground text-xs">{t.categories}</div>
            <div className="text-foreground font-semibold mt-1">{meta?.categories.join(" → ")}</div>
          </div>
          <div className="rounded border border-border/60 p-3 bg-muted/20">
            <div className="text-muted-foreground text-xs">{t.provisionalRule}</div>
            <div className="text-foreground font-semibold mt-1">{meta?.provisional_rule}</div>
          </div>
          <div className="rounded border border-border/60 p-3 bg-muted/20">
            <div className="text-muted-foreground text-xs">{t.runtimeLabel}</div>
            <div className="text-foreground font-semibold mt-1 tabular-nums">{meta?.runtime_sec}s</div>
          </div>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="rounded-lg border border-border/80 bg-card p-5 sm:p-6">
        <h3 className="text-base font-bold text-foreground mb-2">
          {t.techStack}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
          <div><span className="text-foreground font-semibold">Inference Engine:</span> NumPyro NUTS MCMC · JAX</div>
          <div><span className="text-foreground font-semibold">Quadrature:</span> 101-node Gauss–Hermite integration</div>
          <div><span className="text-foreground font-semibold">Frontend:</span> Next.js 16 · React 19 · Tailwind CSS</div>
          <div><span className="text-foreground font-semibold">Scale System:</span> Piecewise LERP · Posterior Medians</div>
        </div>
      </div>
    </div>
  );
}