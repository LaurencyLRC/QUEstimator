"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface Props {
  charts: Chart[];
  onSelectPlayer: (id: string, data: PlayerData) => void;
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
const EXCLUDED_LEVELS = new Set(["-_", "?!", "◆"]);

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

export function RankingTab({ charts, onSelectPlayer }: Props) {
  const { t } = useLang();
  const { mode, format } = useScale();
  const [players, setPlayers] = useState<PlayersDict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("data/players.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PlayersDict;
        setPlayers(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    return ranked.filter((r) => r.id.toLowerCase().includes(q));
  }, [ranked, query]);

  const globalRankById = useMemo(() => {
    const m = new Map<string, number>();
    ranked.forEach((r, i) => m.set(r.id, i + 1));
    return m;
  }, [ranked]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          {t.rankingTitle}
          {players && (
            <span className="text-xs text-muted-foreground font-normal ml-1">
              ({Object.keys(players).length.toLocaleString()})
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {t.rankingDesc}
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t.rankingSearchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {t.ofCharts(filtered.length, ranked.length)}
          </span>
        </div>

        {loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2" />
            <p>{t.computing}</p>
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-sm text-rose-400">
            <p className="font-semibold mb-1">{t.loadFailed}</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {unrankedCount > 0 && (
              <div className="mb-3 rounded-md border border-border/40 bg-muted/20 p-2 text-[11px] text-muted-foreground leading-relaxed">
                {t.unrankedNote(unrankedCount)}
              </div>
            )}
            <div className="rounded-md border border-border/60 overflow-hidden">
              <ScrollArea className="h-[640px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="w-[60px] text-right">{t.rankCol}</TableHead>
                      <TableHead>{t.playerCol}</TableHead>
                      <TableHead className="text-right">{t.thetaCol(mode === "lerp")}</TableHead>
                      <TableHead className="text-right">{t.clearsCol}</TableHead>
                      <TableHead className="text-right">{t.hardCol}</TableHead>
                      <TableHead className="text-right">{t.vhardCol}</TableHead>
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
                    {filtered.map((r) => {
                      const gRank = globalRankById.get(r.id) ?? 0;
                      const medalColor = rankBadgeColor(gRank);
                      return (
                        <TableRow
                          key={r.id}
                          onClick={() => onSelectPlayer(r.id, r.data)}
                          className="cursor-pointer hover:bg-muted/40"
                        >
                          <TableCell className="text-right font-mono text-sm">
                            {medalColor ? (
                              <span
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold"
                                style={{
                                  background: medalColor,
                                  color: "oklch(0.20 0 0)",
                                }}
                                title={`Rank ${gRank}`}
                              >
                                {gRank}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{gRank}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate max-w-[320px]" title={r.id}>
                                {r.id}
                              </span>
                              {!r.eligible && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] py-0 px-1 text-muted-foreground border-border/60 shrink-0"
                                >
                                  {t.lang === "en" ? "ineligible" : "비대상"}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span
                              className={r.eligible ? "font-semibold" : "font-semibold text-muted-foreground"}
                              style={r.eligible ? { color: "oklch(0.78 0.18 200)" } : undefined}
                            >
                              {format(r.data.t, mode === "lerp" ? 2 : 3)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {r.nClears}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span style={{ color: r.nHard > 0 ? "oklch(0.78 0.18 25)" : "text-muted-foreground" }}>
                              {r.nHard}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span style={{ color: r.nVhard > 0 ? "oklch(0.78 0.18 305)" : "text-muted-foreground" }}>
                              {r.nVhard}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}