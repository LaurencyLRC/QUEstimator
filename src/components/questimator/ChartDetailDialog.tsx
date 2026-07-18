"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Chart, PlayerData } from "@/lib/questimator-types";
import { levelLabel } from "@/lib/questimator-types";
import { useLang } from "@/lib/i18n";

interface Props {
  chart: Chart | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePlayer?: { id: string; data: PlayerData } | null;
}

function fmt(v: number | null, digits = 3): string {
  if (v == null || Number.isNaN(v)) return "–";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}`;
}

// 95% confidence interval helper: center ± 1.96 · SE.
function fmtCI(center: number, se: number, digits = 2): string {
  const lo = center - 1.96 * se;
  const hi = center + 1.96 * se;
  const s = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;
  return `[${s(lo)}, ${s(hi)}]`;
}

function seColorClass(se: number | null): string {
  if (se == null || Number.isNaN(se)) return "text-muted-foreground";
  if (se <= 0.20) return "text-emerald-400";
  if (se <= 0.50) return "text-amber-400";
  return "text-rose-400";
}

function getClearBadge(status?: number) {
  if (status === 3) return <Badge variant="outline" className="text-[9px] py-0 px-1 border-purple-500/40 text-purple-400 ml-2">V-HARD</Badge>;
  if (status === 2) return <Badge variant="outline" className="text-[9px] py-0 px-1 border-red-500/40 text-red-400 ml-2">HARD</Badge>;
  if (status === 1) return <Badge variant="outline" className="text-[9px] py-0 px-1 border-yellow-500/40 text-yellow-400 ml-2">NORMAL</Badge>;
  if (status === 0) return <Badge variant="outline" className="text-[9px] py-0 px-1 border-gray-500/40 text-gray-400 ml-2">FAILED</Badge>;
  return null;
}

export function ChartDetailDialog({ chart, open, onOpenChange, activePlayer }: Props) {
  const { t } = useLang();
  if (!chart) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge variant="outline" className="font-mono">
              {levelLabel(chart.level)}
            </Badge>
            {chart.provisional && (
              <Badge
                variant="outline"
                className="text-blue-400 border-blue-500/40"
              >
                {t.provisional}
              </Badge>
            )}
            {activePlayer && activePlayer.data.c[chart.id.toString()] !== undefined && (
              getClearBadge(activePlayer.data.c[chart.id.toString()])
            )}
            <a
              href={`https://ez2pattern.kr/bms/chart?md5=${chart.md5}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-400 hover:underline"
            >
              {t.ez2pattern}
            </a>
          </div>
          <DialogTitle className="text-xl leading-tight font-jp">
            {chart.title}
          </DialogTitle>
          <DialogDescription className="font-jp">
            {t.by} <span className="text-foreground/80">{chart.artist || "unknown"}</span>
            {chart.name_diff && (
              <> · {t.notemaker}: <span className="text-foreground/80">{chart.name_diff}</span></>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {t.irtParams}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <ParamCard
              label={t.hardClear}
              value={fmt(chart.b_hard_display)}
              ciCenter={chart.b_hard}
              seValue={chart.se_b_hard}
              color="oklch(0.70 0.22 25)"
            />
            <ParamCard
              label={t.vhardClear}
              value={fmt(chart.b_vhard_display)}
              ciCenter={chart.b_vhard}
              seValue={chart.se_b_vhard}
              color="oklch(0.70 0.22 305)"
            />
            <ParamCard
              label={t.discrimination}
              value={fmt(chart.a, 3)}
              ciCenter={chart.a}
              seValue={chart.se_a}
            />
            <ParamCard
              label={t.sampleSize}
              value={chart.n.toString()}
            />
          </div>

          {chart.comment && (
            <div className="mt-2 rounded-md border border-border/40 p-3 text-xs">
              <span className="text-muted-foreground">{t.comment} </span>
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
  color,
}: {
  label: string;
  value: string;
  /** Numeric center used to compute the 95% CI (= center ± 1.96 · SE). */
  ciCenter?: number | null;
  seValue?: number | null;
  color?: string;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-card/40 px-3 py-2">
      <div className="flex items-center gap-1.5">
        {color && (
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: color }}
          />
        )}
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground whitespace-nowrap truncate">
          {label}
        </span>
      </div>
      <div className="font-mono text-base font-semibold mt-0.5">{value}</div>
      {seValue != null && ciCenter != null && !Number.isNaN(ciCenter) && !Number.isNaN(seValue) && (
        <div className={`text-[9px] font-mono ${seColorClass(seValue)}`}>
          95% CI {fmtCI(ciCenter, seValue)}
        </div>
      )}
    </div>
  );
}
