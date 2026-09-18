"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, User, Target, Sparkles, TrendingUp, Save, Trash2, Download, Upload } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import { cn } from "@/lib/utils";
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
import { fetchPlayersData } from "@/lib/players-cache";

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
  players?: PlayersDict | null;
  loadingPlayers?: boolean;
  loadError?: string | null;
  chartMaxTheta?: Map<number, number> | null;
}

const STATUS_LABELS: Record<number, { short: string; color: string; bgClass: string; textClass: string }> = {
  0: { short: "F",  color: "var(--color-lamp-failed)", bgClass: "bg-lamp-failed", textClass: "text-muted-foreground" },
  1: { short: "N",  color: "var(--color-lamp-normal)", bgClass: "bg-lamp-normal", textClass: "text-lamp-normal" },
  2: { short: "H",  color: "var(--color-lamp-hard)",   bgClass: "bg-lamp-hard",   textClass: "text-lamp-hard" },
  3: { short: "VH", color: "var(--color-lamp-vhard)",  bgClass: "bg-lamp-vhard",  textClass: "text-lamp-vhard" },
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
  players: propPlayers,
  loadingPlayers: propLoadingPlayers,
  loadError: propLoadError,
  chartMaxTheta: propChartMaxTheta,
}: Props) {
  const { t } = useLang();
  const { mode, format } = useScale();
  const [query, setQuery] = useState("");
  const [submittedID, setSubmittedID] = useState("");
  const [isCustomProfile, setIsCustomProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [internalPlayers, setInternalPlayers] = useState<PlayersDict | null>(null);
  const [searchResults, setSearchResults] = useState<
    { id: string; name: string; clears: number; isCustom?: boolean }[] | null
  >(null);

  const [internalLoadingPlayers, setInternalLoadingPlayers] = useState(false);
  const [internalLoadError, setInternalLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [targetStatus, setTargetStatus] = useState<"HARD" | "V-HARD">("HARD");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const players = propPlayers !== undefined ? propPlayers : internalPlayers;
  const loadingPlayers = propLoadingPlayers !== undefined ? propLoadingPlayers : internalLoadingPlayers;
  const loadError = propLoadError !== undefined ? propLoadError : internalLoadError;

  const internalChartMaxTheta = useMemo(() => {
    if (propChartMaxTheta !== undefined && propChartMaxTheta !== null) return propChartMaxTheta;
    if (!players) return null;
    const max = new Map<number, number>();
    for (const player of Object.values(players)) {
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
  }, [players, propChartMaxTheta]);

  const chartMaxTheta = propChartMaxTheta !== undefined && propChartMaxTheta !== null ? propChartMaxTheta : internalChartMaxTheta;

  const fetchPlayers = useRef<( () => Promise<PlayersDict | null> ) | null>(null);

  useEffect(() => {
    fetchPlayers.current = async () => {
      if (players) return players;
      setInternalLoadingPlayers(true);
      setInternalLoadError(null);
      try {
        const data = await fetchPlayersData();
        setInternalPlayers(data);
        return data;
      } catch (e) {
        setInternalLoadError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setInternalLoadingPlayers(false);
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
  }, [activePlayerExternal]);

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
    const q = query.trim();
    if (!q) return;
    const ql = q.toLowerCase();

    // 1. Exact match in custom/offline profiles
    const customEntries = Object.entries(customProfiles ?? {});
    const exactCustom = customEntries.find(([id, p]) => id.toLowerCase() === ql || (p.n && p.n.toLowerCase() === ql));
    if (exactCustom) {
      setSubmittedID(exactCustom[0]);
      setIsCustomProfile(true);
      setNotFound(false);
      setSearchResults(null);
      return;
    }

    const data = players ?? (await fetchPlayers.current?.());
    if (!data && customEntries.length === 0) {
      setSubmittedID("");
      setNotFound(false);
      setSearchResults(null);
      return;
    }

    // 2. Exact match in online player avatar IDs
    if (data) {
      const exact = Object.keys(data).find((k) => k.toLowerCase() === ql);
      if (exact) {
        setSubmittedID(exact);
        setIsCustomProfile(false);
        setNotFound(false);
        setSearchResults(null);
        return;
      }
    }

    // 3. Fuzzy match across both custom profiles and online players
    const matches: { id: string; name: string; clears: number; isCustom?: boolean }[] = [];

    for (const [cid, cp] of customEntries) {
      const dname = (cp.n ?? cid).toLowerCase();
      if (dname.includes(ql) || cid.toLowerCase().includes(ql)) {
        matches.push({
          id: cid,
          name: `${cp.n ?? cid} [${t.lang === "en" ? "Local" : "로컬"}]`,
          clears: Object.keys(cp.c ?? {}).length,
          isCustom: true,
        });
      }
    }

    if (data) {
      for (const [pid, p] of Object.entries(data)) {
        const dname = (p.n ?? pid).toLowerCase();
        if (dname.includes(ql) || pid.toLowerCase().includes(ql)) {
          matches.push({
            id: pid,
            name: p.n ?? pid,
            clears: Object.keys(p.c ?? {}).length,
            isCustom: false,
          });
        }
      }
    }

    if (matches.length === 0) {
      setSubmittedID("");
      setNotFound(true);
      setSearchResults(null);
    } else if (matches.length === 1) {
      setSubmittedID(matches[0].id);
      setIsCustomProfile(!!matches[0].isCustom);
      setNotFound(false);
      setSearchResults(null);
    } else {
      // Multiple matches — show disambiguation list, sorted by activity
      matches.sort((a, b) => b.clears - a.clears);
      setSearchResults(matches);
      setSubmittedID("");
      setNotFound(false);
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
      if (status >= (targetStatus === "HARD" ? 2 : 3)) continue;

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
      const aVal = targetStatus === "HARD"
        ? ((a.chart.n_hard + a.chart.n_vhard === 0) ? (chartMaxTheta?.get(a.chart.id) ?? a.chart.b_hard_display ?? -99) : a.chart.b_hard_display)
        : (a.chart.n_vhard === 0 ? (chartMaxTheta?.get(a.chart.id) ?? a.chart.b_vhard_display ?? -99) : a.chart.b_vhard_display);
      const bVal = targetStatus === "HARD"
        ? ((b.chart.n_hard + b.chart.n_vhard === 0) ? (chartMaxTheta?.get(b.chart.id) ?? b.chart.b_hard_display ?? -99) : b.chart.b_hard_display)
        : (b.chart.n_vhard === 0 ? (chartMaxTheta?.get(b.chart.id) ?? b.chart.b_vhard_display ?? -99) : b.chart.b_vhard_display);
      return (bVal ?? -99) - (aVal ?? -99);
    });
    const recommendationsLimited = recommendations.slice(0, REC_LIMIT);

    allProbabilities.sort((a, b) => b.p - a.p);
    const allProbabilitiesLimited = allProbabilities.slice(0, PROB_LIMIT);

    const clearedByLevel = new Map<string, number>();
    for (const [idStr, status] of Object.entries(currentPlayer.c || {})) {
      if (status < 2) continue;
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
      {/* Player Identity & Search Console */}
      <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4 pb-3 border-b border-border/40">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-400" />
              {t.playerProfile}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {t.playerProfileDesc}
            </p>
          </div>
          {currentPlayer && (
            <div className="flex items-center gap-2">
              {isCustomProfile ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  OFFLINE LOCAL
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  ONLINE IR
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t.playerIdPlaceholder}
                aria-label={t.playerIdPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9 font-mono text-xs bg-background/50 border-border/80"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button
              onClick={() => handleSearch()}
              disabled={loadingPlayers || !query.trim()}
              size="sm"
              className="text-xs font-mono"
            >
              {loadingPlayers ? "…" : t.search}
            </Button>
          </div>

          {notFound && (
            <div className="mt-3 p-3 rounded-md border border-border/70 bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs text-rose-400 font-mono font-medium">{t.playerNotFound}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-sans">
                  {t.lang === "en"
                    ? "Initialize a local offline profile to record manual clears and calculate your rating."
                    : "로컬 프로필을 생성하여 수동 클리어 기록 및 실력 수치를 산출할 수 있습니다."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs font-mono shrink-0"
                onClick={() => {
                  setNewProfileName(query.trim());
                  setIsCreating(true);
                }}
              >
                <Save className="w-3 h-3 mr-1" />
                {t.newProfile}
              </Button>
            </div>
          )}
          {loadError && (
            <p className="text-xs text-rose-400 mt-2 font-mono">
              {t.loadFailed}: {loadError}
            </p>
          )}

          {searchResults && searchResults.length > 1 && (
            <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-border/80 bg-background/95">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSubmittedID(r.id);
                    setIsCustomProfile(!!r.isCustom);
                    setSearchResults(null);
                    setQuery(r.id);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/40 flex items-center justify-between border-b border-border/30 last:border-0 transition-colors"
                >
                  <span className="font-medium font-jp text-sm">{r.name}</span>
                  <span className="text-xs text-muted-foreground font-mono ml-2">
                    {r.id} · {r.clears} clears
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Active Player Status Banner */}
          {currentPlayer && analytics && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-semibold text-sm">
                    {currentPlayer.n ?? activePlayerExternal?.id ?? submittedID}
                  </span>
                  {currentPlayer.n && (
                    <span className="text-muted-foreground text-xs font-mono">
                      ({activePlayerExternal?.id ?? submittedID})
                    </span>
                  )}
                  {percentile != null && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                      Top {((1 - percentile) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground">
                  <span className="text-foreground font-semibold">{analytics.totalClears}</span> / {charts.length} clears ({((analytics.totalClears / charts.length) * 100).toFixed(1)}%)
                </div>
              </div>

              {/* Proportional clear status gauge bar */}
              <div className="w-full h-2 rounded-sm overflow-hidden flex bg-muted/60 border border-border/40 mt-2">
                <div
                  style={{ width: `${(analytics.statusCounts[3] / charts.length) * 100}%` }}
                  title={`V-HARD: ${analytics.statusCounts[3]}`}
                  className="h-full bg-lamp-vhard"
                />
                <div
                  style={{ width: `${(analytics.statusCounts[2] / charts.length) * 100}%` }}
                  title={`HARD: ${analytics.statusCounts[2]}`}
                  className="h-full bg-lamp-hard"
                />
                <div
                  style={{ width: `${(analytics.statusCounts[1] / charts.length) * 100}%` }}
                  title={`NORMAL: ${analytics.statusCounts[1]}`}
                  className="h-full bg-lamp-normal"
                />
                <div
                  style={{ width: `${(analytics.statusCounts[0] / charts.length) * 100}%` }}
                  title={`FAILED: ${analytics.statusCounts[0]}`}
                  className="h-full bg-lamp-failed"
                />
              </div>
            </div>
          )}

          {/* Profile Management Sub-Bar */}
          <div className="flex gap-4 mt-4 border-t border-border/40 pt-4 flex-col sm:flex-row items-center justify-between text-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-muted-foreground font-mono shrink-0">{t.offlineProfiles}:</span>
              <Select
                value={isCustomProfile ? submittedID : ""}
                onValueChange={(v) => {
                  if (v) {
                    setIsCustomProfile(true);
                    setSubmittedID(v);
                  }
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs font-mono">
                  <SelectValue placeholder={t.selectOfflineProfile} />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(customProfiles).map((id) => (
                    <SelectItem key={id} value={id} className="font-mono text-xs">{id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto justify-end">
              {isCreating ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    placeholder={t.profileName}
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    className="h-8 text-xs font-mono w-36"
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
                  <Button size="sm" className="h-8 text-xs font-mono" onClick={() => {
                    if (newProfileName.trim() && onSaveCustomProfile) {
                      const name = newProfileName.trim();
                      onSaveCustomProfile(name, currentPlayer ? { ...currentPlayer, c: { ...currentPlayer.c } } : { t: 0, c: {} });
                      setIsCustomProfile(true);
                      setSubmittedID(name);
                      setIsCreating(false);
                      setNewProfileName("");
                    }
                  }}>
                    {t.save}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs font-mono" onClick={() => setIsCreating(false)}>
                    {t.cancel}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1.5 flex-wrap">
                  <Button
                    size="sm" variant="outline" className="h-8 text-xs font-mono"
                    onClick={() => {
                      setIsCreating(true);
                    }}
                  >
                    <Save className="w-3 h-3 mr-1" /> {currentPlayer ? t.cloneProfile : t.newProfile}
                  </Button>

                  {isCustomProfile && currentPlayer && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-mono text-rose-400 border-rose-400/30 hover:bg-rose-400/10"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> {t.deleteProfile}
                      </Button>

                      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-semibold text-foreground">
                              {t.lang === "en" ? `Delete profile "${submittedID}"?` : `"${submittedID}" 프로필을 삭제하시겠습니까?`}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground text-xs">
                              {t.lang === "en"
                                ? "This action permanently removes this local offline profile and all its recorded clears. This cannot be undone."
                                : "이 로컬 오프라인 프로필과 기록된 모든 클리어 데이터가 영구적으로 삭제됩니다. 실행 후 되돌릴 수 없습니다."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel autoFocus className="text-xs font-mono">
                              {t.cancel}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="text-xs font-mono bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => {
                                if (onDeleteCustomProfile) {
                                  onDeleteCustomProfile(submittedID);
                                  setIsCustomProfile(false);
                                  setSubmittedID("");
                                }
                                setDeleteDialogOpen(false);
                              }}
                            >
                              {t.deleteProfile}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs font-mono"
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
                        <Download className="w-3 h-3 mr-1" /> {t.exportProfile}
                      </Button>
                    </>
                  )}

                  <Button
                    size="sm" variant="outline" className="h-8 text-xs font-mono relative overflow-hidden"
                  >
                    <Upload className="w-3 h-3 mr-1" /> {t.importProfile}
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
        </div>
      </div>

      {currentPlayer && analytics && (
        <>
          {/* Twin Telemetry Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* Left: Skill Distribution Engine */}
            <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h4 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  {t.estimatedSkill}
                </h4>
                {percentile != null && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    {t.lang === "en"
                      ? `Top ${(100 - percentile * 100).toFixed(1)}%`
                      : `상위 ${(100 - percentile * 100).toFixed(1)}%`}
                  </span>
                )}
              </div>

              <div>
                <div className="font-mono text-3xl font-black text-cyan-400 tracking-tight">
                  {format(currentPlayer.t, mode === "lerp" ? 2 : 3)}
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    {mode === "lerp" ? "Level" : "θ ability"}
                  </span>
                </div>
              </div>

              {samplePlayers && (
                <div>
                  <PlayerSkillHistogram
                    data={samplePlayers}
                    playerTheta={currentPlayer.t}
                  />
                  <div className="text-[10px] font-mono text-muted-foreground text-center mt-1">
                    {t.histogramXAxis(mode === 'lerp')}
                  </div>
                </div>
              )}

              {/* Status pills */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {([3, 2, 1, 0] as const).map((s) => {
                  const meta = STATUS_LABELS[s];
                  const n = analytics.statusCounts[s];
                  return (
                    <div
                      key={s}
                      className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-mono"
                      title={`Status ${s}: ${meta.short}`}
                    >
                      <span
                        className={cn("inline-block w-2 h-2 rounded-full", meta.bgClass)}
                      />
                      <span className={cn("font-bold", meta.textClass)}>{meta.short}</span>
                      <span className="text-foreground tabular-nums">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Folder Clears Matrix */}
            <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h4 className="text-sm font-semibold tracking-tight text-foreground">
                  {t.lang === "en" ? "HARD+ Clears by Level Folder" : "레벨 폴더별 HARD+ 클리어"}
                </h4>
                <span className="text-xs font-mono text-muted-foreground">
                  {analytics.clearedLevels.length} active
                </span>
              </div>

              {analytics.clearedLevels.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center font-mono">
                  {t.lang === "en"
                    ? "No HARD+ clears logged yet."
                    : "HARD 이상 클리어 기록이 없습니다."}
                </p>
              ) : (
                <ScrollArea className="max-h-[240px] pr-2">
                  <div className="flex flex-wrap gap-1.5">
                    {analytics.clearedLevels.map(([lvl, n]) => (
                      <div
                        key={lvl}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border/60 bg-muted/20 font-mono text-xs"
                      >
                        <span className={isSpecialLevel(lvl) ? "text-amber-400 font-bold" : "text-muted-foreground"}>
                          {lvl}
                        </span>
                        <span className="text-border">|</span>
                        <span className="text-foreground font-semibold">{n}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/40 font-mono">
                {t.lang === "en"
                  ? `Population: μ=${format(playerThetaMean)}, σ=${playerThetaStd.toFixed(3)} (n=${samplePlayers?.n_players ?? 0}).`
                  : `모집단: μ=${format(playerThetaMean)}, σ=${playerThetaStd.toFixed(3)} (n=${samplePlayers?.n_players ?? 0}).`}
              </p>
            </div>
          </div>
          {/* Training Horizon: Recommended Charts */}
          <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-border/40">
              <div>
                <h4 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  {t.recommendedCharts}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {t.lang === "en"
                    ? `Charts where P(${targetStatus}) ∈ [${fmtPct(REC_MIN_PROB)}, ${fmtPct(REC_MAX_PROB)}] — prime target horizon. Top ${REC_LIMIT} shown.`
                    : `P(${targetStatus}) ∈ [${fmtPct(REC_MIN_PROB)}, ${fmtPct(REC_MAX_PROB)}] 적정 성장 구간 채보. 상위 ${REC_LIMIT}개.`}
                </p>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-muted-foreground">Target:</span>
                <div className="inline-flex items-center p-0.5 rounded-md bg-muted/40 border border-border/80">
                  <button
                    onClick={() => setTargetStatus("HARD")}
                    className={`px-2.5 py-1 rounded transition-all font-medium ${
                      targetStatus === "HARD"
                        ? "bg-card text-foreground border border-border/80"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    HARD
                  </button>
                  <button
                    onClick={() => setTargetStatus("V-HARD")}
                    className={`px-2.5 py-1 rounded transition-all font-medium ${
                      targetStatus === "V-HARD"
                        ? "bg-card text-foreground border border-border/80"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    V-HARD
                  </button>
                </div>
              </div>
            </div>

            {analytics.recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center font-mono">
                {t.noRecommendations}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    chartMaxTheta={chartMaxTheta}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Probability Horizon Table Panel */}
          <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-4">
            <div className="pb-3 border-b border-border/40">
              <h4 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                <Target className={`w-4 h-4 ${targetStatus === "HARD" ? "text-rose-400" : "text-purple-400"}`} />
                {t.yourProbabilities}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                {t.lang === "en"
                  ? `All uncompleted charts with P(${targetStatus}) ≥ ${fmtPct(PROB_MIN_THRESHOLD)}, sorted by descending probability. Top ${PROB_LIMIT} shown.`
                  : `P(${targetStatus}) ≥ ${fmtPct(PROB_MIN_THRESHOLD)}인 미클리어 채보, 확률 내림차순. 상위 ${PROB_LIMIT}개.`}
              </p>
            </div>

            <div className="rounded-md border border-border/80 overflow-hidden font-mono text-xs">
              <ScrollArea className="max-h-[480px]">
                <Table className="w-full">
                  <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                    <TableRow className="border-b border-border text-left">
                      <TableHead className="px-3 py-2.5 font-semibold text-muted-foreground text-xs uppercase">{t.chart}</TableHead>
                      <TableHead className="px-3 py-2.5 font-semibold text-muted-foreground text-xs text-center w-[70px] uppercase">{t.level}</TableHead>
                      <TableHead className="px-3 py-2.5 font-semibold text-muted-foreground text-xs text-right w-[90px] uppercase">P({targetStatus})</TableHead>
                      <TableHead className="px-3 py-2.5 font-semibold text-muted-foreground text-xs text-right w-[90px] uppercase">b_{targetStatus === "HARD" ? "hard" : "vhard"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/30">
                    {analytics.allProbabilities.map(({ chart, p }) => (
                      <TableRow
                        key={chart.md5}
                        onClick={() => onSelectChart(chart)}
                        className="hover:bg-muted/40 cursor-pointer transition-colors"
                      >
                        <TableCell className="font-medium font-jp py-2.5">
                          <div className="flex flex-col">
                            <span className="text-sm leading-snug line-clamp-1 text-foreground">{chart.title}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {chart.artist || "unknown"}
                              {chart.name_diff && ` · ${chart.name_diff}`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs py-2.5">
                          <span className={isSpecialLevel(chart.level) ? "text-amber-400 font-bold" : "text-muted-foreground"}>
                            {chart.level}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs py-2.5">
                          <ProbabilityBadge p={p} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs py-2.5">
                          <span className={cn(
                            "tabular-nums",
                            targetStatus === "HARD"
                              ? (chart.n_hard + chart.n_vhard === 0 ? "text-amber-500/80" : "text-lamp-hard font-medium")
                              : (chart.n_vhard === 0 ? "text-purple-400/80" : "text-lamp-vhard font-medium")
                          )}>
                            {targetStatus === "HARD"
                              ? (chart.n_hard + chart.n_vhard === 0 ? `>${format(chartMaxTheta?.get(chart.id) ?? chart.b_hard_display)}?` : format(chart.b_hard_display))
                              : (chart.n_vhard === 0 ? `>${format(chartMaxTheta?.get(chart.id) ?? chart.b_vhard_display)}?` : format(chart.b_vhard_display))
                            }
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </div>
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
  targetStatus,
  chartMaxTheta
}: {
  chart: Chart;
  p: number;
  onClick: () => void;
  formatFn: (val: number | null | undefined) => string;
  t: any;
  mode: string;
  targetStatus: "HARD" | "V-HARD";
  chartMaxTheta?: Map<number, number> | null;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg border border-border/70 hover:border-border bg-muted/20 hover:bg-muted/40 transition-all p-3 flex flex-col gap-2 group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium font-jp line-clamp-2 leading-snug group-hover:text-foreground">
          {chart.title}
        </span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-background border border-border/60 shrink-0">
          {levelLabel(chart.level)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground font-jp text-[11px] line-clamp-1">
          {chart.artist || "unknown"}
          {chart.name_diff && ` · ${chart.name_diff}`}
        </span>
        <span
          className={cn(
            "font-mono font-bold text-xs tabular-nums",
            targetStatus === "HARD" ? "text-lamp-hard" : "text-lamp-vhard"
          )}
        >
          {fmtPct(p)}
        </span>
      </div>
      <div className="h-1.5 rounded-sm bg-muted/80 overflow-hidden border border-border/40">
        <div
          className={cn(
            "h-full rounded-sm",
            targetStatus === "HARD" ? "bg-lamp-hard" : "bg-lamp-vhard"
          )}
          style={{
            width: `${Math.min(100, p * 100)}%`,
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>
          b_{targetStatus === "HARD" ? "hard" : "vhard"}: <span className={cn(
            "font-semibold tabular-nums",
            targetStatus === "HARD"
              ? (chart.n_hard + chart.n_vhard === 0 ? "text-amber-500/80" : "text-lamp-hard")
              : (chart.n_vhard === 0 ? "text-purple-400/80" : "text-lamp-vhard")
          )}>
            {targetStatus === "HARD"
              ? (chart.n_hard + chart.n_vhard === 0 ? `>${formatFn(chartMaxTheta?.get(chart.id) ?? chart.b_hard_display)}?` : formatFn(chart.b_hard_display))
              : (chart.n_vhard === 0 ? `>${formatFn(chartMaxTheta?.get(chart.id) ?? chart.b_vhard_display)}?` : formatFn(chart.b_vhard_display))
            }
          </span>
        </span>
        <span>a: {chart.a != null ? chart.a.toFixed(2) : "–"}</span>
      </div>
    </button>
  );
}

function ProbabilityBadge({ p }: { p: number }) {
  const colorClass =
    p >= 0.80
      ? "text-emerald-400"
      : p >= 0.50
      ? "text-cyan-400"
      : p >= 0.20
      ? "text-lamp-normal"
      : "text-muted-foreground";
  return (
    <span className={cn("font-mono font-semibold tabular-nums", colorClass)}>
      {fmtPct(p)}
    </span>
  );
}
