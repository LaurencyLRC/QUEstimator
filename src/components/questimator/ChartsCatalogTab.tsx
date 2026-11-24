"use client";

import { RotateCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChartTable, type SortDir, type SortKey } from "@/components/questimator/ChartTable";
import { useLang } from "@/lib/i18n";
import {
  isSpecialLevel,
  levelLabel,
  type Chart,
  type LevelSummary,
  type PlayerData,
} from "@/lib/questimator-types";

interface ChartsCatalogTabProps {
  charts: Chart[];
  filteredCharts: Chart[];
  sortedLevels: LevelSummary[];
  levelCounts: Map<string, number>;
  selectedLevel: string;
  onSelectLevel: (level: string) => void;
  onSelectChart: (c: Chart) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
  activePlayer: { id: string; data: PlayerData; isCustom?: boolean } | null;
  chartMaxTheta: Map<number, number> | null;
  onClearStatusChange?: (chartId: number, status: number) => void;
}

export function ChartsCatalogTab({
  charts,
  filteredCharts,
  sortedLevels,
  levelCounts,
  selectedLevel,
  onSelectLevel,
  onSelectChart,
  sortKey,
  sortDir,
  onSortChange,
  activePlayer,
  chartMaxTheta,
  onClearStatusChange,
}: ChartsCatalogTabProps) {
  const { t } = useLang();

  return (
    <>
      {/* Mobile horizontal folder pill bar */}
      <div className="md:hidden rounded-lg border border-border/80 bg-card p-3 mb-4">
        <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center justify-between">
          <span>{t.levels}</span>
          <span className="font-mono text-xs text-muted-foreground">
            <span className="text-foreground font-semibold">{sortedLevels.length}</span>{" "}
            {t.lang === "en" ? "folders" : "개 폴더"}
          </span>
        </div>
        <div className="flex overflow-x-auto gap-1.5 pb-1 no-scrollbar">
          <button
            onClick={() => onSelectLevel("all")}
            className={`shrink-0 px-2.5 py-1.5 rounded text-xs font-mono transition-all flex items-center gap-1.5 ${
              selectedLevel === "all"
                ? "bg-muted text-foreground border border-border font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
            }`}
          >
            <span className="font-sans">{t.allCharts}</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-background/80 border border-border/40 tabular-nums">
              {charts.length}
            </span>
          </button>
          {sortedLevels.map((l) => (
            <button
              key={`mob-${l.level}`}
              onClick={() => onSelectLevel(l.level)}
              className={`shrink-0 px-2.5 py-1.5 rounded text-xs font-mono transition-all flex items-center gap-1.5 ${
                selectedLevel === l.level
                  ? "bg-muted text-foreground border border-border font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
              }`}
            >
              {isSpecialLevel(l.level) && <span className="text-amber-400 text-[10px]">●</span>}
              <span>{l.level}</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-background/80 border border-border/40 tabular-nums text-muted-foreground">
                {levelCounts.get(l.level) ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
        {/* Desktop sticky sidebar */}
        <div className="hidden md:block h-fit md:sticky md:top-[74px] rounded-lg border border-border/80 bg-card p-3">
          <div className="px-2 py-1.5 mb-2 border-b border-border/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{t.levels}</span>
            <span className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {sortedLevels.length}
              </span>{" "}
              {t.lang === "en" ? "folders" : "개 폴더"}
            </span>
          </div>
          <ScrollArea className="h-[calc(100vh-220px)] max-h-[640px] pr-2">
            <div className="space-y-1">
              <button
                onClick={() => onSelectLevel("all")}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono transition-all flex items-center justify-between ${
                  selectedLevel === "all"
                    ? "bg-muted text-foreground border border-border font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
                }`}
              >
                <span className="font-sans">{t.allCharts}</span>
                <span className="text-xs px-1.5 py-0.2 rounded bg-background/80 border border-border/40 tabular-nums">
                  {charts.length}
                </span>
              </button>
              {sortedLevels.map((l) => (
                <button
                  key={l.level}
                  onClick={() => onSelectLevel(l.level)}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono transition-all flex items-center justify-between ${
                    selectedLevel === l.level
                      ? "bg-muted text-foreground border border-border font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {isSpecialLevel(l.level) && <span className="text-amber-400 text-xs">●</span>}
                    <span>{l.level}</span>
                  </span>
                  <span className="text-xs px-1.5 py-0.2 rounded bg-background/80 border border-border/40 tabular-nums">
                    {levelCounts.get(l.level) ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between flex-wrap gap-3 p-3 rounded-lg border border-border/80 bg-card">
            <div>
              <h2 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>
                  {selectedLevel === "all" ? t.allChartsTitle : `${levelLabel(selectedLevel)}`}
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-muted border border-border/60 text-muted-foreground tabular-nums">
                  {t.chartsCount(filteredCharts.length)}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.sortBy(t.sortKeys[sortKey], t.sortDirs[sortDir])}
              </p>
            </div>

            {activePlayer && (
              <div className="flex items-center gap-2">
                {activePlayer.isCustom ? (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-telemetry-cyan/10 border border-telemetry-cyan/40 text-xs">
                    <span className="w-2 h-2 rounded-full bg-telemetry-cyan animate-pulse shrink-0" />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-muted-foreground">{t.customProfileActive}:</span>
                      <span className="font-semibold text-foreground">{activePlayer.id}</span>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-telemetry-cyan/20 text-telemetry-cyan font-bold border border-telemetry-cyan/40 flex items-center gap-1"
                        title={t.lampOverrideHint}
                      >
                        <RotateCw className="w-2.5 h-2.5 shrink-0" />
                        <span>{t.lampOverrideActive}</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/60 border border-border/60 text-xs text-muted-foreground">
                    <span>{t.viewingPlayer}</span>
                    <span className="font-semibold text-foreground">{activePlayer.id}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border/60 text-muted-foreground">
                      {t.readOnlyPlayer}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <ChartTable
            charts={filteredCharts}
            onSelectChart={onSelectChart}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
            activePlayer={activePlayer}
            chartMaxTheta={chartMaxTheta}
            onClearStatusChange={activePlayer?.isCustom ? onClearStatusChange : undefined}
          />
        </div>
      </div>
    </>
  );
}
