"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  User,
  Target,
  Sparkles,
  TrendingUp,
  Save,
  Trash2,
  Download,
  Upload,
  Check,
  X,
  SlidersHorizontal,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RotateCcw,
  RotateCw,
  Database,
} from "lucide-react";
import { LampBadge } from "./LampBadge";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import { cn } from "@/lib/utils";
import {
  type Chart,
  type PlayerData,
  type PlayersDict,
  type SamplePlayers,
  type LeaderboardResult,
  pStar,
  levelSortKey,
  levelLabel,
  isSpecialLevel,
  computeTopPercentile,
  formatTopPercentile,
  estimateTheta,
  getNextLampStatus,
  getPrevLampStatus,
} from "@/lib/questimator-types";
import { PlayerSkillHistogram } from "@/components/questimator/PlayerSkillHistogram";
import { fetchPlayersData } from "@/lib/players-cache";
import { QwilightDbImportDialog } from "@/components/questimator/QwilightDbImportDialog";

interface Props {
  charts: Chart[];
  samplePlayers: SamplePlayers | null;
  leaderboard?: LeaderboardResult | null;
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

export const LAMP_LABEL: Record<number, { text: string; bgClass: string; textClass: string; borderClass: string }> = {
  2: { text: "H", bgClass: "bg-lamp-hard/15", textClass: "text-lamp-hard", borderClass: "border-lamp-hard/40" },
  1: { text: "N", bgClass: "bg-lamp-normal/15", textClass: "text-lamp-normal", borderClass: "border-lamp-normal/40" },
  0: { text: "F", bgClass: "bg-lamp-failed/15", textClass: "text-muted-foreground", borderClass: "border-lamp-failed/40" },
};

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

function matchesLevel(
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

export function PlayerTab({
  charts,
  samplePlayers,
  leaderboard,
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
  const [minProb, setMinProb] = useState(30);
  const [maxProb, setMaxProb] = useState(80);
  const [minLevel, setMinLevel] = useState(1);
  const [maxLevel, setMaxLevel] = useState(31);
  const [showMinus, setShowMinus] = useState(false);
  const [showExclamation, setShowExclamation] = useState(false);
  const [showDiamond, setShowDiamond] = useState(false);
  const [horizonSearch, setHorizonSearch] = useState("");
  const [horizonSortKey, setHorizonSortKey] = useState<"p" | "b" | "a" | "level" | "title" | "lamp">("p");
  const [horizonSortDir, setHorizonSortDir] = useState<"asc" | "desc">("desc");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exported, setExported] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [qwilightDbDialogOpen, setQwilightDbDialogOpen] = useState(false);

  const handleQwilightDbImport = (
    name: string,
    newClears: Record<string, number>,
    isMerge?: boolean
  ) => {
    let finalClears = newClears;
    let targetName = name;

    if (isMerge && isCustomProfile && customProfiles[submittedID]) {
      targetName = submittedID;
      const existingClears = customProfiles[submittedID].c || {};
      // Merge: for overlapping charts, keep the better lamp (higher status number)
      finalClears = { ...existingClears };
      for (const [chartId, lamp] of Object.entries(newClears)) {
        const existingLamp = finalClears[chartId];
        if (existingLamp === undefined || lamp > existingLamp) {
          finalClears[chartId] = lamp;
        }
      }
    }

    const calculatedTheta = estimateTheta(charts, finalClears);
    const profileData: PlayerData = {
      t: calculatedTheta,
      c: finalClears,
      n: targetName,
    };

    if (onSaveCustomProfile) {
      onSaveCustomProfile(targetName, profileData);
    }
    setIsCustomProfile(true);
    setSubmittedID(targetName);
    setInternalLoadError(null);
    setImportSuccess(targetName);
    setTimeout(() => setImportSuccess(null), 3000);
  };

  const applyPreset = (min: number, max: number) => {
    setMinProb(min);
    setMaxProb(max);
  };

  const resetHorizonFilters = () => {
    setMinProb(30);
    setMaxProb(80);
    setMinLevel(1);
    setMaxLevel(31);
    setShowMinus(false);
    setShowExclamation(false);
    setShowDiamond(false);
    setHorizonSearch("");
    setHorizonSortKey("p");
    setHorizonSortDir("desc");
  };

  const handleHorizonSort = (key: "p" | "b" | "a" | "level" | "title" | "lamp") => {
    if (horizonSortKey === key) {
      setHorizonSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setHorizonSortKey(key);
      setHorizonSortDir(key === "title" || key === "level" ? "asc" : "desc");
    }
  };

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
    if (isCustomProfile) {
      const p = customProfiles?.[submittedID];
      if (!p) return null;
      const dynamicTheta = charts.length > 0 ? estimateTheta(charts, p.c || {}) : (p.t ?? 0);
      return { ...p, t: dynamicTheta };
    }
    if (activePlayerExternal && activePlayerExternal.id === submittedID) return activePlayerExternal.data;
    if (!players || !submittedID) return null;
    return players[submittedID] ?? null;
  }, [players, submittedID, activePlayerExternal, customProfiles, isCustomProfile, charts]);

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
    type Candidate = {
      chart: Chart;
      p: number;
      lamp: number | null;
    };

    const targetThreshold = targetStatus === "HARD" ? 2 : 3;
    const allCandidates: Candidate[] = [];

    for (const c of charts) {
      if (c.provisional) continue;
      const p = targetStatus === "HARD" ? pHard(theta, c) : pVHard(theta, c);
      if (p == null) continue;
      const rawStatus = currentPlayer.c?.[String(c.id)];
      if (rawStatus !== undefined && rawStatus >= targetThreshold) continue;

      allCandidates.push({
        chart: c,
        p,
        lamp: rawStatus !== undefined ? rawStatus : null,
      });
    }

    const totalUncompleted = allCandidates.length;

    // Filter by probability bounds [minProb/100, maxProb/100] AND level span / special checkboxes
    const pLo = Math.min(minProb, maxProb) / 100;
    const pHi = Math.max(minProb, maxProb) / 100;

    const inRangeCandidates = allCandidates.filter((c) => {
      if (c.p < pLo || c.p > pHi) return false;
      return matchesLevel(
        c.chart.level,
        minLevel,
        maxLevel,
        showMinus,
        showExclamation,
        showDiamond
      );
    });

    // Search filtering for the explorer table
    const searchClean = horizonSearch.trim().toLowerCase();
    const filteredCandidates = inRangeCandidates.filter((c) => {
      if (!searchClean) return true;
      return (
        c.chart.title.toLowerCase().includes(searchClean) ||
        c.chart.artist.toLowerCase().includes(searchClean) ||
        c.chart.name_diff.toLowerCase().includes(searchClean)
      );
    });

    // Sort table rows
    filteredCandidates.sort((a, b) => {
      let cmp = 0;
      switch (horizonSortKey) {
        case "p":
          cmp = a.p - b.p;
          break;
        case "lamp":
          cmp = (a.lamp ?? -1) - (b.lamp ?? -1);
          break;
        case "title":
          cmp = a.chart.title.localeCompare(b.chart.title);
          break;
        case "level": {
          const [ax, ay] = levelSortKey(a.chart.level);
          const [bx, by] = levelSortKey(b.chart.level);
          cmp = ax - bx || ay - by;
          break;
        }
        case "a":
          cmp = (a.chart.a ?? 0) - (b.chart.a ?? 0);
          break;
        case "b": {
          const aVal = targetStatus === "HARD"
            ? ((a.chart.n_hard + a.chart.n_vhard === 0) ? (chartMaxTheta?.get(a.chart.id) ?? a.chart.b_hard_display ?? -99) : a.chart.b_hard_display)
            : (a.chart.n_vhard === 0 ? (chartMaxTheta?.get(a.chart.id) ?? a.chart.b_vhard_display ?? -99) : a.chart.b_vhard_display);
          const bVal = targetStatus === "HARD"
            ? ((b.chart.n_hard + b.chart.n_vhard === 0) ? (chartMaxTheta?.get(b.chart.id) ?? b.chart.b_hard_display ?? -99) : b.chart.b_hard_display)
            : (b.chart.n_vhard === 0 ? (chartMaxTheta?.get(b.chart.id) ?? b.chart.b_vhard_display ?? -99) : b.chart.b_vhard_display);
          cmp = (aVal ?? -99) - (bVal ?? -99);
          break;
        }
      }
      return horizonSortDir === "asc" ? cmp : -cmp;
    });

    // Curated recommendations (picks):
    // Prioritize high discrimination 'a' and midpoint closeness
    const pMid = (pLo + pHi) / 2;
    const recommendations = [...inRangeCandidates]
      .sort((a, b) => {
        const distA = Math.abs(a.p - pMid);
        const distB = Math.abs(b.p - pMid);
        if (Math.abs(distA - distB) > 0.08) return distA - distB;
        return (b.chart.a ?? 1) - (a.chart.a ?? 1);
      })
      .slice(0, 3);

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
      totalUncompleted,
      inRangeCount: inRangeCandidates.length,
      filteredCandidates,
      recommendations,
      clearedLevels,
      targetStatus,
    };
  }, [
    currentPlayer,
    charts,
    targetStatus,
    minProb,
    maxProb,
    minLevel,
    maxLevel,
    showMinus,
    showExclamation,
    showDiamond,
    horizonSearch,
    horizonSortKey,
    horizonSortDir,
    chartMaxTheta,
  ]);

  const rank = useMemo(() => {
    if (isCustomProfile || !submittedID || !leaderboard) return null;
    return leaderboard.rankMap.get(submittedID) ?? null;
  }, [isCustomProfile, submittedID, leaderboard]);

  const topPercentile = useMemo(() => {
    if (!currentPlayer) return null;
    return computeTopPercentile(currentPlayer.t, leaderboard?.sortedThetas, samplePlayers);
  }, [currentPlayer, leaderboard?.sortedThetas, samplePlayers]);

  const handleClearStatusChange = (chartId: number, status: number) => {
    if (!isCustomProfile || !currentPlayer || !onSaveCustomProfile) return;
    const newClears = { ...(currentPlayer.c || {}) };
    if (status < 0) {
      delete newClears[String(chartId)];
    } else {
      newClears[String(chartId)] = status;
    }
    const dynamicTheta = estimateTheta(charts, newClears);
    const updatedProfile: PlayerData = {
      ...currentPlayer,
      c: newClears,
      t: dynamicTheta,
    };
    onSaveCustomProfile(submittedID, updatedProfile);
  };

  const horizonScrollRef = useRef<HTMLDivElement>(null);
  const horizonCandidates = analytics?.filteredCandidates ?? [];

  const horizonVirtualizer = useVirtualizer({
    count: horizonCandidates.length,
    getScrollElement: () => horizonScrollRef.current,
    estimateSize: () => 48,
    overscan: 10,
    getItemKey: (index) => horizonCandidates[index]?.chart.md5 ?? index,
  });

  const horizonVirtualItems = horizonVirtualizer.getVirtualItems();
  const horizonPaddingTop = horizonVirtualItems.length > 0 ? horizonVirtualItems[0].start : 0;
  const horizonPaddingBottom =
    horizonVirtualItems.length > 0
      ? horizonVirtualizer.getTotalSize() - horizonVirtualItems[horizonVirtualItems.length - 1].end
      : 0;

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
            <p className="text-xs text-muted-foreground mt-0.5 font-sans">
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
                className="pl-9 pr-8 font-mono text-xs bg-background/50 border-border/80"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setNotFound(false);
                  }}
                  aria-label="Clear player ID search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry-cyan cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button
              onClick={() => handleSearch()}
              disabled={loadingPlayers || !query.trim()}
              size="sm"
              className="text-xs font-sans"
            >
              {loadingPlayers ? "…" : t.search}
            </Button>
          </div>

          {notFound && (
            <div className="mt-3 p-3 rounded-md border border-border/70 bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs text-rose-400 font-sans font-medium">{t.playerNotFound}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-sans">
                  {t.lang === "en"
                    ? "Initialize a local offline profile to record manual clears and calculate your rating."
                    : "로컬 프로필을 생성하여 수동 클리어 기록 및 실력 수치를 산출할 수 있습니다."}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs font-sans border-telemetry-cyan/40 bg-telemetry-cyan/10 text-telemetry-cyan hover:bg-telemetry-cyan/20 gap-1.5"
                  onClick={() => setQwilightDbDialogOpen(true)}
                >
                  <Database className="w-3.5 h-3.5" />
                  {t.importQwilightDb}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs font-sans shrink-0"
                  onClick={() => {
                    setNewProfileName(query.trim());
                    setIsCreating(true);
                  }}
                >
                  <Save className="w-3 h-3 mr-1" />
                  {t.newProfile}
                </Button>
              </div>
            </div>
          )}
          {loadError && (
            <p className="text-xs text-rose-400 mt-2 font-sans">
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
                  {rank != null && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      #{rank}
                    </span>
                  )}
                  {topPercentile != null && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                      Top {formatTopPercentile(topPercentile)}
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
              <span className="text-muted-foreground font-sans shrink-0">{t.offlineProfiles}:</span>
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
                        const clears = currentPlayer?.c ? { ...currentPlayer.c } : {};
                        const tVal = charts.length > 0 ? estimateTheta(charts, clears) : 0;
                        onSaveCustomProfile(name, { t: tVal, c: clears, n: name });
                        setIsCustomProfile(true);
                        setSubmittedID(name);
                        setIsCreating(false);
                        setNewProfileName("");
                      } else if (e.key === "Escape") {
                        setIsCreating(false);
                      }
                    }}
                  />
                  <Button size="sm" className="h-8 text-xs font-sans" onClick={() => {
                    if (newProfileName.trim() && onSaveCustomProfile) {
                      const name = newProfileName.trim();
                      const clears = currentPlayer?.c ? { ...currentPlayer.c } : {};
                      const tVal = charts.length > 0 ? estimateTheta(charts, clears) : 0;
                      onSaveCustomProfile(name, { t: tVal, c: clears, n: name });
                      setIsCustomProfile(true);
                      setSubmittedID(name);
                      setIsCreating(false);
                      setNewProfileName("");
                    }
                  }}>
                    {t.save}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs font-sans" onClick={() => setIsCreating(false)}>
                    {t.cancel}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1.5 flex-wrap">
                  <Button
                    size="sm" variant="outline" className="h-8 text-xs font-sans"
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
                        className="h-8 text-xs font-sans text-rose-400 border-rose-400/30 hover:bg-rose-400/10"
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
                            <AlertDialogCancel autoFocus className="text-xs font-sans">
                              {t.cancel}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="text-xs font-sans bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                        size="sm" variant="outline" className="h-8 text-xs font-sans"
                        onClick={() => {
                          if (!currentPlayer) return;
                          // Do not store obsolete player ability levels (t).
                          // Ability is dynamically calculated from the chart IRT calibration.
                          const exportData: { c: Record<string, number>; n?: string } = {
                            c: currentPlayer.c ?? {},
                            ...(currentPlayer.n ? { n: currentPlayer.n } : {}),
                          };
                          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `profile-${submittedID}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                          setExported(true);
                          setTimeout(() => setExported(false), 2000);
                        }}
                      >
                        {exported ? (
                          <>
                            <Check className="w-3 h-3 mr-1 text-emerald-400" />
                            <span className="text-emerald-400 font-medium">{t.lang === "en" ? "Exported!" : "내보냄!"}</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3 mr-1" /> {t.exportProfile}
                          </>
                        )}
                      </Button>
                    </>
                  )}

                  <Button
                    size="sm" variant="outline" className="h-8 text-xs font-sans relative overflow-hidden"
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
                            if (data && typeof data.c === 'object' && data.c !== null && !Array.isArray(data.c)) {
                              const name = file.name.replace('.json', '');
                              const calculatedTheta = estimateTheta(charts, data.c);
                              const profileData: PlayerData = {
                                t: calculatedTheta,
                                c: data.c,
                                ...(typeof data.n === 'string' ? { n: data.n } : {}),
                              };
                              if (onSaveCustomProfile) onSaveCustomProfile(name, profileData);
                              setIsCustomProfile(true);
                              setSubmittedID(name);
                              setInternalLoadError(null);
                              setImportSuccess(name);
                              setTimeout(() => setImportSuccess(null), 3000);
                            } else {
                              setInternalLoadError(t.lang === "en" ? "Invalid profile JSON format: expected 'c' (clears) map" : "잘못된 프로필 JSON 형식입니다: 'c' (클리어) 맵이 필요합니다");
                            }
                          } catch (err) {
                            setInternalLoadError(t.lang === "en" ? "Failed to parse JSON file" : "JSON 파일을 구문 분석하지 못했습니다");
                          }
                        };
                        reader.readAsText(file);
                        e.target.value = "";
                      }}
                    />
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-sans border-telemetry-cyan/40 bg-telemetry-cyan/10 text-telemetry-cyan hover:bg-telemetry-cyan/20 hover:text-telemetry-cyan hover:border-telemetry-cyan/70 gap-1.5"
                    onClick={() => setQwilightDbDialogOpen(true)}
                  >
                    <Database className="w-3 h-3 text-telemetry-cyan shrink-0" />
                    <span>{t.importQwilightDb}</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
          {importSuccess && (
            <div className="mt-2 text-xs text-emerald-400 font-sans flex items-center gap-1.5 justify-end">
              <Check className="w-3.5 h-3.5" />
              <span>{t.lang === "en" ? `Profile "${importSuccess}" imported successfully` : `"${importSuccess}" 프로필을 성공적으로 불러왔습니다`}</span>
            </div>
          )}
        </div>
      </div>

      {currentPlayer && analytics && (
        <>
          {isCustomProfile && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-telemetry-cyan/40 bg-telemetry-cyan/10 text-xs flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-telemetry-cyan animate-pulse shrink-0" />
                <span className="font-semibold text-foreground">
                  {t.customProfileActive}: {submittedID}
                </span>
                <span className="text-telemetry-cyan font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-telemetry-cyan/20 border border-telemetry-cyan/40">
                  {t.lampOverrideActive}
                </span>
              </div>
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <RotateCw className="w-3.5 h-3.5 text-telemetry-cyan shrink-0" />
                <span>{t.lampOverrideHint}</span>
              </div>
            </div>
          )}

          {/* Twin Telemetry Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* Left: Skill Distribution Engine */}
            <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h4 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  {t.estimatedSkill}
                </h4>
                <div className="flex items-center gap-1.5">
                  {rank != null && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      #{rank}
                    </span>
                  )}
                  {topPercentile != null && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                      {t.lang === "en"
                        ? `Top ${formatTopPercentile(topPercentile)}`
                        : `상위 ${formatTopPercentile(topPercentile)}`}
                    </span>
                  )}
                </div>
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
                <p className="text-xs text-muted-foreground py-6 text-center font-sans">
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

              <p className="text-xs text-muted-foreground pt-2 border-t border-border/40 font-sans">
                {t.lang === "en" ? (
                  <>Population: <span className="font-mono tabular-nums">μ={format(playerThetaMean)}, σ={playerThetaStd.toFixed(3)}</span> (n=<span className="font-mono tabular-nums">{samplePlayers?.n_players ?? 0}</span>).</>
                ) : (
                  <>모집단: <span className="font-mono tabular-nums">μ={format(playerThetaMean)}, σ={playerThetaStd.toFixed(3)}</span> (n=<span className="font-mono tabular-nums">{samplePlayers?.n_players ?? 0}</span>).</>
                )}
              </p>
            </div>
          </div>
          {/* Unified Training Horizon Console */}
          <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-5">
            {/* Master Header: Title + Target Status Toggle */}
            <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-border/40">
              <div>
                <h4 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <Target className={cn("w-4 h-4", targetStatus === "HARD" ? "text-lamp-hard" : "text-lamp-vhard")} />
                  {t.trainingHorizon}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5 font-sans">
                  {t.horizonDesc}
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
                        : "text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    HARD
                  </button>
                  <button
                    onClick={() => setTargetStatus("V-HARD")}
                    className={`px-2.5 py-1 rounded transition-all font-medium ${
                      targetStatus === "V-HARD"
                        ? "bg-card text-foreground border border-border/80"
                        : "text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    V-HARD
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Control Toolbar */}
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Probability range dual-thumb slider and inputs */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                    {t.probRange}:
                  </span>

                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={minProb}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) setMinProb(Math.max(0, Math.min(100, val)));
                      }}
                      className="w-14 h-7 text-xs font-mono tabular-nums text-center px-1 border-border/70"
                    />
                    <span className="text-muted-foreground font-mono">% –</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={maxProb}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) setMaxProb(Math.max(0, Math.min(100, val)));
                      }}
                      className="w-14 h-7 text-xs font-mono tabular-nums text-center px-1 border-border/70"
                    />
                    <span className="text-muted-foreground font-mono">%</span>
                  </div>

                  <div className="px-2 w-36 sm:w-48">
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[Math.min(minProb, maxProb), Math.max(minProb, maxProb)]}
                      onValueChange={([min, max]) => {
                        setMinProb(min);
                        setMaxProb(max);
                      }}
                      className="cursor-pointer"
                    />
                  </div>
                </div>

                {/* Preset Pills */}
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => applyPreset(30, 80)}
                    className={cn(
                      "px-2 py-1 rounded border text-[11px] transition-colors",
                      minProb === 30 && maxProb === 80
                        ? "bg-card text-cyan-400 border-cyan-500/40 font-semibold"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {t.preset3080}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(50, 100)}
                    className={cn(
                      "px-2 py-1 rounded border text-[11px] transition-colors",
                      minProb === 50 && maxProb === 100
                        ? "bg-card text-cyan-400 border-cyan-500/40 font-semibold"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {t.preset50}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(80, 100)}
                    className={cn(
                      "px-2 py-1 rounded border text-[11px] transition-colors",
                      minProb === 80 && maxProb === 100
                        ? "bg-card text-cyan-400 border-cyan-500/40 font-semibold"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {t.preset80}
                  </button>
                  <button
                    type="button"
                    onClick={resetHorizonFilters}
                    title={t.resetFilter}
                    className="p-1 rounded border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ml-1"
                    aria-label={t.resetFilter}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Row 2: Level Span & Special Level Checkboxes */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2.5 border-t border-border/40">
                {/* Level span inputs and dual-thumb slider */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    {t.levelSpan}:
                  </span>

                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="text-muted-foreground">Lv.</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={minLevel}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) setMinLevel(Math.max(1, Math.min(31, val)));
                      }}
                      className="w-12 h-7 text-xs font-mono tabular-nums text-center px-1 border-border/70"
                    />
                    {minLevel === 31 && (
                      <span className="text-xs font-mono text-amber-400 font-bold" title="Ω = Level 31">Ω</span>
                    )}
                    <span className="text-muted-foreground font-mono">–</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={maxLevel}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) setMaxLevel(Math.max(1, Math.min(31, val)));
                      }}
                      className="w-12 h-7 text-xs font-mono tabular-nums text-center px-1 border-border/70"
                    />
                    {maxLevel === 31 && (
                      <span className="text-xs font-mono text-amber-400 font-bold" title="Ω = Level 31">Ω</span>
                    )}
                  </div>

                  <div className="px-2 w-32 sm:w-44">
                    <Slider
                      min={1}
                      max={31}
                      step={1}
                      value={[Math.min(minLevel, maxLevel), Math.max(minLevel, maxLevel)]}
                      onValueChange={([min, max]) => {
                        setMinLevel(min);
                        setMaxLevel(max);
                      }}
                      className="cursor-pointer"
                    />
                  </div>

                  {/* Level Quick Preset Pills */}
                  <div className="hidden sm:flex items-center gap-1 font-mono text-[11px]">
                    <button
                      type="button"
                      onClick={() => { setMinLevel(1); setMaxLevel(31); }}
                      className={cn(
                        "px-1.5 py-0.5 rounded border transition-colors",
                        minLevel === 1 && maxLevel === 31
                          ? "bg-card text-cyan-400 border-cyan-500/40 font-semibold"
                          : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      1–Ω
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMinLevel(20); setMaxLevel(31); }}
                      className={cn(
                        "px-1.5 py-0.5 rounded border transition-colors",
                        minLevel === 20 && maxLevel === 31
                          ? "bg-card text-cyan-400 border-cyan-500/40 font-semibold"
                          : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      20–Ω
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMinLevel(25); setMaxLevel(31); }}
                      className={cn(
                        "px-1.5 py-0.5 rounded border transition-colors",
                        minLevel === 25 && maxLevel === 31
                          ? "bg-card text-cyan-400 border-cyan-500/40 font-semibold"
                          : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      25–Ω
                    </button>
                  </div>
                </div>

                {/* Special Level Checkboxes (-_-, ?!, ◆) */}
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-muted-foreground text-[11px] font-sans">
                    {t.specialLevels}:
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono select-none hover:text-foreground transition-colors">
                    <Checkbox
                      checked={showMinus}
                      onCheckedChange={(checked) => setShowMinus(!!checked)}
                    />
                    <span className="text-amber-400 font-bold">-_-</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono select-none hover:text-foreground transition-colors">
                    <Checkbox
                      checked={showExclamation}
                      onCheckedChange={(checked) => setShowExclamation(!!checked)}
                    />
                    <span className="text-amber-400 font-bold">?!</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono select-none hover:text-foreground transition-colors">
                    <Checkbox
                      checked={showDiamond}
                      onCheckedChange={(checked) => setShowDiamond(!!checked)}
                    />
                    <span className="text-amber-400 font-bold">◆</span>
                  </label>
                </div>
              </div>

              {/* Row 3: Search input + Live match counter */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-border/40">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder={t.horizonSearchPlaceholder}
                    value={horizonSearch}
                    onChange={(e) => setHorizonSearch(e.target.value)}
                    className="pl-8 pr-7 h-7 text-xs border-border/70 bg-background"
                  />
                  {horizonSearch && (
                    <button
                      onClick={() => setHorizonSearch("")}
                      className="absolute right-2 top-1.5 p-0.5 rounded text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="text-xs font-mono text-muted-foreground shrink-0 tabular-nums">
                  {t.matchingCount(analytics.filteredCandidates.length, analytics.totalUncompleted)}
                </div>
              </div>
            </div>

            {/* Featured Targets Horizon Shelf (Top 3 Picks) */}
            {analytics.recommendations.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    {t.featuredTargets}
                  </h5>
                  {isCustomProfile && onSaveCustomProfile && (
                    <span className="text-[11px] text-telemetry-cyan flex items-center gap-1 font-sans">
                      <RotateCw className="w-2.5 h-2.5 shrink-0" />
                      <span>{t.lampOverrideHint}</span>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {analytics.recommendations.map(({ chart, p, lamp }) => (
                    <RecommendationCard
                      key={chart.md5}
                      chart={chart}
                      p={p}
                      lamp={lamp}
                      onClick={() => onSelectChart(chart)}
                      formatFn={format}
                      t={t}
                      mode={mode}
                      targetStatus={targetStatus}
                      chartMaxTheta={chartMaxTheta}
                      onClearStatusChange={isCustomProfile && onSaveCustomProfile ? handleClearStatusChange : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Horizon Explorer Table */}
            <div className="space-y-2.5">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                {t.horizonExplorer}
              </h5>

              <div className="rounded-md border border-border/80 overflow-hidden font-mono text-xs">
                <div ref={horizonScrollRef} className="max-h-[500px] overflow-auto">
                  <Table className="w-full min-w-[620px]">
                    <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border">
                      <TableRow className="border-b border-border hover:bg-transparent">
                        <HorizonSortHead
                          label={t.currentLamp}
                          sortKey="lamp"
                          currentKey={horizonSortKey}
                          currentDir={horizonSortDir}
                          onSort={handleHorizonSort}
                          align="center"
                          className="w-[65px]"
                        />
                        <HorizonSortHead
                          label={t.chart}
                          sortKey="title"
                          currentKey={horizonSortKey}
                          currentDir={horizonSortDir}
                          onSort={handleHorizonSort}
                          align="left"
                        />
                        <HorizonSortHead
                          label={t.level}
                          sortKey="level"
                          currentKey={horizonSortKey}
                          currentDir={horizonSortDir}
                          onSort={handleHorizonSort}
                          align="center"
                          className="w-[75px]"
                        />
                        <HorizonSortHead
                          label={`P(${targetStatus})`}
                          sortKey="p"
                          currentKey={horizonSortKey}
                          currentDir={horizonSortDir}
                          onSort={handleHorizonSort}
                          align="right"
                          className="w-[120px]"
                        />
                        <HorizonSortHead
                          label={`b_${targetStatus === "HARD" ? "hard" : "vhard"}`}
                          sortKey="b"
                          currentKey={horizonSortKey}
                          currentDir={horizonSortDir}
                          onSort={handleHorizonSort}
                          align="right"
                          className="w-[95px]"
                        />
                        <HorizonSortHead
                          label="a"
                          sortKey="a"
                          currentKey={horizonSortKey}
                          currentDir={horizonSortDir}
                          onSort={handleHorizonSort}
                          align="right"
                          className="w-[70px]"
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/30">
                      {horizonCandidates.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <p className="text-sm font-sans text-muted-foreground">
                                {t.noRecommendations}
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={resetHorizonFilters}
                                className="text-xs h-7 font-mono gap-1.5 mt-1 border-border/80"
                              >
                                <RotateCcw className="w-3 h-3 text-muted-foreground" />
                                {t.resetFilter}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {horizonPaddingTop > 0 && (
                            <TableRow aria-hidden className="border-0 hover:bg-transparent">
                              <TableCell colSpan={6} style={{ height: `${horizonPaddingTop}px`, padding: 0, border: 0 }} />
                            </TableRow>
                          )}
                          {horizonVirtualItems.map((virtualRow) => {
                            const { chart, p, lamp } = horizonCandidates[virtualRow.index];
                            return (
                              <TableRow
                                key={chart.md5}
                                data-index={virtualRow.index}
                                ref={horizonVirtualizer.measureElement}
                                tabIndex={0}
                                role="button"
                                aria-label={`View chart details for ${chart.title}`}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSelectChart(chart);
                                  }
                                }}
                                onClick={() => onSelectChart(chart)}
                                className="hover:bg-muted/40 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-telemetry-cyan"
                              >
                                <TableCell className="text-center font-mono text-xs py-2.5">
                                  <LampBadge
                                    status={lamp}
                                    editable={isCustomProfile && !!onSaveCustomProfile}
                                    onStatusChange={(newStatus) =>
                                      handleClearStatusChange(chart.id, newStatus)
                                    }
                                    variant="short"
                                    showEmptyAsButton={isCustomProfile}
                                  />
                                </TableCell>
                                <TableCell className="font-medium font-jp py-2.5">
                                  <div className="flex flex-col">
                                    <span className="text-sm leading-snug line-clamp-1 text-foreground">
                                      {chart.title}
                                    </span>
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
                                  <ProbabilityBadge p={p} targetStatus={targetStatus} />
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs py-2.5">
                                  <span
                                    className={cn(
                                      "tabular-nums",
                                      targetStatus === "HARD"
                                        ? chart.n_hard + chart.n_vhard === 0
                                          ? "text-amber-500/80"
                                          : "text-lamp-hard font-medium"
                                        : chart.n_vhard === 0
                                        ? "text-purple-400/80"
                                        : "text-lamp-vhard font-medium"
                                    )}
                                  >
                                    {targetStatus === "HARD"
                                      ? chart.n_hard + chart.n_vhard === 0
                                        ? `>${format(chartMaxTheta?.get(chart.id) ?? chart.b_hard_display)}?`
                                        : format(chart.b_hard_display)
                                      : chart.n_vhard === 0
                                      ? `>${format(chartMaxTheta?.get(chart.id) ?? chart.b_vhard_display)}?`
                                      : format(chart.b_vhard_display)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs py-2.5 text-muted-foreground tabular-nums">
                                  {chart.a != null ? chart.a.toFixed(2) : "–"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {horizonPaddingBottom > 0 && (
                            <TableRow aria-hidden className="border-0 hover:bg-transparent">
                              <TableCell colSpan={6} style={{ height: `${horizonPaddingBottom}px`, padding: 0, border: 0 }} />
                            </TableRow>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <QwilightDbImportDialog
        open={qwilightDbDialogOpen}
        onOpenChange={setQwilightDbDialogOpen}
        charts={charts}
        leaderboard={leaderboard}
        activeProfileId={isCustomProfile ? submittedID : undefined}
        onImportComplete={handleQwilightDbImport}
      />
    </div>
  );
}

function HorizonSortHead({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
  className,
}: {
  label: React.ReactNode;
  sortKey: "p" | "b" | "a" | "level" | "title" | "lamp";
  currentKey: "p" | "b" | "a" | "level" | "title" | "lamp";
  currentDir: "asc" | "desc";
  onSort: (key: "p" | "b" | "a" | "level" | "title" | "lamp") => void;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const isActive = currentKey === sortKey;
  return (
    <TableHead
      className={cn(
        "px-3 py-2.5 font-semibold text-xs uppercase select-none cursor-pointer transition-colors hover:text-foreground",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        isActive ? "text-foreground" : "text-muted-foreground",
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1",
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
        )}
      >
        <span>{label}</span>
        {isActive ? (
          currentDir === "asc" ? (
            <ArrowUp className="w-3 h-3 text-cyan-400" />
          ) : (
            <ArrowDown className="w-3 h-3 text-cyan-400" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-70" />
        )}
      </div>
    </TableHead>
  );
}

function RecommendationCard({
  chart,
  p,
  lamp,
  onClick,
  formatFn,
  t,
  mode,
  targetStatus,
  chartMaxTheta,
  onClearStatusChange,
}: {
  chart: Chart;
  p: number;
  lamp?: number | null;
  onClick: () => void;
  formatFn: (val: number | null | undefined) => string;
  t: any;
  mode: string;
  targetStatus: "HARD" | "V-HARD";
  chartMaxTheta?: Map<number, number> | null;
  onClearStatusChange?: (chartId: number, status: number) => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg border border-border/70 hover:border-border bg-muted/20 hover:bg-muted/40 transition-all p-3 flex flex-col gap-2 group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry-cyan"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium font-jp line-clamp-2 leading-snug group-hover:text-foreground">
          {chart.title}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <LampBadge
            status={lamp}
            editable={!!onClearStatusChange}
            onStatusChange={
              onClearStatusChange
                ? (newStatus) => onClearStatusChange(chart.id, newStatus)
                : undefined
            }
            variant="short"
            showEmptyAsButton={true}
          />
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-background border border-border/60">
            {levelLabel(chart.level)}
          </span>
        </div>
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
            "h-full rounded-sm transition-all",
            targetStatus === "HARD" ? "bg-lamp-hard" : "bg-lamp-vhard"
          )}
          style={{
            width: `${Math.min(100, Math.max(0, p * 100))}%`,
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>
          b_{targetStatus === "HARD" ? "hard" : "vhard"}:{" "}
          <span
            className={cn(
              "font-semibold tabular-nums",
              targetStatus === "HARD"
                ? chart.n_hard + chart.n_vhard === 0
                  ? "text-amber-500/80"
                  : "text-lamp-hard"
                : chart.n_vhard === 0
                ? "text-purple-400/80"
                : "text-lamp-vhard"
            )}
          >
            {targetStatus === "HARD"
              ? chart.n_hard + chart.n_vhard === 0
                ? `>${formatFn(chartMaxTheta?.get(chart.id) ?? chart.b_hard_display)}?`
                : formatFn(chart.b_hard_display)
              : chart.n_vhard === 0
              ? `>${formatFn(chartMaxTheta?.get(chart.id) ?? chart.b_vhard_display)}?`
              : formatFn(chart.b_vhard_display)}
          </span>
        </span>
        <span>a: {chart.a != null ? chart.a.toFixed(2) : "–"}</span>
      </div>
    </button>
  );
}

function ProbabilityBadge({
  p,
  targetStatus,
}: {
  p: number;
  targetStatus: "HARD" | "V-HARD";
}) {
  const colorClass =
    p >= 0.8
      ? "text-emerald-400"
      : p >= 0.5
      ? "text-cyan-400"
      : p >= 0.2
      ? "text-lamp-normal"
      : "text-muted-foreground";

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden sm:block w-12 h-1 bg-muted/60 rounded-full overflow-hidden border border-border/30">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            targetStatus === "HARD" ? "bg-lamp-hard" : "bg-lamp-vhard"
          )}
          style={{ width: `${Math.min(100, Math.max(0, p * 100))}%` }}
        />
      </div>
      <span className={cn("font-mono font-semibold tabular-nums text-xs", colorClass)}>
        {fmtPct(p)}
      </span>
    </div>
  );
}
