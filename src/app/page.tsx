"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BoxPlot } from "@/components/questimator/BoxPlot";
import { ChartTable, type SortKey, type SortDir } from "@/components/questimator/ChartTable";
import { ChartDetailDialog } from "@/components/questimator/ChartDetailDialog";
import { LangToggle } from "@/components/questimator/LangToggle";
import { useLang } from "@/lib/i18n";
import {
  type Chart,
  type LevelSummary,
  type Meta,
  levelSortKey,
  levelLabel,
  isSpecialLevel,
} from "@/lib/questimator-types";
import {
  BarChart3,
  ListTree,
  Sigma,
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
  const [sortKey, setSortKey] = useState<SortKey>("b_vhard");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  // Box plot only shows levels where the GRM has meaningful discriminative
  // power. U_E 1-19 suffer from a floor effect (70-96% of players V-HARD
  // clear them), so their difficulty estimates cluster together and don't
  // provide useful visual information. See the About tab for details.
  const plotLevels = useMemo(
    () =>
      sortedLevels.filter((l) => {
        if (isSpecialLevel(l.level)) return true; // always show special folders
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
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
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
            <LangToggle />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 max-w-md">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">
              <BarChart3 className="w-4 h-4 mr-1.5" /> {t.overview}
            </TabsTrigger>
            <TabsTrigger value="charts" className="text-xs sm:text-sm">
              <ListTree className="w-4 h-4 mr-1.5" /> {t.chartsTab}
            </TabsTrigger>
            <TabsTrigger value="about" className="text-xs sm:text-sm">
              <Sigma className="w-4 h-4 mr-1.5" /> {t.about}
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6 mt-0">
            {/* Primary box plot */}
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

            {/* Level summary table */}
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
                      {plotLevels.map((l) => (
                        <tr
                          key={l.level}
                          className="border-b border-border/30 hover:bg-muted/30 cursor-pointer"
                          onClick={() => handleSelectLevelFromPlot(l.level)}
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
                            {l.hard_median != null ? fmt(l.hard_median) : "–"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                            {l.hard_q1 != null && l.hard_q3 != null
                              ? `[${fmt(l.hard_q1)}, ${fmt(l.hard_q3)}]`
                              : "–"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono" style={{ color: "oklch(0.78 0.18 305)" }}>
                            {l.vhard_median != null ? fmt(l.vhard_median) : "–"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                            {l.vhard_q1 != null && l.vhard_q3 != null
                              ? `[${fmt(l.vhard_q1)}, ${fmt(l.vhard_q3)}]`
                              : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CHARTS TAB */}
          <TabsContent value="charts" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
              {/* Level sidebar */}
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

              {/* Chart table */}
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
                />
              </div>
            </div>
          </TabsContent>

          {/* ABOUT TAB */}
          <TabsContent value="about" className="mt-0">
            <AboutTab meta={meta} />
          </TabsContent>
        </Tabs>
      </main>

      <ChartDetailDialog
        chart={selectedChart}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

function fmt(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
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
              <div className="rounded-md border border-border/40 bg-muted/20 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground/80">Floor effect (U_E 1–19):</strong>{" "}
                For charts below U_E 20, approximately 70–96% of active Qwilight
                players achieve a V-HARD-or-better clear. This heavy skew means
                the GRM has very little information to differentiate difficulty
                among these charts – almost everyone clears them, so the
                difficulty estimates cluster together in a narrow band (the
                &quot;floor&quot;). The box plot and per-level table therefore
                only display U_E 20 and above, where the player base actually
                splits across clear tiers and the model has meaningful
                discriminative power. Individual chart difficulty values for
                lower levels are still available in the Charts tab, but should
                be interpreted with caution due to high uncertainty.
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
              <div className="rounded-md border border-border/40 bg-muted/20 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground/80">바닥 효과 (U_E 1–19):</strong>{" "}
                U_E 20 미만의 채보에서는 활동적인 Qwilight 플레이어의 약 70–96%가
                V-HARD 이상의 클리어를 달성합니다. 이러한 심한 편향은 GRM이
                이 채보들 사이의 난이도를 분별할 정보가 거의 없음을 의미합니다 –
                거의 모든 플레이어가 클리어하므로 난이도 추정치가 좁은
                대역(&quot;바닥&quot;)에 모이게 됩니다. 따라서 박스 플롯과
                레벨별 테이블은 플레이어 기반이 실제로 클리어 tier에 걸쳐
                분할되고 모델이 의미 있는 변별력을 갖는 U_E 20 이상만 표시합니다.
                하위 레벨의 개별 채보 난이도 값은 채보 탭에서 여전히 확인할 수
                있지만, 높은 불확실성으로 인해 주의해서 해석해야 합니다.
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
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="text-amber-400 font-medium text-xs uppercase tracking-wider mb-1">
              {t.mockMode}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t.lang === "en" ? (
                <>
                  Qwilight&apos;s IR API is not yet available. This deployment
                  uses <strong className="text-foreground">Monte-Carlo simulated
                  clears</strong> tied to real chart metadata. Once IR
                  access is granted, only the data ingestion step needs to be
                  swapped – the entire modeling and visualization pipeline remains
                  unchanged.
                </>
              ) : (
                <>
                  Qwilight의 IR API가 아직 제공되지 않습니다. 이 배포는
                  실제 채보 메타데이터에 연결된{" "}
                  <strong className="text-foreground">몬테카를로 시뮬레이션 클리어</strong>를
                  사용합니다. IR 접근이 허용되면 데이터 수집 단계만 교체하면 되며,
                  전체 모델링 및 시각화 파이프라인은 변경되지 않습니다.
                </>
              )}
            </p>
          </div>
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
              <div><strong className="text-foreground">Statistical model:</strong> Custom GRM marginal MLE (21-node Gauss-Hermite quadrature)</div>
              <div><strong className="text-foreground">Frontend:</strong> Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui</div>
              <div><strong className="text-foreground">Visualization:</strong> Custom SVG (box plots, GRM curves)</div>
              <div><strong className="text-foreground">Automation target:</strong> GitHub Actions cron → static JSON</div>
            </>
          ) : (
            <>
              <div><strong className="text-foreground">데이터 파이프라인:</strong> Python 3 · NumPy · SciPy · pandas</div>
              <div><strong className="text-foreground">통계 모델:</strong> 커스텀 GRM 주변부 MLE (21-노드 Gauss-Hermite 적분)</div>
              <div><strong className="text-foreground">프론트엔드:</strong> Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui</div>
              <div><strong className="text-foreground">시각화:</strong> 커스텀 SVG (박스 플롯, GRM 곡선)</div>
              <div><strong className="text-foreground">자동화 목표:</strong> GitHub Actions cron → 정적 JSON</div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
