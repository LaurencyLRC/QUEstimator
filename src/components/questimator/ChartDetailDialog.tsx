"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Chart } from "@/lib/questimator-types";
import { levelLabel } from "@/lib/questimator-types";
import { useLang } from "@/lib/i18n";

interface Props {
  chart: Chart | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmt(v: number | null, digits = 3): string {
  if (v == null || Number.isNaN(v)) return "–";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}`;
}

// SE is always positive – no sign prefix.
function fmtSE(v: number | null, digits = 3): string {
  if (v == null || Number.isNaN(v)) return "–";
  return v.toFixed(digits);
}

// Confidence color bands based on the pipeline's provisional threshold (SE > 0.5).
//   SE ≤ 0.20  → emerald (excellent)
//   SE ≤ 0.50  → amber   (acceptable, still valid)
//   SE > 0.50  → rose    (provisional-level uncertainty)
function seColorClass(se: number | null): string {
  if (se == null || Number.isNaN(se)) return "text-muted-foreground";
  if (se <= 0.20) return "text-emerald-400";
  if (se <= 0.50) return "text-amber-400";
  return "text-rose-400";
}

export function ChartDetailDialog({ chart, open, onOpenChange }: Props) {
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
                className="text-amber-400 border-amber-500/40"
              >
                {t.provisional}
              </Badge>
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
          {/* Chart title, artist, and notemaker are displayed as-is from the
              source data (UEtable.json). The BMS ecosystem is Japanese-centric,
              so these fields remain in their original Japanese form regardless
              of the selected UI language. The .font-jp class forces Japanese
              glyph shapes to avoid Han-unification clashes. */}
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
              seValue={chart.se_b_hard}
              color="oklch(0.70 0.22 25)"
            />
            <ParamCard
              label={t.vhardClear}
              value={fmt(chart.b_vhard_display)}
              seValue={chart.se_b_vhard}
              color="oklch(0.70 0.22 305)"
            />
            <ParamCard
              label={t.discrimination}
              value={fmt(chart.a, 3)}
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
  seValue,
  color,
}: {
  label: string;
  value: string;
  seValue?: number | null;
  color?: string;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-card/40 px-3 py-2">
      <div className="flex items-center gap-1.5">
        {color && (
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: color }}
          />
        )}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          {label}
        </span>
      </div>
      <div className="font-mono text-base font-semibold mt-0.5">{value}</div>
      {seValue != null && (
        <div className={`text-[10px] font-mono ${seColorClass(seValue)}`}>
          SE {fmtSE(seValue)}
        </div>
      )}
    </div>
  );
}
