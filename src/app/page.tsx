"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ListTree, Sigma, Trophy, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { type SortDir, type SortKey } from "@/components/questimator/ChartTable";
import { ChartDetailDialog } from "@/components/questimator/ChartDetailDialog";
import { LangToggle } from "@/components/questimator/LangToggle";
import { ScaleToggle } from "@/components/questimator/ScaleToggle";
import { OverviewTab } from "@/components/questimator/OverviewTab";
import { ChartsCatalogTab } from "@/components/questimator/ChartsCatalogTab";
import { PlayerTab } from "@/components/questimator/PlayerTab";
import { RankingTab } from "@/components/questimator/RankingTab";
import { AboutTab } from "@/components/questimator/AboutTab";
import { fetchPlayersData } from "@/lib/players-cache";
import { useLang } from "@/lib/i18n";
import { ScaleProvider } from "@/lib/value-scale";
import { useCustomProfiles } from "@/hooks/use-custom-profiles";
import {
  computeLeaderboard,
  computeSamplePlayers,
  estimateThetaWithSe,
  isSpecialLevel,
  levelSortKey,
  type Chart,
  type LeaderboardResult,
  type LevelSummary,
  type Meta,
  type PlayerData,
  type PlayersDict,
  type SamplePlayers,
} from "@/lib/questimator-types";

let appDataPromise: Promise<[Chart[], LevelSummary[], Meta]> | null = null;
function fetchAppData(): Promise<[Chart[], LevelSummary[], Meta]> {
  if (!appDataPromise) {
    appDataPromise = Promise.all([
      fetch("data/charts.json").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching charts.json`);
        return r.json() as Promise<Chart[]>;
      }),
      fetch("data/level-summary.json").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching level-summary.json`);
        return r.json() as Promise<LevelSummary[]>;
      }),
      fetch("data/meta.json").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching meta.json`);
        return r.json() as Promise<Meta>;
      }),
    ]).catch((err) => {
      appDataPromise = null;
      throw err;
    });
  }
  return appDataPromise;
}

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
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [needsPlayers, setNeedsPlayers] = useState(false);

  const triggerPlayersLoad = useCallback(() => {
    setNeedsPlayers(true);
  }, []);

  // Lazily fetch 1.75 MB players.json only when needed (Player/Ranking tab, URL ?player=/?rival=, or saved rival)
  useEffect(() => {
    if (tab === "player" || tab === "ranking") {
      setNeedsPlayers(true);
    }
  }, [tab]);

  useEffect(() => {
    if (!needsPlayers || playersData) return;
    let cancelled = false;
    setPlayersLoading(true);
    fetchPlayersData()
      .then((data) => {
        if (!cancelled) {
          setPlayersData(data);
          setPlayersError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("Failed to load players.json", e);
          setPlayersError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setPlayersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsPlayers, playersData]);

  // Prefer precomputed max_played_theta on charts.json so Charts tab & ChartDetailDialog
  // don't require loading the 1.75 MB players.json; fall back to playersData when available.
  const chartMaxTheta = useMemo(() => {
    const max = new Map<number, number>();
    for (const c of charts) {
      if (c.max_played_theta != null && Number.isFinite(c.max_played_theta)) {
        max.set(c.id, c.max_played_theta);
      }
    }
    if (playersData) {
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
    }
    return max.size > 0 ? max : null;
  }, [charts, playersData]);

  const samplePlayers = useMemo<SamplePlayers | null>(() => {
    if (playersData) return computeSamplePlayers(playersData);
    return meta?.player_distribution ?? null;
  }, [playersData, meta]);

  const leaderboard = useMemo<LeaderboardResult | null>(() => {
    if (!playersData || charts.length === 0) return null;
    return computeLeaderboard(playersData, charts);
  }, [playersData, charts]);

  const [activePlayer, setActivePlayer] = useState<{
    id: string;
    data: PlayerData;
    isCustom?: boolean;
  } | null>(null);
  const [rivalPlayer, setRivalPlayer] = useState<{
    id: string;
    data: PlayerData;
    isCustom?: boolean;
  } | null>(null);
  const [targetMode, setTargetMode] = useState<"HARD" | "V-HARD">("HARD");
  const { profiles: customProfiles, saveProfile, deleteProfile } = useCustomProfiles(charts);

  const handleTargetModeChange = (nextMode: "HARD" | "V-HARD") => {
    setTargetMode(nextMode);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("questimator_target_mode", nextMode);
      } catch {}
    }
  };

  const handleSetRival = useCallback(
    (id: string | null, player?: PlayerData | null, isCustom?: boolean) => {
      if (!id || !player) {
        setRivalPlayer(null);
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem("questimator_rival_id");
            const url = new URL(window.location.href);
            url.searchParams.delete("rival");
            window.history.replaceState(null, "", url.toString());
          } catch {}
        }
        return;
      }
      setRivalPlayer({ id, data: player, isCustom });
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("questimator_rival_id", id);
          const url = new URL(window.location.href);
          url.searchParams.set("rival", id);
          window.history.replaceState(null, "", url.toString());
        } catch {}
      }
    },
    []
  );

  const hasRestoredInitialState = useRef(false);

  // Restore initial player and rival from URL or localStorage when data loads (once only)
  useEffect(() => {
    if (typeof window === "undefined" || !playersData || hasRestoredInitialState.current) return;
    hasRestoredInitialState.current = true;

    try {
      const params = new URLSearchParams(window.location.search);
      const playerId = params.get("player");
      if (playerId && playersData[playerId]) {
        setActivePlayer({ id: playerId, data: playersData[playerId] });
      }

      const urlRivalId = params.get("rival");
      const savedRivalId = localStorage.getItem("questimator_rival_id");
      const targetRivalId = urlRivalId || savedRivalId;

      if (targetRivalId) {
        if (customProfiles[targetRivalId]) {
          setRivalPlayer({ id: targetRivalId, data: customProfiles[targetRivalId], isCustom: true });
        } else if (playersData[targetRivalId]) {
          setRivalPlayer({ id: targetRivalId, data: playersData[targetRivalId], isCustom: false });
        }
      }
    } catch {}
  }, [playersData, customProfiles]);

  // Keep activePlayer in sync if custom profile theta is recomputed
  useEffect(() => {
    if (activePlayer?.isCustom && customProfiles[activePlayer.id]) {
      const updated = customProfiles[activePlayer.id];
      if (Math.abs(updated.t - activePlayer.data.t) > 0.0001 || updated.se !== activePlayer.data.se) {
        setActivePlayer({ id: activePlayer.id, data: updated, isCustom: true });
      }
    }
  }, [customProfiles, activePlayer]);

  // Keep rivalPlayer in sync if custom profile theta is recomputed
  useEffect(() => {
    if (rivalPlayer?.isCustom && customProfiles[rivalPlayer.id]) {
      const updated = customProfiles[rivalPlayer.id];
      if (Math.abs(updated.t - rivalPlayer.data.t) > 0.0001 || updated.se !== rivalPlayer.data.se) {
        setRivalPlayer({ id: rivalPlayer.id, data: updated, isCustom: true });
      }
    }
  }, [customProfiles, rivalPlayer]);

  // Restore navigation state from URL search params on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const initialTab = params.get("tab");
      if (initialTab && ["overview", "charts", "player", "ranking", "about"].includes(initialTab)) {
        setTab(initialTab);
      }
      const initialLevel = params.get("level");
      if (initialLevel) {
        setSelectedLevel(initialLevel);
      }
      const targetParam = params.get("target")?.toLowerCase();
      if (targetParam === "vhard" || targetParam === "v-hard") {
        setTargetMode("V-HARD");
      } else if (!params.has("target")) {
        const savedTarget = localStorage.getItem("questimator_target_mode");
        if (savedTarget === "V-HARD") {
          setTargetMode("V-HARD");
        }
      }
      if (params.get("player") || params.get("rival") || localStorage.getItem("questimator_rival_id")) {
        triggerPlayersLoad();
      }
    } catch {}
  }, [triggerPlayersLoad]);

  const hasRestoredChart = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || charts.length === 0 || hasRestoredChart.current) return;
    hasRestoredChart.current = true;
    const params = new URLSearchParams(window.location.search);
    const chartParam = params.get("chart");
    if (chartParam) {
      const found = charts.find((c) => c.md5 === chartParam || String(c.id) === chartParam);
      if (found) {
        setSelectedChart(found);
        setDetailOpen(true);
      }
    }
  }, [charts]);

  // Sync state changes to URL query params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (tab !== "overview") url.searchParams.set("tab", tab);
    else url.searchParams.delete("tab");

    if (selectedLevel !== "all") url.searchParams.set("level", selectedLevel);
    else url.searchParams.delete("level");

    if (activePlayer?.id) url.searchParams.set("player", activePlayer.id);
    else url.searchParams.delete("player");

    if (rivalPlayer?.id) url.searchParams.set("rival", rivalPlayer.id);
    else url.searchParams.delete("rival");

    if (targetMode === "V-HARD") url.searchParams.set("target", "vhard");
    else url.searchParams.delete("target");

    if (detailOpen && selectedChart?.md5) url.searchParams.set("chart", selectedChart.md5);
    else url.searchParams.delete("chart");

    window.history.replaceState(null, "", url.toString());
  }, [tab, selectedLevel, activePlayer?.id, rivalPlayer?.id, targetMode, detailOpen, selectedChart?.md5]);

  useEffect(() => {
    fetchAppData()
      .then(([c, l, m]) => {
        setCharts(c);
        setLevels(l);
        setMeta(m);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setLoading(false);
      });
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

  const handleSelectChart = useCallback((c: Chart) => {
    setSelectedChart(c);
    setDetailOpen(true);
  }, []);

  const handleSelectLevelFromPlot = useCallback((level: string) => {
    setSelectedLevel(level);
    setTab("charts");
  }, []);

  const handleSelectPlayerFromRanking = useCallback((id: string, data: PlayerData) => {
    setActivePlayer({ id, data });
    setTab("player");
  }, []);

  const handlePlayerChange = useCallback(
    (id: string | null, player: PlayerData | null, isCustom?: boolean) => {
      setActivePlayer((prev) => {
        if (!player) return prev === null ? prev : null;
        if (prev?.id === id && prev?.data === player && prev?.isCustom === isCustom) return prev;
        return { id: id!, data: player, isCustom };
      });
    },
    []
  );

  const handleClearStatusChange = useCallback(
    (chartId: number, status: number) => {
      if (!activePlayer?.isCustom) return;
      const newData = { ...activePlayer.data, c: { ...(activePlayer.data.c || {}) } };
      if (status < 0) delete newData.c[String(chartId)];
      else newData.c[String(chartId)] = status;
      const { theta, se } = estimateThetaWithSe(charts, newData.c);
      newData.t = theta;
      newData.se = se;
      setActivePlayer({ id: activePlayer.id, data: newData, isCustom: true });
      saveProfile(activePlayer.id, newData);
    },
    [activePlayer, charts, saveProfile]
  );

  const playersCount = playersData ? Object.keys(playersData).length : (meta?.n_players ?? null);

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
          <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded border border-telemetry-cyan/40 bg-telemetry-cyan/10 flex items-center justify-center text-telemetry-cyan font-mono font-bold text-xs tracking-tighter shrink-0">
                QE
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground truncate">
                    QUEstimator
                  </h1>
                  <span className="px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-semibold uppercase bg-telemetry-cyan/10 text-telemetry-cyan border border-telemetry-cyan/30 shrink-0">
                    U_E 6K
                  </span>
                </div>
                <p className="text-xs text-muted-foreground hidden sm:block">{t.subtitle}</p>
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
                <span className="text-foreground tabular-nums font-semibold">
                  {playersCount != null ? playersCount.toLocaleString() : "..."}
                </span>
                <span>PLAYERS</span>
              </div>
              <span className="w-px h-3.5 bg-border/80" />
              <div
                className={cn(
                  "font-medium",
                  (meta?.convergence?.convergence_ok ?? true)
                    ? "text-telemetry-cyan"
                    : "text-amber-400"
                )}
              >
                MCMC NUTS{" "}
                {meta?.convergence?.r_hat_max ? `(R̂: ${meta.convergence.r_hat_max.toFixed(4)})` : ""}
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
                {activePlayer && <span className="w-1.5 h-1.5 rounded-full bg-telemetry-cyan" />}
                {rivalPlayer && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-amber-400"
                    title={`Rival: ${rivalPlayer.data?.n || rivalPlayer.id}`}
                  />
                )}
              </TabsTrigger>
              <TabsTrigger
                value="ranking"
                className="px-3.5 py-2 rounded-md transition-all data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                <span>{t.ranking}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground font-mono tabular-nums">
                  {playersCount ?? 0}
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

            <TabsContent value="overview" className="mt-0">
              <OverviewTab
                chartsCount={charts.length}
                playersCount={playersCount}
                meta={meta}
                samplePlayers={samplePlayers}
                plotLevels={plotLevels}
                onSelectLevel={handleSelectLevelFromPlot}
              />
            </TabsContent>

            <TabsContent value="charts" className="mt-0">
              <ChartsCatalogTab
                charts={charts}
                filteredCharts={filteredCharts}
                sortedLevels={sortedLevels}
                levelCounts={levelCounts}
                selectedLevel={selectedLevel}
                onSelectLevel={setSelectedLevel}
                onSelectChart={handleSelectChart}
                sortKey={sortKey}
                sortDir={sortDir}
                onSortChange={(k, d) => {
                  setSortKey(k);
                  setSortDir(d);
                }}
                activePlayer={activePlayer}
                chartMaxTheta={chartMaxTheta}
                onClearStatusChange={activePlayer?.isCustom ? handleClearStatusChange : undefined}
              />
            </TabsContent>

            <TabsContent value="player" className="mt-0 space-y-6">
              <PlayerTab
                charts={charts}
                samplePlayers={samplePlayers}
                leaderboard={leaderboard}
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
                rivalPlayer={rivalPlayer}
                onSetRival={handleSetRival}
                targetStatus={targetMode}
                onTargetStatusChange={handleTargetModeChange}
                onPlayerChange={handlePlayerChange}
              />
            </TabsContent>

            <TabsContent value="ranking" className="mt-0">
              <RankingTab
                charts={charts}
                players={playersData}
                leaderboard={leaderboard}
                loading={playersLoading}
                error={playersError}
                onSelectPlayer={handleSelectPlayerFromRanking}
                rivalId={rivalPlayer?.id}
                onToggleRival={(id, data) => {
                  if (rivalPlayer?.id === id) handleSetRival(null);
                  else handleSetRival(id, data, false);
                }}
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
        rivalPlayer={rivalPlayer}
        chartMaxTheta={chartMaxTheta}
        onClearStatusChange={handleClearStatusChange}
      />
    </ScaleProvider>
  );
}
