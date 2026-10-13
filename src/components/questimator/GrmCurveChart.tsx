"use client";

import { useState, useMemo } from "react";
import { pStar, itemInformation } from "@/lib/questimator-types";
import { useScale } from "@/lib/value-scale";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  a: number;
  b_hard: number;
  b_vhard: number;
  b_normal?: number;
  se_a?: number | null;
  se_b_hard?: number | null;
  se_b_vhard?: number | null;
  showNormal?: boolean;
  width?: number;
  height?: number;
  /**
   * Optional: a player's latent skill θ. When provided, a vertical marker
   * line is drawn at this θ so users can see where the player sits relative
   * to the survival curves.
   */
  playerTheta?: number;
  rivalTheta?: number | null;
  rivalName?: string;
}

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/**
 * GRM P*(θ) curve chart for a single chart.
 * Shows the cumulative survival probabilities for HARD/V-HARD
 * gauges across the player skill (θ) axis.
 * Supports ±1.96 SE credible interval ribbons, Samejima's Item Information Function I_i(θ),
 * and Head-to-Head rival needle overlay.
 */
export function GrmCurveChart({
  a,
  b_hard,
  b_vhard,
  b_normal,
  se_a,
  se_b_hard,
  se_b_vhard,
  showNormal = false,
  playerTheta,
  rivalTheta,
  rivalName,
  width = 560,
  height = 280,
}: Props) {
  const { mode, format } = useScale();
  const { t } = useLang();

  const hasSE = (se_b_hard != null && se_b_hard > 0) || (se_b_vhard != null && se_b_vhard > 0);
  const [showConfidenceBand, setShowConfidenceBand] = useState(hasSE);
  const [showItemInfo, setShowItemInfo] = useState(false);

  const PAD = { top: 16, right: 16, bottom: 36, left: 44 };
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const bn = b_normal ?? (showNormal ? b_hard - 1.2 : undefined);
  let effectiveMin = Math.min(b_hard, bn ?? b_hard);
  let effectiveMax = b_vhard;

  if (playerTheta != null && Number.isFinite(playerTheta)) {
    effectiveMin = Math.min(effectiveMin, playerTheta);
    effectiveMax = Math.max(effectiveMax, playerTheta);
  }
  if (rivalTheta != null && Number.isFinite(rivalTheta)) {
    effectiveMin = Math.min(effectiveMin, rivalTheta);
    effectiveMax = Math.max(effectiveMax, rivalTheta);
  }

  const thetaMin = Math.min(-4, Math.floor(effectiveMin - 0.5));
  const thetaMax = Math.max(4, Math.ceil(effectiveMax + 0.5));

  const xScale = (tk: number) =>
    PAD.left + ((tk - thetaMin) / (thetaMax - thetaMin)) * innerW;
  const yScale = (p: number) => PAD.top + innerH - p * innerH;

  const N = 80;
  const { pts, maxInfo, peakInfoTheta } = useMemo(() => {
    const arr: {
      t: number;
      pn?: number;
      ph: number;
      pv: number;
      ph_lower?: number;
      ph_upper?: number;
      pv_lower?: number;
      pv_upper?: number;
      info: number;
    }[] = [];

    const se_disc = se_a ?? 0;
    const se_h = se_b_hard ?? 0;
    const se_v = se_b_vhard ?? 0;

    let peakI = 0;
    let peakT = (b_hard + b_vhard) / 2;

    for (let i = 0; i <= N; i++) {
      const curT = thetaMin + (i / N) * (thetaMax - thetaMin);
      const ph = pStar(curT, a, b_hard);
      const pv = pStar(curT, a, b_vhard);

      // Delta method SE on log-odds z = a*(t - b):
      // Var(z) ~= a^2 * Var(b) + (t - b)^2 * Var(a)
      let ph_lower: number | undefined;
      let ph_upper: number | undefined;
      if (se_h > 0 || se_disc > 0) {
        const se_z_h = Math.sqrt((a * se_h) ** 2 + ((curT - b_hard) * se_disc) ** 2);
        const z_h = a * (curT - b_hard);
        ph_lower = sigmoid(z_h - 1.96 * se_z_h);
        ph_upper = sigmoid(z_h + 1.96 * se_z_h);
      }

      let pv_lower: number | undefined;
      let pv_upper: number | undefined;
      if (se_v > 0 || se_disc > 0) {
        const se_z_v = Math.sqrt((a * se_v) ** 2 + ((curT - b_vhard) * se_disc) ** 2);
        const z_v = a * (curT - b_vhard);
        pv_lower = sigmoid(z_v - 1.96 * se_z_v);
        pv_upper = sigmoid(z_v + 1.96 * se_z_v);
      }

      const info = itemInformation(curT, a, b_hard, b_vhard, bn);
      if (info > peakI) {
        peakI = info;
        peakT = curT;
      }

      arr.push({
        t: curT,
        pn: showNormal && bn != null ? pStar(curT, a, bn) : undefined,
        ph,
        pv,
        ph_lower,
        ph_upper,
        pv_lower,
        pv_upper,
        info,
      });
    }

    return { pts: arr, maxInfo: Math.max(0.1, peakI), peakInfoTheta: peakT };
  }, [a, b_hard, b_vhard, bn, se_a, se_b_hard, se_b_vhard, showNormal, thetaMin, thetaMax]);

  const pathFor = (key: "pn" | "ph" | "pv") =>
    pts
      .filter((p) => p[key] != null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.t).toFixed(2)} ${yScale(p[key]!).toFixed(2)}`)
      .join(" ");

  const ribbonFor = (lowerKey: "ph_lower" | "pv_lower", upperKey: "ph_upper" | "pv_upper") => {
    const valid = pts.filter((p) => p[lowerKey] != null && p[upperKey] != null);
    if (valid.length === 0) return "";
    const top = valid
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.t).toFixed(2)} ${yScale(p[upperKey]!).toFixed(2)}`)
      .join(" ");
    const bottom = valid
      .slice()
      .reverse()
      .map((p) => `L ${xScale(p.t).toFixed(2)} ${yScale(p[lowerKey]!).toFixed(2)}`)
      .join(" ");
    return `${top} ${bottom} Z`;
  };

  const infoPath = useMemo(() => {
    if (!showItemInfo || maxInfo <= 0) return "";
    return pts
      .map((p, i) => {
        const normInfo = (p.info / maxInfo) * 0.85;
        return `${i === 0 ? "M" : "L"} ${xScale(p.t).toFixed(2)} ${yScale(normInfo).toFixed(2)}`;
      })
      .join(" ");
  }, [pts, showItemInfo, maxInfo, innerW, innerH]);

  const infoAreaPath = useMemo(() => {
    if (!showItemInfo || maxInfo <= 0) return "";
    const line = pts
      .map((p, i) => {
        const normInfo = (p.info / maxInfo) * 0.85;
        return `${i === 0 ? "M" : "L"} ${xScale(p.t).toFixed(2)} ${yScale(normInfo).toFixed(2)}`;
      })
      .join(" ");
    const baseline = `L ${xScale(thetaMax).toFixed(2)} ${yScale(0).toFixed(2)} L ${xScale(thetaMin).toFixed(2)} ${yScale(0).toFixed(2)} Z`;
    return `${line} ${baseline}`;
  }, [pts, showItemInfo, maxInfo, thetaMin, thetaMax, innerW, innerH]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = useMemo(() => {
    const span = thetaMax - thetaMin;
    const step = span > 9 ? 2 : 1;
    const ticks: number[] = [];
    const start = Math.ceil(thetaMin / step) * step;
    for (let curT = start; curT <= thetaMax; curT += step) {
      ticks.push(curT);
    }
    return ticks;
  }, [thetaMin, thetaMax]);

  return (
    <div className="flex flex-col gap-2">
      {/* Top Legend and Feature Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-sm" style={{ background: "var(--color-lamp-hard)" }} />
            <span className="text-muted-foreground font-sans text-[11px]">HARD</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-sm" style={{ background: "var(--color-lamp-vhard)" }} />
            <span className="text-muted-foreground font-sans text-[11px]">V-HARD</span>
          </span>
          {showItemInfo && (
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-0.5 border-t border-dashed border-amber-400" />
              <span className="font-sans text-[11px]">I(θ)</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                ({t.grmPeakInfo(mode === "lerp" ? format(peakInfoTheta, 1) : peakInfoTheta.toFixed(2), maxInfo.toFixed(2))})
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {hasSE && (
            <button
              type="button"
              onClick={() => setShowConfidenceBand((prev) => !prev)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono transition-colors border",
                showConfidenceBand
                  ? "bg-muted/80 text-foreground border-border/80 font-medium"
                  : "bg-transparent text-muted-foreground border-transparent hover:text-foreground"
              )}
              title={t.grmConfidenceBandDesc}
            >
              {t.grmConfidenceBand}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowItemInfo((prev) => !prev)}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-mono transition-colors border",
              showItemInfo
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30 font-semibold"
                : "bg-transparent text-muted-foreground border-transparent hover:text-foreground"
            )}
            title={t.grmItemInfoDesc}
          >
            {t.grmItemInfo}
          </button>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <defs>
          <linearGradient id="info-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
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

        {/* Item Information Function I_i(θ) Area and Curve */}
        {showItemInfo && (
          <g>
            <path d={infoAreaPath} fill="url(#info-grad)" />
            <path
              d={infoPath}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1.8}
              strokeDasharray="4 3"
            />
            {/* Peak information indicator */}
            <circle
              cx={xScale(peakInfoTheta)}
              cy={yScale((maxInfo / maxInfo) * 0.85)}
              r={3.5}
              fill="#fbbf24"
              stroke="white"
              strokeWidth={1}
            />
          </g>
        )}

        {/* Credible Interval Ribbons (±1.96 SE) */}
        {showConfidenceBand && (
          <g>
            <path
              d={ribbonFor("ph_lower", "ph_upper")}
              fill="var(--color-lamp-hard)"
              fillOpacity={0.12}
            />
            <path
              d={ribbonFor("pv_lower", "pv_upper")}
              fill="var(--color-lamp-vhard)"
              fillOpacity={0.12}
            />
          </g>
        )}

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
                    {mode === "lerp"
                      ? format(playerTheta, 1)
                      : `θ=${playerTheta >= 0 ? `+${playerTheta.toFixed(2)}` : playerTheta.toFixed(2)}`}
                  </text>
                </>
              );
            })()}
          </g>
        )}

        {/* Rival θ marker (overlay, amber dashed line) */}
        {rivalTheta != null && Number.isFinite(rivalTheta) && (
          <g>
            {(() => {
              const clamped = Math.max(thetaMin, Math.min(thetaMax, rivalTheta));
              const x = xScale(clamped);
              const pH = pStar(rivalTheta, a, b_hard);
              const pV = pStar(rivalTheta, a, b_vhard);
              const yH = yScale(Math.max(0, Math.min(1, pH)));
              const yV = yScale(Math.max(0, Math.min(1, pV)));
              const isNearPlayer = playerTheta != null && Math.abs(xScale(playerTheta) - x) < 36;
              const labelY = isNearPlayer ? PAD.top - 12 : PAD.top - 2;
              return (
                <>
                  <line
                    x1={x}
                    y1={PAD.top}
                    x2={x}
                    y2={height - PAD.bottom}
                    stroke="#f59e0b"
                    strokeWidth={1.8}
                    strokeDasharray="4 2"
                  />
                  {/* P*(HARD) dot for rival */}
                  <circle
                    cx={x}
                    cy={yH}
                    r={3.5}
                    fill="#f59e0b"
                    stroke="white"
                    strokeWidth={1}
                  />
                  {/* P*(V-HARD) dot for rival */}
                  <circle
                    cx={x}
                    cy={yV}
                    r={3.5}
                    fill="#f59e0b"
                    stroke="white"
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={labelY}
                    textAnchor="middle"
                    fontSize={10}
                    className="fill-amber-400 font-semibold"
                    fontFamily="var(--font-geist-mono)"
                  >
                    {rivalName ? `${rivalName} ` : "Rival "}
                    {mode === "lerp"
                      ? format(rivalTheta, 1)
                      : `θ=${rivalTheta >= 0 ? `+${rivalTheta.toFixed(2)}` : rivalTheta.toFixed(2)}`}
                  </text>
                </>
              );
            })()}
          </g>
        )}

        {/* Primary Survival Curves */}
        {showNormal && (
          <path d={pathFor("pn")} fill="none" stroke="var(--color-lamp-normal)" strokeWidth={2} />
        )}
        <path d={pathFor("ph")} fill="none" stroke="var(--color-lamp-hard)" strokeWidth={2.2} />
        <path d={pathFor("pv")} fill="none" stroke="var(--color-lamp-vhard)" strokeWidth={2.2} />

        {/* Axis lines */}
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={height - PAD.bottom}
          stroke="currentColor"
          strokeOpacity={0.3}
        />
        <line
          x1={PAD.left}
          y1={height - PAD.bottom}
          x2={width - PAD.right}
          y2={height - PAD.bottom}
          stroke="currentColor"
          strokeOpacity={0.3}
        />

        {/* Axis labels */}
        <text
          x={width / 2}
          y={height - 6}
          textAnchor="middle"
          fontSize={11}
          className="fill-muted-foreground"
        >
          {t.histogramXAxis(mode === "lerp")}
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
    </div>
  );
}