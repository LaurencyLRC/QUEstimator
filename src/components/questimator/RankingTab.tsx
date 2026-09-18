"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, Search } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import type { Chart, PlayerData, PlayersDict } from "@/lib/questimator-types";
import { fetchPlayersData } from "@/lib/players-cache";
import { cn } from "@/lib/utils";

interface Props {
  charts: Chart[];
  onSelectPlayer: (id: string, data: PlayerData) => void;
  players?: PlayersDict | null;
  loading?: boolean;
  error?: string | null;
}

interface RankRow {
  id: string;
  data: PlayerData;
  nClears: number;
  nVhard: number;
  nHard: number;
  eligible: boolean;
}

const MIN_PLAYS = 10;
const MIN_HARD_OR_BETTER = 1;
const EXCLUDED_LEVELS = new Set(["-_-", "?!", "◆"]);

function isValidRankingChart(c: Chart): boolean {
  if (c.provisional) return false;
  if (EXCLUDED_LEVELS.has(c.level)) return false;
  if (/^\d+$/.test(c.level)) return parseInt(c.level, 10) >= 20;
  return c.level === "Ω";
}

function rankBadgeColor(rank: number): string | null {
  if (rank === 1) return "oklch(0.80 0.15 85)";
  if (rank === 2) return "oklch(0.75 0.05 250)";
  if (rank === 3) return "oklch(0.65 0.12 50)";
  return null;
}

export function RankingTab({
  charts,
  onSelectPlayer,
  players: propPlayers,
  loading: propLoading,
  error: propError,
}: Props) {
  const { t } = useLang();
  const { mode, format } = useScale();
  const [internalPlayers, setInternalPlayers] = useState<PlayersDict | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const fetchedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const players = propPlayers !== undefined ? propPlayers : internalPlayers;
  const loading = propLoading !== undefined ? propLoading : internalLoading;
  const error = propError !== undefined ? propError : internalError;

  useEffect(() => {
    if (propPlayers !== undefined) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      setInternalLoading(true);
      setInternalError(null);
      try {
        const data = await fetchPlayersData();
        setInternalPlayers(data);
      } catch (e) {
        setInternalError(e instanceof Error ? e.message : String(e));
      } finally {
        setInternalLoading(false);
      }
    })();
  }, [propPlayers]);

  const rankingChartIds = useMemo(() => {
    const s = new Set<number>();
    for (const c of charts) {
      if (isValidRankingChart(c)) s.add(c.id);
    }
    return s;
  }, [charts]);

  const ranked = useMemo<RankRow[]>(() => {
    if (!players) return [];
    const rows: RankRow[] = Object.entries(players).map(([id, data]) => {
      let nVhard = 0;
      let nHard = 0;
      let nNormal = 0;
      let nFailed = 0;
      let eligPlays = 0;
      let eligHardOrBetter = 0;

      for (const [cidStr, s] of Object.entries(data.c)) {
        if (s === 3) nVhard += 1;
        else if (s === 2) nHard += 1;
        else if (s === 1) nNormal += 1;
        else if (s === 0) nFailed += 1;

        if (rankingChartIds.has(Number(cidStr))) {
          eligPlays += 1;
          if (s >= 2) eligHardOrBetter += 1;
        }
      }

      const nClears = nVhard + nHard + nNormal + nFailed;
      const eligible =
        eligPlays >= MIN_PLAYS && eligHardOrBetter >= MIN_HARD_OR_BETTER;

      return { id, data, nClears, nVhard, nHard, eligible };
    });

    rows.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (a.data.t !== b.data.t) return b.data.t - a.data.t;
      return b.nClears - a.nClears;
    });

    return rows;
  }, [players, rankingChartIds]);

  const unrankedCount = useMemo(
    () => ranked.filter((r) => !r.eligible).length,
    [ranked]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return ranked;
    const q = query.trim().toLowerCase();
    return ranked.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.data.n?.toLowerCase().includes(q)
    );
  }, [ranked, query]);

  const globalRankById = useMemo(() => {
    const m = new Map<string, number>();
    ranked.forEach((r, i) => m.set(r.id, i + 1));
    return m;
  }, [ranked]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 12,
    getItemKey: (index) => filtered[index]?.id ?? index,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-border/40">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            {t.rankingTitle}
            {players && (
              <span className="text-xs font-mono text-muted-foreground font-normal ml-1">
                ({Object.keys(players).length.toLocaleString()} players)
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t.rankingDesc}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t.rankingSearchPlaceholder}
              aria-label={t.rankingSearchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 font-mono text-xs bg-background/50 border-border/80"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {t.ofCharts(filtered.length, ranked.length)}
          </span>
        </div>

        {loading && (
          <div className="py-12 text-center text-sm text-muted-foreground font-mono">
            <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2" />
            <p>{t.computing}</p>
          </div>
        )}

        {error && (
          <div className="py-12 text-center text-sm text-rose-400 font-mono">
            <p className="font-semibold mb-1">{t.loadFailed}</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {unrankedCount > 0 && (
              <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-2.5 text-xs text-muted-foreground leading-relaxed">
                {t.unrankedNote(unrankedCount)}
              </div>
            )}

            <div className="rounded-md border border-border/80 overflow-hidden font-mono text-xs">
              <div ref={scrollRef} className="h-[640px] overflow-y-auto">
                <Table className="w-full">
                  <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                    <TableRow className="border-b border-border text-left">
                      <TableHead className="w-[70px] text-center uppercase font-semibold text-muted-foreground">{t.rankCol}</TableHead>
                      <TableHead className="uppercase font-semibold text-muted-foreground">{t.playerCol}</TableHead>
                      <TableHead className="text-right uppercase font-semibold text-cyan-400">{t.thetaCol(mode === "lerp")}</TableHead>
                      <TableHead className="text-right uppercase font-semibold text-muted-foreground">{t.clearsCol}</TableHead>
                      <TableHead className="text-right uppercase font-semibold text-lamp-hard">{t.hardCol}</TableHead>
                      <TableHead className="text-right uppercase font-semibold text-lamp-vhard">{t.vhardCol}</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody className="divide-y divide-border/30">
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-10 font-mono">
                          {t.noMatch}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {paddingTop > 0 && (
                          <TableRow aria-hidden className="border-0 hover:bg-transparent">
                            <TableCell colSpan={6} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} />
                          </TableRow>
                        )}

                        {virtualItems.map((virtualRow) => {
                          const r = filtered[virtualRow.index];
                          const gRank = ranked.indexOf(r) + 1;
                          const medalColor = rankBadgeColor(gRank);

                          return (
                            <TableRow
                              key={r.id}
                              data-index={virtualRow.index}
                              ref={rowVirtualizer.measureElement}
                              onClick={() => onSelectPlayer(r.id, r.data)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onSelectPlayer(r.id, r.data);
                                }
                              }}
                              tabIndex={0}
                              role="button"
                              aria-label={`View profile for ${r.data.n || r.id}`}
                              className="cursor-pointer hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry-cyan focus-visible:bg-muted/30"
                            >
                              <TableCell className="text-center font-mono py-2.5">
                                {medalColor ? (
                                  <span
                                    className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold"
                                    style={{
                                      background: medalColor,
                                      color: "oklch(0.12 0 0)",
                                    }}
                                    title={`Rank ${gRank}`}
                                  >
                                    #{gRank}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground tabular-nums">#{gRank}</span>
                                )}
                              </TableCell>

                              <TableCell className="py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm font-jp truncate max-w-[320px] text-foreground" title={r.id}>
                                    {r.data.n ? r.data.n : r.id}
                                  </span>
                                  {r.data.n && (
                                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={r.id}>
                                      ({r.id})
                                    </span>
                                  )}
                                  {!r.eligible && (
                                    <span
                                      className="text-[10px] py-0.2 px-1 rounded font-mono text-muted-foreground border border-border/60 bg-muted/40 shrink-0"
                                    >
                                      {t.lang === "en" ? "ineligible" : "비대상"}
                                    </span>
                                  )}
                                </div>
                              </TableCell>

                              <TableCell className="text-right font-mono text-sm py-2.5">
                                <span
                                  className={cn(
                                    "font-bold tabular-nums",
                                    r.eligible ? "text-cyan-400" : "text-muted-foreground"
                                  )}
                                >
                                  {format(r.data.t, mode === "lerp" ? 2 : 3)}
                                </span>
                              </TableCell>

                              <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums py-2.5">
                                {r.nClears}
                              </TableCell>

                              <TableCell className="text-right font-mono text-xs py-2.5">
                                <span
                                  className={cn(
                                    "tabular-nums",
                                    r.nHard > 0 ? "text-lamp-hard font-medium" : "text-muted-foreground/80"
                                  )}
                                >
                                  {r.nHard}
                                </span>
                              </TableCell>

                              <TableCell className="text-right font-mono text-xs py-2.5">
                                <span
                                  className={cn(
                                    "tabular-nums",
                                    r.nVhard > 0 ? "text-lamp-vhard font-medium" : "text-muted-foreground/80"
                                  )}
                                >
                                  {r.nVhard}
                                </span>
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
          </>
        )}
      </div>
    </div>
  );
}
