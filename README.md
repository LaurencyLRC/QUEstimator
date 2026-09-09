# QUEstimator

QUEstimator is an item response theory (IRT) difficulty estimation and player skill tracking system for the U_E 6-key BMS table.

Using actual clear records from the Qwilight Internet Ranking (IR), QUEstimator fits a **Bayesian Graded Response Model (GRM)** with MCMC (No-U-Turn Sampler) to estimate continuous difficulty thresholds for every chart, alongside individual player latent ability ($\theta$).

- **Live Dashboard**: Deployed via GitHub Pages
- **Source of Truth Table**: [UE Difficulty Table](https://classmaterma.github.io/UE/table.html) (`score.json`)
- **Hash Mapping**: [EZ2PATTERN API](https://ez2pattern.kr) (MD5 → SHA-512)
- **IR Leaderboards**: [taehui.net (Qwilight IR)](https://taehui.net)

---

## Architecture Overview

```
[ classmaterma.github.io/UE/score.json ]  (Source of Truth)
                    │
                    ▼
          scripts/refresh_data.py
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
scripts/UE6Kmd5tosha512.py   scripts/6keyLBcrawler.py
  (EZ2PATTERN MD5→SHA512)       (Qwilight IR API)
       │                         │
       └────────────┬────────────┘
                    ▼
          upload/6Kleaderboards/
                    │
                    ▼
          scripts/load_ir_clears.py
                    │
                    ▼
          scripts/pipeline.py  (JAX / NumPyro MCMC)
                    │
                    ▼
          public/data/*.json
    (charts.json, level-summary.json, meta.json, players.json)
                    │
                    ▼
         Next.js Static Frontend
```

---

## Data Pipeline & Refresh

### 1. Refresh Data from Upstream Table & IR
The orchestrator script `scripts/refresh_data.py` synchronizes the local database with the live U_E table and Qwilight IR:

```bash
# Incremental update (fetches new charts and only missing leaderboards)
python scripts/refresh_data.py --incremental

# Full refresh (updates all leaderboards to capture new player clears and lamps)
python scripts/refresh_data.py --force
```

Individual steps can also be run independently:
- **`scripts/UE6Kmd5tosha512.py`**: Reads `upload/UEtable.json`, caches known hashes from `upload/UEtable_enriched.json`, and queries EZ2PATTERN for any unmapped charts.
- **`scripts/6keyLBcrawler.py`**: Async crawler with polite concurrency (`httpx` + `asyncio`) that fetches raw comment JSONs from `https://taehui.net/qwilight/www/comment?noteID={sha512}:0`.

### 2. Verify Clear Data
Inspect parsing statistics, filter rules, and clear category distributions (FAILED, NORMAL, HARD, V-HARD):
```bash
python scripts/load_ir_clears.py
```

### 3. Run the Bayesian GRM Pipeline
Fits the Bayesian Graded Response Model with player $\theta$ marginalized out via Gauss-Hermite quadrature:
```bash
python scripts/pipeline.py
```
Outputs are written directly to `public/data/`:
- `charts.json`: Estimated discrimination ($a$), difficulty thresholds ($b_{\text{hard}}$, $b_{\text{vhard}}$), standard errors, and clear counts.
- `level-summary.json`: Aggregated statistics per U_E level.
- `players.json`: Latent ability parameter ($\theta$) and clear history per player.
- `meta.json`: MCMC convergence statistics ($R_{\text{hat}}$, ESS, runtime).

> **Note**: Full MCMC sampling across all ~1,500+ charts and ~2,800+ players is compute-intensive (~1.5–3 hours on a modern multi-core CPU).

---

## Frontend Development

The dashboard is built with **Next.js 16**, **React 19**, **Tailwind CSS**, and **Radix UI**.

### Prerequisites
- [Bun](https://bun.sh/) (recommended) or Node.js 20+

### Setup & Development
```bash
# Install dependencies
bun install

# Start local development server
bun dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Static Build
```bash
bun run build
```
Generates the static export in `out/`.

---

## Deployment

The site is automatically built and deployed to GitHub Pages via `.github/workflows/deploy.yml` whenever changes to `main` are pushed.

Because the Bayesian MCMC model is compute-intensive, the pipeline is run **locally**, and the resulting `public/data/*.json` artifacts are committed and pushed.
