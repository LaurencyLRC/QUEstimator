"use client";

import { useMemo } from "react";
import { pStar } from "@/lib/questimator-types";

interface Props {
  a: number;
  b_hard: number;
  b_vhard: number;
  b_normal?: number;
  width?: number;
  height?: number;
}

/**
 * GRM P*(θ) curve chart for a single chart.
 * Shows the cumulative survival probabilities for NORMAL/HARD/V-HARD
 * gauges across the player skill (θ) axis.
 */
export function GrmCurveChart({
  a,
  b_hard,
  b_vhard,
  b_normal,
  width = 560,
  height = 280,
}: Props) {
  const PAD = { top: 16, right: 16, bottom: 36, left: 44 };
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const thetaMin = -4;
  const thetaMax = 4;
  const xScale = (t: number) =>
    PAD.left + ((t - thetaMin) / (thetaMax - thetaMin)) * innerW;
  const yScale = (p: number) => PAD.top + innerH - p * innerH;

  const N = 80;
  const pts = useMemo(() => {
    const arr: { t: number; pn: number; ph: number; pv: number }[] = [];
    const bn = b_normal ?? b_hard - 1.2;
    for (let i = 0; i <= N; i++) {
      const t = thetaMin + (i / N) * (thetaMax - thetaMin);
      arr.push({
        t,
        pn: pStar(t, a, bn),
        ph: pStar(t, a, b_hard),
        pv: pStar(t, a, b_vhard),
      });
    }
    return arr;
  }, [a, b_hard, b_vhard, b_normal]);

  const pathFor = (key: "pn" | "ph" | "pv") =>
    pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.t).toFixed(2)} ${yScale(p[key]).toFixed(2)}`)
      .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Grid */}
      {yTicks.map((t) => {
        const y = yScale(t);
        return (
          <g key={`yg-${t}`}>
            <line
              x1={PAD.left}
              y1={y}
              x2={width - PAD.right}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={PAD.left - 6}
              y={y + 3}
              textAnchor="end"
              fontSize={10}
              className="fill-muted-foreground"
              fontFamily="var(--font-geist-mono)"
            >
              {t.toFixed(2)}
            </text>
          </g>
        );
      })}
      {xTicks.map((t) => {
        const x = xScale(t);
        return (
          <g key={`xg-${t}`}>
            <line
              x1={x}
              y1={PAD.top}
              x2={x}
              y2={height - PAD.bottom}
              stroke="currentColor"
              strokeOpacity={0.04}
            />
            <text
              x={x}
              y={height - PAD.bottom + 14}
              textAnchor="middle"
              fontSize={10}
              className="fill-muted-foreground"
              fontFamily="var(--font-geist-mono)"
            >
              {t >= 0 ? `+${t}` : t}
            </text>
          </g>
        );
      })}

      {/* 50% reference line */}
      <line
        x1={PAD.left}
        y1={yScale(0.5)}
        x2={width - PAD.right}
        y2={yScale(0.5)}
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeDasharray="4 3"
      />

      {/* Threshold vertical lines */}
      <line
        x1={xScale(b_hard)}
        y1={PAD.top}
        x2={xScale(b_hard)}
        y2={height - PAD.bottom}
        stroke="oklch(0.70 0.22 25)"
        strokeOpacity={0.4}
        strokeDasharray="3 3"
      />
      <line
        x1={xScale(b_vhard)}
        y1={PAD.top}
        x2={xScale(b_vhard)}
        y2={height - PAD.bottom}
        stroke="oklch(0.70 0.22 305)"
        strokeOpacity={0.4}
        strokeDasharray="3 3"
      />

      {/* Curves */}
      <path d={pathFor("pn")} fill="none" stroke="oklch(0.72 0.16 95)" strokeWidth={2} />
      <path d={pathFor("ph")} fill="none" stroke="oklch(0.70 0.22 25)" strokeWidth={2.2} />
      <path d={pathFor("pv")} fill="none" stroke="oklch(0.70 0.22 305)" strokeWidth={2.2} />

      {/* Axis lines */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={height - PAD.bottom} stroke="currentColor" strokeOpacity={0.3} />
      <line x1={PAD.left} y1={height - PAD.bottom} x2={width - PAD.right} y2={height - PAD.bottom} stroke="currentColor" strokeOpacity={0.3} />

      {/* Axis labels */}
      <text x={width / 2} y={height - 6} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
        Player skill θ (logits)
      </text>
      <text
        x={14}
        y={height / 2}
        textAnchor="middle"
        fontSize={11}
        className="fill-muted-foreground"
        transform={`rotate(-90 14 ${height / 2})`}
      >
        P*(θ, k) survival probability
      </text>

      {/* Legend */}
      <g transform={`translate(${PAD.left + 10}, ${PAD.top + 4})`}>
        <line x1={0} y1={6} x2={14} y2={6} stroke="oklch(0.72 0.16 95)" strokeWidth={2} />
        <text x={18} y={9} fontSize={10} className="fill-foreground">NORMAL</text>
        <line x1={78} y1={6} x2={92} y2={6} stroke="oklch(0.70 0.22 25)" strokeWidth={2} />
        <text x={96} y={9} fontSize={10} className="fill-foreground">HARD</text>
        <line x1={146} y1={6} x2={160} y2={6} stroke="oklch(0.70 0.22 305)" strokeWidth={2} />
        <text x={164} y={9} fontSize={10} className="fill-foreground">V-HARD</text>
      </g>
    </svg>
  );
}
