# QUEstimator

Item Response Theory (IRT) difficulty estimation and player skill tracking for the [U_E 6-key BMS table](https://classmaterma.github.io/UE/table.html).

QUEstimator scrapes clear lamps from the [Qwilight Internet Ranking](https://taehui.net), maps hashes via [EZ2PATTERN](https://ez2pattern.kr), and fits a Bayesian Graded Response Model (GRM) using NumPyro (NUTS) with latent player skill ($\theta$) marginalized out. The resulting continuous difficulty parameters ($b_{\text{hard}}$, $b_{\text{vhard}}$) and discrimination values ($a$) power the static dashboard.

**[Live Dashboard](https://laurencylrc.github.io/QUEstimator)**

---

## Dataflow

```text
U_E table (score.json) ──► MD5 → SHA-512 (EZ2PATTERN) ──► Qwilight IR Crawler
                                                                │
                                                        load_ir_clears.py
                                                                │
public/data/*.json    ◄── NumPyro / JAX (Bayesian GRM) ◄────────┘
(Next.js Dashboard)

```

---

## Data Pipeline

Python 3.11+ with JAX and NumPyro installed is required.

### 1. Scrape & Sync

`refresh_data.py` checks upstream `score.json`, resolves unmapped MD5s through EZ2PATTERN, and fetches missing comment JSONs from the Qwilight API (`[https://taehui.net/qwilight/www/comment?noteID=](https://taehui.net/qwilight/www/comment?noteID=){sha512}:0`):

```bash
# Fetch new charts and missing leaderboards only
python scripts/refresh_data.py --incremental

# Force-refetch all leaderboards to capture recent clears
python scripts/refresh_data.py --force

```

Sub-scripts can be run manually if needed:

* `scripts/UE6Kmd5tosha512.py`: Resolves new MD5 hashes against EZ2PATTERN.
* `scripts/6keyLBcrawler.py`: Async crawler (`httpx` + `asyncio`) targeting the Qwilight IR endpoint.

### 2. Validate Clears

Parse raw IR dumps, filter invalid scores, and verify lamp distributions across clear tiers (FAILED, NORMAL, HARD, V-HARD):

```bash
python scripts/load_ir_clears.py

```

### 3. Fit IRT Model

Fits the Graded Response Model across all charts and players. Player ability ($\theta$) is marginalized out using Gauss-Hermite quadrature to sample chart parameters efficiently:

```bash
python scripts/pipeline.py

```

> **Runtime:** Full MCMC sampling (~1,500 charts, ~2,800 players) takes ~1.5 to 3 hours on a modern multi-core CPU.

Output artifacts written to `public/data/`:

* `charts.json`: Discrimination ($a$), thresholds ($b_{\text{hard}}$, $b_{\text{vhard}}$), standard errors, play counts.
* `level-summary.json`: Per-folder aggregated metrics.
* `players.json`: Latent ability estimates ($\theta$) and clear history.
* `meta.json`: Sampling diagnostics ($R_{\text{hat}}$, effective sample size, runtime).

---

## Web UI

Built with Next.js (Static Export), React, Tailwind CSS, and Radix UI.

```bash
# Install dependencies
bun install   # or: npm install

# Local dev server (http://localhost:3000)
bun dev

# Production static export to out/
bun run build

```

---

## Deployment

Pushes to `main` trigger a GitHub Actions workflow that builds the Next.js export and publishes it to GitHub Pages.

Because MCMC fitting is compute-heavy, model inference runs locally. The generated JSON files in `public/data/` are committed directly to the repository.
