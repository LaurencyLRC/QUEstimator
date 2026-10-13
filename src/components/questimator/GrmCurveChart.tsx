"use client";

import { useMemo } from "react";
import { pStar } from "@/lib/questimator-types";
import { useScale } from "@/lib/value-scale";
import { useLang } from "@/lib/i18n";

interface Props {
  a: number;
  b_hard: number;
  b_vhard: number;
  b_normal?: number;
  showNormal?: boolean;
  width?: number;
  height?: number;
  /**
   * Optional: a player's latent skill θ. When provided, a vertical marker
   * line is drawn at this θ so users can see where the player sits relative
   * to the survival curves.
   */
  playerTheta?: number;
}

/**
 * GRM P*(θ) curve chart for a single chart.
 * Shows the cumulative survival probabilities for HARD/V-HARD
 * gauges across the player skill (θ) axis. NORMAL is hidden by default
 * due to being irrelevant (lax gauge mechanics).
 */
export function GrmCurveChart({
  a,
  b_hard,
  b_vhard,
  b_normal,
  showNormal = false,
  playerTheta,
  width = 560,
  height = 280,
}: Props) {
  const { mode, format } = useScale();
  const { t } = useLang();
  
  const PAD = { top: 16, right: 16, bottom: 36, left: 44 };
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const bn = b_normal ?? (showNormal ? b_hard - 1.2 : undefined);
  const minThreshold = Math.min(b_hard, bn ?? b_hard);
  const maxThreshold = b_vhard;

  const effectiveMin = playerTheta != null && Number.isFinite(playerTheta)
    ? Math.min(minThreshold, playerTheta)
    : minThreshold;
  const effectiveMax = playerTheta != null && Number.isFinite(playerTheta)
    ? Math.max(maxThreshold, playerTheta)
    : maxThreshold;

  const thetaMin = Math.min(-4, Math.floor(effectiveMin - 0.5));
  const thetaMax = Math.max(4, Math.ceil(effectiveMax + 0.5));

  const xScale = (t: number) =>
    PAD.left + ((t - thetaMin) / (thetaMax - thetaMin)) * innerW;
  const yScale = (p: number) => PAD.top + innerH - p * innerH;

  const N = 80;
  const pts = useMemo(() => {
    const arr: { t: number; pn?: number; ph: number; pv: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const t = thetaMin + (i / N) * (thetaMax - thetaMin);
      arr.push({
        t,
        pn: showNormal && bn != null ? pStar(t, a, bn) : undefined,
        ph: pStar(t, a, b_hard),
        pv: pStar(t, a, b_vhard),
      });
    }
    return arr;
  }, [a, b_hard, b_vhard, bn, showNormal, thetaMin, thetaMax]);

  const pathFor = (key: "pn" | "ph" | "pv") =>
    pts
      .filter((p) => p[key] != null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.t).toFixed(2)} ${yScale(p[key]!).toFixed(2)}`)
      .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = useMemo(() => {
    const span = thetaMax - thetaMin;
    const step = span > 9 ? 2 : 1;
    const ticks: number[] = [];
    const start = Math.ceil(thetaMin / step) * step;
    for (let t = start; t <= thetaMax; t += step) {
      ticks.push(t);
    }
    return ticks;
  }, [thetaMin, thetaMax]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Grid */}
      {yTicks.map((tick) => {
        const y = yScale(tick);
        return (
          <g key={`yg-${tick}`}>
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
              {tick.toFixed(2)}
            </text>
          </g>
        );
      })}
      {xTicks.map((tk) => {
        const x = xScale(tk);
        return (
          <g key={`xg-${tk}`}>
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
              {mode === "lerp" ? format(tk, 1) : (tk >= 0 ? `+${tk}` : tk)}
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
        stroke="var(--color-lamp-hard)"
        strokeOpacity={0.5}
        strokeDasharray="3 3"
      />
      <line
        x1={xScale(b_vhard)}
        y1={PAD.top}
        x2={xScale(b_vhard)}
        y2={height - PAD.bottom}
        stroke="var(--color-lamp-vhard)"
        strokeOpacity={0.5}
        strokeDasharray="3 3"
      />

      {/* Player θ marker (overlay). Clamped to the visible range */}
      {playerTheta != null && Number.isFinite(playerTheta) && (
        <g>
          {(() => {
            const clamped = Math.max(thetaMin, Math.min(thetaMax, playerTheta));
            const x = xScale(clamped);
            const pH = pStar(playerTheta, a, b_hard);
            const pV = pStar(playerTheta, a, b_vhard);
            const yH = yScale(Math.max(0, Math.min(1, pH)));
            const yV = yScale(Math.max(0, Math.min(1, pV)));
            return (
              <>
                <line
                  x1={x}
                  y1={PAD.top}
                  x2={x}
                  y2={height - PAD.bottom}
                  stroke="var(--color-telemetry-cyan)"
                  strokeWidth={1.8}
                />
                {/* P*(HARD) dot on the HARD curve */}
                <circle
                  cx={x}
                  cy={yH}
                  r={3.5}
                  fill="var(--color-lamp-hard)"
                  stroke="white"
                  strokeWidth={1}
                />
                {/* P*(V-HARD) dot on the V-HARD curve */}
                <circle
                  cx={x}
                  cy={yV}
                  r={3.5}
                  fill="var(--color-lamp-vhard)"
                  stroke="white"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={PAD.top - 2}
                  textAnchor="middle"
                  fontSize={10}
                  className="fill-foreground font-semibold"
                  fontFamily="var(--font-geist-mono)"
                >
                  {mode === "lerp" ? format(playerTheta, 1) : `θ=${playerTheta >= 0 ? `+${playerTheta.toFixed(2)}` : playerTheta.toFixed(2)}`}
                </text>
              </>
            );
          })()}
        </g>
      )}

      {/* Curves */}
      {showNormal && (
        <path d={pathFor("pn")} fill="none" stroke="var(--color-lamp-normal)" strokeWidth={2} />
      )}
      <path d={pathFor("ph")} fill="none" stroke="var(--color-lamp-hard)" strokeWidth={2.2} />
      <path d={pathFor("pv")} fill="none" stroke="var(--color-lamp-vhard)" strokeWidth={2.2} />

      {/* Axis lines */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={height - PAD.bottom} stroke="currentColor" strokeOpacity={0.3} />
      <line x1={PAD.left} y1={height - PAD.bottom} x2={width - PAD.right} y2={height - PAD.bottom} stroke="currentColor" strokeOpacity={0.3} />

      {/* Axis labels */}
      <text x={width / 2} y={height - 6} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
        {t.histogramXAxis(mode === 'lerp')}
      </text>
      <text
        x={14}
        y={height / 2}
        textAnchor="middle"
        fontSize={11}
        className="fill-muted-foreground"
        transform={`rotate(-90 14 ${height / 2})`}
      >
        {t.grmSurvivalProb}
      </text>
    </svg>
  );
}