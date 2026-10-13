"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Chart, PlayerData } from "@/lib/questimator-types";
import { levelLabel, getCensoredDisplayBound } from "@/lib/questimator-types";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import { GrmCurveChart } from "@/components/questimator/GrmCurveChart";
import { LampBadge } from "@/components/questimator/LampBadge";
import { Check, Copy, ExternalLink, Video, Download } from "lucide-react";

interface Props {
  chart: Chart | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePlayer?: { id: string; data: PlayerData; isCustom?: boolean } | null;
  rivalPlayer?: { id: string; data: PlayerData; isCustom?: boolean } | null;
  chartMaxTheta?: Map<number, number> | null;
  onClearStatusChange?: (chartId: number, status: number) => void;
}

function fmtRaw(v: number | null, digits = 3): string {
  if (v == null || Number.isNaN(v)) return "–";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}`;
}

function seColorClass(se: number | null): string {
  if (se == null || Number.isNaN(se)) return "text-muted-foreground";
  if (se <= 0.20) return "text-emerald-400";
  if (se <= 0.50) return "text-amber-400";
  return "text-rose-400";
}

export function ChartDetailDialog({ chart, open, onOpenChange, activePlayer, rivalPlayer, chartMaxTheta, onClearStatusChange }: Props) {
  const { t } = useLang();
  const { format, mode } = useScale();
  const [copiedMd5, setCopiedMd5] = useState(false);
  if (!chart) return null;

  const fmtCI = (center: number, se: number, digits = 2) => {
    const lo = center - 1.96 * se;
    const hi = center + 1.96 * se;
    return `[${format(lo, digits)}, ${format(hi, digits)}]`;
  };

  const pStar = (theta: number, a: number, b: number) => 1 / (1 + Math.exp(-a * (theta - b)));
  const playerProbHard = activePlayer?.data.t != null && chart.a != null && chart.b_hard != null
    ? pStar(activePlayer.data.t, chart.a, chart.b_hard)
    : null;
  const playerProbVhard = activePlayer?.data.t != null && chart.a != null && chart.b_vhard != null
    ? pStar(activePlayer.data.t, chart.a, chart.b_vhard)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border/80 text-foreground p-6 rounded-lg">
        <DialogHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 border-border/80 bg-background/60">
                {levelLabel(chart.level)}
              </Badge>
              {chart.provisional && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono py-0 px-1.5 text-telemetry-cyan border-telemetry-cyan/40 bg-telemetry-cyan/10"
                >
                  {t.provisional}
                </Badge>
              )}
              {activePlayer && (
                <div className="ml-1">
                  <LampBadge
                    status={activePlayer.data.c?.[chart.id.toString()]}
                    editable={!!(activePlayer.isCustom && onClearStatusChange)}
                    onStatusChange={
                      onClearStatusChange
                        ? (newStatus) => onClearStatusChange(chart.id, newStatus)
                        : undefined
                    }
                    variant="full"
                    showEmptyAsButton={!!activePlayer.isCustom}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap ml-auto">
              {chart.video2 && (
                <a
                  href={chart.video2.startsWith("http") ? chart.video2 : `https://www.youtube.com/watch?v=${chart.video2}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-telemetry-cyan hover:underline"
                  title={t.lang === "en" ? "Watch chart video preview" : "채보 미리보기 영상 시청"}
                >
                  <Video className="h-3 w-3" />
                  <span>Video</span>
                </a>
              )}
              {chart.url && (
                <a
                  href={chart.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-telemetry-cyan hover:underline"
                  title={t.lang === "en" ? "Download BMS package" : "BMS 패키지 다운로드"}
                >
                  <Download className="h-3 w-3" />
                  <span>BMS</span>
                </a>
              )}
              {chart.url_diff && (
                <a
                  href={chart.url_diff}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-telemetry-cyan hover:underline"
                  title={t.lang === "en" ? "Download sabun differential" : "차분 파일 다운로드"}
                >
                  <Download className="h-3 w-3" />
                  <span>Sabun</span>
                </a>
              )}
              <a
                href={`https://ez2pattern.kr/bms/chart?md5=${chart.md5}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-mono text-telemetry-cyan hover:underline"
              >
                <span>{t.ez2pattern}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <DialogTitle className="text-xl font-bold font-jp leading-snug tracking-tight text-foreground">
            {chart.title}
          </DialogTitle>
          <DialogDescription className="font-jp text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <span>{t.by} <strong className="text-foreground/90 font-medium">{chart.artist || "unknown"}</strong></span>
            {chart.name_diff && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span>{t.notemaker}: <strong className="text-foreground/90 font-medium">{chart.name_diff}</strong></span>
              </>
            )}
            <span className="text-muted-foreground/60">·</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(chart.md5);
                setCopiedMd5(true);
                setTimeout(() => setCopiedMd5(false), 1500);
              }}
              title={t.lang === "en" ? "Click to copy full MD5 hash to clipboard" : "클릭하여 전체 MD5 해시 복사"}
              className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground/80 hover:text-foreground transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry-cyan rounded px-1 -mx-1"
            >
              <span>MD5: {chart.md5.slice(0, 8)}…</span>
              {copiedMd5 ? (
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </button>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-sans font-medium text-muted-foreground">
              {t.irtParams}
            </h4>
            <span className="text-xs font-mono text-muted-foreground/80">
              GRM Metrics
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <ParamCard
              label={t.hardClear}
              value={chart.n_hard + chart.n_vhard === 0 ? `>${format(getCensoredDisplayBound(chart.b_hard_display, chartMaxTheta?.get(chart.id)), mode === "lerp" ? 2 : 3)}?` : format(chart.b_hard_display, mode === "lerp" ? 2 : 3)}
              ciCenter={chart.n_hard + chart.n_vhard === 0 ? null : chart.b_hard}
              seValue={chart.n_hard + chart.n_vhard === 0 ? null : chart.se_b_hard}
              fmtCIFn={fmtCI}
              color="var(--color-lamp-hard)"
              title={t.lang === "en" ? "Difficulty threshold b_hard (50% HARD clear probability)" : "난이도 임계값 b_hard (HARD 클리어 확률 50% 지점)"}
              playerProb={playerProbHard}
            />
            <ParamCard
              label={t.vhardClear}
              value={chart.n_vhard === 0 ? `>${format(getCensoredDisplayBound(chart.b_vhard_display, chartMaxTheta?.get(chart.id)), mode === "lerp" ? 2 : 3)}?` : format(chart.b_vhard_display, mode === "lerp" ? 2 : 3)}
              ciCenter={chart.n_vhard === 0 ? null : chart.b_vhard}
              seValue={chart.n_vhard === 0 ? null : chart.se_b_vhard}
              fmtCIFn={fmtCI}
              color="var(--color-lamp-vhard)"
              title={t.lang === "en" ? "Difficulty threshold b_vhard (50% V-HARD clear probability)" : "난이도 임계값 b_vhard (V-HARD 클리어 확률 50% 지점)"}
              playerProb={playerProbVhard}
            />
            <ParamCard
              label={t.discrimination}
              value={fmtRaw(chart.a, 3)}
              ciCenter={chart.a}
              seValue={chart.se_a}
              fmtCIFn={(c, se) => `[${fmtRaw(c - 1.96 * se, 2)}, ${fmtRaw(c + 1.96 * se, 2)}]`}
              title={t.lang === "en" ? "Item discrimination parameter (a-parameter / slope) — indicates how sharply the chart separates player skill levels" : "문항 변별도 파라미터(a) — 플레이어 실력 격차를 얼마나 민감하게 구분하는지 나타냅니다"}
            />
            <ParamCard
              label={t.sampleSize}
              value={chart.n.toLocaleString()}
              title={t.lang === "en" ? "Total play submissions analyzed in the IRT dataset for this chart" : "이 채보에 대해 IRT 분석에 반영된 총 플레이 제출 건수"}
            />
          </div>

          {/* Clear Distribution Breakdown */}
          {chart.n > 0 && (
            <div className="rounded-lg border border-border/80 p-3 bg-muted/15 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-sans font-medium text-muted-foreground">{t.clearBreakdown}</span>
                <span className="font-mono text-muted-foreground text-[11px]">{t.lang === "en" ? `${chart.n.toLocaleString()} submissions` : `${chart.n.toLocaleString()}건 기록`}</span>
              </div>
              <div className="w-full h-2 rounded overflow-hidden flex bg-muted/40 border border-border/40">
                <div style={{ width: `${(chart.n_vhard / chart.n) * 100}%` }} className="h-full bg-lamp-vhard" title={`V-HARD: ${chart.n_vhard}`} />
                <div style={{ width: `${(chart.n_hard / chart.n) * 100}%` }} className="h-full bg-lamp-hard" title={`HARD: ${chart.n_hard}`} />
                <div style={{ width: `${((chart.n_normal + chart.n_failed) / chart.n) * 100}%` }} className="h-full bg-lamp-failed" title={`NORMAL+FAILED: ${chart.n_normal + chart.n_failed}`} />
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono pt-1">
                <div className="rounded p-1.5 bg-muted/30 border border-border/40">
                  <div className="text-[10px] text-lamp-vhard font-sans font-medium">V-HARD</div>
                  <div className="font-semibold text-foreground mt-0.5">{chart.n_vhard}</div>
                  <div className="text-[10px] text-muted-foreground">{((chart.n_vhard / chart.n) * 100).toFixed(0)}%</div>
                </div>
                <div className="rounded p-1.5 bg-muted/30 border border-border/40">
                  <div className="text-[10px] text-lamp-hard font-sans font-medium">HARD</div>
                  <div className="font-semibold text-foreground mt-0.5">{chart.n_hard}</div>
                  <div className="text-[10px] text-muted-foreground">{((chart.n_hard / chart.n) * 100).toFixed(0)}%</div>
                </div>
                <div className="rounded p-1.5 bg-muted/30 border border-border/40">
                  <div className="text-[10px] text-amber-400 font-sans font-medium">NORMAL</div>
                  <div className="font-semibold text-foreground mt-0.5">{chart.n_normal}</div>
                  <div className="text-[10px] text-muted-foreground">{((chart.n_normal / chart.n) * 100).toFixed(0)}%</div>
                </div>
                <div className="rounded p-1.5 bg-muted/30 border border-border/40">
                  <div className="text-[10px] text-muted-foreground font-sans font-medium">FAILED</div>
                  <div className="font-semibold text-foreground mt-0.5">{chart.n_failed}</div>
                  <div className="text-[10px] text-muted-foreground">{((chart.n_failed / chart.n) * 100).toFixed(0)}%</div>
                </div>
              </div>
            </div>
          )}

          {chart.a != null && chart.b_hard != null && chart.b_vhard != null && (
            <div className="rounded-lg border border-border/80 p-4 bg-background/50 space-y-3">
              <div className="text-xs font-sans font-medium text-muted-foreground">
                {t.lang === "en" ? "GRM Cumulative Survival Probabilities" : "GRM 누적 생존 확률 곡선"}
              </div>
              <GrmCurveChart
                a={chart.a}
                b_hard={chart.b_hard}
                b_vhard={chart.b_vhard}
                se_a={chart.se_a}
                se_b_hard={chart.se_b_hard}
                se_b_vhard={chart.se_b_vhard}
                playerTheta={activePlayer?.data.t}
                rivalTheta={rivalPlayer?.data.t}
                rivalName={rivalPlayer?.data.n || rivalPlayer?.id}
                width={560}
                height={260}
              />
            </div>
          )}

          {chart.comment && (
            <div className="rounded-lg border border-border/80 p-3 bg-background/40 font-mono text-xs text-muted-foreground/90 leading-relaxed">
              <span className="text-xs font-sans text-muted-foreground block mb-1">{t.comment}</span>
              {chart.comment}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ParamCard({
  label,
  value,
  ciCenter,
  seValue,
  fmtCIFn,
  color,
  title,
  playerProb,
}: {
  label: string;
  value: string;
  ciCenter?: number | null;
  seValue?: number | null;
  fmtCIFn?: (center: number, se: number) => string;
  color?: string;
  title?: string;
  playerProb?: number | null;
}) {
  const { t } = useLang();
  return (
    <div
      title={title}
      className="rounded-lg border border-border/80 bg-background/50 px-3 py-2.5 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center gap-1.5">
          {color && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: color }}
            />
          )}
          <span className="text-xs text-muted-foreground whitespace-nowrap truncate">
            {label}
          </span>
        </div>
        <div className="font-mono text-base font-bold tabular-nums text-foreground mt-1">{value}</div>
        {seValue != null && ciCenter != null && fmtCIFn && !Number.isNaN(ciCenter) && !Number.isNaN(seValue) && (
          <div className={`text-[10px] font-mono tabular-nums ${seColorClass(seValue)} mt-0.5`}>
            95% CI {fmtCIFn(ciCenter, seValue)}
          </div>
        )}
      </div>

      {playerProb != null && (
        <div className="text-[10px] font-mono tabular-nums text-telemetry-cyan font-medium mt-1.5 pt-1.5 border-t border-border/40 flex items-center justify-between">
          <span className="text-muted-foreground">{t.lang === "en" ? "Est. Clear" : "예상 확률"}</span>
          <span className="font-semibold">{(playerProb * 100).toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}