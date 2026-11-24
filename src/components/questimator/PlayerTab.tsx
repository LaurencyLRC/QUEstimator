"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { useLang } from "@/lib/i18n";
import {
  type Chart,
  type PlayerData,
  type PlayersDict,
  type SamplePlayers,
  type LeaderboardResult,
  type PlayerHistoryPoint,
  levelSortKey,
  computeTopPercentile,
  estimateThetaWithSe,
  computeBaseLogLik,
  eapFromLogLik,
  estimateThetaWithBase,
  computePlayerDiagnostics,
  getCensoredDisplayBound,
} from "@/lib/questimator-types";
import { fetchPlayersData } from "@/lib/players-cache";
import { QwilightDbImportDialog } from "@/components/questimator/QwilightDbImportDialog";
import { SkillProgressionChart } from "@/components/questimator/SkillProgressionChart";
import { ProfileSummaryDialog } from "@/components/questimator/ProfileSummaryDialog";
import {
  LAMP_LABEL,
  formatSkillGain,
  matchesLevel,
  pHard,
  pVHard,
  type HorizonCandidate,
  type HorizonSortKey,
  type PlayerAnalytics,
} from "./player/player-utils";
import { ProfileSearchConsole, type PlayerSearchMatch } from "./player/ProfileSearchConsole";
import { PlayerRivalCard } from "./player/PlayerRivalCard";
import { PlayerSkillPanels } from "./player/PlayerSkillPanels";
import { PlayerDiagnosticsPanel } from "./player/PlayerDiagnosticsPanel";
import { TrainingHorizonSection } from "./player/TrainingHorizonSection";

export { LAMP_LABEL, formatSkillGain };

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
  rivalPlayer?: { id: string; data: PlayerData; isCustom?: boolean } | null;
  onSetRival?: (id: string | null, player?: PlayerData | null, isCustom?: boolean) => void;
  targetStatus?: "HARD" | "V-HARD";
  onTargetStatusChange?: (mode: "HARD" | "V-HARD") => void;
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
  rivalPlayer,
  onSetRival,
  targetStatus: targetStatusProp,
  onTargetStatusChange,
}: Props) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [submittedID, setSubmittedID] = useState("");
  const [isCustomProfile, setIsCustomProfile] = useState(false);
  const [internalPlayers, setInternalPlayers] = useState<PlayersDict | null>(null);
  const [searchResults, setSearchResults] = useState<PlayerSearchMatch[] | null>(null);
  const [internalLoadingPlayers, setInternalLoadingPlayers] = useState(false);
  const [internalLoadError, setInternalLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [internalTargetStatus, setInternalTargetStatus] = useState<"HARD" | "V-HARD">("HARD");
  const targetStatus = targetStatusProp ?? internalTargetStatus;
  const setTargetStatus = (nextMode: "HARD" | "V-HARD") => {
    setInternalTargetStatus(nextMode);
    onTargetStatusChange?.(nextMode);
  };

  const [rivalDiffOnly, setRivalDiffOnly] = useState(false);
  const [minProb, setMinProb] = useState(30);
  const [maxProb, setMaxProb] = useState(80);
  const [minLevel, setMinLevel] = useState(1);
  const [maxLevel, setMaxLevel] = useState(31);
  const [showMinus, setShowMinus] = useState(false);
  const [showExclamation, setShowExclamation] = useState(false);
  const [showDiamond, setShowDiamond] = useState(false);
  const [horizonSearch, setHorizonSearch] = useState("");
  const [horizonSortKey, setHorizonSortKey] = useState<HorizonSortKey>("p");
  const [horizonSortDir, setHorizonSortDir] = useState<"asc" | "desc">("desc");
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [qwilightDbDialogOpen, setQwilightDbDialogOpen] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);

  const notifyImportSuccess = (name: string) => {
    setImportSuccess(name);
    setTimeout(() => setImportSuccess(null), 3000);
  };

  const handleQwilightDbImport = (
    name: string,
    newClears: Record<string, number>,
    isMerge?: boolean,
    history?: PlayerHistoryPoint[]
  ) => {
    let finalClears = newClears;
    let targetName = name;
    let finalHistory = history;

    if (isMerge && isCustomProfile && customProfiles[submittedID]) {
      targetName = submittedID;
      const existingProfile = customProfiles[submittedID];
      const existingClears = existingProfile.c || {};
      finalClears = { ...existingClears };
      for (const [chartId, lamp] of Object.entries(newClears)) {
        const existingLamp = finalClears[chartId];
        if (existingLamp === undefined || lamp > existingLamp) {
          finalClears[chartId] = lamp;
        }
      }
      if (!finalHistory && existingProfile.history) {
        finalHistory = existingProfile.history;
      }
    }

    const { theta: calculatedTheta, se: calculatedSe } = estimateThetaWithSe(charts, finalClears);
    const profileData: PlayerData = {
      t: calculatedTheta,
      se: calculatedSe,
      c: finalClears,
      n: targetName,
      ...(finalHistory ? { history: finalHistory } : {}),
    };

    onSaveCustomProfile?.(targetName, profileData);
    setIsCustomProfile(true);
    setSubmittedID(targetName);
    setInternalLoadError(null);
    notifyImportSuccess(targetName);
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

  const handleHorizonSort = (key: HorizonSortKey) => {
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

  const chartMaxTheta =
    propChartMaxTheta !== undefined && propChartMaxTheta !== null
      ? propChartMaxTheta
      : internalChartMaxTheta;

  const fetchPlayers = useRef<(() => Promise<PlayersDict | null>) | null>(null);

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
      if (charts.length > 0) {
        const { theta, se } = estimateThetaWithSe(charts, p.c || {});
        return { ...p, t: theta, se };
      }
      return { ...p, t: p.t ?? 0 };
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

    const customEntries = Object.entries(customProfiles ?? {});
    const exactCustom = customEntries.find(
      ([id, p]) => id.toLowerCase() === ql || (p.n && p.n.toLowerCase() === ql)
    );
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

    const matches: PlayerSearchMatch[] = [];
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
      matches.sort((a, b) => b.clears - a.clears);
      setSearchResults(matches);
      setSubmittedID("");
      setNotFound(false);
    }
  };

  const playerClears = currentPlayer?.c;
  const rivalClears = rivalPlayer?.data?.c;

  const baseLogLik = useMemo(() => {
    if (!playerClears) return new Float64Array(0);
    return computeBaseLogLik(charts, playerClears);
  }, [charts, playerClears]);

  const diagnostics = useMemo(() => {
    if (!currentPlayer || baseLogLik.length === 0) {
      return { signatureClears: [], ratingDrags: [] };
    }
    return computePlayerDiagnostics(charts, currentPlayer.c || {}, currentPlayer.t, baseLogLik);
  }, [charts, currentPlayer, baseLogLik]);

  const analytics = useMemo<PlayerAnalytics | null>(() => {
    if (!currentPlayer) return null;

    const statusCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const s of Object.values(currentPlayer.c || {})) {
      if (s >= 0 && s <= 3) statusCounts[s as 0 | 1 | 2 | 3] += 1;
    }
    const totalClears = statusCounts[0] + statusCounts[1] + statusCounts[2] + statusCounts[3];

    const theta = currentPlayer.t;
    const baseTheta = baseLogLik.length > 0 ? eapFromLogLik(baseLogLik) : theta;

    let rivalAheadCount = 0;
    if (rivalClears) {
      for (const c of charts) {
        if (c.provisional) continue;
        const rLamp = rivalClears[String(c.id)];
        const pLamp = currentPlayer.c?.[String(c.id)];
        if (rLamp !== undefined && rLamp >= 2 && (pLamp === undefined || pLamp < rLamp)) {
          rivalAheadCount++;
        }
      }
    }

    const targetThreshold = targetStatus === "HARD" ? 2 : 3;
    const allCandidates: HorizonCandidate[] = [];

    for (const c of charts) {
      if (c.provisional) continue;
      const p = targetStatus === "HARD" ? pHard(theta, c, chartMaxTheta) : pVHard(theta, c, chartMaxTheta);
      if (p == null) continue;
      const rawStatus = currentPlayer.c?.[String(c.id)];
      if (rawStatus !== undefined && rawStatus >= targetThreshold) continue;

      const rStatus = rivalClears?.[String(c.id)];
      const rivalLamp = rStatus !== undefined ? rStatus : null;
      const isRivalAhead =
        rivalLamp !== null && rivalLamp >= 2 && (rawStatus === undefined || rawStatus < rivalLamp);

      const deltaTheta =
        baseLogLik.length > 0
          ? Math.max(0, estimateThetaWithBase(baseLogLik, c, targetThreshold, rawStatus) - baseTheta)
          : 0;

      allCandidates.push({
        chart: c,
        p,
        lamp: rawStatus !== undefined ? rawStatus : null,
        deltaTheta,
        expectedGain: p * deltaTheta,
        rivalLamp,
        isRivalAhead,
      });
    }

    const totalUncompleted = allCandidates.length;
    const pLo = Math.min(minProb, maxProb) / 100;
    const pHi = Math.max(minProb, maxProb) / 100;

    const inRangeCandidates = allCandidates.filter((c) => {
      if (rivalDiffOnly) {
        if (!c.isRivalAhead) return false;
      } else if (c.p < pLo || c.p > pHi) {
        return false;
      }
      return matchesLevel(c.chart.level, minLevel, maxLevel, showMinus, showExclamation, showDiamond);
    });

    const searchClean = horizonSearch.trim().toLowerCase();
    const filteredCandidates = inRangeCandidates.filter((c) => {
      if (!searchClean) return true;
      return (
        c.chart.title.toLowerCase().includes(searchClean) ||
        c.chart.artist.toLowerCase().includes(searchClean) ||
        c.chart.name_diff.toLowerCase().includes(searchClean)
      );
    });

    filteredCandidates.sort((a, b) => {
      let cmp = 0;
      switch (horizonSortKey) {
        case "p":
          cmp = a.p - b.p;
          break;
        case "delta":
          cmp = a.deltaTheta - b.deltaTheta;
          break;
        case "expected":
          cmp = a.expectedGain - b.expectedGain;
          break;
        case "lamp":
          cmp = (a.lamp ?? -1) - (b.lamp ?? -1);
          break;
        case "rival":
          cmp = (a.rivalLamp ?? -1) - (b.rivalLamp ?? -1);
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
          const aVal =
            targetStatus === "HARD"
              ? a.chart.n_hard + a.chart.n_vhard === 0
                ? (getCensoredDisplayBound(a.chart.b_hard_display, chartMaxTheta?.get(a.chart.id)) ?? -99)
                : a.chart.b_hard_display
              : a.chart.n_vhard === 0
              ? (getCensoredDisplayBound(a.chart.b_vhard_display, chartMaxTheta?.get(a.chart.id)) ?? -99)
              : a.chart.b_vhard_display;
          const bVal =
            targetStatus === "HARD"
              ? b.chart.n_hard + b.chart.n_vhard === 0
                ? (getCensoredDisplayBound(b.chart.b_hard_display, chartMaxTheta?.get(b.chart.id)) ?? -99)
                : b.chart.b_hard_display
              : b.chart.n_vhard === 0
              ? (getCensoredDisplayBound(b.chart.b_vhard_display, chartMaxTheta?.get(b.chart.id)) ?? -99)
              : b.chart.b_vhard_display;
          cmp = (aVal ?? -99) - (bVal ?? -99);
          break;
        }
      }
      return horizonSortDir === "asc" ? cmp : -cmp;
    });

    const pMid = (pLo + pHi) / 2;
    const recommendations = [...inRangeCandidates]
      .sort((a, b) => {
        const distA = Math.abs(a.p - pMid);
        const distB = Math.abs(b.p - pMid);
        if (Math.abs(distA - distB) > 0.08) return distA - distB;
        return (b.chart.a ?? 1) - (a.chart.a ?? 1);
      })
      .slice(0, 3);

    const folderMap = new Map<
      string,
      { total: number; vhard: number; hard: number; normal: number; failed: number }
    >();
    for (const c of charts) {
      if (!c.level) continue;
      let entry = folderMap.get(c.level);
      if (!entry) {
        entry = { total: 0, vhard: 0, hard: 0, normal: 0, failed: 0 };
        folderMap.set(c.level, entry);
      }
      entry.total++;
      const s = currentPlayer.c?.[String(c.id)];
      if (s === 3) entry.vhard++;
      else if (s === 2) entry.hard++;
      else if (s === 1) entry.normal++;
      else if (s === 0) entry.failed++;
    }

    const levelStats = [...folderMap.entries()]
      .map(([lvl, data]) => ({
        level: lvl,
        ...data,
        cleared: data.vhard + data.hard,
        played: data.vhard + data.hard + data.normal + data.failed,
      }))
      .filter((s) => s.played > 0)
      .sort((a, b) => {
        const [ax, ay] = levelSortKey(a.level);
        const [bx, by] = levelSortKey(b.level);
        return ax - bx || ay - by;
      });

    return {
      statusCounts,
      totalClears,
      totalUncompleted,
      inRangeCount: inRangeCandidates.length,
      filteredCandidates,
      recommendations,
      clearedLevels: levelStats.map((s) => [s.level, s.cleared] as [string, number]),
      levelStats,
      targetStatus,
      rivalAheadCount,
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
    baseLogLik,
    rivalClears,
    rivalDiffOnly,
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
    if (status < 0) delete newClears[String(chartId)];
    else newClears[String(chartId)] = status;
    const { theta: dynamicTheta, se: dynamicSe } = estimateThetaWithSe(charts, newClears);
    onSaveCustomProfile(submittedID, { ...currentPlayer, c: newClears, t: dynamicTheta, se: dynamicSe });
  };

  return (
    <div className="space-y-6">
      <ProfileSearchConsole
        charts={charts}
        query={query}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        loadingPlayers={loadingPlayers}
        notFound={notFound}
        onClearNotFound={() => setNotFound(false)}
        loadError={loadError}
        onSetLoadError={setInternalLoadError}
        searchResults={searchResults}
        onSelectSearchMatch={(r) => {
          setSubmittedID(r.id);
          setIsCustomProfile(!!r.isCustom);
          setSearchResults(null);
          setQuery(r.id);
        }}
        currentPlayer={currentPlayer}
        analytics={analytics}
        submittedID={submittedID}
        activePlayerExternalId={activePlayerExternal?.id}
        isCustomProfile={isCustomProfile}
        rank={rank}
        topPercentile={topPercentile}
        customProfiles={customProfiles}
        onSelectCustomProfile={(id) => {
          setIsCustomProfile(true);
          setSubmittedID(id);
        }}
        onSaveCustomProfile={onSaveCustomProfile}
        onDeleteCustomProfile={onDeleteCustomProfile}
        onProfileActivated={(id, custom) => {
          setIsCustomProfile(custom);
          setSubmittedID(id);
        }}
        onProfileDeleted={() => {
          setIsCustomProfile(false);
          setSubmittedID("");
        }}
        onOpenQwilightDb={() => setQwilightDbDialogOpen(true)}
        onOpenSummary={() => setSummaryDialogOpen(true)}
        importSuccess={importSuccess}
        onNotifyImportSuccess={notifyImportSuccess}
      />

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

          {rivalPlayer && rivalPlayer.data && rivalPlayer.id !== submittedID && (
            <PlayerRivalCard
              submittedID={submittedID}
              currentPlayer={currentPlayer}
              isCustomProfile={isCustomProfile}
              totalClears={analytics.totalClears}
              rivalPlayer={rivalPlayer}
              rivalAheadCount={analytics.rivalAheadCount}
              rivalDiffOnly={rivalDiffOnly}
              onToggleRivalDiff={() => setRivalDiffOnly((prev) => !prev)}
              onUnpinRival={() => {
                setRivalDiffOnly(false);
                onSetRival?.(null);
              }}
            />
          )}

          <PlayerSkillPanels
            submittedID={submittedID}
            currentPlayer={currentPlayer}
            isCustomProfile={isCustomProfile}
            rank={rank}
            topPercentile={topPercentile}
            statusCounts={analytics.statusCounts}
            levelStats={analytics.levelStats}
            samplePlayers={samplePlayers}
            playerThetaMean={playerThetaMean}
            playerThetaStd={playerThetaStd}
            rivalPlayer={rivalPlayer}
            onSetRival={onSetRival}
          />

          {currentPlayer.history && currentPlayer.history.length >= 2 && (
            <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-5 space-y-3">
              <SkillProgressionChart history={currentPlayer.history} currentTheta={currentPlayer.t} />
            </div>
          )}

          <PlayerDiagnosticsPanel
            diagnostics={diagnostics}
            playerTheta={currentPlayer.t}
            onSelectChart={onSelectChart}
          />

          <TrainingHorizonSection
            targetStatus={targetStatus}
            onTargetStatusChange={setTargetStatus}
            rivalPlayer={rivalPlayer}
            rivalAheadCount={analytics.rivalAheadCount}
            rivalDiffOnly={rivalDiffOnly}
            onToggleRivalDiff={() => setRivalDiffOnly((prev) => !prev)}
            onClearRivalDiff={() => setRivalDiffOnly(false)}
            minProb={minProb}
            maxProb={maxProb}
            onProbChange={(lo, hi) => {
              setMinProb(lo);
              setMaxProb(hi);
            }}
            minLevel={minLevel}
            maxLevel={maxLevel}
            onLevelChange={(lo, hi) => {
              setMinLevel(lo);
              setMaxLevel(hi);
            }}
            showMinus={showMinus}
            showExclamation={showExclamation}
            showDiamond={showDiamond}
            onShowMinusChange={setShowMinus}
            onShowExclamationChange={setShowExclamation}
            onShowDiamondChange={setShowDiamond}
            horizonSearch={horizonSearch}
            onHorizonSearchChange={setHorizonSearch}
            horizonSortKey={horizonSortKey}
            horizonSortDir={horizonSortDir}
            onHorizonSort={handleHorizonSort}
            onResetFilters={resetHorizonFilters}
            totalUncompleted={analytics.totalUncompleted}
            recommendations={analytics.recommendations}
            candidates={analytics.filteredCandidates}
            playerTheta={currentPlayer.t}
            chartMaxTheta={chartMaxTheta}
            isCustomProfile={isCustomProfile}
            onSelectChart={onSelectChart}
            onClearStatusChange={isCustomProfile && onSaveCustomProfile ? handleClearStatusChange : undefined}
          />
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

      {currentPlayer && (
        <ProfileSummaryDialog
          open={summaryDialogOpen}
          onOpenChange={setSummaryDialogOpen}
          playerName={currentPlayer.n || submittedID}
          playerTheta={currentPlayer.t}
          clears={currentPlayer.c || {}}
          charts={charts}
          rank={rank}
          topPercentile={topPercentile}
          isCustomProfile={isCustomProfile}
          signatureClears={diagnostics?.signatureClears}
          levelStats={analytics?.levelStats}
        />
      )}
    </div>
  );
}
