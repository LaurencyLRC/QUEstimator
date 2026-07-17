"use client";

import { useMemo, useState, useCallback } from "react";
import type { LevelSummary } from "@/lib/questimator-types";
import { levelSortKey } from "@/lib/questimator-types";
import { useLang } from "@/lib/i18n";

interface Props {
  data: LevelSummary[];
  onSelectLevel?: (level: string) => void;
}

function fmt(v: number | null): string {
  if (v == null) return "–";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

/**
 * Dual-overlay Box Plot:
 *   X-axis: nominal U_E level (1..30 + specials)
 *   Y-axis: raw difficulty (logits)
 *   Red boxes = HARD clear difficulty (Q1, median, Q3)
 *   Purple boxes = V-HARD clear difficulty (Q1, median, Q3)
 *
 * Interactive enhancements:
 *   – Hovering a column dims all other columns.
 *   – A fixed-position tooltip follows the cursor with exact median + IQR.
 */
export function BoxPlot({ data, onSelectLevel }: Props) {
  const { t } = useLang();
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

  const W = 1100;
  const H = 520;
  const PAD = { top: 40, right: 40, bottom: 80, left: 70 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const allVals: number[] = [];
  for (const d of sorted) {
    if (d.hard_q1 != null) allVals.push(d.hard_q1, d.hard_q3 ?? d.hard_q1);
    if (d.vhard_q1 != null) allVals.push(d.vhard_q1, d.vhard_q3 ?? d.vhard_q1);
  }
  if (allVals.length === 0) allVals.push(-3, 3);
  let yMin = Math.min(...allVals);
  let yMax = Math.max(...allVals);
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad;
  yMax += yPad;

  const yScale = (v: number) =>
    PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const slotW = innerW / sorted.length;
  const xCenter = (i: number) => PAD.left + slotW * (i + 0.5);
  
  const boxW = Math.min(slotW * 0.64, 32);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = yMax - yMin <= 6 ? 1 : 2;
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMin, yMax]);

  const handleEnter = useCallback((level: string) => {
    setHovered(level);
  }, []);

  const handleMove = useCallback((e: React.MouseEvent) => {
    setTipPos({ x: e.clientX + 12, y: e.clientY + 12 });
  }, []);

  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const hoveredData = useMemo(
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
        {yTicks.map((t) => {
          const y = yScale(t);
          return (
            <g key={`grid-${t}`}>
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
                {t >= 0 ? `+${t.toFixed(0)}` : t.toFixed(0)}
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
          {t.yAxisLabel}
        </text>

        {/* Boxes */}
        {sorted.map((d, i) => {
          const cx = xCenter(i);
          
          // Aligned both boxes to the exact center of the level column
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
                onMouseLeave={handleLeave}
              >
                <title>{t.tooltipValid(d.level, d.n_charts_valid, d.n_charts_total)}</title>
              </rect>
              
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

      {/* Floating tooltip */}
      {hovered && hoveredData && tipPos && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-border/60 bg-card/95 backdrop-blur-sm shadow-xl px-3 py-2.5 text-xs"
          style={{ left: tipPos.x, top: tipPos.y }}
        >
          <div className="font-semibold text-foreground mb-1.5 font-mono">
            {hoveredData.level}
          </div>
          <div className="text-muted-foreground mb-2">
            Charts {hoveredData.n_charts_valid}/{hoveredData.n_charts_total}
          </div>
          
          {hoveredData.hard_median != null && (
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: "oklch(0.62 0.22 25)" }} />
              <span className="text-muted-foreground w-12">{t.legendHard}</span>
              <span className="font-mono text-foreground">{fmt(hoveredData.hard_median)}</span>
              <span className="font-mono text-muted-foreground text-[10px]">
                [{fmt(hoveredData.hard_q1)}, {fmt(hoveredData.hard_q3)}]
              </span>
            </div>
          )}
          
          {hoveredData.vhard_median != null && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: "oklch(0.62 0.22 305)" }} />
              <span className="text-muted-foreground w-12">{t.legendVhard}</span>
              <span className="font-mono text-foreground">{fmt(hoveredData.vhard_median)}</span>
              <span className="font-mono text-muted-foreground text-[10px]">
                [{fmt(hoveredData.vhard_q1)}, {fmt(hoveredData.vhard_q3)}]
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
