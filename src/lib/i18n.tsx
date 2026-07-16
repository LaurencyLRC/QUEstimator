"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Lang = "en" | "ko";

// All UI strings. Keys are namespaced by section for clarity.
// Numeric values like {n} are interpolated at call sites via template strings
// rather than ICU syntax – simpler for our small string set.
export const STRINGS = {
  en: {
    // Header
    subtitle: "a Qwilight-oriented U_E Scale Difficulty Estimator",
    charts: "charts",
    players: "players",
    clears: "clears",

    // Tabs
    overview: "Overview",
    chartsTab: "Charts",
    about: "About",

    // Overview tab
    levelDistribution: "U_E Level Difficulty Distribution",
    levelDistributionDesc: (valid: number, provisional: number) =>
      `Median & IQR of raw GRM difficulty estimates, grouped by official U_E level. Red = HARD clear, purple = V-HARD clear. ${valid} valid · ${provisional} provisional charts. Click any column to drill into that level's charts.`,
    yAxisLabel: "Raw difficulty (logits, θ-scale)",
    xAxisLabel: "Nominal U_E level (click a column to drill into charts)",
    legendHard: "HARD clear",
    legendVhard: "V-HARD clear",
    tooltipValid: (level: string, valid: number, total: number) =>
      `U_E ${level} – ${valid}/${total} valid charts (click to drill in)`,
    perLevelAggregates: "Per-Level Aggregates",
    perLevelDesc:
      "Median b values per level. Charts with insufficient data (n < 30 or SE > 0.5) are tagged provisional and excluded from medians.",
    level: "Level",
    chartsCol: "Charts",
    hardMed: "HARD med",
    hardIQR: "HARD IQR",
    vhardMed: "V-HARD med",
    vhardIQR: "V-HARD IQR",

    // Charts tab
    levels: "Levels",
    allCharts: "All charts",
    allChartsTitle: "All Charts",
    chartsCount: (n: number) => `${n} charts`,
    sortedByVhard: "sorted by V-HARD difficulty",
    sortBy: (key: string, dir: string) => `sorted by ${key} (${dir})`,
    sortKeys: {
      title: "title",
      b_hard: "HARD difficulty",
      b_vhard: "V-HARD difficulty",
      a: "discrimination",
      n: "sample size",
    },
    sortDirs: {
      asc: "ascending",
      desc: "descending",
    },
    searchPlaceholder: "Search title, artist, notemaker...",
    showingAll: "Showing all",
    validOnly: "Valid only",
    ofCharts: (shown: number, total: number) => `${shown} / ${total} charts`,
    noMatch: "No charts match the current filter.",

    // Chart table headers
    chart: "Chart",
    bHard: "b_HARD",
    bVhard: "b_V-HARD",
    disc: "a",

    // Chart detail dialog
    irtParams: "IRT Parameters",
    hardClear: "HARD clear",
    vhardClear: "V-HARD clear",
    discrimination: "Discrimination",
    sampleSize: "Sample size",
    provisional: "Provisional",
    ez2pattern: "EZ2PATTERN",
    by: "by",
    notemaker: "notemaker",
    comment: "Comment:",

    // Footer
    onDifficultyTable: "on",
    generated: "Generated",
    runtime: "runtime",

    // About tab
    projectOverview: "Project Overview",
    methodology: "Methodology · Graded Response Model",
    pipelineState: "Current Pipeline State",
    techStack: "Technology Stack",
    mockMode: "Mock data mode",
    model: "Model",
    categories: "Categories",
    provisionalRule: "Provisional rule",
    runtimeLabel: "Runtime",

    // Loading / error
    computing: "Computing GRM parameters…",
    loadFailed: "Failed to load data",
  },

  ko: {
    // Header
    subtitle: "Qwilight 기반 U_E 스케일 난이도 추정기",
    charts: "채보",
    players: "플레이어",
    clears: "클리어",

    // Tabs
    overview: "개요",
    chartsTab: "채보",
    about: "소개",

    // Overview tab
    levelDistribution: "U_E 레벨별 난이도 분포",
    levelDistributionDesc: (valid: number, provisional: number) =>
      `GRM 난이도 추정치의 중앙값과 IQR을 공식 U_E 레벨별로 그룹화. 빨강 = HARD 클리어, 보라 = V-HARD 클리어. 유효 ${valid}개 · 임시 ${provisional}개 채보. 각 열을 클릭하면 해당 레벨의 채보로 이동합니다.`,
    yAxisLabel: "원시 난이도 (로짓, θ 스케일)",
    xAxisLabel: "공식 U_E 레벨 (열을 클릭하면 채보로 이동)",
    legendHard: "HARD 클리어",
    legendVhard: "V-HARD 클리어",
    tooltipValid: (level: string, valid: number, total: number) =>
      `U_E ${level} – 유효 ${valid}/${total}개 채보 (클릭하면 이동)`,
    perLevelAggregates: "레벨별 집계",
    perLevelDesc:
      "레벨별 b 값 중앙값. 데이터가 부족한 채보 (n < 30 또는 SE > 0.5)는 임시로 표기되며 중앙값 계산에서 제외됩니다.",
    level: "레벨",
    chartsCol: "채보",
    hardMed: "HARD 중앙값",
    hardIQR: "HARD IQR",
    vhardMed: "V-HARD 중앙값",
    vhardIQR: "V-HARD IQR",

    // Charts tab
    levels: "레벨",
    allCharts: "전체 채보",
    allChartsTitle: "전체 채보",
    chartsCount: (n: number) => `${n}개 채보`,
    sortedByVhard: "V-HARD 난이도순 정렬",
    sortBy: (key: string, dir: string) => `${key}순 정렬 (${dir})`,
    sortKeys: {
      title: "제목",
      b_hard: "HARD 난이도",
      b_vhard: "V-HARD 난이도",
      a: "변별도",
      n: "표본 수",
    },
    sortDirs: {
      asc: "오름차순",
      desc: "내림차순",
    },
    searchPlaceholder: "제목, 아티스트, 채보 제작자 검색...",
    showingAll: "전체 표시",
    validOnly: "유효만",
    ofCharts: (shown: number, total: number) => `${shown} / ${total}개 채보`,
    noMatch: "현재 필터와 일치하는 채보가 없습니다.",

    // Chart table headers
    chart: "채보",
    bHard: "b_HARD",
    bVhard: "b_V-HARD",
    disc: "a",

    // Chart detail dialog
    irtParams: "IRT 파라미터",
    hardClear: "HARD 클리어",
    vhardClear: "V-HARD 클리어",
    discrimination: "변별도",
    sampleSize: "표본 수",
    provisional: "임시",
    ez2pattern: "EZ2PATTERN",
    by: "아티스트:",
    notemaker: "채보 제작자",
    comment: "코멘트:",

    // Footer
    onDifficultyTable: "",
    generated: "생성일",
    runtime: "실행시간",

    // About tab
    projectOverview: "프로젝트 개요",
    methodology: "방법론 · 등급 반응 모델 (GRM)",
    pipelineState: "현재 파이프라인 상태",
    techStack: "기술 스택",
    mockMode: "모의 데이터 모드",
    model: "모델",
    categories: "카테고리",
    provisionalRule: "임시 기준",
    runtimeLabel: "실행시간",

    // Loading / error
    computing: "GRM 파라미터 계산 중…",
    loadFailed: "데이터 로드 실패",
  },
} as const;

type StringDict = typeof STRINGS.en;

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: StringDict & { lang: Lang };
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ko");
  const value: LangContextValue = {
    lang,
    setLang,
    t: { ...STRINGS[lang], lang },
  };
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
