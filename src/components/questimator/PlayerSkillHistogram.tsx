"use client";

import type { SamplePlayers } from "@/lib/questimator-types";
import { useScale } from "@/lib/value-scale";

interface Props {
  data: SamplePlayers;
  playerTheta?: number | null;
  width?: number;
  height?: number;
}

/**
 * Histogram of player latent skill θ.
 * Helps users contextualise where the median player sits on the difficulty scale.
 */
export function PlayerSkillHistogram({
  data,
  playerTheta,
  width = 460,
  height = 180,
}: Props) {
  const { mode, format } = useScale();
  const PAD = { top: 14, right: 14, bottom: 36, left: 36 };
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const bins = data.theta_histogram;
  const edges = data.theta_edges;
  const maxCount = Math.max(...bins, 1);

  const barW = innerW / bins.length;
  const yScale = (c: number) => (c / maxCount) * innerH;

  const xTicks = [-4, -2, 0, 2, 4];
  const xScale = (t: number) =>
    PAD.left + ((t - edges[0]) / (edges[edges.length - 1] - edges[0])) * innerW;

  const meanX = xScale(data.theta_mean);
  const hasPlayer = playerTheta != null && Number.isFinite(playerTheta);
  const playerClamped = hasPlayer ? Math.max(edges[0], Math.min(edges[edges.length - 1], playerTheta!)) : 0;
  const playerX = hasPlayer ? xScale(playerClamped) : 0;
  const isLabelNear = hasPlayer && Math.abs(meanX - playerX) < 45;
  const meanLabelY = isLabelNear ? PAD.top + 10 : PAD.top - 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PAD.top + innerH - f * innerH;
        return (
          <line
            key={`g-${f}`}
            x1={PAD.left}
            y1={y}
            x2={width - PAD.right}
            y2={y}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
        );
      })}
      {bins.map((c, i) => {
        const h = yScale(c);
        const x = PAD.left + i * barW;
        const y = PAD.top + innerH - h;
        return (
          <rect
            key={`b-${i}`}
            x={x + 1}
            y={y}
            width={Math.max(0, barW - 2)}
            height={h}
            fill="oklch(0.68 0.15 200)"
            fillOpacity={0.7}
            rx={1}
          />
        );
      })}

      {/* Population mean line (dashed gold) */}
      <line
        x1={meanX}
        y1={PAD.top}
        x2={meanX}
        y2={PAD.top + innerH}
        stroke="oklch(0.85 0.18 50)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <text
        x={meanX}
        y={meanLabelY}
        textAnchor="middle"
        fontSize={9}
        className="fill-muted-foreground"
        fontFamily="var(--font-geist-mono)"
      >
        {mode === "lerp" ? `μ=${format(data.theta_mean, 2)}` : `μ=${data.theta_mean.toFixed(2)}`}
      </text>

      {/* Active player needle (solid cyan) */}
      {hasPlayer && (
        <g>
          <line
            x1={playerX}
            y1={PAD.top}
            x2={playerX}
            y2={PAD.top + innerH}
            stroke="oklch(0.68 0.15 200)"
            strokeWidth={2}
          />
          <text
            x={playerX}
            y={PAD.top - 2}
            textAnchor="middle"
            fontSize={9}
            fill="oklch(0.68 0.15 200)"
            fontWeight="bold"
            fontFamily="var(--font-geist-mono)"
          >
            {mode === "lerp" ? `θ=${format(playerTheta!, 2)}` : `θ=${format(playerTheta!, 3)}`}
          </text>
        </g>
      )}

      {xTicks.map((t) => (
        <text
          key={`xt-${t}`}
          x={xScale(t)}
          y={height - PAD.bottom + 14}
          textAnchor="middle"
          fontSize={10}
          className="fill-muted-foreground"
          fontFamily="var(--font-geist-mono)"
        >
          {mode === "lerp" ? format(t, 0) : (t >= 0 ? `+${t}` : t)}
        </text>
      ))}
      <line x1={PAD.left} y1={PAD.top + innerH} x2={width - PAD.right} y2={PAD.top + innerH} stroke="currentColor" strokeOpacity={0.3} />
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="currentColor" strokeOpacity={0.3} />
    </svg>
  );
}