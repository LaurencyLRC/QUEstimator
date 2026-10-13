"use client";

import { useState } from "react";
import type { PlayerHistoryPoint } from "@/lib/questimator-types";
import { useScale } from "@/lib/value-scale";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TrendingUp, Calendar, Trophy } from "lucide-react";

interface Props {
  history: PlayerHistoryPoint[];
  currentTheta?: number;
  width?: number;
  height?: number;
}

export function SkillProgressionChart({
  history,
  width = 600,
  height = 220,
}: Props) {
  const { mode, toScale, format } = useScale();
  const { t } = useLang();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!history || history.length < 2) {
    return null;
  }

  const PAD = { top: 24, right: 28, bottom: 36, left: 46 };
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  // Map each point to scaled ability value
  const points = history.map((p) => {
    const val = mode === "lerp" ? (toScale(p.theta) ?? p.theta) : p.theta;
    return {
      date: p.date,
      theta: p.theta,
      val,
      clears: p.clears,
    };
  });

  const vals = points.map((p) => p.val);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const valSpan = Math.max(0.4, maxVal - minVal);
  const yMin = minVal - valSpan * 0.12;
  const yMax = maxVal + valSpan * 0.12;

  const xScale = (i: number) =>
    PAD.left + (i / Math.max(1, points.length - 1)) * innerW;
  const yScale = (v: number) =>
    PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  // Generate SVG path strings
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(p.val).toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L ${xScale(points.length - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${xScale(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

  // Career Gain metric
  const startVal = points[0].val;
  const latestVal = points[points.length - 1].val;
  const careerGain = latestVal - startVal;
  const careerGainSign = careerGain >= 0 ? "+" : "";

  // Select evenly spaced X-axis labels
  const labelIndices: number[] = [];
  const maxLabels = Math.min(6, points.length);
  for (let i = 0; i < maxLabels; i++) {
    const idx = Math.round((i / (maxLabels - 1)) * (points.length - 1));
    if (!labelIndices.includes(idx)) labelIndices.push(idx);
  }

  // Generate 4 horizontal grid ticks
  const yTicks = [0, 0.33, 0.67, 1].map((f) => yMin + f * (yMax - yMin));

  const activePoint = hoverIndex !== null ? points[hoverIndex] : points[points.length - 1];
  const activeX = hoverIndex !== null ? xScale(hoverIndex) : xScale(points.length - 1);
  const activeY = hoverIndex !== null ? yScale(activePoint.val) : yScale(activePoint.val);

  return (
    <div className="space-y-3">
      {/* Telemetry Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-telemetry-cyan/15 text-telemetry-cyan border border-telemetry-cyan/30">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-semibold text-foreground">{t.skillProgression}</span>
            <span className="text-muted-foreground ml-2 text-[11px] font-mono">
              {t.timelineSpan(points[0].date, points[points.length - 1].date, points.length)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <span className="text-muted-foreground text-[11px]">{t.careerGain}:</span>
          <span
            className={cn(
              "font-bold text-xs px-2 py-0.5 rounded border",
              careerGain >= 0
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                : "bg-rose-500/15 text-rose-400 border-rose-500/40"
            )}
          >
            {careerGainSign}{careerGain.toFixed(2)} {mode === "lerp" ? "Level" : "θ"}
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative rounded-md border border-border/60 bg-muted/20 p-2 overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = (e.clientX - rect.left) * (width / rect.width);
            const clampedX = Math.max(PAD.left, Math.min(width - PAD.right, relX));
            const frac = (clampedX - PAD.left) / innerW;
            const nearestIdx = Math.round(frac * (points.length - 1));
            setHoverIndex(nearestIdx);
          }}
        >
          <defs>
            <linearGradient id="skillProgressionGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-telemetry-cyan)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-telemetry-cyan)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-labels */}
          {yTicks.map((yTickVal, idx) => {
            const y = yScale(yTickVal);
            return (
              <g key={`y-grid-${idx}`}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={width - PAD.right}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                  strokeDasharray="2 3"
                />
                <text
                  x={PAD.left - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] font-mono tabular-nums"
                >
                  {format(yTickVal, mode === "lerp" ? 1 : 2)}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          <path d={areaPath} fill="url(#skillProgressionGradient)" />

          {/* Progression Line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-telemetry-cyan)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Baseline dots */}
          {points.map((p, i) => (
            <circle
              key={`dot-${i}`}
              cx={xScale(i)}
              cy={yScale(p.val)}
              r="3.5"
              className="fill-background stroke-telemetry-cyan"
              strokeWidth="1.75"
            />
          ))}

          {/* X-axis tick labels */}
          {labelIndices.map((idx) => {
            const x = xScale(idx);
            return (
              <g key={`x-tick-${idx}`}>
                <line
                  x1={x}
                  y1={PAD.top + innerH}
                  x2={x}
                  y2={PAD.top + innerH + 4}
                  stroke="currentColor"
                  strokeOpacity={0.2}
                />
                <text
                  x={x}
                  y={PAD.top + innerH + 16}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-mono"
                >
                  {points[idx].date}
                </text>
              </g>
            );
          })}

          {/* Active Hover Needle & Highlights */}
          {activePoint && (
            <g>
              <line
                x1={activeX}
                y1={PAD.top}
                x2={activeX}
                y2={PAD.top + innerH}
                stroke="var(--color-telemetry-cyan)"
                strokeOpacity={0.75}
                strokeDasharray="3 3"
              />
              <circle
                cx={activeX}
                cy={activeY}
                r="5.5"
                className="fill-telemetry-cyan stroke-background"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Hover Snapshot Tooltip Card */}
        {activePoint && (
          <div
            className="pointer-events-none absolute top-3 right-3 rounded border border-telemetry-cyan/50 bg-card/95 backdrop-blur p-2.5 font-mono shadow-md text-xs space-y-1 z-10"
          >
            <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground border-b border-border/40 pb-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-telemetry-cyan" />
                <span>{activePoint.date}</span>
              </span>
              <span className="text-foreground font-semibold">
                {activePoint.clears} {t.clears}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-0.5">
              <span className="text-[11px] text-muted-foreground font-sans">
                {t.progressionTooltipAbility}:
              </span>
              <span className="text-sm font-bold text-telemetry-cyan tabular-nums">
                {format(activePoint.val, mode === "lerp" ? 2 : 3)}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  {mode === "lerp" ? "Level" : "θ"}
                </span>
              </span>
            </div>
            {activePoint !== points[0] && (
              <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground pt-0.5">
                <span>{t.progressionDeltaStart}:</span>
                <span
                  className={cn(
                    "font-bold tabular-nums",
                    activePoint.val - points[0].val >= 0 ? "text-emerald-400" : "text-rose-400"
                  )}
                >
                  {activePoint.val - points[0].val >= 0 ? "+" : ""}
                  {(activePoint.val - points[0].val).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
