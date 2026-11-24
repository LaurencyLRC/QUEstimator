# QUEstimator

Item Response Theory (IRT) difficulty estimation and player skill tracking for the [U_E 6-key BMS table](https://classmaterma.github.io/UE/table.html).

QUEstimator scrapes clear lamps from the [Qwilight Internet Ranking](https://taehui.net), maps MD5 chart hashes to SHA-512 via [EZ2PATTERN](https://ez2pattern.kr), and fits a Bayesian Graded Response Model (GRM) using a standalone C11 + OpenMP NUTS sampler (`native/`) with latent player skill ($\theta$) marginalized out via 41-point Gauss–Hermite quadrature.  
The resulting continuous difficulty thresholds ($b_{\text{normal}}$, $b_{\text{hard}}$, $b_{\text{vhard}}$), discriminations ($a$), and posterior uncertainties power the static Next.js dashboard.

**[Live dashboard](https://laurencylrc.github.io/QUEstimator)**

---

## Dataflow

```text
U_E table (score.json) ──► MD5 → SHA-512 (EZ2PATTERN) ──► Qwilight IR Crawler (loadUnit=-1)
                                                                  │
                                                       upload/6Kleaderboards/*.json
                                                                  │
public/data/*.json     ◄── native/questimator_calc (C11 NUTS) ◄───┘
(Next.js Static App)       └── verified by scripts/verify_data.py
```

---

## Data Pipeline

### Prerequisites

* **C11 compiler with OpenMP** (`gcc` via w64devkit/MinGW on Windows, or GCC/Clang on Linux/macOS) + `make`
* **Python 3.10+** with `httpx` installed (`pip install httpx`) for scraping; `scripts/verify_data.py` uses Python stdlib only.

### One-Command Refresh & Calibration

```bash
# Full refresh (table + all IR leaderboards) + C11 MCMC calibration + smell test
python scripts/update_all.py

# Incremental scrape (new/missing charts only) + C11 MCMC + smell test
python scripts/update_all.py --incremental

# Re-run C11 calibration on already-downloaded leaderboards
python scripts/update_all.py --skip-refresh

# Fast player EAP recovery only (recomputes players.json from existing charts.json)
python scripts/update_all.py --recover-only
```

### Individual Steps

1. **Scrape & sync** (`scripts/refresh_data.py`): Fetches upstream `score.json`, resolves unmapped MD5s via EZ2PATTERN (`scripts/UE6Kmd5tosha512.py`), prunes removed charts, and downloads full leaderboards from `https://taehui.net/qwilight/www/comment?noteID={sha512}:0&loadUnit=-1` via `scripts/6keyLBcrawler.py`. Raw leaderboard files are cached locally under `upload/6Kleaderboards/` (gitignored).
2. **Build & run native C11 engine** (`native/`):

```bash
make -C native
./native/questimator_calc --check-grad   # Verify analytic gradients vs finite differences
./native/questimator_calc                # 4 chains × (500 warmup + 500 samples), Q=41
```

Full MCMC sampling (~1,544 charts, ~3,120 players, ~191k deduplicated clears) completes in **~14 minutes** on a modern multi-core CPU with 0 post-warmup divergences.  
(`scripts/pipeline.py` is retained as an archived NumPyro/JAX reference specification.)

3. **Post-calibration smell test** (`scripts/verify_data.py`):

```bash
python scripts/verify_data.py
```

Verifies schema counts, convergence gates ($\hat{R} < 1.05$, $\text{ESS} \ge 200$, 0 divergences), 31-level anchor monotonicity, Weighted Whittaker + PAVA + PCHIP U_E scale bounds, provisional rates, and player rating sanity.

### Output Artifacts (`public/data/`)

* `charts.json`: Discrimination ($a$), thresholds ($b_{\text{normal}}$, $b_{\text{hard}}$, $b_{\text{vhard}}$), standard errors, covariances, play counts, and provisional flags.
* `level-summary.json`: Per-folder aggregated medians and IQRs (anchored on charts with $n \ge 10$).
* `players.json`: Latent ability estimates ($\theta_{\text{EAP}}$, posterior SE) and deduplicated clear lamps.
* `sha512-to-id.json`: SHA-512 to persistent chart ID map (used for local Qwilight `DB.db` import).
* `meta.json`: Sampling diagnostics ($\hat{R}$, ESS, NUTS stats, runtime, model identification metadata).

---

## Web UI

Built with Next.js 16 (Static Export), React 19, Tailwind CSS v4, Radix UI, TanStack Virtual, and `sql.js` (client-side SQLite WASM for Qwilight `DB.db` import).

```bash
# Install dependencies
bun install

# Local dev server (http://localhost:3000)
bun dev

# Type-check, lint, test, and build static export to out/
bunx tsc --noEmit
bun run lint
bun test
bun run build
```

---

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which verifies committed JSON artifacts via `scripts/verify_data.py`, runs type-checking/linting/tests, builds the static export (`out/`), and deploys to GitHub Pages.

Model inference runs locally; commit the generated `public/data/*.json` files before pushing.
