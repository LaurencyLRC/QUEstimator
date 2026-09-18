---
target: src/app/page.tsx
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\adam.WIN-PFVD0LK8FPA\\Documents\\GitHub\\QUEstimator\\src\\app\\page.tsx"
target_fingerprint: "sha256:47cea14038cef799e487ea018b27b7578c78b4ef5f4e96407b1d48e919ae3a26"
target_path: "C:\\Users\\adam.WIN-PFVD0LK8FPA\\Documents\\GitHub\\QUEstimator\\src\\app\\page.tsx"
timestamp: 2026-09-18T19-29-20Z
slug: src-app-page-tsx
closed: true
---
Method: dual-agent (A: 766c3917-c31e-4156-b63d-5218f305dc73 · B: 014760bc-e450-43b2-9b03-43b95aae65ea)

## Design Health Score

| # | Heuristic | Score (0–4) | Key Issue / Observation |
|---|---|:---:|---|
| 1 | **Visibility of System Status** | **3** | Real-time Bayesian MCMC convergence status (`R-hat PASS ≤ 1.05`), chart counts, and percentile rank needle. Missing feedback toast during profile export/import; search filtering lacks debouncing indicator. |
| 2 | **Match Between System and Real World** | **3** | Authentic BMS clear lamp progression (F → N → H → VH) and Qwilight Gauge Auto-Shift (GAS). Developer jargon persists in toggles ("lerp" vs "raw") and raw math columns ("b_hard", "a") without introductory tooltips. |
| 3 | **User Control and Freedom** | **3** | Dialogs dismiss cleanly via Esc; local profiles cloned, exported, and safely deleted via AlertDialog with autoFocus on Cancel. Missing a one-click "Reset Filters" button in ChartTable when combinations yield empty results. |
| 4 | **Consistency and Standards** | **3** | Cohesive border radius scale and unified OKLCH lamp tokens. Minor inconsistency in typography (monospace applied to action buttons and full sentences) and asymmetric 1px border on toggle buttons. |
| 5 | **Error Prevention** | **3** | Destructive profile deletion protected by AlertDialog with default focus on Cancel. Imported JSON profiles validated for schema, but empty profile names are permitted and failed JSON import is swallowed silently. |
| 6 | **Recognition Rather Than Recall** | **3** | Micro-gauge bars show exact percentages on hover; active player clear probabilities display inline. Cryptic parameter column heads ("a", "n") lack contextual hover tooltips for newcomers. |
| 7 | **Flexibility and Efficiency of Use** | **2** | Major Gap: Zero keyboard navigation in virtualized table rows (`ChartTable`, `RankingTab`, `LevelAggregatesTable`) and SVG box plots (no `tabIndex`, `role="button"`, or `Enter`/`Space` handlers). No one-click copy for chart MD5. |
| 8 | **Aesthetic and Minimalist Design** | **3** | Clean coplanar obsidian depth with zero drop shadows; compact row heights. Redundant container nesting: 24 recommendation cards inside a parent card followed immediately by a 60-row probability table in `PlayerTab`. |
| 9 | **Help Users Recognize, Diagnose, Recover from Errors** | **2** | "Player not found" provides a constructive recovery card to initialize a local profile. Failed JSON import is swallowed silently in a blank `catch (err) {}` block with no user feedback. |
| 10 | **Help and Documentation** | **3** | Dedicated About tab explaining Samejima's GRM formulation and GAS mechanics in bilingual EN/KO. Statistical explanations are isolated in About rather than contextualized inline via micro-tooltips. |
| **Total** | | **28 / 40** | **Good (Rating Band: 28–35 / 40)** — Solid telemetry foundation; address typography and keyboard gaps. |

---

## Design Specificity Verdict

**Verdict: Domain-Authentic Core with Lingering "Tech-Costume" AI Artifacts.**

The QUEstimator dashboard is genuinely tailored to competitive BMS/Qwilight 6-key rhythm game culture rather than an interchangeable SaaS dashboard:
- The obsidian canvas (`oklch(0.12 0 0)`) anchored by BMS Gauge Neon accents (Amber Gold, Crimson Coral, Violet Magenta, Ash Gray) faithfully mirrors arcade health-gauge survival dynamics.
- Qwilight's Gauge Auto-Shift (GAS) mechanic validates real-world player survival thresholds without artificial gauge conversion guesses.
- CJK glyph protection via `Noto Sans JP` isolates Doujin BMS music metadata from Korean/English Han-unification distortion.
- Replacing the 4 floating hero metric cards with a unified 4-cell telemetry strip (`divide-x`) establishes an authentic arcade telemetry aesthetic.

However, several subtle AI slop anti-patterns and craft-floor violations persist:
1. **Monospace as a Costume**: Rather than reserving `font-mono` strictly for numbers, parameters, code, and measurements, whole natural-language sentences, button labels ("Search", "Save", "Cancel", "Delete Profile", "Offline Profiles:"), table headers, and error messages are rendered in monospace to look "hacker-ish."
2. **Nested Card-in-Card Containers**: In `PlayerTab`, 24 recommendation cards are nested inside a large bordered card, immediately stacked atop another large bordered card housing a 60-row table showing the exact same probability data. In `AboutTab`, 4 identical cards are stacked with nested bordered sub-boxes.
3. **Subpixel Jitter on Interactive Toggles**: Mode toggles (`ScaleToggle`, `LangToggle`, and `targetStatus`) add `border border-border/80` only when active, omitting `border border-transparent` on inactive states, causing micro-reflows on click.
4. **Keyboard Accessibility Void**: Click-only interactions across virtualized table rows and SVG box plots without `tabIndex`, `onKeyDown`, or focus rings prevent power users from navigating without a mouse.

---

## Overall Impression

QUEstimator's transformation from generic floating SaaS cards to an obsidian coplanar telemetry console with zero drop shadows and zero color token drift represents a massive leap in craft. Its Samejima GRM psychometric model and BMS gauge accents give it unmistakable product character. The primary opportunity now is shedding the lingering "hacker costume" (monospace on buttons and copy) and adding keyboard operability to make it feel like a polished, world-class competitive instrument.

---

## What's Working

1. **Strict Palette Discipline (0 Color Violations):** All 22 previous color token drifts were eliminated. Every hue maps to the semantic palette in `DESIGN.md`: obsidian canvas (`oklch(0.12 0 0)`), card surfaces (`oklch(0.155 0.005 260)`), and BMS gauge neons (`lamp-vhard`, `lamp-hard`, `lamp-normal`, `lamp-failed`).
2. **Pure-Plane Canvas Architecture:** 100% elimination of drop shadows across all custom components. Depth is achieved cleanly through luminance stratification and 1px hairline dividers (`oklch(1 0 0 / 10%)`).
3. **Safety & Recovery Heuristics:** Destructive profile deletion is safely guarded by an `AlertDialog` with default `autoFocus` on "Cancel", and "Player not found" offers a constructive path to create a local offline profile immediately.

---

## Priority Issues

### [P1] Issue 1: Monospace Font Overextension (Aesthetic Slop)
- **What**: `font-mono` (`Geist Mono`) is applied to natural-language descriptions, full sentences, action buttons ("Search", "Save", "Cancel", "Delete Profile", "Offline Profiles:"), table headers, and error messages (`page.tsx:328, 387, 432, 438, 593, 701`, `PlayerTab.tsx:387, 425, 434, 449, 536, 564, 578, 598, 815, 880`, `RankingTab.tsx:191, 233`).
- **Why it matters**: Violates the Craft Floor rule (*"Monospace as a costume for 'technical' rather than for code, data, or measurement"*). Impairs readability of English and Korean copy, degrades typographic hierarchy, and feels like an AI-generated dashboard costume.
- **Fix**: Confine `font-mono` strictly to numerical figures ($\theta$, $a$, $b$, $n$, R-hat), percentages, dates, and hashes. Revert all button labels, subtitles, error messages, and table column titles to `font-sans`.
- **Suggested command**: `$impeccable typeset`

### [P1] Issue 2: Keyboard Accessibility & Focus Void in Data Grids
- **What**: Table rows in `ChartTable.tsx` (line 280), `RankingTab.tsx` (line 273), and `LevelAggregatesTable` (`page.tsx:537`), as well as SVG column click targets in `BoxPlot.tsx` (line 157), rely purely on `onClick` without `tabIndex={0}`, `role="button"`, or keyboard event listeners (`Enter`/`Space`).
- **Why it matters**: Completely breaks keyboard-only navigation (WCAG 2.1 Principle 2: Operable). Prevents power rhythm gamers from rapidly browsing charts or checking leaderboards without switching to the mouse.
- **Fix**: Add `tabIndex={0}`, `role="button"`, and `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectChart(c); }}` with visible `:focus-visible:ring-1` focus rings on interactive table rows.
- **Suggested command**: `$impeccable polish`

### [P2] Issue 3: Nested Card Containers & Horizon Display Redundancy
- **What**: In `PlayerTab.tsx` (lines 808–940), the "Recommended Charts" section wraps 24 individual card buttons inside a bordered card container, immediately followed by another bordered card container wrapping a 60-row table showing the exact same probability data. In `AboutTab` (`page.tsx:579–707`), 4 identical cards are stacked with nested bordered sub-boxes.
- **Why it matters**: Violates Craft Floor guidelines (*"Cards are the lazy container; nested cards are always wrong"*). Causes visual clutter, redundant border lines, and forces the user to mentally reconcile two competing presentation formats for the same data.
- **Fix**: Flatten the presentation: convert recommendations into a unified, filterable target table (e.g. tabs or segmented toggles for "Practice Horizon [30%–70%]" vs "All Reachable [≥5%]"). In `AboutTab`, remove outer card boundaries in favor of clean section headers separated by hairline dividers.
- **Suggested command**: `$impeccable layout`

### [P2] Issue 4: Interactive Toggle Subpixel Jitter & Layout Shifts
- **What**: In `ScaleToggle.tsx` (line 14), `LangToggle.tsx` (line 19), and the HARD/V-HARD target switch in `PlayerTab.tsx` (line 827), the active button has `border border-border/80`, while the inactive button has no border class (`border-transparent` is omitted).
- **Why it matters**: When switching between LERP/RAW, KO/EN, or HARD/V-HARD, the component experiences a 1–2px subpixel geometry shift / reflow, violating the crisp, jitter-free interaction standards of a precision data console.
- **Fix**: Ensure both states declare a uniform border width: apply `border border-transparent` to inactive buttons and `border border-border/80` to active buttons.
- **Suggested command**: `$impeccable polish`

### [P2] Issue 5: Sub-Threshold Contrast on Opacity-Modified Text & 9px Typography
- **What**: In `RankingTab.tsx` (lines 336, 347) and `ChartDetailDialog.tsx` (lines 105, 135, 176), text styled with `text-muted-foreground/60` on dark card surfaces yields an effective contrast ratio of ~2.9:1, failing WCAG AA (4.5:1). In addition, several badges and confidence interval strings use `text-[9px]` (`ChartTable.tsx:293, 311`, `ChartDetailDialog.tsx:233`).
- **Why it matters**: Renders secondary metrics nearly illegible for players in dim environments or users with visual impairments.
- **Fix**: Replace `text-muted-foreground/60` with solid `text-muted-foreground` (or `oklch(0.68 0 0)` at ≥ 4.5:1). Enforce an absolute floor of `11px` (`text-[11px]`) for badges and parameter annotations.
- **Suggested command**: `$impeccable audit`

---

## Persona Red Flags

### Alex (Competitive BMS / Dan Grinder)
- **Zero Keyboard Navigation in Tables**: The virtualized 1,544-item ChartTable and RankingTable cannot be navigated with arrow keys or Enter. Alex cannot browse charts hands-on from their keyboard/controller setup.
- **No Quick Copy for MD5 / Title**: Alex cannot copy a chart's MD5 hash or Japanese title to search in Beatoraja or Qwilight without manually opening the dialog and highlighting text.
- **No Batch Status Updates**: In offline profile mode, updating multiple clears requires opening the modal for each chart individually rather than rapid inline entry.

### Jordan (First-time Qwilight player exploring difficulty ratings)
- **IRT Jargon Barrier**: Terms like `b_hard`, `b_vhard`, `a_i (Discrimination)`, `MCMC NUTS (R-hat: 1.0040)`, and `Gauss-Hermite quadrature` are displayed without layman tooltips.
- **Developer Jargon in Controls**: The header scale toggle says "lerp" vs "raw"—Jordan has no idea what linear interpolation means; "Folder Level" vs "Skill Rating (θ)" would be immediately intuitive.
- **Dead-End Online Search**: Searching their Qwilight handle returns "Player not found" without explaining that only players with scraped clears in the official U_E Internet Ranking are pre-indexed.

### Dr. Chen (Psychometrician / IRT Statistical Researcher)
- **Monospace Cosmetic Abuse**: Essential statistical descriptions, method copy, and table headers are dressed in monospace for cyberpunk flavor rather than reserved for numeric parameters.
- **Missing Item Information Curves (IIC)**: While cumulative logistic survival curves $P^*(\theta)$ are rendered, Category Response Curves $P_k(\theta)$ and Item Information Functions $I_i(\theta)$ are omitted, preventing Dr. Chen from auditing where on the skill continuum the chart discriminates best.
- **Unclarified Boundary Imputation**: Charts with 0 hard clears show `>28.5?` with a question mark without a tooltip explaining the exact statistical imputation boundary.

---

## Minor Observations

- In `ChartDetailDialog.tsx` line 100, `<span className="text-border">·</span>` uses the border token (`oklch(1 0 0 / 10%)`) as a text color, resulting in an unreadable 1.1:1 contrast dot.
- In `PlayerTab.tsx` line 674, JSON file import silently suppresses parsing errors via an empty `catch (err) {}` block, leaving the user wondering why their file did not load.
- In `page.tsx` line 432, `<h2 className="text-base font-bold font-mono tracking-tight ...">` forces the section header "All Charts" or "Folder 24" into monospace font.
- In `ChartTable.tsx` line 209, column sorting headers use generic Lucide `ArrowUpDown` for both ascending, descending, and unsorted states, rather than specific directional indicators (`ArrowUp` / `ArrowDown`).

---

## Questions to Consider

1. *"What if the 24 recommendation cards and the 60-row probability table in the Player tab were unified into a single interactive Practice Matrix with segmented filters ('Reachable: 30%–70%', 'Stretch: 10%–30%', 'Farmable: >70%'), eliminating container redundancy and cognitive split?"*
2. *"What if BMS Dan course milestones (Dan 1–10, Kaiden, Overjoy) were plotted as vertical reference lines across the Skill Histogram and Table filters, allowing players to instantly correlate their continuous theta rating ($\theta$) with familiar rhythm gaming ranks?"*
3. *"Could the header toggle be renamed from 'LERP / RAW' to 'FOLDER LEVEL / SKILL θ'—making the continuous difficulty scale instantly understandable to casual rhythm gamers without compromising psychometric accuracy?"*
