"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Layers,
  RotateCcw,
  RotateCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Target,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LampBadge } from "@/components/questimator/LampBadge";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import {
  getCensoredDisplayBound,
  isSpecialLevel,
  levelLabel,
  type Chart,
  type PlayerData,
} from "@/lib/questimator-types";
import {
  fmtPct,
  formatSkillGain,
  type HorizonCandidate,
  type HorizonSortKey,
} from "./player-utils";

interface TrainingHorizonSectionProps {
  targetStatus: "HARD" | "V-HARD";
  onTargetStatusChange: (mode: "HARD" | "V-HARD") => void;
  rivalPlayer?: { id: string; data: PlayerData; isCustom?: boolean } | null;
  rivalAheadCount: number;
  rivalDiffOnly: boolean;
  onToggleRivalDiff: () => void;
  onClearRivalDiff: () => void;
  minProb: number;
  maxProb: number;
  onProbChange: (min: number, max: number) => void;
  minLevel: number;
  maxLevel: number;
  onLevelChange: (min: number, max: number) => void;
  showMinus: boolean;
  showExclamation: boolean;
  showDiamond: boolean;
  onShowMinusChange: (v: boolean) => void;
  onShowExclamationChange: (v: boolean) => void;
  onShowDiamondChange: (v: boolean) => void;
  horizonSearch: string;
  onHorizonSearchChange: (v: string) => void;
  horizonSortKey: HorizonSortKey;
  horizonSortDir: "asc" | "desc";
  onHorizonSort: (key: HorizonSortKey) => void;
  onResetFilters: () => void;
  totalUncompleted: number;
  recommendations: HorizonCandidate[];
  candidates: HorizonCandidate[];
  playerTheta: number;
  chartMaxTheta: Map<number, number> | null;
  isCustomProfile: boolean;
  onSelectChart: (c: Chart) => void;
  onClearStatusChange?: (chartId: number, status: number) => void;
}

export function TrainingHorizonSection({
  targetStatus,
  onTargetStatusChange,
  rivalPlayer,
  rivalAheadCount,
  rivalDiffOnly,
  onToggleRivalDiff,
  onClearRivalDiff,
  minProb,
  maxProb,
  onProbChange,
  minLevel,
  maxLevel,
  onLevelChange,
  showMinus,
  showExclamation,
  showDiamond,
  onShowMinusChange,
  onShowExclamationChange,
  onShowDiamondChange,
  horizonSearch,
  onHorizonSearchChange,
  horizonSortKey,
  horizonSortDir,
  onHorizonSort,
  onResetFilters,
  totalUncompleted,
  recommendations,
  candidates,
  playerTheta,
  chartMaxTheta,
  isCustomProfile,
  onSelectChart,
  onClearStatusChange,
}: TrainingHorizonSectionProps) {
  const { t } = useLang();
  const { mode, format, toScale } = useScale();
  const horizonScrollRef = useRef<HTMLDivElement>(null);

  const horizonVirtualizer = useVirtualizer({
    count: candidates.length,
    getScrollElement: () => horizonScrollRef.current,
    estimateSize: () => 48,
    overscan: 10,
    getItemKey: (index) => candidates[index]?.chart.md5 ?? index,
  });

  const horizonVirtualItems = horizonVirtualizer.getVirtualItems();
  const horizonPaddingTop = horizonVirtualItems.length > 0 ? horizonVirtualItems[0].start : 0;
  const horizonPaddingBottom =
    horizonVirtualItems.length > 0
      ? horizonVirtualizer.getTotalSize() - horizonVirtualItems[horizonVirtualItems.length - 1].end
      : 0;

  return (
    <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-5">
      {/* Master Header: Title + Target Status Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-border/40">
        <div>
          <h4 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Target
              className={cn("w-4 h-4", targetStatus === "HARD" ? "text-lamp-hard" : "text-lamp-vhard")}
            />
            {t.trainingHorizon}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5 font-sans">
            {targetStatus === "V-HARD" ? t.horizonDescVhard : t.horizonDesc}
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs flex-wrap">
          {rivalPlayer && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleRivalDiff}
              className={cn(
                "h-7 text-xs font-mono gap-1.5 transition-all border",
                rivalDiffOnly
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold hover:bg-amber-500/25"
                  : "bg-muted/30 text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Swords className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.rivalDiff}</span>
              {rivalAheadCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1 py-0 h-4 bg-amber-500/10 text-amber-400 border-amber-500/30 font-mono"
                >
                  {rivalAheadCount}
                </Badge>
              )}
            </Button>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t.targetMode}</span>
            <div
              role="radiogroup"
              aria-label={t.targetMode}
              className="inline-flex items-center p-0.5 rounded-md bg-muted/40 border border-border/80"
            >
              <button
                type="button"
                role="radio"
                aria-checked={targetStatus === "HARD"}
                onClick={() => onTargetStatusChange("HARD")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all border",
                  targetStatus === "HARD"
                    ? "bg-lamp-hard/20 text-lamp-hard border-lamp-hard/50 font-bold"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/40 font-medium"
                )}
              >
                {targetStatus === "HARD" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-lamp-hard shrink-0" aria-hidden="true" />
                )}
                <span>HARD</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={targetStatus === "V-HARD"}
                onClick={() => onTargetStatusChange("V-HARD")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all border",
                  targetStatus === "V-HARD"
                    ? "bg-lamp-vhard/20 text-lamp-vhard border-lamp-vhard/50 font-bold"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/40 font-medium"
                )}
              >
                {targetStatus === "V-HARD" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-lamp-vhard shrink-0" aria-hidden="true" />
                )}
                <span>V-HARD</span>
              </button>
            </div>
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
                  if (!isNaN(val)) onProbChange(Math.max(0, Math.min(100, val)), maxProb);
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
                  if (!isNaN(val)) onProbChange(minProb, Math.max(0, Math.min(100, val)));
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
                onValueChange={([min, max]) => onProbChange(min, max)}
                className="cursor-pointer"
              />
            </div>
          </div>

          {/* Preset Pills */}
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
            <button
              type="button"
              onClick={() => onProbChange(30, 80)}
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
              onClick={() => onProbChange(50, 100)}
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
              onClick={() => onProbChange(80, 100)}
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
              onClick={onResetFilters}
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
                  if (!isNaN(val)) onLevelChange(Math.max(1, Math.min(31, val)), maxLevel);
                }}
                className="w-12 h-7 text-xs font-mono tabular-nums text-center px-1 border-border/70"
              />
              {minLevel === 31 && (
                <span
                  className="text-xs font-mono text-amber-400 font-bold"
                  title={t.lang === "en" ? "Ω = Level 31" : "Ω = 31레벨"}
                >
                  Ω
                </span>
              )}
              <span className="text-muted-foreground font-mono">–</span>
              <Input
                type="number"
                min={1}
                max={31}
                value={maxLevel}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) onLevelChange(minLevel, Math.max(1, Math.min(31, val)));
                }}
                className="w-12 h-7 text-xs font-mono tabular-nums text-center px-1 border-border/70"
              />
              {maxLevel === 31 && (
                <span
                  className="text-xs font-mono text-amber-400 font-bold"
                  title={t.lang === "en" ? "Ω = Level 31" : "Ω = 31레벨"}
                >
                  Ω
                </span>
              )}
            </div>

            <div className="px-2 w-32 sm:w-44">
              <Slider
                min={1}
                max={31}
                step={1}
                value={[Math.min(minLevel, maxLevel), Math.max(minLevel, maxLevel)]}
                onValueChange={([min, max]) => onLevelChange(min, max)}
                className="cursor-pointer"
              />
            </div>

            {/* Level Quick Preset Pills */}
            <div className="hidden sm:flex items-center gap-1 font-mono text-[11px]">
              {[
                { label: "1–Ω", lo: 1, hi: 31 },
                { label: "20–Ω", lo: 20, hi: 31 },
                { label: "25–Ω", lo: 25, hi: 31 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onLevelChange(preset.lo, preset.hi)}
                  className={cn(
                    "px-1.5 py-0.5 rounded border transition-colors",
                    minLevel === preset.lo && maxLevel === preset.hi
                      ? "bg-card text-cyan-400 border-cyan-500/40 font-semibold"
                      : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Special Level Checkboxes (-_-, ?!, ◆) */}
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-muted-foreground text-[11px] font-sans">{t.specialLevels}:</span>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono select-none hover:text-foreground transition-colors">
              <Checkbox checked={showMinus} onCheckedChange={(c) => onShowMinusChange(!!c)} />
              <span className="text-amber-400 font-bold">-_-</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono select-none hover:text-foreground transition-colors">
              <Checkbox checked={showExclamation} onCheckedChange={(c) => onShowExclamationChange(!!c)} />
              <span className="text-amber-400 font-bold">?!</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono select-none hover:text-foreground transition-colors">
              <Checkbox checked={showDiamond} onCheckedChange={(c) => onShowDiamondChange(!!c)} />
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
              onChange={(e) => onHorizonSearchChange(e.target.value)}
              className="pl-8 pr-7 h-7 text-xs border-border/70 bg-background"
            />
            {horizonSearch && (
              <button
                onClick={() => onHorizonSearchChange("")}
                className="absolute right-2 top-1.5 p-0.5 rounded text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="text-xs font-mono text-muted-foreground shrink-0 tabular-nums">
            {t.matchingCount(candidates.length, totalUncompleted)}
          </div>
        </div>
      </div>

      {/* Rival Diff Active Indicator */}
      {rivalDiffOnly && rivalPlayer && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-400 font-sans">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              {t.rivalDiffDesc} ({rivalPlayer.data?.n || rivalPlayer.id})
            </span>
          </div>
          <button
            type="button"
            onClick={onClearRivalDiff}
            className="text-xs text-muted-foreground hover:text-foreground font-mono underline ml-auto cursor-pointer"
          >
            {t.lang === "en" ? "Show all" : "전체 보기"}
          </button>
        </div>
      )}

      {/* Featured Targets Horizon Shelf (Top 3 Picks) */}
      {recommendations.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              {t.featuredTargets}
            </h5>
            {isCustomProfile && onClearStatusChange && (
              <span className="text-[11px] text-telemetry-cyan flex items-center gap-1 font-sans">
                <RotateCw className="w-2.5 h-2.5 shrink-0" />
                <span>{t.lampOverrideHint}</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recommendations.map(({ chart, p, lamp, deltaTheta, expectedGain }) => (
              <RecommendationCard
                key={chart.md5}
                chart={chart}
                p={p}
                lamp={lamp}
                deltaTheta={deltaTheta}
                expectedGain={expectedGain}
                onClick={() => onSelectChart(chart)}
                formatFn={format}
                mode={mode}
                targetStatus={targetStatus}
                chartMaxTheta={chartMaxTheta}
                onClearStatusChange={onClearStatusChange}
                toScaleFn={toScale}
                playerTheta={playerTheta}
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
            <Table className={cn("w-full min-w-[720px]", rivalPlayer && "min-w-[780px]")}>
              <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border">
                <TableRow className="border-b border-border hover:bg-transparent">
                  <HorizonSortHead
                    label={t.currentLamp}
                    sortKey="lamp"
                    currentKey={horizonSortKey}
                    currentDir={horizonSortDir}
                    onSort={onHorizonSort}
                    align="center"
                    className="w-[65px]"
                  />
                  {rivalPlayer && (
                    <HorizonSortHead
                      label={<Swords className="w-3.5 h-3.5 text-amber-400" />}
                      sortKey="rival"
                      currentKey={horizonSortKey}
                      currentDir={horizonSortDir}
                      onSort={onHorizonSort}
                      align="center"
                      className="w-[60px]"
                    />
                  )}
                  <HorizonSortHead
                    label={t.chart}
                    sortKey="title"
                    currentKey={horizonSortKey}
                    currentDir={horizonSortDir}
                    onSort={onHorizonSort}
                    align="left"
                  />
                  <HorizonSortHead
                    label={t.level}
                    sortKey="level"
                    currentKey={horizonSortKey}
                    currentDir={horizonSortDir}
                    onSort={onHorizonSort}
                    align="center"
                    className="w-[75px]"
                  />
                  <HorizonSortHead
                    label={`P(${targetStatus})`}
                    sortKey="p"
                    currentKey={horizonSortKey}
                    currentDir={horizonSortDir}
                    onSort={onHorizonSort}
                    align="right"
                    className="w-[120px]"
                  />
                  <HorizonSortHead
                    label={mode === "lerp" ? "+ΔU_E" : "+Δθ"}
                    sortKey="delta"
                    currentKey={horizonSortKey}
                    currentDir={horizonSortDir}
                    onSort={onHorizonSort}
                    align="right"
                    className="w-[110px]"
                  />
                  <HorizonSortHead
                    label={`b_${targetStatus === "HARD" ? "hard" : "vhard"}`}
                    sortKey="b"
                    currentKey={horizonSortKey}
                    currentDir={horizonSortDir}
                    onSort={onHorizonSort}
                    align="right"
                    className="w-[95px]"
                  />
                  <HorizonSortHead
                    label="a"
                    sortKey="a"
                    currentKey={horizonSortKey}
                    currentDir={horizonSortDir}
                    onSort={onHorizonSort}
                    align="right"
                    className="w-[70px]"
                  />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/30">
                {candidates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={rivalPlayer ? 8 : 7} className="py-10 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p className="text-sm font-sans text-muted-foreground">
                          {rivalDiffOnly ? t.noRivalDiff : t.noRecommendations}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (rivalDiffOnly) onClearRivalDiff();
                            onResetFilters();
                          }}
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
                        <TableCell
                          colSpan={rivalPlayer ? 8 : 7}
                          style={{ height: `${horizonPaddingTop}px`, padding: 0, border: 0 }}
                        />
                      </TableRow>
                    )}
                    {horizonVirtualItems.map((virtualRow) => {
                      const { chart, p, lamp, deltaTheta, expectedGain, rivalLamp } =
                        candidates[virtualRow.index];
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
                              editable={!!onClearStatusChange}
                              onStatusChange={
                                onClearStatusChange
                                  ? (newStatus) => onClearStatusChange(chart.id, newStatus)
                                  : undefined
                              }
                              variant="short"
                              showEmptyAsButton={isCustomProfile}
                            />
                          </TableCell>
                          {rivalPlayer && (
                            <TableCell className="text-center font-mono text-xs py-2.5">
                              <LampBadge status={rivalLamp} variant="short" />
                            </TableCell>
                          )}
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
                            <span
                              className={
                                isSpecialLevel(chart.level)
                                  ? "text-amber-400 font-bold"
                                  : "text-muted-foreground"
                              }
                            >
                              {chart.level}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs py-2.5">
                            <ProbabilityBadge p={p} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs py-2.5">
                            <div className="flex flex-col items-end leading-none gap-0.5">
                              <span className="text-emerald-400 font-semibold tabular-nums">
                                {(() => {
                                  if (mode === "lerp") {
                                    const s0 = toScale(playerTheta);
                                    const s1 = toScale(playerTheta + deltaTheta);
                                    if (s0 != null && s1 != null) return formatSkillGain(s1 - s0);
                                  }
                                  return formatSkillGain(deltaTheta);
                                })()}
                              </span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                exp:{" "}
                                {(() => {
                                  if (mode === "lerp") {
                                    const s0 = toScale(playerTheta);
                                    const s1 = toScale(playerTheta + deltaTheta);
                                    if (s0 != null && s1 != null) return formatSkillGain(p * (s1 - s0));
                                  }
                                  return formatSkillGain(expectedGain);
                                })()}
                              </span>
                            </div>
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
                                  ? `>${format(getCensoredDisplayBound(chart.b_hard_display, chartMaxTheta?.get(chart.id)))}?`
                                  : format(chart.b_hard_display)
                                : chart.n_vhard === 0
                                ? `>${format(getCensoredDisplayBound(chart.b_vhard_display, chartMaxTheta?.get(chart.id)))}?`
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
                        <TableCell
                          colSpan={rivalPlayer ? 8 : 7}
                          style={{ height: `${horizonPaddingBottom}px`, padding: 0, border: 0 }}
                        />
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
  sortKey: HorizonSortKey;
  currentKey: HorizonSortKey;
  currentDir: "asc" | "desc";
  onSort: (key: HorizonSortKey) => void;
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
  deltaTheta,
  expectedGain,
  onClick,
  formatFn,
  mode,
  targetStatus,
  chartMaxTheta,
  onClearStatusChange,
  toScaleFn,
  playerTheta,
}: {
  chart: Chart;
  p: number;
  lamp?: number | null;
  deltaTheta?: number;
  expectedGain?: number;
  onClick: () => void;
  formatFn: (val: number | null | undefined) => string;
  mode: string;
  targetStatus: "HARD" | "V-HARD";
  chartMaxTheta?: Map<number, number> | null;
  onClearStatusChange?: (chartId: number, status: number) => void;
  toScaleFn?: (val: number | null | undefined) => number | null;
  playerTheta?: number;
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
            p >= 0.8
              ? "text-emerald-400"
              : p >= 0.5
              ? "text-cyan-400"
              : p >= 0.2
              ? "text-amber-400"
              : "text-muted-foreground"
          )}
        >
          {fmtPct(p)}
        </span>
      </div>
      <div className="h-1.5 rounded-sm bg-muted/80 overflow-hidden border border-border/40">
        <div
          className={cn(
            "h-full rounded-sm transition-all",
            p >= 0.8
              ? "bg-emerald-400"
              : p >= 0.5
              ? "bg-cyan-400"
              : p >= 0.2
              ? "bg-amber-400"
              : "bg-muted-foreground"
          )}
          style={{ width: `${Math.min(100, Math.max(0, p * 100))}%` }}
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
                ? `>${formatFn(getCensoredDisplayBound(chart.b_hard_display, chartMaxTheta?.get(chart.id)))}?`
                : formatFn(chart.b_hard_display)
              : chart.n_vhard === 0
              ? `>${formatFn(getCensoredDisplayBound(chart.b_vhard_display, chartMaxTheta?.get(chart.id)))}?`
              : formatFn(chart.b_vhard_display)}
          </span>
        </span>
        <span>a: {chart.a != null ? chart.a.toFixed(2) : "–"}</span>
      </div>
      {deltaTheta !== undefined && deltaTheta > 0.00005 && (
        <div className="flex items-center justify-between pt-1.5 border-t border-border/40 text-[10px] font-mono">
          <div className="flex items-center gap-1 text-emerald-400 font-semibold">
            <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="tabular-nums">
              {(() => {
                if (mode === "lerp" && toScaleFn && playerTheta != null) {
                  const s0 = toScaleFn(playerTheta);
                  const s1 = toScaleFn(playerTheta + deltaTheta);
                  if (s0 != null && s1 != null) return formatSkillGain(s1 - s0);
                }
                return formatSkillGain(deltaTheta);
              })()}{" "}
              <span className="text-[9px] text-muted-foreground font-normal">
                {mode === "lerp" ? "U_E" : "θ"}
              </span>
            </span>
          </div>
          <span className="text-muted-foreground tabular-nums">
            exp:{" "}
            {(() => {
              if (mode === "lerp" && toScaleFn && playerTheta != null) {
                const s0 = toScaleFn(playerTheta);
                const s1 = toScaleFn(playerTheta + deltaTheta);
                if (s0 != null && s1 != null) return formatSkillGain(p * (s1 - s0));
              }
              return formatSkillGain(expectedGain ?? p * deltaTheta);
            })()}
          </span>
        </div>
      )}
    </button>
  );
}

function ProbabilityBadge({ p }: { p: number }) {
  const meta =
    p >= 0.8
      ? { text: "text-emerald-400", bar: "bg-emerald-400" }
      : p >= 0.5
      ? { text: "text-cyan-400", bar: "bg-cyan-400" }
      : p >= 0.2
      ? { text: "text-amber-400", bar: "bg-amber-400" }
      : { text: "text-muted-foreground", bar: "bg-muted-foreground" };

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden sm:block w-10 h-1.5 bg-muted/70 rounded-full overflow-hidden border border-border/40">
        <div
          className={cn("h-full rounded-full transition-all", meta.bar)}
          style={{ width: `${Math.min(100, Math.max(0, p * 100))}%` }}
        />
      </div>
      <span className={cn("font-mono font-semibold tabular-nums text-xs", meta.text)}>
        {fmtPct(p)}
      </span>
    </div>
  );
}
