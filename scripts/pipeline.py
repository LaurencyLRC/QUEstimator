You are absolutely right. I mistakenly assumed a new translation key was needed
when the UI actually uses dynamic mapping (sortKeys) which already included
b_hard: "HARD difficulty". Thank you for catching that!

Here are the full contents of the 5 files with all the fixes applied (the
infinite loop fix, setting the default sort to HARD, changing the interpolation
base to HARD, and updating the player tab/ranking tab/pipeline strictly to focus
on HARD clear).

src/app/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BoxPlot } from "@/components/questimator/BoxPlot";
import { ChartTable, type SortKey, type SortDir } from "@/components/questimator/ChartTable";
import { ChartDetailDialog } from "@/components/questimator/ChartDetailDialog";
import { LangToggle } from "@/components/questimator/LangToggle";
import { ScaleToggle } from "@/components/questimator/ScaleToggle";
import { RankingTab } from "@/components/questimator/RankingTab";
import { PlayerTab } from "@/components/questimator/PlayerTab";
import { useLang } from "@/lib/i18n";
import { ScaleProvider, useScale } from "@/lib/value-scale";
import type {
  Chart,
  LevelSummary,
  Meta,
  PlayerData,
  PlayersDict
} from "@/lib/questimator-types";
import {
  levelSortKey,
  levelLabel,
  isSpecialLevel
} from "@/lib/questimator-types";
import {
  BarChart3,
  ListTree,
  Sigma,
  Trophy,
  User
} from "lucide-react";

export default function Home() {
  const { t } = useLang();
  const [charts, setCharts] = useState<Chart[]>([]);
  const [levels, setLevels] = useState<LevelSummary[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedChart, setSelectedChart] = useState<Chart | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [sortKey, setSortKey] = useState<SortKey>("b_hard");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [playersData, setPlayersData] = useState<PlayersDict | null>(null);
  const [activePlayer, setActivePlayer] = useState<{ id: string; data: PlayerData } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, l, m] = await Promise.all([
          fetch("data/charts.json").then((r) => r.json()),
          fetch("data/level-summary.json").then((r) => r.json()),
          fetch("data/meta.json").then((r) => r.json()),
        ]);
        setCharts(c);
        setLevels(l);
        setMeta(m);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sortedLevels = useMemo(
    () =>
      [...levels].sort((a, b) => {
        const [ax, ay] = levelSortKey(a.level);
        const [bx, by] = levelSortKey(b.level);
        return ax - bx || ay - by;
      }),
    [levels]
  );

  const plotLevels = useMemo(
    () =>
      sortedLevels.filter((l) => {
        if (isSpecialLevel(l.level)) return true;
        const n = parseInt(l.level, 10);
        return n >= 20;
      }),
    [sortedLevels]
  );

  const levelCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of charts) m.set(c.level, (m.get(c.level) ?? 0) + 1);
    return m;
  }, [charts]);

  const filteredCharts = useMemo(() => {
    if (selectedLevel === "all") return charts;
    return charts.filter((c) => c.level === selectedLevel);
  }, [charts, selectedLevel]);

  const handleSelectChart = (c: Chart) => {
    setSelectedChart(c);
    setDetailOpen(true);
  };

  const handleSelectLevelFromPlot = (level: string) => {
    setSelectedLevel(level);
    setTab("charts");
  };

  const handleSelectPlayerFromRanking = (id: string, data: PlayerData) => {
    setActivePlayer({ id, data });
    setTab("player");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">{t.computing}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-rose-400">
          <p className="font-semibold mb-2">{t.loadFailed}</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <ScaleProvider levels={levels}>
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rose-500 via-purple-500 to-cyan-500 flex items-center justify-center">
                <Sigma className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight">
                  QUEstimator
                </h1>
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  {t.subtitle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <ScaleToggle />
              <LangToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-6 max-w-2xl">
              <TabsTrigger value="overview" className="text-xs sm:text-sm">
                <BarChart3 className="w-4 h-4 mr-1.5 hidden sm:block" /> {t.overview}
              </TabsTrigger>
              <TabsTrigger value="charts" className="text-xs sm:text-sm">
                <ListTree className="w-4 h-4 mr-1.5 hidden sm:block" /> {t.chartsTab}
              </TabsTrigger>
              <TabsTrigger value="player" className="text-xs sm:text-sm">
                <User className="w-4 h-4 mr-1.5 hidden sm:block" /> {t.player}
              </TabsTrigger>
              <TabsTrigger value="ranking" className="text-xs sm:text-sm">
                <Trophy className="w-4 h-4 mr-1.5 hidden sm:block" /> {t.ranking}
              </TabsTrigger>
              <TabsTrigger value="about" className="text-xs sm:text-sm">
                <Sigma className="w-4 h-4 mr-1.5 hidden sm:block" /> {t.about}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-0">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    {t.levelDistribution}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {meta
                      ? t.levelDistributionDesc(meta.n_charts_valid, meta.n_charts_provisional)
                      : t.levelDistributionDesc(0, 0)}
                  </p>
                </CardHeader>
                <CardContent>
                  <BoxPlot
                    data={plotLevels}
                    onSelectLevel={handleSelectLevelFromPlot}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {t.perLevelAggregates}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {t.perLevelDesc}
                  </p>
                </CardHeader>
                <CardContent>
                  <LevelAggregatesTable levels={plotLevels} onSelectLevel={handleSelectLevelFromPlot} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="charts" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
                <Card className="h-fit md:sticky md:top-[88px]">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">{t.levels}</CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 pb-3">
                    <ScrollArea className="h-[60vh] pr-2">
                      <div className="space-y-0.5">
                        <button
                          onClick={() => setSelectedLevel("all")}
                          className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                            selectedLevel === "all"
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted/60"
                          }`}
                        >
                          {t.allCharts}
                          <span className="float-right text-xs opacity-70">
                            {charts.length}
                          </span>
                        </button>
                        {sortedLevels.map((l) => (
                          <button
                            key={l.level}
                            onClick={() => setSelectedLevel(l.level)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                              selectedLevel === l.level
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted/60"
                            }`}
                          >
                            <span className="font-mono">
                              {isSpecialLevel(l.level) && (
                                <span className="text-amber-400 mr-1">●</span>
                              )}
                              {l.level}
                            </span>
                            <span className="float-right text-xs opacity-70">
                              {levelCounts.get(l.level) ?? 0}
                            </span>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <div>
                  <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {selectedLevel === "all"
                          ? t.allChartsTitle
                          : `${levelLabel(selectedLevel)}`}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {t.chartsCount(filteredCharts.length)} · {t.sortBy(t.sortKeys[sortKey], t.sortDirs[sortDir])}
                      </p>
                    </div>
                  </div>
                  <ChartTable
                    charts={filteredCharts}
                    onSelectChart={handleSelectChart}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
                    activePlayer={activePlayer}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="player" className="mt-0 space-y-6">
              <PlayerTab
                charts={charts}
                samplePlayers={null} 
                playerThetaMean={meta?.player_theta_mean ?? 0}
                playerThetaStd={meta?.player_theta_std ?? 1}
                onSelectChart={handleSelectChart}
                activePlayerExternal={activePlayer}
                onPlayerChange={(id, player) => {
                  setActivePlayer((prev) => {
                    if (!player) return prev === null ? prev : null;
                    if (prev?.id === id) return prev;
                    return { id: id!, data: player };
                  });
                }}
              />
            </TabsContent>

            <TabsContent value="ranking" className="mt-0">
              <RankingTab
                charts={charts}
                onSelectPlayer={handleSelectPlayerFromRanking}
              />
            </TabsContent>

            <TabsContent value="about" className="mt-0">
              <AboutTab meta={meta} />
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <ChartDetailDialog
        chart={selectedChart}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        activePlayer={activePlayer}
      />
    </ScaleProvider>
  );
}

function LevelAggregatesTable({ levels, onSelectLevel }: { levels: LevelSummary[], onSelectLevel: (l: string) => void }) {
  const { t } = useLang();
  const { format } = useScale();

  return (
    <div className="max-h-[420px] overflow-y-auto rounded-md border border-border/50">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border/60 text-left">
            <th className="px-3 py-2 font-medium text-muted-foreground">{t.level}</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-right">{t.chartsCol}</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-right">{t.hardMed}</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-right">{t.hardIQR}</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-right">{t.vhardMed}</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-right">{t.vhardIQR}</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((l) => (
            <tr
              key={l.level}
              className="border-b border-border/30 hover:bg-muted/30 cursor-pointer"
              onClick={() => onSelectLevel(l.level)}
            >
              <td className="px-3 py-1.5 font-mono">
                <span className={isSpecialLevel(l.level) ? "text-amber-400" : ""}>
                  {l.level}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                {l.n_charts_valid}/{l.n_charts_total}
              </td>
              <td className="px-3 py-1.5 text-right font-mono" style={{ color: "oklch(0.78 0.18 25)" }}>
                {format(l.hard_median)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                {l.hard_q1 != null && l.hard_q3 != null
                  ? `[${format(l.hard_q1)}, ${format(l.hard_q3)}]`
                  : "–"}
              </td>
              <td className="px-3 py-1.5 text-right font-mono" style={{ color: "oklch(0.78 0.18 305)" }}>
                {format(l.vhard_median)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                {l.vhard_q1 != null && l.vhard_q3 != null
                  ? `[${format(l.vhard_q1)}, ${format(l.vhard_q3)}]`
                  : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AboutTab({ meta }: { meta: Meta | null }) {
  const { t } = useLang();
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.projectOverview}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {t.lang === "en" ? (
            <>
              <p>
                <strong className="text-foreground">QUEstimator</strong> is a
                data-driven difficulty estimation system for 6-key charts on the
                U_E scale in <span className="text-foreground">Qwilight</span>. By
                applying Item Response Theory (IRT), it evaluates the precise
                difficulty of achieving HARD and V-HARD clears, providing players
                with highly accurate, community-calibrated targets.
              </p>
              <p>
                Qwilight is uniquely suited for this due to its{" "}
                <strong className="text-foreground">Gauge Auto-Shift (GAS)</strong>{" "}
                system. Because a failed V-HARD run automatically continues at HARD,
                the clear status recorded on the Internet Ranking (IR) represents
                a player&apos;s exact, organic peak performance threshold. We do
                not need to guess what would have happened if they played a
                different gauge – the game does it for us.
              </p>
              <p className="text-xs">
                Inspired by{" "}
                <a
                  href="https://github.com/HorieYuuka"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  HorieYuuka&apos;s Scale Analyzer
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <p>
                <strong className="text-foreground">QUEstimator</strong>는{" "}
                <span className="text-foreground">Qwilight</span>의 U_E 스케일
                6키 채보를 위한 데이터 기반 난이도 추정 시스템입니다. 문항반응이론
                (IRT)을 적용하여 HARD 및 V-HARD 클리어 달성의 정확한 난이도를
                평가하며, 플레이어에게 고정밀도의 커뮤니티 보정 목표를 제공합니다.
              </p>
              <p>
                Qwilight는{" "}
                <strong className="text-foreground">Gauge Auto-Shift (GAS)</strong>{" "}
                시스템 덕분에 이 용도에 특히 적합합니다. V-HARD 실패 시 자동으로
                HARD로 이어지기 때문에, 인터넷 랭킹(IR)에 기록되는 클리어 상태는
                플레이어의 정확하고 자연스러운 최고 성과 임계값을 나타냅니다.
                다른 게이지로 플레이했다면 어땠을지 추측할 필요가 없습니다 –
                게임이 대신 해줍니다.
              </p>
              <p className="text-xs">
                {" "}
                <a
                  href="https://github.com/HorieYuuka"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  HorieYuuka의 Scale Analyzer
                </a>
                에서 영감을 받았습니다.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.methodology}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {t.lang === "en" ? (
            <>
              <p>
                To handle the ordered clear statuses generated by the GAS system,
                the system uses a <strong className="text-foreground">Graded
                Response Model (GRM)</strong>. The categories represent strict,
                ordered survival thresholds: FAILED → NORMAL → HARD → V-HARD.
              </p>
              <div className="rounded-md border border-border/50 bg-card/40 p-3 font-mono text-xs">
                <div className="text-muted-foreground mb-1">P*(θ, k) = 1 / (1 + exp(−a · (θ − b<sub>k</sub>)))</div>
                <div className="text-[11px]">
                  The probability that a player with latent skill θ survives the
                  gauge drop of tier k.
                </div>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>
                  <strong className="text-foreground">θ (Player Ability)</strong>:
                  latent skill level. Estimated from the population distribution,
                  anchored to N(0, σ²).
                </li>
                <li>
                  <strong className="text-foreground">a (Discrimination)</strong>:
                  slope of the curve. High a = strict gatekeeper; low a = high
                  variance (e.g. spammy or subjective patterns).
                </li>
                <li>
                  <strong className="text-foreground">b<sub>k</sub> (Difficulty)</strong>:
                  the player skill at which P*(θ, k) = 50%. Reported separately
                  for HARD and V-HARD tiers.
                </li>
              </ul>
              <div className="rounded-md border border-border/40 bg-muted/20 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground/80">Note on NORMAL:</strong> The
                model internally estimates a third threshold for NORMAL clears,
                but it is not surfaced in the dashboard. The NORMAL gauge is
                currently being reworked by the Qwilight developer, and its
                difficulty values will be displayed once the gauge mechanics are
                finalized.
              </div>
            </>
          ) : (
            <>
              <p>
                GAS 시스템이 생성하는 순서형 클리어 상태를 처리하기 위해
                <strong className="text-foreground"> 등급 반응 모델 (GRM)</strong>을
                사용합니다. 카테고리는 엄격한 순서형 생존 임계값을 나타냅니다:
                FAILED → NORMAL → HARD → V-HARD.
              </p>
              <div className="rounded-md border border-border/50 bg-card/40 p-3 font-mono text-xs">
                <div className="text-muted-foreground mb-1">P*(θ, k) = 1 / (1 + exp(−a · (θ − b<sub>k</sub>)))</div>
                <div className="text-[11px]">
                  잠재 능력 θ를 가진 플레이어가 tier k의 게이지 드롭에서
                  생존할 확률.
                </div>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>
                  <strong className="text-foreground">θ (플레이어 능력)</strong>:
                  잠재 능력 수준. 모집단 분포에서 추정되며 N(0, σ²)에 고정됩니다.
                </li>
                <li>
                  <strong className="text-foreground">a (변별도)</strong>:
                  곡선의 기울기. a가 높으면 엄격한 관문; a가 낮으면 높은 분산
                  (예: 스팸성 또는 주관적인 패턴).
                </li>
                <li>
                  <strong className="text-foreground">b<sub>k</sub> (난이도)</strong>:
                  P*(θ, k) = 50%가 되는 플레이어 능력. HARD 및 V-HARD tier에
                  대해 별도로 보고됩니다.
                </li>
              </ul>
              <div className="rounded-md border border-border/40 bg-muted/20 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground/80">NORMAL 참고:</strong>{" "}
                모델은 내부적으로 NORMAL 클리어에 대한 세 번째 임계값을 추정하지만,
                대시보드에는 표시하지 않습니다. NORMAL 게이지는 현재 Qwilight
                개발자에 의해 재작업 중이며, 게이지 메커니즘이 확정되면 난이도
                값이 표시될 예정입니다.
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.pipelineState}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border/50 p-2">
              <div className="text-muted-foreground text-[10px] uppercase">{t.model}</div>
              <div className="font-mono">{meta?.model}</div>
            </div>
            <div className="rounded-md border border-border/50 p-2">
              <div className="text-muted-foreground text-[10px] uppercase">{t.categories}</div>
              <div className="font-mono">{meta?.categories.join(" → ")}</div>
            </div>
            <div className="rounded-md border border-border/50 p-2">
              <div className="text-muted-foreground text-[10px] uppercase">{t.provisionalRule}</div>
              <div className="font-mono text-[11px]">{meta?.provisional_rule}</div>
            </div>
            <div className="rounded-md border border-border/50 p-2">
              <div className="text-muted-foreground text-[10px] uppercase">{t.runtimeLabel}</div>
              <div className="font-mono">{meta?.runtime_sec}s</div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>{t.techStack}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          {t.lang === "en" ? (
            <>
              <div><strong className="text-foreground">Data pipeline:</strong> Python 3 · NumPy · SciPy · pandas</div>
              <div><strong className="text-foreground">Statistical model:</strong> Bayesian Graded Response Model (MCMC NUTS via Numpyro)</div>
              <div><strong className="text-foreground">Frontend:</strong> Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui</div>
              <div><strong className="text-foreground">Visualization:</strong> Custom SVG (box plots, GRM curves)</div>
              <div><strong className="text-foreground">Scale mapping:</strong> Piecewise linear interpolation (LERP) over posterior medians</div>
              <div><strong className="text-foreground">Automation target:</strong> GitHub Actions cron → static JSON</div>
            </>
          ) : (
            <>
              <div><strong className="text-foreground">데이터 파이프라인:</strong> Python 3 · NumPy · SciPy · pandas</div>
              <div><strong className="text-foreground">통계 모델:</strong> 베이지안 등급 반응 모델 (Numpyro 기반 MCMC NUTS)</div>
              <div><strong className="text-foreground">프론트엔드:</strong> Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui</div>
              <div><strong className="text-foreground">시각화:</strong> 커스텀 SVG (박스 플롯, GRM 곡선)</div>
              <div><strong className="text-foreground">스케일 변환:</strong> 사후 중앙값 기반 구간 선형 보간 (LERP)</div>
              <div><strong className="text-foreground">자동화 목표:</strong> GitHub Actions cron → 정적 JSON</div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

src/lib/value-scale.tsx

"use client";

import { createContext, useContext, useState, useEffect, type ReactNode, useMemo } from "react";
import type { LevelSummary } from "./questimator-types";

export type ScaleMode = "lerp" | "raw";

interface ScaleContextValue {
  mode: ScaleMode;
  setMode: (m: ScaleMode) => void;
  toScale: (logit: number | null | undefined) => number | null;
  format: (logit: number | null | undefined, digits?: number) => string;
}

const ScaleContext = createContext<ScaleContextValue | null>(null);

export function ScaleProvider({ children, levels }: { children: ReactNode; levels: LevelSummary[] }) {
  const [mode, setModeState] = useState<ScaleMode>("lerp");

  useEffect(() => {
    const saved = localStorage.getItem("questimator_scale") as ScaleMode;
    if (saved === "raw" || saved === "lerp") setModeState(saved);
  }, []);

  const setMode = (m: ScaleMode) => {
    setModeState(m);
    localStorage.setItem("questimator_scale", m);
  };

  const anchors = useMemo(() => {
    const pts: { num: number; val: number }[] = [];
    for (const l of levels) {
      let num = parseInt(l.level);
      if (l.level === "Ω") num = 31;
      if (!isNaN(num) && l.hard_median != null) {
        pts.push({ num, val: l.hard_median });
      }
    }
    pts.sort((a, b) => a.num - b.num);
    // Enforce strict monotonicity (handles edge case noise)
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].val <= pts[i - 1].val) {
        pts[i].val = pts[i - 1].val + 0.001;
      }
    }
    return pts;
  }, [levels]);

  const toScale = (logit: number | null | undefined): number | null => {
    if (logit == null || Number.isNaN(logit)) return null;
    if (mode === "raw" || anchors.length < 2) return logit;

    const val = logit;
    if (val <= anchors[0].val) {
      const a = anchors[0], b = anchors[1];
      return a.num + ((val - a.val) * (b.num - a.num)) / (b.val - a.val);
    }
    if (val >= anchors[anchors.length - 1].val) {
      const a = anchors[anchors.length - 2], b = anchors[anchors.length - 1];
      return a.num + ((val - a.val) * (b.num - a.num)) / (b.val - a.val);
    }
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      if (val >= a.val && val <= b.val) {
        return a.num + ((val - a.val) * (b.num - a.num)) / (b.val - a.val);
      }
    }
    return val;
  };

  const format = (logit: number | null | undefined, digits = 2) => {
    const v = toScale(logit);
    if (v == null) return "–";
    if (mode === "raw") {
      const sign = v >= 0 ? "+" : "";
      return `${sign}${v.toFixed(digits)}`;
    }
    return v.toFixed(digits); // mapped LERP values are typically un-prefixed positive scale ranks 
  };

  const value: ScaleContextValue = {
    mode,
    setMode,
    toScale,
    format,
  };

  return <ScaleContext.Provider value={value}>{children}</ScaleContext.Provider>;
}

export function useScale() {
  const ctx = useContext(ScaleContext);
  if (!ctx) throw new Error("useScale must be used within ScaleProvider");
  return ctx;
}

src/components/questimator/PlayerTab.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Search, User, Target, Sparkles, TrendingUp } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import {
  type Chart,
  type PlayerData,
  type PlayersDict,
  type SamplePlayers,
  pStar,
  levelSortKey,
  levelLabel,
  isSpecialLevel,
} from "@/lib/questimator-types";
import { PlayerSkillHistogram } from "@/components/questimator/PlayerSkillHistogram";

interface Props {
  charts: Chart[];
  samplePlayers: SamplePlayers | null;
  playerThetaMean: number;
  playerThetaStd: number;
  onSelectChart: (c: Chart) => void;
  activePlayerExternal?: { id: string; data: PlayerData } | null;
  onPlayerChange: (avatarID: string | null, player: PlayerData | null) => void;
}

const STATUS_LABELS: Record<number, { short: string; color: string }> = {
  0: { short: "F",  color: "oklch(0.55 0 0)"        },
  1: { short: "N",  color: "oklch(0.72 0.16 95)"    },
  2: { short: "H",  color: "oklch(0.70 0.22 25)"    },
  3: { short: "VH", color: "oklch(0.70 0.22 305)"   },
};

const REC_MIN_PROB = 0.30;
const REC_MAX_PROB = 0.70;
const REC_LIMIT = 24;

const PROB_MIN_THRESHOLD = 0.05;
const PROB_LIMIT = 60;

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function pHard(theta: number, c: Chart): number | null {
  if (c.a == null || c.b_hard == null) return null;
  return pStar(theta, c.a, c.b_hard);
}

export function PlayerTab({
  charts,
  samplePlayers,
  playerThetaMean,
  playerThetaStd,
  onSelectChart,
  activePlayerExternal,
  onPlayerChange,
}: Props) {
  const { t } = useLang();
  const { mode, format } = useScale();
  const [query, setQuery] = useState("");
  const [submittedID, setSubmittedID] = useState("");
  const [players, setPlayers] = useState<PlayersDict | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchPlayers = useRef<( () => Promise<PlayersDict | null> ) | null>(null);

  useEffect(() => {
    fetchPlayers.current = async () => {
      if (players) return players;
      setLoadingPlayers(true);
      setLoadError(null);
      try {
        const res = await fetch("data/players.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PlayersDict;
        setPlayers(data);
        return data;
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setLoadingPlayers(false);
      }
    };
  }, [players]);

  const currentPlayer = useMemo<PlayerData | null>(() => {
    if (activePlayerExternal) return activePlayerExternal.data;
    if (!players || !submittedID) return null;
    return players[submittedID] ?? null;
  }, [players, submittedID, activePlayerExternal]);

  useEffect(() => {
    onPlayerChange(currentPlayer ? (activePlayerExternal?.id ?? submittedID) : null, currentPlayer);
  }, [currentPlayer, submittedID, activePlayerExternal, onPlayerChange]);

  const handleSearch = async () => {
    const id = query.trim();
    if (!id) return;
    const data = await fetchPlayers.current?.();
    if (!data) {
      setSubmittedID("");
      setNotFound(false);
      return;
    }
    const foundId = Object.keys(data).find(k => k.toLowerCase() === id.toLowerCase());
    if (foundId) {
      setSubmittedID(foundId);
      setNotFound(false);
    } else {
      setSubmittedID("");
      setNotFound(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const analytics = useMemo(() => {
    if (!currentPlayer) return null;

    const chartById = new Map<number, Chart>();
    for (const c of charts) chartById.set(c.id, c);

    const statusCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const s of Object.values(currentPlayer.c)) {
      if (s >= 0 && s <= 3) statusCounts[s as 0 | 1 | 2 | 3] += 1;
    }
    const totalClears = statusCounts[0] + statusCounts[1] + statusCounts[2] + statusCounts[3];

    const theta = currentPlayer.t;
    type Rec = { chart: Chart; p: number };
    const recommendations: Rec[] = [];
    const allProbabilities: Rec[] = [];

    for (const c of charts) {
      if (c.provisional) continue;
      const p = pHard(theta, c);
      if (p == null) continue;
      const status = currentPlayer.c[String(c.id)];
      if (status >= 2) continue; // Skip if HARD or V-HARD cleared

      if (p >= PROB_MIN_THRESHOLD) {
        allProbabilities.push({ chart: c, p });
      }
      if (p >= REC_MIN_PROB && p <= REC_MAX_PROB) {
        recommendations.push({ chart: c, p });
      }
    }

    recommendations.sort((a, b) => {
      const da = Math.abs(a.p - 0.5);
      const db = Math.abs(b.p - 0.5);
      if (Math.abs(da - db) > 1e-6) return da - db;
      return (b.chart.b_hard_display ?? -99) - (a.chart.b_hard_display ?? -99);
    });
    const recommendationsLimited = recommendations.slice(0, REC_LIMIT);

    allProbabilities.sort((a, b) => b.p - a.p);
    const allProbabilitiesLimited = allProbabilities.slice(0, PROB_LIMIT);

    const clearedByLevel = new Map<string, number>();
    for (const [idStr, status] of Object.entries(currentPlayer.c)) {
      if (status < 2) continue; // 2 is HARD, 3 is V-HARD
      const c = chartById.get(Number(idStr));
      if (!c) continue;
      clearedByLevel.set(c.level, (clearedByLevel.get(c.level) ?? 0) + 1);
    }
    const clearedLevels = [...clearedByLevel.entries()].sort((a, b) => {
      const [ax, ay] = levelSortKey(a[0]);
      const [bx, by] = levelSortKey(b[0]);
      return ax - bx || ay - by;
    });

    return {
      statusCounts,
      totalClears,
      recommendations: recommendationsLimited,
      allProbabilities: allProbabilitiesLimited,
      clearedLevels,
    };
  }, [currentPlayer, charts]);

  const percentile = useMemo(() => {
    if (!currentPlayer || !samplePlayers) return null;
    const edges = samplePlayers.theta_edges;
    const hist = samplePlayers.theta_histogram;
    const theta = currentPlayer.t;
    let total = 0;
    let below = 0;
    for (let i = 0; i < hist.length; i++) {
      const lo = edges[i];
      const hi = edges[i + 1];
      total += hist[i];
      if (theta <= lo) continue;
      if (theta >= hi) {
        below += hist[i];
      } else {
        const frac = (theta - lo) / (hi - lo);
        below += hist[i] * frac;
      }
    }
    return total > 0 ? below / total : null;
  }, [currentPlayer, samplePlayers]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" />
            {t.playerProfile}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t.playerProfileDesc}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t.playerIdPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={loadingPlayers || !query.trim()}
              size="sm"
            >
              {loadingPlayers ? "…" : t.search}
            </Button>
          </div>
          {notFound && (
            <p className="text-xs text-rose-400 mt-2">{t.playerNotFound}</p>
          )}
          {loadError && (
            <p className="text-xs text-rose-400 mt-2">
              {t.loadFailed}: {loadError}
            </p>
          )}
          {currentPlayer && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{activePlayerExternal?.id ?? submittedID}</span>
              <span className="mx-1.5">·</span>
              {t.clearsCount(analytics?.totalClears ?? 0)}
            </div>
          )}
        </CardContent>
      </Card>

      {currentPlayer && analytics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {t.estimatedSkill}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="font-mono text-3xl font-bold">
                    <span className="text-cyan-400">{format(currentPlayer.t, mode === "lerp" ? 2 : 3)}</span>
                  </div>
                  {percentile != null && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {t.lang === "en"
                        ? `Top ${(100 - percentile * 100).toFixed(1)}% of tracked players`
                        : `추적 대상 플레이어 중 상위 ${(100 - percentile * 100).toFixed(1)}%`}
                    </div>
                  )}
                </div>
                {samplePlayers && (
                  <div>
                  <PlayerSkillHistogram
                    data={{
                      ...samplePlayers,
                      theta_mean: currentPlayer.t,
                    }}
                  />
                  <div className="text-[10px] text-muted-foreground text-center mt-1">
                    {t.histogramXAxis}
                  </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {([3, 2, 1, 0] as const).map((s) => {
                    const meta = STATUS_LABELS[s];
                    const n = analytics.statusCounts[s];
                    return (
                      <div
                        key={s}
                        className="flex items-center gap-1.5 rounded-md border border-border/50 px-2 py-1 text-xs"
                        title={`Status ${s}: ${meta.short}`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: meta.color }}
                        />
                        <span className="font-mono">{meta.short}</span>
                        <span className="text-muted-foreground">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {t.lang === "en" ? "HARD+ Clears by Level" : "레벨별 HARD+ 클리어"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.clearedLevels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t.lang === "en"
                      ? "No HARD+ clears logged yet."
                      : "HARD 이상 클리어 기록이 없습니다."}
                  </p>
                ) : (
                  <ScrollArea className="h-[220px] pr-2">
                    <div className="flex flex-wrap gap-1.5">
                      {analytics.clearedLevels.map(([lvl, n]) => (
                        <Badge
                          key={lvl}
                          variant="outline"
                          className="font-mono text-xs"
                        >
                          <span className={isSpecialLevel(lvl) ? "text-amber-400 mr-1" : "text-muted-foreground mr-1"}>
                            {lvl}
                          </span>
                          <span className="text-foreground">{n}</span>
                        </Badge>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                <p className="text-[11px] text-muted-foreground mt-3">
                  {t.lang === "en"
                    ? `Population: μ=${format(playerThetaMean)}, σ=${playerThetaStd.toFixed(3)} (n=${samplePlayers?.n_players ?? 0}).`
                    : `모집단: μ=${format(playerThetaMean)}, σ=${playerThetaStd.toFixed(3)} (n=${samplePlayers?.n_players ?? 0}).`}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                {t.recommendedCharts}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t.lang === "en"
                  ? `Charts you haven't HARD cleared where P(HARD) ∈ [${fmtPct(REC_MIN_PROB)}, ${fmtPct(REC_MAX_PROB)}] — challenging but achievable. Top ${REC_LIMIT} shown.`
                  : `HARD 미클리어 채보 중 P(HARD) ∈ [${fmtPct(REC_MIN_PROB)}, ${fmtPct(REC_MAX_PROB)}]인 도전 가능한 채보. 상위 ${REC_LIMIT}개.`}
              </p>
            </CardHeader>
            <CardContent>
              {analytics.recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t.noRecommendations}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analytics.recommendations.map(({ chart, p }) => (
                    <RecommendationCard
                      key={chart.md5}
                      chart={chart}
                      p={p}
                      onClick={() => onSelectChart(chart)}
                      formatFn={format}
                      t={t}
                      mode={mode}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-rose-400" />
                {t.yourProbabilities}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t.lang === "en"
                  ? `All uncompleted charts with P(HARD) ≥ ${fmtPct(PROB_MIN_THRESHOLD)}, sorted by descending probability. Top ${PROB_LIMIT} shown.`
                  : `P(HARD) ≥ ${fmtPct(PROB_MIN_THRESHOLD)}인 미클리어 채보, 확률 내림차순. 상위 ${PROB_LIMIT}개.`}
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/60 overflow-hidden">
                <ScrollArea className="h-[480px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="border-b border-border/60 text-left">
                        <th className="px-3 py-2 font-medium text-muted-foreground text-xs">{t.chart}</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-center w-[60px]">{t.level}</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right w-[80px]">P(HARD)</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right w-[80px]">{t.bHard(mode === "lerp")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.allProbabilities.map(({ chart, p }) => (
                        <tr
                          key={chart.md5}
                          onClick={() => onSelectChart(chart)}
                          className="border-b border-border/30 hover:bg-muted/40 cursor-pointer"
                        >
                          <TableCell className="font-medium font-jp">
                            <div className="flex flex-col">
                              <span className="text-sm leading-snug line-clamp-1">{chart.title}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {chart.artist || "unknown"}
                                {chart.name_diff && ` · ${chart.name_diff}`}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            <span className={isSpecialLevel(chart.level) ? "text-amber-400" : "text-muted-foreground"}>
                              {chart.level}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <ProbabilityBadge p={p} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span style={{ color: "oklch(0.78 0.18 25)" }}>
                              {format(chart.b_hard_display)}
                            </span>
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RecommendationCard({
  chart,
  p,
  onClick,
  formatFn,
  t,
  mode
}: {
  chart: Chart;
  p: number;
  onClick: () => void;
  formatFn: (val: number | null | undefined) => string;
  t: any;
  mode: string;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-md border border-border/60 hover:border-border hover:bg-muted/30 transition-colors p-2.5 flex flex-col gap-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium font-jp line-clamp-2 leading-snug">
          {chart.title}
        </span>
        <Badge variant="outline" className="font-mono text-[10px] shrink-0">
          {levelLabel(chart.level)}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground font-jp line-clamp-1">
          {chart.artist || "unknown"}
          {chart.name_diff && ` · ${chart.name_diff}`}
        </span>
        <span className="font-mono font-semibold" style={{ color: "oklch(0.78 0.18 25)" }}>
          {fmtPct(p)}
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full"
          style={{
            width: `${Math.min(100, p * 100)}%`,
            background: "oklch(0.70 0.22 25)",
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>
          {t.bHard(mode === "lerp")}: <span style={{ color: "oklch(0.78 0.18 25)" }}>{formatFn(chart.b_hard_display)}</span>
        </span>
        <span>a: {chart.a != null ? chart.a.toFixed(2) : "–"}</span>
      </div>
    </button>
  );
}

function ProbabilityBadge({ p }: { p: number }) {
  let color = "oklch(0.55 0 0)";
  if (p >= 0.80) color = "oklch(0.70 0.18 145)";
  else if (p >= 0.50) color = "oklch(0.70 0.18 200)";
  else if (p >= 0.20) color = "oklch(0.70 0.18 75)";
  return (
    <span className="font-mono font-semibold" style={{ color }}>
      {fmtPct(p)}
    </span>
  );
}

src/components/questimator/RankingTab.tsx

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

scripts/pipeline.py

#!/usr/bin/env python3
"""
QUEstimator data pipeline.

Stage 1: Parse UEtable.json -> chart database (real metadata).
Stage 2: Load real IR leaderboard data.
Stage 3: Fit Bayesian Graded Response Model via MCMC (NUTS) using numpyro.
         This jointly estimates player abilities, chart difficulties, and discrimination,
         incorporating the U_E nominal levels as an informative prior.
Stage 4: Extract posterior means and standard errors.
Stage 5: Aggregate per U_E level (median + IQR).
Stage 6: Emit static JSON artifacts for the Next.js dashboard.
"""

from __future__ import annotations
import json
import math
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = _PROJECT_ROOT / "upload" / "UEtable_enriched.json"
OUT_DIR = _PROJECT_ROOT / "public" / "data"

# --------------------------------------------------------------------------- #
# Stage 1 - Metadata loading
# --------------------------------------------------------------------------- #
def load_charts() -> pd.DataFrame:
    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    rows = []
    for c in raw:
        md5 = (c.get("md5") or "").strip()
        if not md5:
            continue
        rows.append({
            "md5": md5,
            "sha512": (c.get("sha512") or "").strip(),
            "title": (c.get("title") or "").strip(),
            "artist": (c.get("artist") or "").strip(),
            "level": (c.get("level") or "").strip(),
            "name_diff": (c.get("name_diff") or "").strip(),
            "video2": (c.get("video2") or "").strip(),
            "url": (c.get("url") or "").strip(),
            "url_diff": (c.get("url_diff") or "").strip(),
            "comment": (c.get("comment") or "").strip(),
            "state": (c.get("state") or "").strip(),
            "sha256": (c.get("sha256") or "").strip(),
        })
    df = pd.DataFrame(rows).drop_duplicates(subset="md5").reset_index(drop=True)
    return df

def level_sort_key(level: str):
    specials_order = {"-_-": 100, "?!": 101, "◆": 102, "Ω": 103}
    if level.isdigit():
        return (0, int(level))
    return (1, specials_order.get(level, 999))

# --------------------------------------------------------------------------- #
# Stage 3 - Bayesian GRM with MCMC
# --------------------------------------------------------------------------- #
def run_mcmc(clears: np.ndarray, df: pd.DataFrame, n_players: int):
    import jax
    import jax.numpy as jnp
    import numpyro
    import numpyro.distributions as dist
    from numpyro.infer import MCMC, NUTS, init_to_median

    n_charts = len(df)
    
    chart_idx = clears[:, 0]
    player_idx = clears[:, 1]
    y = clears[:, 2]
    
    level_num = np.zeros(n_charts)
    is_gimmick = np.zeros(n_charts, dtype=bool)
    
    for i, row in df.iterrows():
        lvl = row["level"]
        if lvl == "Ω":
            level_num[i] = 31.0
        elif lvl.isdigit():
            level_num[i] = float(lvl)
        else:
            is_gimmick[i] = True

    def model(player_idx, chart_idx, y, level_num, is_gimmick, n_players, n_charts):
        # Hyperparameters for the linear prior mapping
        # Maps [1, 31] roughly to [-3, +3] standard deviations on the ability axis
        a = numpyro.sample("prior_a", dist.Normal(-3.0, 2.0))
        b = numpyro.sample("prior_b", dist.Normal(0.2, 0.2))
        
        # Prior location anchored to numerical rank
        loc = a + b * level_num
        loc = jnp.where(is_gimmick, 0.0, loc)
        scale = jnp.where(is_gimmick, 3.0, 0.4) # Tight adherence for 1-31 scale, loose for gimmicks
        
        with numpyro.plate("charts", n_charts):
            # The primary difficulty anchor for the chart (V-HARD)
            delta = numpyro.sample("delta", dist.Normal(loc, scale))
            
            # Chart discrimination (gatekeeping severity)
            alpha = numpyro.sample("alpha", dist.LogNormal(0, 0.5))
            
            # Distance bounds for intermediate gauges
            tau1 = numpyro.sample("tau1", dist.HalfNormal(1.0))
            tau2 = numpyro.sample("tau2", dist.HalfNormal(1.0))
        
        with numpyro.plate("players", n_players):
            # Player skill tied to N(0, 1) standard identifiability constraint
            theta = numpyro.sample("theta", dist.Normal(0, 1))
        
        # Unroll into respective cutpoints
        beta3 = delta
        beta2 = delta - tau2
        beta1 = delta - tau2 - tau1
        
        # Subset parameters by index
        theta_obs = theta[player_idx]
        alpha_obs = alpha[chart_idx]
        beta1_obs = beta1[chart_idx]
        beta2_obs = beta2[chart_idx]
        beta3_obs = beta3[chart_idx]
        
        c1 = alpha_obs * beta1_obs
        c2 = alpha_obs * beta2_obs
        c3 = alpha_obs * beta3_obs
        cutpoints = jnp.stack([c1, c2, c3], axis=-1)
        
        with numpyro.plate("data", len(y)):
            numpyro.sample("obs", dist.OrderedLogistic(alpha_obs * theta_obs, cutpoints), obs=y)

    print("      compiling and running NUTS MCMC...")
    mcmc = MCMC(
        NUTS(model, init_strategy=init_to_median),
        num_warmup=500,
        num_samples=1000,
        num_chains=1,
        progress_bar=True
    )
    
    mcmc.run(
        jax.random.PRNGKey(42),
        player_idx=jnp.array(player_idx),
        chart_idx=jnp.array(chart_idx),
        y=jnp.array(y),
        level_num=jnp.array(level_num),
        is_gimmick=jnp.array(is_gimmick),
        n_players=n_players,
        n_charts=n_charts
    )
    
    return mcmc.get_samples()

# --------------------------------------------------------------------------- #
# Stage 5 - Aggregation
# --------------------------------------------------------------------------- #
def aggregate_by_level(df: pd.DataFrame) -> list:
    rows = []
    for level, sub in df.groupby("level", sort=False):
        valid = sub.dropna(subset=["b_hard", "b_vhard"])
        valid = valid[~valid["provisional"]]
        if len(valid) == 0:
            rows.append({
                "level": level, "n_charts_total": int(len(sub)),
                "n_charts_valid": 0,
                "hard_median": None, "hard_q1": None, "hard_q3": None,
                "vhard_median": None, "vhard_q1": None, "vhard_q3": None,
            })
            continue
        bh = valid["b_hard"].to_numpy()
        bv = valid["b_vhard"].to_numpy()
        rows.append({
            "level": level,
            "n_charts_total": int(len(sub)),
            "n_charts_valid": int(len(valid)),
            "hard_median": float(np.median(bh)),
            "hard_q1": float(np.percentile(bh, 25)),
            "hard_q3": float(np.percentile(bh, 75)),
            "vhard_median": float(np.median(bv)),
            "vhard_q1": float(np.percentile(bv, 25)),
            "vhard_q3": float(np.percentile(bv, 75)),
        })
    rows.sort(key=lambda r: level_sort_key(r["level"]))
    return rows

# --------------------------------------------------------------------------- #
# Main Execution
# --------------------------------------------------------------------------- #
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()

    print("[1/5] Loading UEtable_enriched.json ...")
    df = load_charts()
    print(f"      loaded {len(df)} charts across {df['level'].nunique()} levels")

    print("[2/5] Loading real IR leaderboard data ...")
    import sys
    sys.path.insert(0, str(_PROJECT_ROOT / "scripts"))
    from load_ir_clears import load_ir_clears, print_stats as print_ir_stats
    clears, player_map, ir_stats = load_ir_clears(df)
    print_ir_stats(ir_stats)

    print("[3/5] Fitting Bayesian GRM via MCMC (numpyro NUTS) ...")
    samples = run_mcmc(clears, df, len(player_map))
    
    a_mean = np.array(samples["alpha"].mean(axis=0))
    a_se = np.array(samples["alpha"].std(axis=0))
    
    delta_mean = np.array(samples["delta"].mean(axis=0))
    delta_se = np.array(samples["delta"].std(axis=0))
    
    tau1_mean = np.array(samples["tau1"].mean(axis=0))
    tau2_mean = np.array(samples["tau2"].mean(axis=0))
    
    b_vhard = delta_mean
    b_hard = delta_mean - tau2_mean
    b_normal = delta_mean - tau2_mean - tau1_mean
    
    se_b_vhard = delta_se
    b_hard_samples = samples["delta"] - samples["tau2"]
    se_b_hard = np.array(b_hard_samples.std(axis=0))

    df["a"] = a_mean
    df["b_normal"] = b_normal
    df["b_hard"] = b_hard
    df["b_vhard"] = b_vhard
    df["se_a"] = a_se
    df["se_b_hard"] = se_b_hard
    df["se_b_vhard"] = se_b_vhard

    chart_idx = clears[:, 0]
    statuses = clears[:, 2]
    grp = pd.DataFrame({"chart": chart_idx, "status": statuses}).groupby("chart")
    
    chart_cat_counts: dict[int, dict[str, int]] = {}
    for ci in grp.groups.keys():
        st = grp.get_group(ci)["status"].to_numpy()
        chart_cat_counts[ci] = {
            "n_failed": int(np.sum(st == 0)),
            "n_normal": int(np.sum(st == 1)),
            "n_hard":   int(np.sum(st == 2)),
            "n_vhard":  int(np.sum(st == 3)),
            "n_total":  len(st)
        }

    df["n_failed"] = [chart_cat_counts.get(ci, {}).get("n_failed", 0) for ci in df.index]
    df["n_normal"] = [chart_cat_counts.get(ci, {}).get("n_normal", 0) for ci in df.index]
    df["n_hard"]   = [chart_cat_counts.get(ci, {}).get("n_hard", 0) for ci in df.index]
    df["n_vhard"]  = [chart_cat_counts.get(ci, {}).get("n_vhard", 0) for ci in df.index]
    df["n"]        = [chart_cat_counts.get(ci, {}).get("n_total", 0) for ci in df.index]

    PROVISIONAL_MIN_N = 10
    PROVISIONAL_MAX_SE = 1.0

    df["provisional"] = (
        (df["n"] < PROVISIONAL_MIN_N) |
        (df["se_b_hard"] > PROVISIONAL_MAX_SE) |
        (df["se_b_hard"].isna())
    )

    df["b_hard_display"] = df["b_hard"]
    df["b_vhard_display"] = df["b_vhard"]

    print(f"      fits complete. provisional charts: {int(df['provisional'].sum())} / {len(df)}")

    print("[4/5] Extracting player theta values ...")
    theta_mean = np.array(samples["theta"].mean(axis=0))
    theta_std = float(np.std(theta_mean))
    player_data = {}
    inv_player_map = {v: k for k, v in player_map.items()}
    
    p_clears = pd.DataFrame({"chart": clears[:, 0], "player": clears[:, 1], "status": clears[:, 2]}).groupby("player")
    
    for pid, group in p_clears:
        avatar_id = inv_player_map[pid]
        p_c = {str(int(row["chart"])): int(row["status"]) for _, row in group.iterrows()}
        player_data[avatar_id] = {
            "t": round(float(theta_mean[pid]), 3),
            "c": p_c
        }

    print("[5/5] Aggregating per U_E level ...")
    level_summary = aggregate_by_level(df)

    print("[6/6] Emitting JSON artifacts ...")

    charts_out = []
    for i, r in df.iterrows():
        charts_out.append({
            "id": i,
            "md5": r["md5"],
            "title": r["title"],
            "artist": r["artist"],
            "level": r["level"],
            "name_diff": r["name_diff"],
            "video2": r["video2"],
            "url": r["url"],
            "url_diff": r["url_diff"],
            "comment": r["comment"],
            "state": r["state"],
            "n": int(r["n"]),
            "n_failed": int(r["n_failed"]),
            "n_normal": int(r["n_normal"]),
            "n_hard": int(r["n_hard"]),
            "n_vhard": int(r["n_vhard"]),
            "a": None if math.isnan(r["a"]) else round(float(r["a"]), 4),
            "b_hard": None if math.isnan(r["b_hard"]) else round(float(r["b_hard"]), 4),
            "b_vhard": None if math.isnan(r["b_vhard"]) else round(float(r["b_vhard"]), 4),
            "b_hard_display": None if math.isnan(r["b_hard_display"]) else round(float(r["b_hard_display"]), 4),
            "b_vhard_display": None if math.isnan(r["b_vhard_display"]) else round(float(r["b_vhard_display"]), 4),
            "se_a": None if math.isnan(r["se_a"]) else round(float(r["se_a"]), 4),
            "se_b_hard": None if math.isnan(r["se_b_hard"]) else round(float(r["se_b_hard"]), 4),
            "se_b_vhard": None if math.isnan(r["se_b_vhard"]) else round(float(r["se_b_vhard"]), 4),
            "provisional": bool(r["provisional"]),
        })
    charts_out.sort(key=lambda c: (level_sort_key(c["level"]),
                                   -(c["b_hard_display"] if c["b_hard_display"] is not None else -999)))

    meta = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "n_charts_total": int(len(df)),
        "n_charts_valid": int((~df["provisional"]).sum()),
        "n_charts_provisional": int(df["provisional"].sum()),
        "n_players": int(len(player_map)),
        "n_clears": int(len(clears)),
        "model": "Bayesian Graded Response Model (MCMC NUTS)",
        "categories": ["FAILED", "NORMAL", "HARD", "V-HARD"],
        "provisional_rule": f"n < {PROVISIONAL_MIN_N} OR se_b_hard > {PROVISIONAL_MAX_SE}",
        "player_theta_mean": float(np.mean(theta_mean)),
        "player_theta_std": theta_std,
        "data_source": "Qwilight IR leaderboards (real player data)",
        "runtime_sec": round(time.time() - t0, 2),
    }

    with open(os.path.join(OUT_DIR, "charts.json"), "w", encoding="utf-8") as f:
        json.dump(charts_out, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "level-summary.json"), "w", encoding="utf-8") as f:
        json.dump(level_summary, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT_DIR, "players.json"), "w", encoding="utf-8") as f:
        json.dump(player_data, f, separators=(',', ':'))

    print()
    print("=== Pipeline complete (real IR data) ===")
    print(f"  Runtime:        {meta['runtime_sec']}s")
    print(f"  Charts:         {meta['n_charts_total']} (valid {meta['n_charts_valid']}, provisional {meta['n_charts_provisional']})")
    print(f"  Players:        {meta['n_players']:,}")
    print(f"  Clears:         {meta['n_clears']:,}")
    print(f"  Outputs in:     {OUT_DIR}/")

if __name__ == "__main__":
    main()
