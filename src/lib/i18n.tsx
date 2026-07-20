"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "en" | "ko";

export const STRINGS = {
  en: {
    // Header
    subtitle: "a Qwilight-oriented U_E Scale Difficulty Estimator",
    scaleLerp: "U_E Scale",
    scaleRaw: "Raw θ",
    charts: "charts",
    players: "players",
    clears: "clears",

    // Tabs
    overview: "Overview",
    chartsTab: "Charts",
    player: "Player",
    ranking: "Ranking",
    about: "About",

    // Overview tab
    levelDistribution: "U_E Level Difficulty Distribution",
    levelDistributionDesc: (valid: number, provisional: number) =>
      `Median & IQR of raw GRM difficulty estimates, grouped by official U_E level. Red = HARD clear, purple = V-HARD clear. ${valid} valid · ${provisional} provisional charts. Click any column to drill into that level's charts.`,
    yAxisLabel: (isLerp: boolean) => isLerp ? "Interpolated U_E Level" : "Raw difficulty (logits, θ-scale)",
    xAxisLabel: "Nominal U_E level (click a column to drill into charts)",
    legendHard: "HARD clear",
    legendVhard: "V-HARD clear",
    tooltipValid: (level: string, valid: number, total: number) =>
      `U_E ${level} – ${valid}/${total} valid charts (click to drill in)`,
    perLevelAggregates: "Per-Level Aggregates",
    perLevelDesc:
      "Median b values per level. Charts with insufficient data (n < 10 or huge posterior variance SE > 1.0) are tagged provisional and excluded from medians.",
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
    sortedByHard: "sorted by HARD difficulty",
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
    bHard: (isLerp: boolean) => isLerp ? "HARD" : "b_HARD",
    bVhard: (isLerp: boolean) => isLerp ? "V-HARD" : "b_V-HARD",
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

    // Player tab
    playerProfile: "Player Profile",
    playerProfileDesc: "Enter your Qwilight Avatar ID to view your estimated skill (θ) and get personalized chart recommendations.",
    playerIdPlaceholder: "Enter Avatar ID (e.g. Laurency)",
    search: "Search",
    playerNotFound: "Player not found. Make sure you typed the exact Avatar ID.",
    estimatedSkill: "Estimated Skill",
    clearsCount: (n: number) => `${n} clears logged`,
    recommendedCharts: "Recommended Targets",
    yourProbabilities: "Your Clear Probabilities",
    noRecommendations: "No suitable recommendations found. You might be too good!",
    histogramXAxis: (isLerp: boolean) => isLerp ? "Player skill (U_E scale)" : "Player skill θ (Raw logits)",

    // Ranking tab
    rankingTitle: "Player Ranking",
    rankingDesc: "All tracked players sorted by estimated latent skill θ. Click any row to load that player into the Player tab. Eligibility requires ≥ 10 plays AND ≥ 1 HARD-or-better clear on valid U_E 20+ charts (or Ω) — plays on lower levels, provisional charts, and -_- / ?! / ◆ do not count.",
    rankingSearchPlaceholder: "Filter by Avatar ID...",
    rankCol: "#",
    playerCol: "Player",
    thetaCol: (isLerp: boolean) => isLerp ? "U_E (skill)" : "θ (skill)",
    clearsCol: "Clears",
    vhardCol: "V-HARD",
    hardCol: "HARD",
    unrankedNote: (n: number) => `${n} players are ineligible for ranking (< 10 valid-chart plays or no HARD-or-better clear on U_E 20+ / Ω).`,

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
    computing: "Computing GRM parameters via MCMC…",
    loadFailed: "Failed to load data",
  },

  ko: {
    // Header
    subtitle: "Qwilight 기반 U_E 스케일 난이도 추정기",
    scaleLerp: "U_E 환산",
    scaleRaw: "원시 θ",
    charts: "채보",
    players: "플레이어",
    clears: "클리어",

    // Tabs
    overview: "개요",
    chartsTab: "채보",
    player: "플레이어",
    ranking: "랭킹",
    about: "소개",

    // Overview tab
    levelDistribution: "U_E 레벨별 난이도 분포",
    levelDistributionDesc: (valid: number, provisional: number) =>
      `GRM 난이도 추정치의 중앙값과 IQR을 공식 U_E 레벨별로 그룹화. 빨강 = HARD 클리어, 보라 = V-HARD 클리어. 유효 ${valid}개 · 임시 ${provisional}개 채보. 각 열을 클릭하면 해당 레벨의 채보로 이동합니다.`,
    yAxisLabel: (isLerp: boolean) => isLerp ? "환산 U_E 레벨" : "원시 난이도 (로짓, θ 스케일)",
    xAxisLabel: "공식 U_E 레벨 (열을 클릭하면 채보로 이동)",
    legendHard: "HARD 클리어",
    legendVhard: "V-HARD 클리어",
    tooltipValid: (level: string, valid: number, total: number) =>
      `U_E ${level} – 유효 ${valid}/${total}개 채보 (클릭하면 이동)`,
    perLevelAggregates: "레벨별 집계",
    perLevelDesc:
      "레벨별 b 값 중앙값. 데이터가 부족하거나 사후 분산이 너무 큰 채보 (n < 10 또는 SE > 1.0)는 임시로 표기되며 중앙값 계산에서 제외됩니다.",
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
    sortedByHard: "HARD 난이도순 정렬",
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
    bHard: (isLerp: boolean) => isLerp ? "HARD" : "b_HARD",
    bVhard: (isLerp: boolean) => isLerp ? "V-HARD" : "b_V-HARD",
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

    // Player tab
    playerProfile: "플레이어 프로필",
    playerProfileDesc: "Qwilight Avatar ID를 입력하여 추정 실력(θ)을 확인하고 맞춤형 추천 채보를 받아보세요.",
    playerIdPlaceholder: "Avatar ID 입력 (예: Laurency)",
    search: "검색",
    playerNotFound: "플레이어를 찾을 수 없습니다. 정확한 Avatar ID를 입력했는지 확인하세요.",
    estimatedSkill: "추정 실력",
    clearsCount: (n: number) => `클리어 기록 ${n}개`,
    recommendedCharts: "추천 목표",
    yourProbabilities: "예상 클리어 확률",
    noRecommendations: "적합한 추천을 찾을 수 없습니다. 이미 모든 채보를 클리어하셨을 수도 있습니다!",
    histogramXAxis: (isLerp: boolean) => isLerp ? "플레이어 실력 (U_E 스케일)" : "플레이어 실력 θ (원시 로짓)",

    // Ranking tab
    rankingTitle: "플레이어 랭킹",
    rankingDesc: "추정 잠재 실력 θ 기준 정렬된 전체 플레이어 목록입니다. 행을 클릭하면 해당 플레이어가 플레이어 탭에 로드됩니다. 랭킹 대상이 되려면 유효한 U_E 20+ 채보(또는 Ω)에서 10플레이 이상 AND HARD 이상 클리어 1건 이상이 필요합니다 — 하위 레벨, 임시 채보, -_- / ?! / ◆에서의 플레이는 집계되지 않습니다.",
    rankingSearchPlaceholder: "Avatar ID로 필터링...",
    rankCol: "#",
    playerCol: "플레이어",
    thetaCol: (isLerp: boolean) => isLerp ? "U_E (실력)" : "θ (실력)",
    clearsCol: "클리어",
    vhardCol: "V-HARD",
    hardCol: "HARD",
    unrankedNote: (n: number) => `${n}명의 플레이어는 랭킹 대상이 아닙니다 (유효 채보 플레이 10건 미만 또는 U_E 20+ / Ω에서 HARD 이상 클리어 없음).`,

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
    computing: "MCMC 기반 GRM 파라미터 계산 중…",
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
  const [lang, setLangState] = useState<Lang>("ko");

  // Load language from localStorage or browser preferences on mount
  useEffect(() => {
    const saved = localStorage.getItem("questimator_lang") as Lang;
    if (saved === "en" || saved === "ko") {
      setLangState(saved);
    } else if (navigator.language.startsWith("en")) {
      setLangState("en");
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("questimator_lang", l);
  };

  const value: LangContextValue = {
    lang,
    setLang,
    t: { ...(STRINGS[lang] as StringDict), lang },
  };
  
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}