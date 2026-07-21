"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, User, Target, Sparkles, TrendingUp, Save, Trash2, Download, Upload } from "lucide-react";
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
import { PlayerComparison } from "./PlayerComparison";

interface Props {
  charts: Chart[];
  samplePlayers: SamplePlayers | null;
  playerThetaMean: number;
  playerThetaStd: number;
  onSelectChart: (c: Chart) => void;
  activePlayerExternal?: { id: string; data: PlayerData; isCustom?: boolean } | null;
  onPlayerChange: (avatarID: string | null, player: PlayerData | null, isCustom?: boolean) => void;
  customProfiles?: Record<string, PlayerData>;
  onSaveCustomProfile?: (id: string, data: PlayerData) => void;
  onDeleteCustomProfile?: (id: string) => void;
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

function pHard(theta: number, c: Chart): number | null {
  if (c.a == null || c.b_hard == null) return null;
  return pStar(theta, c.a, c.b_hard);
}

function pVHard(theta: number, c: Chart): number | null {
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
  customProfiles = {},
  onSaveCustomProfile,
  onDeleteCustomProfile,
}: Props) {
  const { t } = useLang();
  const { mode, format } = useScale();
  const [query, setQuery] = useState("");
  const [submittedID, setSubmittedID] = useState("");
  const [isCustomProfile, setIsCustomProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [players, setPlayers] = useState<PlayersDict | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [targetStatus, setTargetStatus] = useState<"HARD" | "V-HARD">("HARD");

  const [rivalID, setRivalID] = useState("");
  const [rivalPlayer, setRivalPlayer] = useState<PlayerData | null>(null);
  const [rivalNotFound, setRivalNotFound] = useState(false);

  const handleSearchRival = async (id: string) => {
    if (!id) {
      setRivalPlayer(null);
      setRivalID("");
      return;
    }
    if (customProfiles[id]) {
      setRivalID(id);
      setRivalPlayer(customProfiles[id]);
      setRivalNotFound(false);
      return;
    }
    const dict = await fetchPlayers.current?.();
    if (dict && dict[id]) {
      setRivalID(id);
      setRivalPlayer(dict[id]);
      setRivalNotFound(false);
    } else {
      setRivalNotFound(true);
      setRivalPlayer(null);
    }
  };

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

  // Sync external active player to local state when it changes from outside (e.g. Ranking tab)
  useEffect(() => {
    if (activePlayerExternal) {
      setSubmittedID(activePlayerExternal.id);
      setIsCustomProfile(!!activePlayerExternal.isCustom);
      setQuery(activePlayerExternal.id);
    }
  }, [activePlayerExternal]); // Sync when the external object changes (e.g., clicking on ranking tab)

  const currentPlayer = useMemo<PlayerData | null>(() => {
    if (isCustomProfile) return customProfiles?.[submittedID] ?? null;
    if (activePlayerExternal && activePlayerExternal.id === submittedID) return activePlayerExternal.data;
    if (!players || !submittedID) return null;
    return players[submittedID] ?? null;
  }, [players, submittedID, activePlayerExternal, customProfiles, isCustomProfile]);

  useEffect(() => {
    onPlayerChange(currentPlayer ? submittedID : null, currentPlayer, isCustomProfile);
  }, [currentPlayer, submittedID, isCustomProfile, onPlayerChange]);

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
      setIsCustomProfile(false);
      handleSearch();
    }
  };

  const analytics = useMemo(() => {
    if (!currentPlayer) return null;

    const chartById = new Map<number, Chart>();
    for (const c of charts) chartById.set(c.id, c);

    const statusCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const s of Object.values(currentPlayer.c || {})) {
      if (s >= 0 && s <= 3) statusCounts[s as 0 | 1 | 2 | 3] += 1;
    }
    const totalClears = statusCounts[0] + statusCounts[1] + statusCounts[2] + statusCounts[3];

    const theta = currentPlayer.t;
    type Rec = { chart: Chart; p: number };
    const recommendations: Rec[] = [];
    const allProbabilities: Rec[] = [];

    for (const c of charts) {
      if (c.provisional) continue;
      const p = targetStatus === "HARD" ? pHard(theta, c) : pVHard(theta, c);
      if (p == null) continue;
      const status = currentPlayer.c?.[String(c.id)] ?? 0;
      if (status >= (targetStatus === "HARD" ? 2 : 3)) continue; // Skip if target status or higher is cleared

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
      const aVal = targetStatus === "HARD" ? a.chart.b_hard_display : a.chart.b_vhard_display;
      const bVal = targetStatus === "HARD" ? b.chart.b_hard_display : b.chart.b_vhard_display;
      return (bVal ?? -99) - (aVal ?? -99);
    });
    const recommendationsLimited = recommendations.slice(0, REC_LIMIT);

    allProbabilities.sort((a, b) => b.p - a.p);
    const allProbabilitiesLimited = allProbabilities.slice(0, PROB_LIMIT);

    const clearedByLevel = new Map<string, number>();
    const levelTotals = new Map<string, number>();
    charts.forEach(c => {
      if (!c.provisional) {
        levelTotals.set(c.level, (levelTotals.get(c.level) ?? 0) + 1);
      }
    });
    for (const [idStr, status] of Object.entries(currentPlayer.c || {})) {
      if (status < 2) continue; // 2 is HARD, 3 is V-HARD
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
      targetStatus,
      levelTotals,
    };
  }, [currentPlayer, charts, targetStatus]);

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
      <Card className="gap-3 py-4">
        <CardHeader>
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
              onClick={() => { setIsCustomProfile(false); handleSearch(); }}
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
              {percentile != null && (
                <>
                  <span className="mx-1.5">·</span>
                  <span className="font-mono">Top {((1 - percentile) * 100).toFixed(1)}%</span>
                  <PlayerComparison
            activePlayer={currentPlayer}
            activePlayerId={submittedID}
            rivalPlayer={rivalPlayer}
            rivalId={rivalID}
            onSearchRival={handleSearchRival}
            chartById={chartById}
            targetStatus={targetStatus === "HARD" ? 2 : 3}
            t={t}
            format={format}
            rivalNotFound={rivalNotFound}
          />
        </>
              )}
              {isCustomProfile && <Badge variant="outline" className="ml-2 text-[9px] py-0 border-blue-500/40 text-blue-400">OFFLINE PROFILE</Badge>}
              {isCustomProfile && <span className="ml-2">Click any chart to edit its clear status (use the Charts tab to search all charts).</span>}
            </div>
          )}

          <div className="flex gap-6 mt-6 border-t border-border/40 pt-5 flex-col sm:flex-row">
            <div className="flex-1 space-y-3">
              <div className="text-sm font-medium">Offline Profiles</div>
              <Select
                value={isCustomProfile ? submittedID : ""}
                onValueChange={(v) => {
                  if (v) {
                    setIsCustomProfile(true);
                    setSubmittedID(v);
                  }
                }}
              >
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder="Select an offline profile..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(customProfiles).map((id) => (
                    <SelectItem key={id} value={id}>{id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1 space-y-3">
              <div className="text-sm font-medium">Manage</div>
              
              {isCreating ? (
                <div className="flex items-center gap-2">
                  <Input 
                    placeholder="Profile name..." 
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    className="h-8 text-xs"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter" && newProfileName.trim() && onSaveCustomProfile) {
                        const name = newProfileName.trim();
                        onSaveCustomProfile(name, currentPlayer ? { ...currentPlayer, c: { ...currentPlayer.c } } : { t: 0, c: {} });
                        setIsCustomProfile(true);
                        setSubmittedID(name);
                        setIsCreating(false);
                        setNewProfileName("");
                      } else if (e.key === "Escape") {
                        setIsCreating(false);
                      }
                    }}
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={() => {
                    if (newProfileName.trim() && onSaveCustomProfile) {
                        const name = newProfileName.trim();
                        onSaveCustomProfile(name, currentPlayer ? { ...currentPlayer, c: { ...currentPlayer.c } } : { t: 0, c: {} });
                        setIsCustomProfile(true);
                        setSubmittedID(name);
                        setIsCreating(false);
                        setNewProfileName("");
                    }
                  }}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setIsCreating(false)}>Cancel</Button>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    size="sm" variant="outline" className="text-xs"
                    onClick={() => {
                      setIsCreating(true);
                    }}
                  >
                    <Save className="w-3 h-3 mr-1" /> {currentPlayer ? "Clone" : "New"}
                  </Button>
                  
                  {isCustomProfile && currentPlayer && (
                    <>
                      <Button 
                        size="sm" variant="outline" className="text-xs text-rose-400 border-rose-400/30 hover:bg-rose-400/10"
                        onClick={() => {
                          if (onDeleteCustomProfile) {
                            onDeleteCustomProfile(submittedID);
                            setIsCustomProfile(false);
                            setSubmittedID("");
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                      </Button>
                      <Button 
                        size="sm" variant="outline" className="text-xs"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(currentPlayer)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `profile-${submittedID}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="w-3 h-3 mr-1" /> Export
                      </Button>
                    </>
                  )}
                  
                  <Button 
                    size="sm" variant="outline" className="text-xs relative overflow-hidden"
                  >
                    <Upload className="w-3 h-3 mr-1" /> Import
                    <input 
                      type="file" 
                      accept=".json"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (e) => {
                          try {
                            const data = JSON.parse(e.target?.result as string);
                            if (data && typeof data.t === 'number' && typeof data.c === 'object') {
                              const name = file.name.replace('.json', '');
                              if (onSaveCustomProfile) onSaveCustomProfile(name, data);
                              setIsCustomProfile(true);
                              setSubmittedID(name);
                            }
                          } catch (err) {}
                        };
                        reader.readAsText(file);
                        e.target.value = "";
                      }}
                    />
                  </Button>
                </div>
              )}
            </div>
          </div>

        </CardContent>
      </Card>

      {currentPlayer && analytics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <Card className="gap-3 py-4">
              <CardHeader>
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
                    {t.histogramXAxis(mode === 'lerp')}
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

            <Card className="gap-3 py-4">
              <CardHeader>
                <CardTitle className="text-sm">
                  {t.lang === "en" ? "Level Completion (HARD+)" : "레벨 클리어 진행도 (HARD+)"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.clearedLevels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t.lang === "en"
                      ? "No HARD+ clears logged yet."
                      : "HARD 이상 클리어 기록이 없습니다."}
                  </p>
                ) : (
                  <ScrollArea className="max-h-[220px] pr-4">
                    <div className="space-y-3">
                      {analytics.clearedLevels.map(([lvl, n]) => {
                        const total = analytics.levelTotals.get(lvl) ?? 1;
                        const pct = Math.min(100, Math.max(0, (n / total) * 100));
                        return (
                          <div key={lvl} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className={`font-mono ${isSpecialLevel(lvl) ? "text-amber-400" : "text-foreground"}`}>
                                Level {lvl}
                              </span>
                              <span className="text-muted-foreground tabular-nums font-mono text-[10px]">
                                {n} / {total} ({pct.toFixed(1)}%)
                              </span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        );
                      })}
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

          <Card className="gap-3 py-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  {t.recommendedCharts}
                </CardTitle>
                <Select value={targetStatus} onValueChange={(v: any) => setTargetStatus(v)}>
                  <SelectTrigger className="w-[110px] h-8 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HARD">HARD</SelectItem>
                    <SelectItem value="V-HARD">V-HARD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t.lang === "en"
                  ? `Charts you haven't ${targetStatus} cleared where P(${targetStatus}) ∈ [${fmtPct(REC_MIN_PROB)}, ${fmtPct(REC_MAX_PROB)}] — challenging but achievable. Top ${REC_LIMIT} shown.`
                  : `${targetStatus} 미클리어 채보 중 P(${targetStatus}) ∈ [${fmtPct(REC_MIN_PROB)}, ${fmtPct(REC_MAX_PROB)}]인 도전 가능한 채보. 상위 ${REC_LIMIT}개.`}
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
                      targetStatus={targetStatus}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className={`w-4 h-4 ${targetStatus === "HARD" ? "text-rose-400" : "text-purple-400"}`} />
                {t.yourProbabilities}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {t.lang === "en"
                  ? `All uncompleted charts with P(${targetStatus}) ≥ ${fmtPct(PROB_MIN_THRESHOLD)}, sorted by descending probability. Top ${PROB_LIMIT} shown.`
                  : `P(${targetStatus}) ≥ ${fmtPct(PROB_MIN_THRESHOLD)}인 미클리어 채보, 확률 내림차순. 상위 ${PROB_LIMIT}개.`}
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/60 overflow-hidden">
                <ScrollArea className="max-h-[480px]">
                  <Table className="w-full text-sm">
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="border-b border-border/60 text-left">
                        <TableHead className="px-3 py-2 font-medium text-muted-foreground text-xs">{t.chart}</TableHead>
                        <TableHead className="px-3 py-2 font-medium text-muted-foreground text-xs text-center w-[60px]">{t.level}</TableHead>
                        <TableHead className="px-3 py-2 font-medium text-muted-foreground text-xs text-right w-[80px]">P({targetStatus})</TableHead>
                        <TableHead className="px-3 py-2 font-medium text-muted-foreground text-xs text-right w-[80px]">b_{targetStatus === "HARD" ? "hard" : "vhard"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.allProbabilities.map(({ chart, p }) => (
                        <TableRow
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
                            <span style={{ color: targetStatus === "HARD" ? "oklch(0.78 0.18 25)" : "oklch(0.78 0.18 305)" }}>
                              {format(targetStatus === "HARD" ? chart.b_hard_display : chart.b_vhard_display)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
  mode,
  targetStatus
}: {
  chart: Chart;
  p: number;
  onClick: () => void;
  formatFn: (val: number | null | undefined) => string;
  t: any;
  mode: string;
  targetStatus: "HARD" | "V-HARD";
}) {
  const bVal = targetStatus === "HARD" ? chart.b_hard_display : chart.b_vhard_display;
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
        <span className="font-mono font-semibold" style={{ color: targetStatus === "HARD" ? "oklch(0.78 0.18 25)" : "oklch(0.78 0.18 305)" }}>
          {fmtPct(p)}
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full"
          style={{
            width: `${Math.min(100, p * 100)}%`,
            background: targetStatus === "HARD" ? "oklch(0.70 0.22 25)" : "oklch(0.70 0.22 305)",
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>
          b_{targetStatus === "HARD" ? "hard" : "vhard"}: <span style={{ color: targetStatus === "HARD" ? "oklch(0.78 0.18 25)" : "oklch(0.78 0.18 305)" }}>{formatFn(bVal)}</span>
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