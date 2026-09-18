# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Dedicated Qwilight and BMS 6-key rhythm game players looking to benchmark their latent skill rating (θ), track clear lamp progression across difficulty tiers (FAILED, NORMAL, HARD, V-HARD), and discover recommended practice charts in their success window. Secondary audience includes rhythm game analysts and chart authors seeking objective difficulty metrics.

## Product Purpose
QUEstimator provides an objective, mathematically rigorous difficulty rating and skill tracking system for the U_E 6-key BMS table. It eliminates the distortion and subjectivity of community tier lists by estimating continuous chart difficulty and player skill via Item Response Theory (IRT), helping players understand their true skill level and find charts suited to their progression.

## Positioning
Unlike static community tier lists or simple clear counters, QUEstimator fits a Bayesian Graded Response Model (GRM) directly on tens of thousands of real player clears scraped from the Qwilight Internet Ranking (IR), joint-estimating item discrimination ($a$) and category threshold parameters ($b_{\text{hard}}$, $b_{\text{vhard}}$) while marginalizing out latent player skill ($\theta$) via Gauss-Hermite quadrature.

## Operating Context
Players use QUEstimator in a web browser alongside running Qwilight or BMS clients. Key rituals include looking up an avatar ID or local custom profile after a play session, checking whether difficult charts lie within a reachable probability window (30%–70% clear probability), inspecting the global top-player rankings, and toggling between intuitive level-mapped difficulty (`lerp`) and continuous latent skill metrics (`raw` $\theta$).

## Capabilities and Constraints
- **Table Overview**: Searchable, sortable catalog of all 1,544 UE charts with clear status badges, continuous difficulty estimates, confidence intervals, video links, and EZ2PATTERN references.
- **Player Skill Profiling**: Latent skill ($\theta$) estimation, clear distribution breakdown, level-by-level clear summaries, and skill-tailored target recommendations.
- **Custom / Offline Profiles**: Local offline profile creation and editing stored in browser storage for unranked or offline players.
- **Global Leaderboard**: Tracked player rankings filtered by activity and clear counts.
- **Language & Scale Modes**: Full bilingual support (English and Korean) and dual scale representation (`lerp` folder-relative level vs `raw` latent theta).
- **Technical Constraints**: Client-side static export (Next.js App Router deployed to GitHub Pages). Heavy MCMC sampling runs offline via NumPyro/JAX; dashboard consumes precomputed JSON artifacts in `public/data/`.

## Brand Commitments
- Name: **QUEstimator**
- Aesthetic: Technical, data-dense, dark rhythm-game arcade console feel with clean typographic contrast and vivid lamp status accents:
  - FAILED: Muted gray/red
  - NORMAL: Warm gold / yellow
  - HARD: Crimson / coral
  - V-HARD: Violet / magenta
- Tone: Analytical, authoritative, precise, respectful of competitive rhythm gaming culture.

## Evidence on Hand
- Complete dataset in `public/data/`: `charts.json` (1,544 charts), `players.json` (2,946 players), `level-summary.json` (folder benchmarks), and `meta.json` (MCMC sampling diagnostics).
- Upstream table source: [U_E Difficulty Table](https://classmaterma.github.io/UE/table.html).
- IR clear data: [Qwilight Internet Ranking](https://taehui.net).
- Hash resolution: [EZ2PATTERN](https://ez2pattern.kr).

## Product Principles
1. **Mathematical Grounding Over Community Consensus**: Every difficulty number is rooted in Bayesian IRT inference on verified clear records, never anecdotal debate.
2. **Actionable Training Signals**: Present probabilities and difficulty ratings that tell players what to practice next to advance their skill, not just passive scorekeeping.
3. **High-Density, Glancable Interface**: Rhythm game players digest high volumes of data rapidly; prioritize scanability, monospace figures, and clear visual hierarchy over decorative fluff.
4. **Resilience & Local Autonomy**: Support both live online avatars and local offline profiles with zero external backend required at runtime.

## Accessibility & Inclusion
- High-contrast text and interactive elements on deep dark backgrounds.
- Color-independent status indicators (short alphanumeric badges "F", "N", "H", "VH" paired with gauge colors).
- Screen-reader labels and keyboard navigability across tabular data and filter controls.
