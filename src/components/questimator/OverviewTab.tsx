"use client";

import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BoxPlot } from "@/components/questimator/BoxPlot";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import {
  isSpecialLevel,
  type LevelSummary,
  type Meta,
  type SamplePlayers,
} from "@/lib/questimator-types";

interface OverviewTabProps {
  chartsCount: number;
  playersCount: number | null;
  meta: Meta | null;
  samplePlayers: SamplePlayers | null;
  plotLevels: LevelSummary[];
  onSelectLevel: (level: string) => void;
}

export function OverviewTab({
  chartsCount,
  playersCount,
  meta,
  samplePlayers,
  plotLevels,
  onSelectLevel,
}: OverviewTabProps) {
  const { t } = useLang();
  const displayPlayersCount = playersCount ?? meta?.n_players ?? null;
  const displayThetaMean = samplePlayers?.theta_mean ?? meta?.player_theta_mean;

  return (
    <div className="space-y-6">
      {/* Unified Console Telemetry Strip */}
      <div className="rounded-lg border border-border/80 bg-card/60 divide-y lg:divide-y-0 lg:divide-x divide-border/60 grid grid-cols-2 lg:grid-cols-4">
        <div className="p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground font-medium">
            {t.lang === "en" ? "Valid Charts" : "유효 채보"}
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-foreground mt-2">
            {meta?.n_charts_valid ?? chartsCount}
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
            {displayPlayersCount != null ? displayPlayersCount.toLocaleString() : "..."}
            <span className="text-xs text-muted-foreground font-normal ml-1.5">
              (μ={displayThetaMean != null ? displayThetaMean.toFixed(2) : "0.05"})
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
            <span>{t.lang === "en" ? "MCMC Convergence" : "MCMC 수렴도"}</span>
            <span
              className={cn(
                "text-[10px] font-mono font-semibold",
                (meta?.convergence?.convergence_ok ?? true)
                  ? "text-emerald-400"
                  : "text-amber-400"
              )}
            >
              {(meta?.convergence?.convergence_ok ?? true)
                ? `PASS (≤ ${meta?.convergence?.r_hat_threshold ?? 1.05})`
                : `WARN (> ${meta?.convergence?.r_hat_threshold ?? 1.05})`}
            </span>
          </div>
          <div
            className={cn(
              "text-xl font-bold font-mono tabular-nums mt-2",
              (meta?.convergence?.convergence_ok ?? true)
                ? "text-emerald-400"
                : "text-amber-400"
            )}
          >
            R̂ = {meta?.convergence?.r_hat_max ? meta.convergence.r_hat_max.toFixed(4) : "–"}
          </div>
        </div>

        <div className="p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground font-medium">
            {t.lang === "en" ? "IRT Model" : "IRT 모델"}
          </div>
          <div className="text-sm font-bold text-telemetry-cyan mt-2">
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
              <span className="text-foreground text-xs font-mono">HARD (b_hard)</span>
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted/40 border border-border/60">
              <span className="w-2.5 h-2.5 rounded-sm bg-lamp-vhard" />
              <span className="text-foreground text-xs font-mono">V-HARD (b_vhard)</span>
            </span>
          </div>
        </div>

        <BoxPlot data={plotLevels} onSelectLevel={onSelectLevel} />
      </div>

      {/* Level Aggregates Table Panel */}
      <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6">
        <div className="mb-4 pb-3 border-b border-border/40 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {t.perLevelAggregates}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{t.perLevelDesc}</p>
          </div>
        </div>
        <LevelAggregatesTable levels={plotLevels} onSelectLevel={onSelectLevel} />
      </div>
    </div>
  );
}

function LevelAggregatesTable({
  levels,
  onSelectLevel,
}: {
  levels: LevelSummary[];
  onSelectLevel: (l: string) => void;
}) {
  const { t } = useLang();
  const { format } = useScale();

  return (
    <div className="max-h-[480px] overflow-y-auto rounded-md border border-border/80 text-xs">
      <table className="w-full">
        <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 font-sans">
          <tr className="border-b border-border text-left">
            <th className="px-3 py-2.5 font-semibold text-muted-foreground">{t.level}</th>
            <th className="px-3 py-2.5 font-semibold text-muted-foreground text-right">{t.chartsCol}</th>
            <th className="px-3 py-2.5 font-semibold text-right text-lamp-hard">{t.hardMed}</th>
            <th className="px-3 py-2.5 font-semibold text-muted-foreground text-right">{t.hardIQR}</th>
            <th className="px-3 py-2.5 font-semibold text-right text-lamp-vhard">{t.vhardMed}</th>
            <th className="px-3 py-2.5 font-semibold text-muted-foreground text-right">{t.vhardIQR}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 font-mono">
          {levels.map((l) => (
            <tr
              key={l.level}
              className="hover:bg-muted/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry-cyan focus-visible:bg-muted/30"
              onClick={() => onSelectLevel(l.level)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectLevel(l.level);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Filter to level ${l.level}`}
            >
              <td className="px-3 py-2.5 font-semibold">
                <span className={isSpecialLevel(l.level) ? "text-amber-400" : "text-foreground"}>
                  {l.level}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                {l.n_charts_valid}{" "}
                <span className="text-xs text-muted-foreground/80 font-sans">/ {l.n_charts_total}</span>
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
