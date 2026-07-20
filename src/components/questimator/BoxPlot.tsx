"use client";

import { useMemo, useState, useCallback } from "react";
import type { LevelSummary } from "@/lib/questimator-types";
import { levelSortKey } from "@/lib/questimator-types";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";

interface Props {
  data: LevelSummary[];
  onSelectLevel?: (level: string) => void;
}

export function BoxPlot({ data, onSelectLevel }: Props) {
  const { t } = useLang();
  const { mode, toScale, format } = useScale();
  const [hovered, setHovered] = useState<string | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);

  const sorted = useMemo(
    () => [...data].sort((a, b) => {
      const [ax, ay] = levelSortKey(a.level);
      const [bx, by] = levelSortKey(b.level);
      return ax - bx || ay - by;
    }),
    [data]
  );

  const mapped = useMemo(() => sorted.map(d => ({
    ...d,
    hard_median: toScale(d.hard_median),
    hard_q1: toScale(d.hard_q1),
    hard_q3: toScale(d.hard_q3),
    vhard_median: toScale(d.vhard_median),
    vhard_q1: toScale(d.vhard_q1),
    vhard_q3: toScale(d.vhard_q3),
  })), [sorted, toScale]);

  const W = 1100;
  const H = 520;
  const PAD = { top: 40, right: 40, bottom: 80, left: 70 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const allVals: number[] = [];
  for (const d of mapped) {
    if (d.hard_q1 != null) allVals.push(d.hard_q1, d.hard_q3 ?? d.hard_q1);
    if (d.vhard_q1 != null) allVals.push(d.vhard_q1, d.vhard_q3 ?? d.vhard_q1);
  }
  if (allVals.length === 0) allVals.push(mode === "lerp" ? 20 : -3, mode === "lerp" ? 31 : 3);
  let yMin = Math.min(...allVals);
  let yMax = Math.max(...allVals);
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad;
  yMax += yPad;

  const yScale = (v: number) =>
    PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const slotW = innerW / mapped.length;
  const xCenter = (i: number) => PAD.left + slotW * (i + 0.5);
  
  const boxW = Math.min(slotW * 0.64, 32);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = mode === "lerp" ? (yMax - yMin <= 15 ? 1 : 2) : (yMax - yMin <= 6 ? 1 : 2);
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMin, yMax, mode]);

  const handleEnter = useCallback((level: string) => {
    setHovered(level);
  }, []);

  const handleMove = useCallback((e: React.MouseEvent) => {
    setTipPos({ x: e.clientX + 12, y: e.clientY + 12 });
  }, []);

  const handleLeave = useCallback(() => {
    setHovered(null);
    setTipPos(null);
  }, []);

  const hoveredRawData = useMemo(
    () => sorted.find((d) => d.level === hovered) ?? null,
    [sorted, hovered]
  );

  return (
    <div className="w-full overflow-x-auto relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto min-w-[800px]"
        style={{ maxHeight: 560 }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {/* Background grid */}
        {yTicks.map((t_val) => {
          const y = yScale(t_val);
          return (
            <g key={`grid-${t_val}`}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize={11}
                fontFamily="var(--font-geist-mono)"
              >
                {mode === "raw" ? (t_val >= 0 ? `+${t_val.toFixed(0)}` : t_val.toFixed(0)) : t_val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Y-axis label */}
        <text
          x={20}
          y={H / 2}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={12}
          transform={`rotate(-90 20 ${H / 2})`}
        >
          {t.yAxisLabel(mode === "lerp")}
        </text>

        {/* Boxes */}
        {mapped.map((d, i) => {
          const cx = xCenter(i);
          
          const hardX = cx - boxW / 2;
          const vhardX = cx - boxW / 2;
          
          const hasHard = d.hard_median != null && d.hard_q1 != null && d.hard_q3 != null;
          const hasVhard = d.vhard_median != null && d.vhard_q1 != null && d.vhard_q3 != null;
          
          const isDimmed = hovered !== null && hovered !== d.level;
          const dimOpacity = isDimmed ? 0.2 : 1;
          
          return (
            <g key={`lvl-${d.level}`}>
              {/* Transparent click target covering the whole column slot */}
              <rect
                x={PAD.left + i * slotW}
                y={PAD.top}
                width={slotW}
                height={innerH + 50}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={() => onSelectLevel?.(d.level)}
                onMouseEnter={() => handleEnter(d.level)}
              />
              
              {/* V-HARD box (purple) */}
              {hasVhard && (
                <g pointerEvents="none" opacity={dimOpacity}>
                  <rect
                    x={vhardX}
                    y={yScale(d.vhard_q3!)}
                    width={boxW}
                    height={Math.max(2, yScale(d.vhard_q1!) - yScale(d.vhard_q3!))}
                    fill="oklch(0.62 0.22 305)"
                    fillOpacity={0.55}
                    stroke="oklch(0.70 0.22 305)"
                    strokeWidth={1.2}
                    rx={2}
                  />
                  <line
                    x1={vhardX - 2}
                    y1={yScale(d.vhard_median!)}
                    x2={vhardX + boxW + 2}
                    y2={yScale(d.vhard_median!)}
                    stroke="oklch(0.92 0.10 305)"
                    strokeWidth={2}
                  />
                </g>
              )}
              
              {/* HARD box (red) */}
              {hasHard && (
                <g pointerEvents="none" opacity={dimOpacity}>
                  <rect
                    x={hardX}
                    y={yScale(d.hard_q3!)}
                    width={boxW}
                    height={Math.max(2, yScale(d.hard_q1!) - yScale(d.hard_q3!))}
                    fill="oklch(0.62 0.22 25)"
                    fillOpacity={0.55}
                    stroke="oklch(0.70 0.22 25)"
                    strokeWidth={1.2}
                    rx={2}
                  />
                  <line
                    x1={hardX - 2}
                    y1={yScale(d.hard_median!)}
                    x2={hardX + boxW + 2}
                    y2={yScale(d.hard_median!)}
                    stroke="oklch(0.95 0.10 25)"
                    strokeWidth={2}
                  />
                </g>
              )}
              
              <text
                x={cx}
                y={H - PAD.bottom + 16}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={11}
                fontFamily="var(--font-geist-mono)"
                pointerEvents="none"
                opacity={isDimmed ? 0.35 : 1}
              >
                {d.level}
              </text>
            </g>
          );
        })}

        {/* X-axis label */}
        <text
          x={W / 2}
          y={H - 8}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={12}
        >
          {t.xAxisLabel}
        </text>

        {/* Legend */}
        <g transform={`translate(${PAD.left}, 12)`}>
          <rect
            x={0}
            y={0}
            width={18}
            height={12}
            fill="oklch(0.62 0.22 25)"
            fillOpacity={0.55}
            stroke="oklch(0.70 0.22 25)"
            strokeWidth={1.2}
            rx={2}
          />
          <text x={24} y={10} fontSize={11} className="fill-foreground">
            {t.legendHard}
          </text>
          <rect
            x={110}
            y={0}
            width={18}
            height={12}
            fill="oklch(0.62 0.22 305)"
            fillOpacity={0.55}
            stroke="oklch(0.70 0.22 305)"
            strokeWidth={1.2}
            rx={2}
          />
          <text x={134} y={10} fontSize={11} className="fill-foreground">
            {t.legendVhard}
          </text>
        </g>

        {/* Axes */}
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={H - PAD.bottom}
          stroke="currentColor"
          strokeOpacity={0.3}
        />
        <line
          x1={PAD.left}
          y1={H - PAD.bottom}
          x2={W - PAD.right}
          y2={H - PAD.bottom}
          stroke="currentColor"
          strokeOpacity={0.3}
        />
      </svg>

      {/* Floating tooltip using the original Raw data, mapped via format() */}
      {hovered && hoveredRawData && tipPos && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-border/60 bg-card/95 backdrop-blur-sm shadow-xl px-3 py-2.5 text-xs"
          style={{ left: tipPos.x, top: tipPos.y }}
        >
          <div className="font-semibold text-foreground mb-1.5 font-mono">
            {hoveredRawData.level}
          </div>
          
          {hoveredRawData.vhard_median != null && (
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: "oklch(0.62 0.22 305)" }} />
              <span className="text-muted-foreground w-12">V-HARD</span>
              <span className="font-mono text-foreground">{format(hoveredRawData.vhard_median)}</span>
              <span className="font-mono text-muted-foreground text-[10px]">
                [{format(hoveredRawData.vhard_q1)}, {format(hoveredRawData.vhard_q3)}]
              </span>
            </div>
          )}
          
          {hoveredRawData.hard_median != null && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: "oklch(0.62 0.22 25)" }} />
              <span className="text-muted-foreground w-12">HARD</span>
              <span className="font-mono text-foreground">{format(hoveredRawData.hard_median)}</span>
              <span className="font-mono text-muted-foreground text-[10px]">
                [{format(hoveredRawData.hard_q1)}, {format(hoveredRawData.hard_q3)}]
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}