"use client";

import { TrendingUp, Trophy } from "lucide-react";
import { LampBadge } from "@/components/questimator/LampBadge";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import {
  levelLabel,
  type Chart,
  type PlayerDiagnostics,
} from "@/lib/questimator-types";
import { fmtPct, formatSkillGain } from "./player-utils";

interface PlayerDiagnosticsPanelProps {
  diagnostics: PlayerDiagnostics;
  playerTheta: number;
  onSelectChart: (c: Chart) => void;
}

export function PlayerDiagnosticsPanel({
  diagnostics,
  playerTheta,
  onSelectChart,
}: PlayerDiagnosticsPanelProps) {
  const { t } = useLang();
  const { mode, toScale } = useScale();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Signature Clears (Peak Upsets) */}
      <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-5 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center justify-between pb-2.5 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <h4 className="text-sm font-semibold tracking-tight text-foreground">
                {t.signatureClears}
              </h4>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              Top {diagnostics.signatureClears.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 font-sans">{t.signatureClearsDesc}</p>

          <div className="mt-3 divide-y divide-border/30">
            {diagnostics.signatureClears.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center font-sans">
                {t.noSignatureClears}
              </p>
            ) : (
              diagnostics.signatureClears.map((item) => (
                <div
                  key={item.chart.md5}
                  tabIndex={0}
                  role="button"
                  aria-label={`View chart details for ${item.chart.title}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectChart(item.chart);
                    }
                  }}
                  onClick={() => onSelectChart(item.chart)}
                  className="py-2.5 px-2 -mx-2 rounded hover:bg-muted/40 cursor-pointer transition-colors flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-telemetry-cyan"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <LampBadge status={item.status} variant="short" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium font-jp truncate text-foreground leading-snug">
                        {item.chart.title}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-jp truncate">
                        <span className="font-mono text-amber-400 font-semibold mr-1.5">
                          {levelLabel(item.chart.level)}
                        </span>
                        {item.chart.artist || "unknown"}
                        {item.chart.name_diff && ` · ${item.chart.name_diff}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 font-mono text-right">
                    <span className="text-xs font-bold text-amber-400 tabular-nums">
                      {t.odds(Math.round(item.odds))}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      P = {fmtPct(item.p)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Rating Recovery Targets (Rating Drags) */}
      <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-5 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center justify-between pb-2.5 border-b border-border/40">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-semibold tracking-tight text-foreground">
                {t.ratingDrags}
              </h4>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              Top {diagnostics.ratingDrags.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 font-sans">{t.ratingDragsDesc}</p>

          <div className="mt-3 divide-y divide-border/30">
            {diagnostics.ratingDrags.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center font-sans">
                {t.noRatingDrags}
              </p>
            ) : (
              diagnostics.ratingDrags.map((item) => {
                const gainVal = (() => {
                  if (mode === "lerp") {
                    const s0 = toScale(playerTheta);
                    const s1 = toScale(playerTheta + item.recoveryGain);
                    if (s0 != null && s1 != null) return s1 - s0;
                  }
                  return item.recoveryGain;
                })();
                const expVal = mode === "lerp" ? item.pHard * gainVal : item.expectedRecovery;
                const gainStr = formatSkillGain(gainVal);
                const expStr = formatSkillGain(expVal);

                return (
                  <div
                    key={item.chart.md5}
                    tabIndex={0}
                    role="button"
                    aria-label={`View chart details for ${item.chart.title}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectChart(item.chart);
                      }
                    }}
                    onClick={() => onSelectChart(item.chart)}
                    className="py-2.5 px-2 -mx-2 rounded hover:bg-muted/40 cursor-pointer transition-colors flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-telemetry-cyan"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <LampBadge status={item.currentStatus} variant="short" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium font-jp truncate text-foreground leading-snug">
                          {item.chart.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-jp truncate">
                          <span className="font-mono text-muted-foreground mr-1.5">
                            {levelLabel(item.chart.level)}
                          </span>
                          {item.chart.artist || "unknown"}
                          {item.chart.name_diff && ` · ${item.chart.name_diff}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0 font-mono text-right">
                      <span className="text-xs font-bold text-emerald-400 tabular-nums">
                        {gainStr} {mode === "lerp" ? "U_E" : "θ"}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        P(HARD) {fmtPct(item.pHard)} · exp {expStr}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
