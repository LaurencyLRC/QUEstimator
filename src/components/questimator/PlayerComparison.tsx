import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Swords, Trophy, Shield } from "lucide-react";
import { Chart, PlayerData } from "@/lib/questimator-types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface Props {
  activePlayer: PlayerData;
  activePlayerId: string;
  rivalPlayer: PlayerData | null;
  rivalId: string;
  onSearchRival: (id: string) => void;
  chartById: Map<number, Chart>;
  targetStatus: number;
  t: any;
  format: (v: number) => string;
  rivalNotFound: boolean;
}

export function PlayerComparison({
  activePlayer,
  activePlayerId,
  rivalPlayer,
  rivalId,
  onSearchRival,
  chartById,
  targetStatus,
  t,
  format,
  rivalNotFound
}: Props) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchRival(query.trim());
  };

  const comparison = useMemo(() => {
    if (!activePlayer || !rivalPlayer) return null;

    const p1Clears = new Set<number>();
    const p2Clears = new Set<number>();

    for (const [idStr, status] of Object.entries(activePlayer.c || {})) {
      if (status >= targetStatus) p1Clears.add(Number(idStr));
    }
    for (const [idStr, status] of Object.entries(rivalPlayer.c || {})) {
      if (status >= targetStatus) p2Clears.add(Number(idStr));
    }

    const both = new Set<number>();
    const p1Only = new Set<number>();
    const p2Only = new Set<number>();

    for (const id of p1Clears) {
      if (p2Clears.has(id)) both.add(id);
      else p1Only.add(id);
    }
    for (const id of p2Clears) {
      if (!p1Clears.has(id)) p2Only.add(id);
    }

    const mapToCharts = (set: Set<number>) => {
      const arr: Chart[] = [];
      for (const id of set) {
        const c = chartById.get(id);
        if (c) arr.push(c);
      }
      return arr.sort((a, b) => {
        const lA = parseFloat(a.level) || 0;
        const lB = parseFloat(b.level) || 0;
        return lB - lA; // Sort highest level first
      });
    };

    return {
      p1Only: mapToCharts(p1Only),
      p2Only: mapToCharts(p2Only),
      bothCount: both.size,
      p1Count: p1Clears.size,
      p2Count: p2Clears.size
    };
  }, [activePlayer, rivalPlayer, targetStatus, chartById]);

  return (
    <Card className="gap-3 py-4 mt-6 border-indigo-500/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-indigo-400">
          <Swords className="w-5 h-5" />
          {t.lang === "en" ? "Rival Comparison" : "라이벌 비교"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t.lang === "en" ? "Enter Rival Avatar ID" : "라이벌 Avatar ID 입력"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit">{t.lang === "en" ? "Compare" : "비교"}</Button>
        </form>

        {rivalNotFound && (
          <div className="text-sm text-destructive">
            {t.lang === "en" ? "Rival not found." : "라이벌을 찾을 수 없습니다."}
          </div>
        )}

        {rivalPlayer && comparison && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-card border flex flex-col items-center">
                <span className="text-xs text-muted-foreground mb-1">{activePlayerId}</span>
                <span className="text-2xl font-bold font-mono text-cyan-400">
                  {format(activePlayer.t)}
                </span>
                <span className="text-xs text-muted-foreground mt-2">{comparison.p1Count} Clears</span>
              </div>
              <div className="p-4 rounded-lg bg-card border flex flex-col items-center">
                <span className="text-xs text-muted-foreground mb-1">{rivalId}</span>
                <span className="text-2xl font-bold font-mono text-rose-400">
                  {format(rivalPlayer.t)}
                </span>
                <span className="text-xs text-muted-foreground mt-2">{comparison.p2Count} Clears</span>
              </div>
            </div>

            {/* Venn Diagram simple visualization */}
            <div className="flex items-center justify-between px-4 py-6 rounded-lg bg-muted/30 border">
              <div className="text-center">
                <div className="text-sm font-bold text-cyan-400">{comparison.p1Only.length}</div>
                <div className="text-xs text-muted-foreground">{t.lang === "en" ? "Unique" : "독자 클리어"}</div>
              </div>
              <div className="flex-1 flex justify-center">
                <div className="w-32 h-16 relative">
                  <div className="absolute left-0 w-16 h-16 rounded-full border-4 border-cyan-400/50 mix-blend-screen" />
                  <div className="absolute right-0 w-16 h-16 rounded-full border-4 border-rose-400/50 mix-blend-screen" />
                  <div className="absolute inset-0 flex items-center justify-center font-bold text-sm">
                    {comparison.bothCount}
                  </div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-rose-400">{comparison.p2Only.length}</div>
                <div className="text-xs text-muted-foreground">{t.lang === "en" ? "Unique" : "독자 클리어"}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-cyan-400">
                  <Shield className="w-4 h-4" />
                  {t.lang === "en" ? "Defended (You have, Rival doesn't)" : "방어 (나만 클리어)"}
                </div>
                <ScrollArea className="h-48 rounded-md border p-2">
                  <div className="space-y-1">
                    {comparison.p1Only.length === 0 && (
                      <div className="text-xs text-muted-foreground p-2">None</div>
                    )}
                    {comparison.p1Only.map(c => (
                      <div key={c.id} className="flex justify-between items-center text-xs p-1 rounded hover:bg-muted">
                        <span className="truncate pr-2">{c.title}</span>
                        <Badge variant="outline" className="font-mono text-[10px] shrink-0">Lv {c.level}</Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-rose-400">
                  <Trophy className="w-4 h-4" />
                  {t.lang === "en" ? "Snipe List (Rival has, You don't)" : "스나이프 대상 (라이벌만 클리어)"}
                </div>
                <ScrollArea className="h-48 rounded-md border p-2">
                  <div className="space-y-1">
                    {comparison.p2Only.length === 0 && (
                      <div className="text-xs text-muted-foreground p-2">None</div>
                    )}
                    {comparison.p2Only.map(c => (
                      <div key={c.id} className="flex justify-between items-center text-xs p-1 rounded hover:bg-muted">
                        <span className="truncate pr-2">{c.title}</span>
                        <Badge variant="outline" className="font-mono text-[10px] shrink-0">Lv {c.level}</Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}
