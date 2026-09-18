---
name: QUEstimator
description: High-density Bayesian IRT difficulty estimator and skill tracker for Qwilight 6K BMS
colors:
  bg-canvas: "oklch(0.13 0 0)"
  bg-card: "oklch(0.16 0 0)"
  bg-muted: "oklch(0.269 0 0)"
  text-primary: "oklch(0.98 0 0)"
  text-muted: "oklch(0.708 0 0)"
  border-subtle: "oklch(1 0 0 / 10%)"
  border-card: "oklch(1 0 0 / 15%)"
  lamp-failed: "oklch(0.55 0 0)"
  lamp-normal: "oklch(0.72 0.16 95)"
  lamp-hard: "oklch(0.70 0.22 25)"
  lamp-vhard: "oklch(0.70 0.22 305)"
  cyan-theta: "oklch(0.68 0.15 200)"
  gold-rank1: "oklch(0.80 0.15 85)"
typography:
  display:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.lamp-hard}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge-lamp:
    backgroundColor: "{colors.bg-muted}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: QUEstimator

## Overview

**Creative North Star: "The Cybernetic Archive"**

QUEstimator is an understated, minimalist data terminal built for high-speed scanning, mathematical precision, and rapid telemetry consumption. Inspired by Japanese arcade rhythm-game telemetry displays and statistical research tools, it eschews flashy gamification in favor of clinical clarity, tight information density, and instant legibility.

The interface lives in a deep obsidian environment where chrome and borders recede into the canvas. Visual emphasis is reserved strictly for functional metrics: calibrated gauge lamp colors that signal clear thresholds, monospace telemetry figures that align perfectly in tables, and razor-sharp SVG statistical plots that communicate Bayesian confidence intervals at a glance.

**Key Characteristics:**
- **Zero-Distraction Density:** High data-per-pixel ratio with compact row heights, disciplined padding, and no oversized decorative whitespace.
- **Strictly Semantic Neon Accents:** Saturated color is exclusively functional, reserved for rhythm-game clear lamps (Failed, Normal, Hard, Very Hard) and player rating reference lines.
- **Dual Typographic Discipline:** High-contrast sans-serif for UI labels, tabular monospace for all numbers, and dedicated Japanese font glyph pinning for BMS metadata.
- **Flat Coplanar Depth:** Border-delineated grid system with zero drop shadows or simulated physical elevation.

## Colors

The palette is "BMS Gauge Neon on Void Black"—an obsidian ground where functional neon lamps cut through a dark monochrome architecture.

### Primary
- **Obsidian Canvas** (`oklch(0.13 0 0)`): Deep near-black background that anchors the entire dashboard, maximizing contrast for data and charts.
- **Surface Elevation / Card** (`oklch(0.16 0 0)`): Subtle 3% tonal lift for card surfaces, dialog frames, and grouped controls.
- **Muted Surface** (`oklch(0.269 0 0)`): Surface fill for inactive pills, subtle badge backgrounds, and secondary interactive states.

### Semantic Gauge Lamps (Functional Accents)
- **Signal Gray / FAILED** (`oklch(0.55 0 0)`): Neutral ash indicating a failed play attempt or unachieved threshold.
- **Amber Gold / NORMAL** (`oklch(0.72 0.16 95)`): Warm amber indicating a Normal clear lamp or baseline clear hurdle.
- **Crimson Coral / HARD** (`oklch(0.70 0.22 25)`): High-intensity red-orange representing the primary competitive benchmark (Hard clear lamp, $b_{\text{hard}}$ difficulty parameter).
- **Violet Magenta / V-HARD** (`oklch(0.70 0.22 305)`): Vivid electric purple representing the extreme achievement tier (Very Hard clear lamp, $b_{\text{vhard}}$ difficulty parameter).

### Telemetry & Chart Accents
- **Cyan Rating Marker** (`oklch(0.68 0.15 200)`): Vibrant cyan reserved for the active player's latent ability ($	heta$), skill histogram bars, and target reference lines.
- **Championship Gold** (`oklch(0.80 0.15 85)`): Trophy and 1st-place leaderboard highlight.
- **Silver Medalist** (`oklch(0.75 0.05 250)`): 2nd-place ranking indicator.
- **Bronze Medalist** (`oklch(0.65 0.12 50)`): 3rd-place ranking indicator.

### Neutral
- **Foreground Primary** (`oklch(0.98 0 0)`): Bright white text for headers, chart titles, and prominent metrics.
- **Foreground Muted** (`oklch(0.708 0 0)`): Neutral gray for secondary metadata, artist names, axis tick labels, and inactive filters.
- **Subtle Border** (`oklch(1 0 0 / 10%)`): 1px translucent white border defining cards, tables, and dividers without visual clutter.
- **Interactive Border** (`oklch(1 0 0 / 15%)`): Enhanced stroke for inputs and active interactive edges.

### Named Rules
**The Gauge Truth Rule.** Gauge colors (Amber Gold, Crimson Coral, Violet Magenta) are strictly semantic indicators reserved for clear status and IRT parameters. They must never be diluted for decorative UI elements, generic buttons, or arbitrary visual accents.

**The Background Contrast Rule.** The canvas must remain native dark (`.dark`). Pure white cards or light-mode flashes break the rhythm-game arcade continuity and are forbidden.

## Typography

**Display Font:** Geist Sans (`var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif`)  
**Body Font:** Geist Sans (`var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif`)  
**Label/Mono Font:** Geist Mono (`var(--font-geist-mono), ui-monospace, monospace`)  
**CJK Metadata Font:** Noto Sans JP (`var(--font-noto-sans-jp), sans-serif`, via `.font-jp`)  

**Character:** Technical, razor-sharp, and multilingual. Clean neo-grotesque sans for system UI paired with zero-ambiguity tabular monospace for mathematical metrics, reinforced by Japanese CJK glyph preservation.

### Hierarchy
- **Display** (Bold 700, 24px / 1.5rem, line-height 1.2): Main header branding, player avatar names in profile view.
- **Headline** (SemiBold 600, 18px / 1.125rem, line-height 1.3): Card titles, dialog headers, section anchors.
- **Title** (SemiBold 600, 14px / 0.875rem, line-height 1.4): Table column headers, parameter labels, modal subheadings.
- **Body** (Regular 400, 14px / 0.875rem, line-height 1.5): Standard UI copy, explanations, about text, comments.
- **Label / Metric** (Medium 500, 12px / 0.75rem, letter-spacing 0.02em, Monospace): Difficulty values, clear counts, probabilities, timestamps, table cells.

### Named Rules
**The Tabular Precision Rule.** All numerical ratings (latent ability $	heta$, item discrimination $a$, thresholds $b_{\text{hard}}$ / $b_{\text{vhard}}$, confidence intervals, percentages, and level numbers) must strictly render in `Geist Mono` (`font-mono`) with tabular figures.

**The CJK Unification Rule.** BMS chart titles, artist credits, and notemaker names must strictly include the `.font-jp` class (`Noto Sans JP`). This guarantees authentic Japanese glyph shaping for CJK ideographs and prevents Han-unification rendering glitches in Korean/English browser environments.

## Layout

The application employs a single-screen responsive command layout designed for dense tabular data and interactive charting.

- **Container:** Maximum content width constrained to `max-w-7xl` (`1280px`) with centered horizontal alignment and `px-4 sm:px-6` responsive padding.
- **Tab Navigation:** Sticky or prominent header tabs (`TabsList`) organizing the interface into four core workspaces: Overview (Table & Distribution), Player (Profile & Recommendations), Ranking (Leaderboards), and About (IRT Documentation).
- **Rhythm & Grid:** Strict 4px base spatial unit (`gap-1` = 4px, `gap-2` = 8px, `gap-3` = 12px, `gap-4` = 16px, `gap-6` = 24px).
- **Table Virtualization:** TanStack Virtual utilized for long tables (Ranking and Catalog) to maintain instantaneous 60fps scrolling over 1,500+ items without DOM lag.
- **Split Workspaces:** Responsive two-column split on desktop (`lg:grid-cols-2` or `lg:grid-cols-3`) for summary analytics and recommendation feeds.

## Elevation & Depth

QUEstimator adheres to a strictly flat, coplanar architectural model with zero simulated physical elevation.

- **Depth Model:** Depth is established purely through luminance stratification:
  1. Base canvas: `oklch(0.13 0 0)` (lowest plane)
  2. Data cards & dialog bodies: `oklch(0.16 0 0)` (primary container plane)
  3. Subtle interactive hover: `oklch(0.20 0 0)` or `bg-muted/40`
- **Shadows:** No drop shadows (`box-shadow: none` across default cards, tables, and buttons). Modals use a clean backdrop dim (`bg-black/80`) rather than floating shadow plumes.
- **Dividers:** Crisp 1px hairline borders (`border border-border/50` or `oklch(1 0 0 / 10%)`) provide clean boundary separation between data regions.

### Named Rules
**The Pure Plane Rule.** Surfaces remain strictly coplanar without drop shadows. State changes are communicated via hairline border highlight, background tone shift, or gauge glow—never by lifting elements in physical z-space.

## Shapes

- **Corner Radius Scale:**
  - Base radius: `0.625rem` (10px, `--radius-lg`) applied to main container cards and dialog surfaces.
  - Sub-elements: `8px` (`--radius-md`) for buttons, inputs, and popovers; `6px` (`--radius-sm`) for compact parameter chips.
  - Fully Rounded (`rounded-full`): Reserved for pill badges, clear status tags (`F`, `N`, `H`, `VH`), and player rank badges.
- **Strokes:** Uniform 1px hairline borders on all bounded surfaces (`border-border/50`).

## Components

### Buttons
- **Shape:** Rounded 8px (`rounded-md`).
- **Primary Action:** Solid high-contrast text and fill (`bg-primary text-primary-foreground` or gauge-specific accent for confirmed actions).
- **Secondary / Outline:** Translucent border (`border border-border/60`) with dark surface; hovers subtly brighten background (`hover:bg-muted/30`).
- **Ghost:** Zero border, padding-only; reveals `bg-muted/40` on hover.

### Status Badges & Lamps
- **Pill Badge:** Compact pill (`rounded-full px-2 py-0.5 text-xs font-mono`) with distinct border and background tinted to the clear tier.
- **Gauge Dots:** 8px circular indicator (`w-2 h-2 rounded-full`) colored with the exact semantic gauge token.

### Cards & Telemetry Containers
- **Frame:** Flat dark card (`bg-card border border-border/50 rounded-lg p-4 sm:p-5`).
- **Header:** Concise uppercase or bold title (`text-sm font-semibold tracking-wider text-muted-foreground`).

### Data Tables
- **Grid:** Compact row height (`h-9` to `h-11`) with cell padding `px-2 py-1.5 sm:px-3`.
- **Numbers:** Monospace tabular figures with consistent column alignment (difficulty right-aligned, status center-aligned, titles left-aligned).
- **Row Interaction:** Subtle background highlight on hover (`hover:bg-muted/30 transition-colors`).

### Statistical Charts
- **Box Plot:** SVG distribution showing Q1, Median, and Q3 with separate Crimson (`HARD`) and Violet (`V-HARD`) box pairs per level folder.
- **GRM Survival Curves:** Cumulative IRT logistic probability curves ($P^*(	heta)$) for Normal, Hard, and V-Hard clear probabilities with vertical player $	heta$ needle.
- **Skill Histogram:** Bar chart with OKLCH cyan bars and dashed amber/cyan population and player benchmark markers.

## Do's and Don'ts

### Do:
- **Do** use `Geist Mono` (`font-mono`) for all scores, skill ratings, difficulty metrics, percentages, and timestamps.
- **Do** wrap BMS chart titles and artist credits in `.font-jp` to guarantee correct Japanese font rendering.
- **Do** keep the interface compact, glancable, and information-dense.
- **Do** use exact gauge lamp colors (`lamp-failed`, `lamp-normal`, `lamp-hard`, `lamp-vhard`) when displaying clear statuses.
- **Do** maintain bilingual parity (English and Korean) for all UI labels and tooltips.

### Don't:
- **Don't** use gauge lamp colors (Amber, Crimson, Violet) for generic UI decorations, generic buttons, or unrelated status states.
- **Don't** add heavy drop shadows, bubbly card skeuomorphism, or floating elevation effects.
- **Don't** increase card or table padding to create airy, low-density marketing-style layouts.
- **Don't** introduce light mode or bright white content cards.
- **Don't** allow CJK chart titles to fallback to generic system fonts that render Japanese kanji with Chinese or Korean glyph variants.
