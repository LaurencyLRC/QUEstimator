"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Chart, PlayerData } from "@/lib/questimator-types";
import { levelLabel } from "@/lib/questimator-types";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import { GrmCurveChart } from "@/components/questimator/GrmCurveChart";
import { ExternalLink } from "lucide-react";

interface Props {
  chart: Chart | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePlayer?: { id: string; data: PlayerData } | null;
  onClearStatusChange?: (chartId: number, status: number) => void;
  chartMaxTheta?: Map<number, number> | null;
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

function getClearBadge(status?: number) {
  if (status === 3) return <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono border-lamp-vhard/40 bg-lamp-vhard/10 text-lamp-vhard ml-2">V-HARD</Badge>;
  if (status === 2) return <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono border-lamp-hard/40 bg-lamp-hard/10 text-lamp-hard ml-2">HARD</Badge>;
  if (status === 1) return <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono border-lamp-normal/40 bg-lamp-normal/10 text-lamp-normal ml-2">NORMAL</Badge>;
  if (status === 0) return <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono border-lamp-failed/40 bg-lamp-failed/10 text-lamp-failed ml-2">FAILED</Badge>;
  return null;
}

export function ChartDetailDialog({ chart, open, onOpenChange, activePlayer, onClearStatusChange, chartMaxTheta }: Props) {
  const { t } = useLang();
  const { format, mode } = useScale();
  if (!chart) return null;

  const fmtCI = (center: number, se: number, digits = 2) => {
    const lo = center - 1.96 * se;
    const hi = center + 1.96 * se;
    return `[${format(lo, digits)}, ${format(hi, digits)}]`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border/80 text-foreground p-6 rounded-lg">
        <DialogHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
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
              {activePlayer && !onClearStatusChange && activePlayer.data.c?.[chart.id.toString()] !== undefined && (
                getClearBadge(activePlayer.data.c?.[chart.id.toString()])
              )}
            </div>

            <a
              href={`https://ez2pattern.kr/bms/chart?md5=${chart.md5}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-mono text-telemetry-cyan hover:underline ml-auto"
            >
              <span>{t.ez2pattern}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
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
            <span className="font-mono text-xs text-muted-foreground/80">MD5: {chart.md5.slice(0, 8)}...</span>
          </DialogDescription>

          {onClearStatusChange && activePlayer && (
            <div className="flex items-center gap-2 pt-3 mt-2 border-t border-border/40">
              <span className="text-xs font-sans text-muted-foreground">Status Override:</span>
              <ToggleGroup
                type="single"
                value={String(activePlayer.data.c?.[chart.id.toString()] ?? -1)}
                onValueChange={(v) => {
                  onClearStatusChange(chart.id, v ? parseInt(v, 10) : -1);
                }}
                size="sm"
                className="gap-0.5 h-6 bg-background/80 p-0.5 rounded border border-border/80"
              >
                <ToggleGroupItem value="-1" className="text-[10px] font-mono h-5 px-2 rounded-sm border border-transparent data-[state=on]:bg-muted data-[state=on]:text-foreground text-muted-foreground">NONE</ToggleGroupItem>
                <ToggleGroupItem value="0" className="text-[10px] font-mono h-5 px-2 rounded-sm border border-transparent text-muted-foreground data-[state=on]:border-lamp-failed/40 data-[state=on]:bg-lamp-failed/20 data-[state=on]:text-foreground">FAILED</ToggleGroupItem>
                <ToggleGroupItem value="1" className="text-[10px] font-mono h-5 px-2 rounded-sm border border-transparent text-lamp-normal/80 data-[state=on]:border-lamp-normal/40 data-[state=on]:bg-lamp-normal/20 data-[state=on]:text-lamp-normal">NORMAL</ToggleGroupItem>
                <ToggleGroupItem value="2" className="text-[10px] font-mono h-5 px-2 rounded-sm border border-transparent text-lamp-hard/80 data-[state=on]:border-lamp-hard/40 data-[state=on]:bg-lamp-hard/20 data-[state=on]:text-lamp-hard">HARD</ToggleGroupItem>
                <ToggleGroupItem value="3" className="text-[10px] font-mono h-5 px-2 rounded-sm border border-transparent text-lamp-vhard/80 data-[state=on]:border-lamp-vhard/40 data-[state=on]:bg-lamp-vhard/20 data-[state=on]:text-lamp-vhard">V-HARD</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
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
              value={chart.n_hard + chart.n_vhard === 0 ? `>${format(chartMaxTheta?.get(chart.id) ?? chart.b_hard_display, mode === "lerp" ? 2 : 3)}?` : format(chart.b_hard_display, mode === "lerp" ? 2 : 3)}
              ciCenter={chart.n_hard + chart.n_vhard === 0 ? null : chart.b_hard}
              seValue={chart.n_hard + chart.n_vhard === 0 ? null : chart.se_b_hard}
              fmtCIFn={fmtCI}
              color="var(--color-lamp-hard)"
            />
            <ParamCard
              label={t.vhardClear}
              value={chart.n_vhard === 0 ? `>${format(chartMaxTheta?.get(chart.id) ?? chart.b_vhard_display, mode === "lerp" ? 2 : 3)}?` : format(chart.b_vhard_display, mode === "lerp" ? 2 : 3)}
              ciCenter={chart.n_vhard === 0 ? null : chart.b_vhard}
              seValue={chart.n_vhard === 0 ? null : chart.se_b_vhard}
              fmtCIFn={fmtCI}
              color="var(--color-lamp-vhard)"
            />
            <ParamCard
              label={t.discrimination}
              value={fmtRaw(chart.a, 3)}
              ciCenter={chart.a}
              seValue={chart.se_a}
              fmtCIFn={(c, se) => `[${fmtRaw(c - 1.96 * se, 2)}, ${fmtRaw(c + 1.96 * se, 2)}]`}
            />
            <ParamCard
              label={t.sampleSize}
              value={chart.n.toLocaleString()}
            />
          </div>

          {chart.a != null && chart.b_hard != null && chart.b_vhard != null && (
            <div className="rounded-lg border border-border/80 p-4 bg-background/50">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-sans font-medium text-muted-foreground">
                  {t.lang === "en" ? "GRM Cumulative Survival Probabilities" : "GRM 누적 생존 확률 곡선"}
                </div>
                <div className="text-xs font-mono text-muted-foreground/80">
                  P*(θ) Logistic Fit
                </div>
              </div>
              <GrmCurveChart
                a={chart.a}
                b_hard={chart.b_hard}
                b_vhard={chart.b_vhard}
                playerTheta={activePlayer?.data.t}
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
}: {
  label: string;
  value: string;
  ciCenter?: number | null;
  seValue?: number | null;
  fmtCIFn?: (center: number, se: number) => string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-background/50 px-3 py-2.5 flex flex-col justify-between">
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
  );
}