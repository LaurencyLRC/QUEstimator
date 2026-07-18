"use client";

import { useMemo, useState } from "react";
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
import { ArrowUpDown, Search } from "lucide-react";
import type { Chart, PlayerData } from "@/lib/questimator-types";
import { levelLabel, levelSortKey, isSpecialLevel, pStar } from "@/lib/questimator-types";
import { useLang } from "@/lib/i18n";

export type SortKey = "title" | "level" | "b_vhard" | "b_hard" | "a" | "n";
export type SortDir = "asc" | "desc";

interface Props {
  charts: Chart[];
  onSelectChart: (c: Chart) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
  activePlayer?: { id: string; data: PlayerData } | null;
}

function fmt(v: number | null, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "–";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}`;
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
  if (n === 0) return <span className="text-muted-foreground">–</span>;

  const nLower = nNormal + nFailed;
  const pct = (v: number) => (v / n) * 100;

  // Three-layer stack (right-aligned):
  //   top    — percentages "XX.X%/XX.X%/XX.X%" summing to 100%
  //   middle — 3-segment mini bar (V-HARD / HARD / NORMAL+FAILED)
  //   bottom — raw counts "V / H / lower"
  return (
    <div className="flex flex-col items-end gap-1" title={`V-HARD ${nVhard} | HARD ${nHard} | NORMAL+FAILED ${nLower} (n=${n})`}>
      {/* Percentages on top */}
      <span className="text-[10px] font-mono leading-none tabular-nums">
        <span style={{ color: "oklch(0.70 0.22 305)" }}>{pct(nVhard).toFixed(1)}%</span>
        <span className="text-border mx-0.5">/</span>
        <span style={{ color: "oklch(0.70 0.22 25)" }}>{pct(nHard).toFixed(1)}%</span>
        <span className="text-border mx-0.5">/</span>
        <span className="text-muted-foreground">{pct(nLower).toFixed(1)}%</span>
      </span>
      {/* Mini bar in the middle */}
      <div className="w-20 h-2 rounded-sm overflow-hidden flex bg-muted">
        <div
          style={{ width: `${pct(nVhard)}%`, background: "oklch(0.62 0.22 305)" }}
          className="h-full"
        />
        <div
          style={{ width: `${pct(nHard)}%`, background: "oklch(0.62 0.22 25)" }}
          className="h-full"
        />
        <div
          style={{ width: `${pct(nLower)}%`, background: "oklch(0.55 0 0)" }}
          className="h-full"
        />
      </div>
      {/* Raw counts on bottom */}
      <span className="text-[10px] font-mono text-muted-foreground leading-none tabular-nums">
        <span style={{ color: "oklch(0.70 0.22 305)" }}>{nVhard}</span>
        <span className="text-border mx-0.5">/</span>
        <span style={{ color: "oklch(0.70 0.22 25)" }}>{nHard}</span>
        <span className="text-border mx-0.5">/</span>
        <span className="text-muted-foreground">{nLower}</span>
      </span>
    </div>
  );
}

export function ChartTable({ charts, onSelectChart, sortKey, sortDir, onSortChange, activePlayer }: Props) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [showProvisional, setShowProvisional] = useState(false);

  // Dark, low-opacity row tints for the active player's best clear status.
  // Applied as the TableRow background — the existing hover:bg-muted/40 still
  // works on top. Colors are deliberately dark so the tint is subtle but
  // scannable at a glance.
  const STATUS_ROW_TINT: Record<number, string> = {
    3: "oklch(0.28 0.10 305 / 0.18)",  // V-HARD — deep purple
    2: "oklch(0.28 0.12 25 / 0.18)",   // HARD — deep red
    1: "oklch(0.28 0.10 95 / 0.15)",   // NORMAL — deep yellow/brown
    0: "oklch(0.25 0 0 / 0.18)",        // FAILED — dark gray
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
          av = a.b_vhard_display ?? -99;
          bv = b.b_vhard_display ?? -99;
          break;
        case "b_hard":
          av = a.b_hard_display ?? -99;
          bv = b.b_hard_display ?? -99;
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
  }, [charts, query, sortKey, sortDir, showProvisional]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      onSortChange(key, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(key, key === "title" || key === "level" ? "asc" : "desc");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t.searchPlaceholder}
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
        <div className="max-h-[640px] overflow-y-auto">
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
                    {t.bHard} <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => toggleSort("b_vhard")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {t.bVhard} <ArrowUpDown className="w-3 h-3" />
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
              {filtered.map((c) => {
                const status = activePlayer?.data.c[c.id.toString()];
                const hasStatus = status != null && status >= 0 && status <= 3;
                const rowTint = hasStatus ? STATUS_ROW_TINT[status] : undefined;
                return (
                  <TableRow
                    key={c.md5}
                    onClick={() => onSelectChart(c)}
                    className="cursor-pointer hover:bg-muted/40"
                    style={rowTint ? { background: rowTint } : undefined}
                  >
                    <TableCell className="font-medium font-jp whitespace-normal break-all max-w-[400px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm leading-snug line-clamp-3">
                          {c.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {c.artist || "unknown"}
                          {c.name_diff && ` · ${c.name_diff}`}
                        </span>
                        {c.provisional && (
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1 text-blue-400 border-blue-500/40 w-fit"
                          >
                            {t.provisional}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    <span className={isSpecialLevel(c.level) ? "text-amber-400" : "text-muted-foreground"}>
                      {c.level}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <div className="flex flex-col items-end leading-tight">
                      <span style={{ color: "oklch(0.78 0.18 25)" }}>
                        {fmt(c.b_hard_display)}
                      </span>
                      {activePlayer && c.a != null && c.b_hard != null && (
                        <span
                          className="text-[10px] font-semibold tabular-nums"
                          style={{ color: "oklch(0.70 0.22 25)" }}
                          title="Your HARD clear probability"
                        >
                          {(pStar(activePlayer.data.t, c.a, c.b_hard) * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <div className="flex flex-col items-end leading-tight">
                      <span style={{ color: "oklch(0.78 0.18 305)" }}>
                        {fmt(c.b_vhard_display)}
                      </span>
                      {activePlayer && c.a != null && c.b_vhard != null && (
                        <span
                          className="text-[10px] font-semibold tabular-nums"
                          style={{ color: "oklch(0.70 0.22 305)" }}
                          title="Your V-HARD clear probability"
                        >
                          {(pStar(activePlayer.data.t, c.a, c.b_vhard) * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
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
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export { levelLabel };
