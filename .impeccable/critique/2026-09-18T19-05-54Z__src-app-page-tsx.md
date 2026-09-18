---
target: src/app/page.tsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\adam.WIN-PFVD0LK8FPA\\Documents\\GitHub\\QUEstimator\\src\\app\\page.tsx"
target_fingerprint: "sha256:7b5083f18d4afdbd2badf5818d1ef77b806331355a2b491c62c8c4e428cc822a"
target_path: "C:\\Users\\adam.WIN-PFVD0LK8FPA\\Documents\\GitHub\\QUEstimator\\src\\app\\page.tsx"
timestamp: 2026-09-18T19-05-54Z
slug: src-app-page-tsx
---
# Design Critique: QUEstimator Dashboard (`src/app/page.tsx`)

Method: dual-agent (A: 17a6dfb3-7e11-4785-80cc-a2aedde722af · B: 37826d97-b663-472e-a3c2-2611895e74c9)

## Design Health Score

| # | Heuristic | Score (0–4) | Key Issue |
|---|-----------|:-----------:|-----------|
| 1 | Visibility of System Status | 3 | Background skill rating re-estimation on custom profile override occurs silently without feedback indicator. |
| 2 | Match Between System and Real World | 3 | Psychometric parameters (a, b_hard, b_vhard, θ, NUTS) lack plain-language explanations in active workflows. |
| 3 | User Control and Freedom | 3 | Local profile deletion in PlayerTab is immediate with no undo buffer or recovery mechanism. |
| 4 | Consistency and Standards | 3 | Color tokens alternate between inline OKLCH strings and theme tokens; 6 ad-hoc OKLCH variants for Hard lamp. |
| 5 | Error Prevention | 2 | Delete Profile button triggers immediately upon click with zero confirmation dialog, risking permanent record loss. |
| 6 | Recognition Rather Than Recall | 3 | ChartTable column headers (a, b_hard, n) lack tooltips or legends, forcing recall from About tab. |
| 7 | Flexibility and Efficiency | 2 | No keyboard navigation: rhythm gamers cannot use arrow keys/JK, `/` search, or 1–4 keys for clear logging. |
| 8 | Aesthetic and Minimalist Design | 2 | ClearDistBar crowds percentages, bars, and counts in 100px cell; LevelAggregatesTable duplicates BoxPlot. |
| 9 | Error Recovery | 2 | Unregistered avatar search displays a harsh red dead-end with no constructive recovery path. |
| 10 | Help and Documentation | 3 | Theoretical math docs exist in AboutTab, but active parameter micro-copy and tooltips are missing. |
| **Total** | | **26 / 40** | **Acceptable (Significant improvements needed before users are happy)** |

## Design Specificity Verdict

**Verdict**: Authentic Rhythm Game Grounding Compromised by Lingering SaaS Boilerplate and Token Drift.

**LLM Assessment**: The application successfully establishes core rhythm game telemetry DNA: semantic clear gauge colors (Ash Gray, Amber, Coral, Violet), dedicated CJK font pinning (`.font-jp` / `Noto Sans JP`) preventing Han-unification glitches in BMS titles, and Graded Response Model survival curves. However, card-in-card stacking, standard web padding, and lack of keyboard acceleration betray its generic SaaS framework origins rather than feeling like a dedicated arcade terminal HUD.

**Deterministic Scan**: The automated detector identified **62 advisory quality findings** across the primary surfaces:
- `40x design-system-font-size`: High-density micro-typography (9px, 10px, 11px) used extensively in table badges, micro-captions, and table headers that is not yet formalized in `DESIGN.md`.
- `22x design-system-color`: Handcrafted literal OKLCH color strings used in `ChartTable.tsx` and `PlayerTab.tsx` instead of central design tokens, causing palette fragmentation across components.
- *False Positives*: The detector flags the 4 gauge hues as out-of-palette because they are written as raw OKLCH literals; these are domain-essential rhythm game lamps, but their exact parameters have drifted into 6 uncurated variants.

**Visual Overlays**: Headless fallback signal reported. Browser injection skipped because no local development server was active on port 3000 during the subagent audit phase.

## Overall Impression

QUEstimator combines mathematical rigor (Bayesian GRM via MCMC NUTS) with high-performance 60fps virtualization for 1,500+ charts. However, the interface currently operates more like a statistical research spreadsheet than an arcade telemetry console. Addressing the severe contrast issues, adding keyboard navigation, streamlining visual clutter in table cells, and guarding user data with destructive action confirmation will elevate it to true production craft.

## What's Working

1. **Mathematically Rigorous Domain Modeling**: Item Response Theory combined with Qwilight's Gauge Auto-Shift (GAS) replaces subjective community difficulty opinions with an objective, data-backed standard.
2. **High-Performance CJK-Safe Virtualization**: TanStack Virtual maintains smooth 60fps scrolling over 1,500+ charts, with strict Noto Sans JP font pinning preserving Japanese title typography.
3. **Training Horizon Targeting**: The [30%, 70%] clear probability filter proactively assists players in identifying breakthrough practice targets.

## Priority Issues

### [P1] Critical Safety Gap: Immediate Profile Deletion Without Confirmation
- **What**: Clicking "Delete Profile" in `PlayerTab.tsx` immediately wipes custom play logs from state and localStorage.
- **Why it matters**: Players logging manual plays risk destroying their entire record archive with an accidental click on trackpad or mobile.
- **Fix**: Wrap deletion in an `AlertDialog` confirming the profile name, default focus to "Cancel", and provide an undo toast notification.
- **Suggested Command**: `$impeccable harden src/components/questimator/PlayerTab.tsx`

### [P1] Accessibility & Severe Contrast Floor Failures
- **What**: Inactive clear counts (`oklch(0.45 0 0)`) and lower gauge fills (`oklch(0.40 0 0)`) produce 2.2:1–2.7:1 contrast against canvas `oklch(0.12 0 0)`, violating WCAG AA (4.5:1). Search inputs also lack `aria-label`s.
- **Why it matters**: Crucial inactive stats and table boundaries are unreadable on darker monitors or under ambient glare; screen readers receive unannounced search bars.
- **Fix**: Elevate muted text to at least `oklch(0.60 0 0)` (> 5.1:1 contrast) and add `aria-label={t.searchPlaceholder}` to all search inputs.
- **Suggested Command**: `$impeccable audit src/components/questimator/RankingTab.tsx`

### [P2] Visual Clutter & Token Fragmentation in Chart Table Cells
- **What**: `ClearDistBar` simultaneously renders graphic bars, percentages, and counts in a 100px cell; 22 literal OKLCH colors bypass design tokens.
- **Why it matters**: High visual noise and vibration during fast scrolling violate working memory limits; fragmented color literals make theme maintenance brittle.
- **Fix**: Distill `ClearDistBar` into a sleek 4px gauge bar with primary percentage, reveal raw counts on tooltip hover, and bind colors to semantic theme variables.
- **Suggested Command**: `$impeccable distill src/components/questimator/ChartTable.tsx`

### [P2] Total Absence of Keyboard Acceleration
- **What**: Neither table navigation, search focus, nor modal clear logging can be controlled via keyboard.
- **Why it matters**: Rhythm game players are keyboard-native power users; forcing mouse reliance breaks operational focus.
- **Fix**: Implement `/` for search focus, `J`/`K` or arrow keys for virtual row traversal, `Enter` to open song details, and `1`–`4` for rapid clear logging.
- **Suggested Command**: `$impeccable adapt src/components/questimator/ChartTable.tsx`

### [P2] Cognitive Overload & Statistical Jargon Barrier
- **What**: Psychometric terms ($a$, $b_{\text{hard}}$, $b_{\text{vhard}}$, $\theta$) lack contextual tooltips or plain-language translations in active workflows.
- **Why it matters**: Casual and intermediate players cannot interpret what discrimination $a$ means or how raw $\theta$ relates to in-game level folders.
- **Fix**: Add explanatory tooltips to all table column headers and parameter cards (e.g., "$a$: Gatekeeping Strictness — how sharply this chart tests pure skill").
- **Suggested Command**: `$impeccable clarify src/components/questimator/ChartDetailDialog.tsx`

## Persona Red Flags

- **Alex (Competitive BMS / Dan Grinder)**: Zero keyboard shortcuts for table skimming or score logging; faint clear-status row highlights make unplayed charts hard to spot when rapidly skimming folders.
- **Jordan (First-Time Qwilight Player)**: Intimidated by mathematical jargon and Greek letters; typing an unregistered avatar yields a harsh red "Player not found" message with no recovery path.
- **Dr. Chen (Psychometrician / IRT Researcher)**: `GrmCurveChart` displays point-estimate cumulative curves without Bayesian credible interval ribbons ($\pm 1.96 \times \text{SE}$); no Test Information Function (TIF) curve showing measurement precision.

## Minor Observations

- Hardcoded fallback `"1.0040"` in header ticker masks network or metadata loading degradation.
- "Import Profile" button uses an unstyled hidden file input without focus indication.
- `LevelAggregatesTable` duplicates the same statistical data plotted in `BoxPlot` directly above it.

## Questions to Consider

1. What if logging a breakthrough clear triggered an authentic arcade LED illumination effect and sound cue?
2. Why restrict practice targets to a static [30%, 70%] window instead of offering a customizable training horizon slider (Warmup vs. Challenge vs. Miracle)?
3. Could charts display multidimensional pattern radar attributes (Jackhammer, Stream, Delay, Gimmick) alongside unidimensional difficulty $b$?
