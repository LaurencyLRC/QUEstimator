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
      level: "level",
      b_hard: "HARD difficulty",
      b_vhard: "V-HARD difficulty",
      a: "discrimination",
      n: "sample size",
      delta: "skill gain",
      expected: "expected gain",
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
    grmConfidenceBand: "±1.96 SE Band",
    grmConfidenceBandDesc: "95% credible interval ribbon based on posterior parameter standard errors",
    grmItemInfo: "Item Information I(θ)",
    grmItemInfoDesc: "Samejima's Fisher Information showing skill measurement precision",
    grmPeakInfo: (theta: string, maxVal: string) => `Peak info: I=${maxVal} at θ=${theta}`,
    folderClearsTitle: "Folder Lamp Distribution",
    folderClearsDesc: "Clear status breakdown across level folders",

    // Player tab
    playerProfile: "Player Profile",
    playerProfileDesc: "Enter your Qwilight Avatar ID or Player Name to view your estimated skill (θ) and get personalized chart recommendations.",
    playerIdPlaceholder: "Enter Avatar ID or Name (e.g. Laurency)",
    search: "Search",
    offlineProfiles: "Offline Profiles",
    selectOfflineProfile: "Select an offline profile...",
    manage: "Manage",
    profileName: "Profile name...",
    save: "Save",
    cancel: "Cancel",
    cloneProfile: "Clone",
    newProfile: "New",
    deleteProfile: "Delete",
    exportProfile: "Export",
    importProfile: "Import JSON",
    importQwilightDb: "Load DB.db",
    importQwilightDbShort: "DB.db",
    qwilightDbTitle: "Import Qwilight Database (DB.db)",
    qwilightDbDesc: "Load your cleared charts locally from Qwilight. 100% client-side, no files uploaded.",
    qwilightDbDragDrop: "Drop your DB.db file here, or click to browse",
    qwilightDbFileConstraint: "Accepts .db files only",
    qwilightDbLocationTip: "Default database location:",
    qwilightDbLocationNote: "(e.g., inside your Steam library or portable folder)",
    qwilightDbPathTip: "<Qwilight Folder>\\SavesDir\\DB.db",
    copyPath: "Copy path",
    copied: "Copied!",
    qwilightDbParsing: "Parsing SQLite database...",
    qwilightDbSuccess: (matched: number, total: number) => `Matched ${matched} / ${total} U_E charts`,
    qwilightDbSaveNew: "Create Profile",
    qwilightDbMerge: "Merge into Active",
    historicalSnapshotsFound: (n: number) => `${n} historical snapshots found`,
    skillProgression: "Skill Progression Timeline",
    skillProgressionDesc: "Historical ability progression over time extracted from DB.db play history.",
    careerGain: "Career Gain",
    timelineSpan: (start: string, end: string, count: number) => `${start} → ${end} (${count} snapshots)`,
    progressionTooltipDate: "Date",
    progressionTooltipAbility: "Ability",
    progressionTooltipClears: "Clears",
    progressionDeltaStart: "From start",
    shareProfile: "Share Card",
    profileCardTitle: "Player Telemetry Card",
    profileCardDesc: "Generate an ultra-crisp shareable telemetry card for your profile.",
    copyCardImage: "Copy Image",
    cardImageCopied: "Copied to Clipboard!",
    downloadCardImage: "Download PNG",
    copyCardFailed: "Clipboard copy not supported or permission denied. Please use Download PNG.",
    cardBmsTelemetry: "BMS TELEMETRY ARCHIVE",
    cardIrtEngine: "SAMEJIMA GRM CALIBRATION",
    cardTopPercentile: (pct: string) => `TOP ${pct}`,
    lampOverrideActive: "Lamp Override Active",
    lampOverrideHint: "Click any chart lamp to cycle status",
    customProfileActive: "Custom Profile Active",
    readOnlyPlayer: "Read-Only",
    viewingPlayer: "Viewing Player:",
    clickToCycleLamp: "Click to cycle lamp",
    setLamp: "Set",
    playerNotFound: "Player not found. Make sure you typed the exact Avatar ID or Player Name.",
    estimatedSkill: "Estimated Skill",
    clearsCount: (n: number) => `${n} clears logged`,
    recommendedCharts: "Recommended Targets",
    yourProbabilities: "Your Clear Probabilities",
    noRecommendations: "No charts match your active filter criteria.",
    histogramXAxis: (isLerp: boolean) => isLerp ? "Player skill (U_E scale)" : "Player skill θ (Raw logits)",
    trainingHorizon: "Training Horizon",
    horizonDesc: "Explore uncompleted charts filtered by your custom clear probability range, folder level, or search keyword.",
    horizonDescVhard: "Explore charts below V-HARD and potential upgrades from your existing HARD clears, filtered by pass probability and level.",
    targetMode: "Target:",
    probRange: "Clear Probability Range",
    featuredTargets: "Featured Targets",
    horizonExplorer: "Horizon Explorer",
    matchingCount: (matched: number, total: number) => `${matched} / ${total} charts`,
    allLevels: "All Levels",
    levelSpan: "Level Span",
    specialLevels: "Special Folders",
    currentLamp: "Lamp",
    preset3080: "30% – 80%",
    preset50: "≥ 50%",
    preset80: "≥ 80%",
    resetFilter: "Reset",
    horizonSearchPlaceholder: "Search title, artist, or diff...",
    signatureClears: "Signature Clears (Peak Upsets)",
    signatureClearsDesc: "Cleared charts with the lowest expected pass probability at your skill level — your biggest overperformances.",
    noSignatureClears: "Log HARD or V-HARD clears to surface your peak signature upsets.",
    odds: (n: number) => `1 in ${n} odds`,
    ratingDrags: "Rating Recovery Targets",
    ratingDragsDesc: "Past FAILED or NORMAL plays dragging your posterior rating down, but which you now have a high probability of passing (P* ≥ 40%).",
    noRatingDrags: "No lingering failure records dragging your rating down.",
    skillGain: "Gain",
    expectedGain: "Expected",
    recoveryBoost: "Recovery",
    rival: "Rival",
    setRival: "Set as Rival",
    unpinRival: "Remove Rival",
    rivalComparison: "Head-to-Head Rival Telemetry",
    rivalDiff: "Rival Diff",
    rivalDiffDesc: "Charts your rival has cleared that you haven't — sorted by your easiest snipes first.",
    noRivalDiff: "You have matched or surpassed all of your rival's clears!",
    rivalLead: "Lead",
    rivalDeficit: "Deficit",
    rivalTied: "Tied",
    rivalLamp: "Rival Lamp",
    selectRivalPlaceholder: "Search player to set as rival...",

    // Ranking tab
    rankingTitle: "Player Ranking",
    rankingDesc: "All tracked players sorted by estimated latent skill θ. Click any row to load that player into the Player tab. Eligibility requires ≥ 10 plays AND ≥ 1 HARD-or-better clear on valid U_E 20+ charts (or Ω) — plays on lower levels, provisional charts, and -_- / ?! / ◆ do not count.",
    rankingSearchPlaceholder: "Search by player name or Avatar ID...",
    grmSurvivalProb: "P*(θ, k) survival probability",
    predictedClearProb: (pct: number) => `${pct}% predicted clear chance`,
    clearBreakdown: "Clear Breakdown",
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
      `공식 U_E 레벨별 GRM 난이도 추정치의 중앙값 및 사분위수 범위(IQR)입니다. 빨강 = HARD 클리어, 보라 = V-HARD 클리어 (유효 ${valid}개 · 잠정 ${provisional}개). 각 열을 클릭하면 해당 레벨의 채보 목록으로 이동합니다.`,
    yAxisLabel: (isLerp: boolean) => isLerp ? "환산 U_E 레벨" : "원시 난이도 (로짓, θ 스케일)",
    xAxisLabel: "공식 U_E 레벨 (열을 클릭하면 채보로 이동)",
    legendHard: "HARD 클리어",
    legendVhard: "V-HARD 클리어",
    tooltipValid: (level: string, valid: number, total: number) =>
      `U_E ${level} – 유효 ${valid}/${total}개 채보 (클릭하면 이동)`,
    perLevelAggregates: "레벨별 집계",
    perLevelDesc:
      "레벨별 난이도(b) 중앙값 및 사분위수 범위입니다. 표본이 부족하거나 사후 표준오차가 큰 채보(n < 10 또는 SE > 1.0)는 잠정치로 분류되어 집계에서 제외됩니다.",
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
    sortBy: (key: string, dir: string) => `${key} 기준 정렬 (${dir})`,
    sortKeys: {
      title: "제목",
      level: "레벨",
      b_hard: "HARD 난이도",
      b_vhard: "V-HARD 난이도",
      a: "변별도",
      n: "표본 수",
      delta: "실력 상승치",
      expected: "기대 상승치",
    },
    sortDirs: {
      asc: "오름차순",
      desc: "내림차순",
    },
    searchPlaceholder: "곡명, 아티스트, 차분명 검색...",
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
    provisional: "잠정",
    ez2pattern: "EZ2PATTERN",
    by: "아티스트:",
    notemaker: "차분",
    comment: "코멘트:",
    grmConfidenceBand: "±1.96 SE 오차 범위",
    grmConfidenceBandDesc: "문항 모수 사후 표준오차에 기반한 95% 신용구간 리본",
    grmItemInfo: "문항 정보 I(θ)",
    grmItemInfoDesc: "실력 측정의 정밀도를 나타내는 사메지마의 피셔 정보 함수",
    grmPeakInfo: (theta: string, maxVal: string) => `최대 정밀도: I=${maxVal} (θ=${theta})`,
    folderClearsTitle: "폴더별 램프 분포",
    folderClearsDesc: "각 난이도 폴더별 클리어 램프 현황",

    // Player tab
    playerProfile: "플레이어 프로필",
    playerProfileDesc: "Qwilight Avatar ID 또는 플레이어 이름을 입력하여 추정 실력(θ)을 확인하고 맞춤형 추천 채보를 받아보세요.",
    playerIdPlaceholder: "Avatar ID 또는 이름 입력 (예: Laurency)",
    search: "검색",
    offlineProfiles: "오프라인 프로필",
    selectOfflineProfile: "오프라인 프로필 선택...",
    manage: "관리",
    profileName: "프로필 이름...",
    save: "저장",
    cancel: "취소",
    cloneProfile: "복제",
    newProfile: "새 프로필",
    deleteProfile: "삭제",
    exportProfile: "내보내기",
    importProfile: "JSON 가져오기",
    importQwilightDb: "DB.db 불러오기",
    importQwilightDbShort: "DB.db",
    qwilightDbTitle: "Qwilight 데이터베이스(DB.db) 가져오기",
    qwilightDbDesc: "Qwilight의 클리어 기록을 로컬에서 불러옵니다. 100% 클라이언트 환경에서 처리되며 파일이 서버로 업로드되지 않습니다.",
    qwilightDbDragDrop: "DB.db 파일을 여기로 끌어다 놓거나 클릭하여 선택",
    qwilightDbFileConstraint: ".db 파일만 지원",
    qwilightDbLocationTip: "기본 데이터베이스 위치:",
    qwilightDbLocationNote: "(예: Steam 라이브러리 또는 포터블 폴더 내부)",
    qwilightDbPathTip: "<Qwilight 폴더>\\SavesDir\\DB.db",
    copyPath: "경로 복사",
    copied: "복사됨!",
    qwilightDbParsing: "SQLite 데이터베이스 분석 중...",
    qwilightDbSuccess: (matched: number, total: number) => `U_E 채보 ${matched} / ${total}개 일치`,
    qwilightDbSaveNew: "새 프로필 생성",
    qwilightDbMerge: "현재 프로필에 병합",
    historicalSnapshotsFound: (n: number) => `${n}개 히스토리 스냅샷 발견`,
    skillProgression: "실력 변화 타임라인",
    skillProgressionDesc: "DB.db 플레이 기록에서 추출한 기간별 실력 변화 추이입니다.",
    careerGain: "총 성장치",
    timelineSpan: (start: string, end: string, count: number) => `${start} → ${end} (${count}개 스냅샷)`,
    progressionTooltipDate: "일자",
    progressionTooltipAbility: "실력",
    progressionTooltipClears: "클리어 수",
    progressionDeltaStart: "시작 대비",
    shareProfile: "카드 공유",
    profileCardTitle: "플레이어 텔레메트리 카드",
    profileCardDesc: "SNS 및 커뮤니티 공유용 고화질 텔레메트리 카드를 생성합니다.",
    copyCardImage: "이미지 복사",
    cardImageCopied: "클립보드에 복사됨!",
    downloadCardImage: "PNG 다운로드",
    copyCardFailed: "클립보드 복사를 지원하지 않거나 권한이 없습니다. PNG 다운로드를 이용해 주세요.",
    cardBmsTelemetry: "BMS 텔레메트리 아카이브",
    cardIrtEngine: "사메지마 GRM 보정",
    cardTopPercentile: (pct: string) => `상위 ${pct}`,
    lampOverrideActive: "램프 수동 편집 활성",
    lampOverrideHint: "채보의 램프를 클릭하여 클리어 상태를 변경할 수 있습니다",
    customProfileActive: "커스텀 프로필 활성",
    readOnlyPlayer: "읽기 전용",
    viewingPlayer: "조회 중인 프로필:",
    clickToCycleLamp: "클릭하여 램프 변경",
    setLamp: "설정",
    playerNotFound: "플레이어를 찾을 수 없습니다. 정확한 Avatar ID 또는 이름을 입력했는지 확인하세요.",
    estimatedSkill: "추정 실력",
    clearsCount: (n: number) => `클리어 기록 ${n}개`,
    recommendedCharts: "추천 목표",
    yourProbabilities: "예상 클리어 확률",
    noRecommendations: "설정하신 필터 조건에 부합하는 채보가 없습니다.",
    histogramXAxis: (isLerp: boolean) => isLerp ? "플레이어 실력 (U_E 스케일)" : "플레이어 실력 θ (원시 로짓)",
    trainingHorizon: "맞춤 연습 목표 탐색",
    horizonDesc: "지정한 클리어 확률 범위, 레벨 폴더, 검색어로 미클리어 채보를 탐색하고 다음 세션을 계획하세요.",
    horizonDescVhard: "지정한 클리어 확률 범위와 레벨 구간에 맞춰 V-HARD 미달 채보 및 기존 HARD 클리어의 승급 대상을 탐색합니다.",
    targetMode: "목표:",
    probRange: "클리어 확률 범위",
    featuredTargets: "핵심 추천 채보",
    horizonExplorer: "목표 채보 탐색기",
    matchingCount: (matched: number, total: number) => `${matched} / ${total}개 채보`,
    allLevels: "전체 레벨",
    levelSpan: "레벨 범위",
    specialLevels: "특수 폴더",
    currentLamp: "현재 램프",
    preset3080: "30% – 80%",
    preset50: "≥ 50%",
    preset80: "≥ 80%",
    resetFilter: "초기화",
    horizonSearchPlaceholder: "곡명, 아티스트, 차분명 검색...",
    signatureClears: "대표 성과 (이변 클리어)",
    signatureClearsDesc: "현재 실력 대비 통계적 클리어 확률이 가장 낮았던 채보 목록입니다. 기대를 뛰어넘은 최고의 성과를 확인하세요.",
    noSignatureClears: "HARD 또는 V-HARD 클리어 기록을 추가하면 대표 성과가 표시됩니다.",
    odds: (n: number) => `1/${n} 확률`,
    ratingDrags: "평점 회복 목표 (정체 기록 극복)",
    ratingDragsDesc: "과거 FAILED 또는 NORMAL 기록으로 인해 잠재 실력이 억제되어 있으나, 현재는 무난히 클리어 가능한 채보(P* ≥ 40%)입니다.",
    noRatingDrags: "평점을 억제하는 과거 실패 기록이 없습니다.",
    skillGain: "상승량",
    expectedGain: "기대치",
    recoveryBoost: "회복량",
    rival: "라이벌",
    setRival: "라이벌 지정",
    unpinRival: "라이벌 해제",
    rivalComparison: "라이벌 1:1 전력 비교",
    rivalDiff: "라이벌 격차 (탈환 목표)",
    rivalDiffDesc: "라이벌은 클리어했으나 내가 아직 달성하지 못한 채보 목록입니다. (탈환 확률 높은 순)",
    noRivalDiff: "라이벌의 모든 클리어 기록을 따라잡았거나 앞서고 있습니다!",
    rivalLead: "우세",
    rivalDeficit: "열세",
    rivalTied: "동점",
    rivalLamp: "라이벌 램프",
    selectRivalPlaceholder: "라이벌로 지정할 플레이어 검색...",

    // Ranking tab
    rankingTitle: "플레이어 랭킹",
    rankingDesc: "추정 잠재 실력(θ) 순으로 정렬된 전체 플레이어 목록입니다. 행을 클릭하면 플레이어 탭에서 해당 유저의 상세 프로필을 볼 수 있습니다. 랭킹에 집계되려면 유효한 U_E 20+ 또는 Ω 채보에서 플레이 기록 10건 이상 및 HARD 이상 클리어 1건 이상이 필요합니다. (하위 레벨, 잠정 채보, 특수 폴더 -_- · ?! · ◆ 기록은 제외)",
    rankingSearchPlaceholder: "플레이어 이름 또는 Avatar ID 검색...",
    grmSurvivalProb: "누적 생존 확률 P*(θ, k)",
    predictedClearProb: (pct: number) => `예상 클리어 확률 ${pct}%`,
    clearBreakdown: "클리어 분포",
    rankCol: "#",
    playerCol: "플레이어",
    thetaCol: (isLerp: boolean) => isLerp ? "U_E (실력)" : "θ (실력)",
    clearsCol: "클리어",
    vhardCol: "V-HARD",
    hardCol: "HARD",
    unrankedNote: (n: number) => `${n}명의 플레이어는 랭킹 산정 기준 미달입니다 (U_E 20+ / Ω 유효 채보 플레이 10건 미만 또는 HARD 이상 클리어 없음).`,

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
    provisionalRule: "잠정 판정 기준",
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

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

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