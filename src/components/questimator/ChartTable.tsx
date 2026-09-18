"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ArrowUpDown, Search } from "lucide-react";
import type { Chart, PlayerData } from "@/lib/questimator-types";
import { levelLabel, levelSortKey, isSpecialLevel, pStar } from "@/lib/questimator-types";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";

export type SortKey = "title" | "level" | "b_vhard" | "b_hard" | "a" | "n";
export type SortDir = "asc" | "desc";

interface Props {
  charts: Chart[];
  onSelectChart: (c: Chart) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
  activePlayer?: { id: string; data: PlayerData } | null;
  chartMaxTheta?: Map<number, number> | null;
}

function ClearDistBar({
  n,
  nFailed,
  nNormal,
  nHard,
  nVhard,
}: {
  n: number;
  nFailed: number;
  nNormal: number;
  nHard: number;
  nVhard: number;
}) {
  if (n === 0) return <span className="text-muted-foreground font-mono text-xs">–</span>;

  const nLower = nNormal + nFailed;
  const vhPct = (nVhard / n) * 100;
  const hPct = (nHard / n) * 100;
  const lowerPct = (nLower / n) * 100;

  return (
    <div
      className="flex flex-col items-end gap-1 font-mono"
      title={`V-HARD ${nVhard} (${vhPct.toFixed(0)}%) | HARD ${nHard} (${hPct.toFixed(0)}%) | NORMAL+FAILED ${nLower} (${lowerPct.toFixed(0)}%) · Total: ${n}`}
    >
      <div className="flex items-center gap-1 text-xs tabular-nums font-semibold">
        <span className="text-lamp-vhard">{vhPct.toFixed(0)}%</span>
        <span className="text-muted-foreground font-normal text-[10px]">VH</span>
      </div>
      <div className="w-16 h-1 rounded-sm overflow-hidden flex bg-muted/40 border border-border/40">
        <div style={{ width: `${vhPct}%` }} className="h-full bg-lamp-vhard" />
        <div style={{ width: `${hPct}%` }} className="h-full bg-lamp-hard" />
        <div style={{ width: `${lowerPct}%` }} className="h-full bg-lamp-failed" />
      </div>
    </div>
  );
}

export function ChartTable({ charts, onSelectChart, sortKey, sortDir, onSortChange, activePlayer, chartMaxTheta }: Props) {
  const { t } = useLang();
  const { mode, format } = useScale();
  const [query, setQuery] = useState("");
  const [showProvisional, setShowProvisional] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const STATUS_ROW_CLASS: Record<number, string> = {
    3: "bg-lamp-vhard/10",
    2: "bg-lamp-hard/10",
    1: "bg-lamp-normal/10",
    0: "bg-lamp-failed/10",
  };

  const STATUS_BADGE: Record<number, { label: string; className: string }> = {
    3: { label: "VH", className: "bg-lamp-vhard/15 text-lamp-vhard border-lamp-vhard/40" },
    2: { label: "H", className: "bg-lamp-hard/15 text-lamp-hard border-lamp-hard/40" },
    1: { label: "N", className: "bg-lamp-normal/15 text-lamp-normal border-lamp-normal/40" },
    0: { label: "F", className: "bg-lamp-failed/15 text-lamp-failed border-lamp-failed/40" },
  };

  const filtered = useMemo(() => {
    let out = charts;
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.artist.toLowerCase().includes(q) ||
          c.name_diff.toLowerCase().includes(q) ||
          c.md5.toLowerCase().includes(q)
      );
    }
    if (!showProvisional) {
      out = out.filter((c) => !c.provisional);
    }

    const sorted = [...out].sort((a, b) => {
      if (sortKey === "level") {
        const [ax, ay] = levelSortKey(a.level);
        const [bx, by] = levelSortKey(b.level);
        const cmp = ax - bx || ay - by;
        return sortDir === "asc" ? cmp : -cmp;
      }
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "title":
          av = a.title.toLowerCase();
          bv = b.title.toLowerCase();
          break;
        case "b_vhard":
          av = a.n_vhard === 0 ? (chartMaxTheta?.get(a.id) ?? a.b_vhard_display ?? -99) : (a.b_vhard_display ?? -99);
          bv = b.n_vhard === 0 ? (chartMaxTheta?.get(b.id) ?? b.b_vhard_display ?? -99) : (b.b_vhard_display ?? -99);
          break;
        case "b_hard":
          av = (a.n_hard + a.n_vhard === 0) ? (chartMaxTheta?.get(a.id) ?? a.b_hard_display ?? -99) : (a.b_hard_display ?? -99);
          bv = (b.n_hard + b.n_vhard === 0) ? (chartMaxTheta?.get(b.id) ?? b.b_hard_display ?? -99) : (b.b_hard_display ?? -99);
          break;
        case "a":
          av = a.a ?? -99;
          bv = b.a ?? -99;
          break;
        case "n":
          av = a.n;
          bv = b.n;
          break;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return sorted;
  }, [charts, query, sortKey, sortDir, showProvisional, chartMaxTheta]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      onSortChange(key, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(key, key === "title" || key === "level" ? "asc" : "desc");
    }
  };

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 104,
    overscan: 10,
    getItemKey: (index) => filtered[index]?.md5 ?? index,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Button
          variant={showProvisional ? "default" : "outline"}
          size="sm"
          onClick={() => setShowProvisional(!showProvisional)}
          className="text-xs"
        >
          {showProvisional ? t.showingAll : t.validOnly}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t.ofCharts(filtered.length, charts.length)}
        </span>
      </div>

      <div className="rounded-md border border-border/60 overflow-hidden">
        <div ref={scrollRef} className="max-h-[640px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[32%]">
                  <button
                    onClick={() => toggleSort("title")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {t.chart} <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead className="text-center w-[60px]">
                  <button
                    onClick={() => toggleSort("level")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {t.level} <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => toggleSort("b_hard")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {t.bHard(mode === "lerp")} <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => toggleSort("b_vhard")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {t.bVhard(mode === "lerp")} <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => toggleSort("a")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {t.disc} <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[100px]">
                  <button
                    onClick={() => toggleSort("n")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    n <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t.noMatch}
                  </TableCell>
                </TableRow>
              )}
              {filtered.length > 0 && (
                <>
                  {paddingTop > 0 && (
                    <TableRow aria-hidden className="border-0 hover:bg-transparent">
                      <TableCell colSpan={6} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} />
                    </TableRow>
                  )}

                  {virtualItems.map((virtualRow) => {
                    const c = filtered[virtualRow.index];
                    const status = activePlayer?.data.c?.[c.id.toString()];
                    const hasStatus = status != null && status >= 0 && status <= 3;
                    const rowClass = hasStatus ? STATUS_ROW_CLASS[status] : undefined;
                    return (
                      <TableRow
                        key={c.md5}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        onClick={() => onSelectChart(c)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectChart(c);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`View chart details for ${c.title}`}
                        className={cn(
                          "cursor-pointer hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry-cyan focus-visible:bg-muted/30",
                          rowClass
                        )}
                      >
                        <TableCell className="font-medium font-jp whitespace-normal break-all max-w-[400px]">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {hasStatus && (
                                <span
                                  className={cn(
                                    "text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase shrink-0 border",
                                    STATUS_BADGE[status].className
                                  )}
                                >
                                  {STATUS_BADGE[status].label}
                                </span>
                              )}
                              <span className="text-sm leading-snug line-clamp-2">
                                {c.title}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {c.artist || "unknown"}
                              {c.name_diff && ` · ${c.name_diff}`}
                            </span>
                            {c.provisional && (
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 text-telemetry-cyan border-telemetry-cyan/40 bg-telemetry-cyan/10 w-fit font-mono"
                              >
                                {t.provisional}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      <TableCell className="text-center font-mono text-sm tabular-nums">
                        <span className={isSpecialLevel(c.level) ? "text-amber-400" : "text-muted-foreground"}>
                          {c.level}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        <div className="flex flex-col items-end leading-tight">
                          <span className={c.n_hard + c.n_vhard === 0 ? "text-lamp-hard/60" : "text-lamp-hard font-semibold"}>
                            {(c.n_hard + c.n_vhard === 0) ? `>${format(chartMaxTheta?.get(c.id) ?? c.b_hard_display)}?` : format(c.b_hard_display)}
                          </span>
                          {activePlayer && c.a != null && c.b_hard != null && (
                            <span
                              className="text-[10px] font-semibold tabular-nums text-lamp-hard"
                              title="Your HARD clear probability"
                            >
                              {(pStar(activePlayer.data.t, c.a, c.b_hard) * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        <div className="flex flex-col items-end leading-tight">
                          <span className={c.n_vhard === 0 ? "text-lamp-vhard/60" : "text-lamp-vhard font-semibold"}>
                            {(c.n_vhard === 0) ? `>${format(chartMaxTheta?.get(c.id) ?? c.b_vhard_display)}?` : format(c.b_vhard_display)}
                          </span>
                          {activePlayer && c.a != null && c.b_vhard != null && (
                            <span
                              className="text-[10px] font-semibold tabular-nums text-lamp-vhard"
                              title="Your V-HARD clear probability"
                            >
                              {(pStar(activePlayer.data.t, c.a, c.b_vhard) * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        {c.a != null ? c.a.toFixed(2) : "–"}
                      </TableCell>
                      <TableCell className="text-right">
                        <ClearDistBar
                          n={c.n}
                          nFailed={c.n_failed ?? 0}
                          nNormal={c.n_normal ?? 0}
                          nHard={c.n_hard ?? 0}
                          nVhard={c.n_vhard ?? 0}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                
                  {paddingBottom > 0 && (
                    <TableRow aria-hidden className="border-0 hover:bg-transparent">
                      <TableCell colSpan={6} style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} />
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export { levelLabel };