#include "data.h"
#include "diag.h"
#include "grm.h"
#include "json.h"
#include "nuts.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
#include <windows.h>
#include <direct.h>
static double now_sec(void) {
    static LARGE_INTEGER freq = {0};
    if (freq.QuadPart == 0) QueryPerformanceFrequency(&freq);
    LARGE_INTEGER cnt;
    QueryPerformanceCounter(&cnt);
    return (double)cnt.QuadPart / (double)freq.QuadPart;
}
static int atomic_replace(const char *tmp_path, const char *dst_path) {
    return MoveFileExA(tmp_path, dst_path, MOVEFILE_REPLACE_EXISTING) != 0;
}
#else
#include <sys/stat.h>
#include <sys/time.h>
static double now_sec(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (double)tv.tv_sec + (double)tv.tv_usec * 1e-6;
}
static int atomic_replace(const char *tmp_path, const char *dst_path) {
    return rename(tmp_path, dst_path) == 0;
}
#endif

static void write_double_or_null(FILE *f, double v, int decimals) {
    if (!isfinite(v)) {
        fputs("null", f);
        return;
    }
    double scale = pow(10.0, (double)decimals);
    double r = round(v * scale) / scale;
    if (r == 0.0) r = 0.0; /* avoid -0.0 */
    fprintf(f, "%.*f", decimals, r);
}

static int cmp_double(const void *a, const void *b) {
    double da = *(const double *)a;
    double db = *(const double *)b;
    return (da > db) - (da < db);
}

/* Linear-interpolated percentile matching numpy.percentile */
static double percentile_sorted(const double *sorted, int n, double p) {
    if (n <= 0) return NAN;
    if (n == 1) return sorted[0];
    double idx = (p / 100.0) * (double)(n - 1);
    int lo = (int)floor(idx);
    int hi = (int)ceil(idx);
    if (lo < 0) lo = 0;
    if (hi >= n) hi = n - 1;
    double frac = idx - (double)lo;
    return sorted[lo] * (1.0 - frac) + sorted[hi] * frac;
}

/* Chart sorting for charts.json: (level_sort_key, -b_hard_display) */
static const ChartMeta *g_sort_charts = NULL;
static int cmp_chart_output(const void *a, const void *b) {
    int ia = *(const int *)a;
    int ib = *(const int *)b;
    const ChartMeta *ca = &g_sort_charts[ia];
    const ChartMeta *cb = &g_sort_charts[ib];
    int ga, ra, gb, rb;
    level_sort_key(ca->level, &ga, &ra);
    level_sort_key(cb->level, &gb, &rb);
    if (ga != gb) return ga - gb;
    if (ra != rb) return ra - rb;
    double ba = isfinite(ca->b_hard) ? ca->b_hard : -999.0;
    double bb = isfinite(cb->b_hard) ? cb->b_hard : -999.0;
    if (ba > bb) return -1;
    if (ba < bb) return 1;
    return ca->id - cb->id;
}

typedef struct {
    const char *level;
    int n_total;
    int n_valid;
    double hard_median, hard_q1, hard_q3;
    double vhard_median, vhard_q1, vhard_q3;
} LevelRow;

static int cmp_level_row(const void *a, const void *b) {
    const LevelRow *la = (const LevelRow *)a;
    const LevelRow *lb = (const LevelRow *)b;
    int ga, ra, gb, rb;
    level_sort_key(la->level, &ga, &ra);
    level_sort_key(lb->level, &gb, &rb);
    if (ga != gb) return ga - gb;
    return ra - rb;
}

#define DEFAULT_PROV_MIN_N  10
#define DEFAULT_PROV_MAX_SE 1.0

static FILE *open_tmp(const char *dir, const char *name, char *tmp_out, char *dst_out, size_t cap) {
    int n1 = snprintf(dst_out, cap, "%s/%s", dir, name);
    int n2 = snprintf(tmp_out, cap, "%s/%s.tmp", dir, name);
    if (n1 < 0 || (size_t)n1 >= cap || n2 < 0 || (size_t)n2 >= cap) {
        fprintf(stderr, "Error: output path too long for buffer (%s/%s)\n", dir, name);
        return NULL;
    }
    return fopen(tmp_out, "wb");
}

static int close_and_commit(FILE *f, const char *tmp_path, const char *dst_path) {
    if (fclose(f) != 0) return 0;
    if (!atomic_replace(tmp_path, dst_path)) {
        fprintf(stderr, "Error: failed to move %s -> %s\n", tmp_path, dst_path);
        return 0;
    }
    return 1;
}

static int write_charts_json(const Dataset *ds, const char *out_dir) {
    int J = ds->n_charts;
    int *order = (int *)malloc((size_t)J * sizeof(int));
    if (!order) return 0;
    for (int i = 0; i < J; i++) order[i] = i;
    g_sort_charts = ds->charts;
    qsort(order, (size_t)J, sizeof(int), cmp_chart_output);

    char tmp[512], dst[512];
    FILE *f = open_tmp(out_dir, "charts.json", tmp, dst, sizeof(tmp));
    if (!f) { free(order); return 0; }

    fputc('[', f);
    for (int k = 0; k < J; k++) {
        const ChartMeta *c = &ds->charts[order[k]];
        if (k > 0) fputs(", ", f);
        fputs("{\"id\": ", f); fprintf(f, "%d", c->id);
        fputs(", \"md5\": ", f); json_write_string(f, c->md5);
        fputs(", \"title\": ", f); json_write_string(f, c->title);
        fputs(", \"artist\": ", f); json_write_string(f, c->artist);
        fputs(", \"level\": ", f); json_write_string(f, c->level);
        fputs(", \"name_diff\": ", f); json_write_string(f, c->name_diff);
        fputs(", \"video2\": ", f); json_write_string(f, c->video2);
        fputs(", \"url\": ", f); json_write_string(f, c->url);
        fputs(", \"url_diff\": ", f); json_write_string(f, c->url_diff);
        fputs(", \"comment\": ", f); json_write_string(f, c->comment);
        fputs(", \"state\": ", f); json_write_string(f, c->state);
        fprintf(f, ", \"n\": %d, \"n_failed\": %d, \"n_normal\": %d, \"n_hard\": %d, \"n_vhard\": %d",
                c->n, c->n_failed, c->n_normal, c->n_hard, c->n_vhard);
        fputs(", \"a\": ", f); write_double_or_null(f, c->a, 4);
        fputs(", \"b_normal\": ", f); write_double_or_null(f, c->b_normal, 4);
        fputs(", \"b_hard\": ", f); write_double_or_null(f, c->b_hard, 4);
        fputs(", \"b_vhard\": ", f); write_double_or_null(f, c->b_vhard, 4);
        fputs(", \"b_hard_display\": ", f); write_double_or_null(f, c->b_hard, 4);
        fputs(", \"b_vhard_display\": ", f); write_double_or_null(f, c->b_vhard, 4);
        fputs(", \"se_a\": ", f); write_double_or_null(f, c->se_a, 4);
        fputs(", \"se_b_hard\": ", f); write_double_or_null(f, c->se_b_hard, 4);
        fputs(", \"se_b_vhard\": ", f); write_double_or_null(f, c->se_b_vhard, 4);
        fputs(", \"cov_a_bh\": ", f); write_double_or_null(f, c->cov_a_bh, 4);
        fputs(", \"cov_a_bv\": ", f); write_double_or_null(f, c->cov_a_bv, 4);
        fputs(", \"max_played_theta\": ", f); write_double_or_null(f, c->max_played_theta, 3);
        fprintf(f, ", \"provisional\": %s}", c->provisional ? "true" : "false");
    }
    fputc(']', f);
    free(order);
    return close_and_commit(f, tmp, dst);
}

static int write_level_summary_json(const Dataset *ds, int min_anchor_n, const char *out_dir) {
    int J = ds->n_charts;
    const char **uniq = (const char **)malloc((size_t)J * sizeof(const char *));
    if (!uniq) return 0;
    int n_levels = 0;
    for (int i = 0; i < J; i++) {
        const char *lvl = ds->charts[i].level;
        int seen = 0;
        for (int u = 0; u < n_levels; u++) {
            if (strcmp(uniq[u], lvl) == 0) { seen = 1; break; }
        }
        if (!seen) uniq[n_levels++] = lvl;
    }

    LevelRow *rows = (LevelRow *)calloc((size_t)n_levels, sizeof(LevelRow));
    double *bh = (double *)malloc((size_t)J * sizeof(double));
    double *bv = (double *)malloc((size_t)J * sizeof(double));
    if (!rows || !bh || !bv) {
        free(rows); free(bh); free(bv); free(uniq);
        return 0;
    }

    for (int u = 0; u < n_levels; u++) {
        LevelRow *r = &rows[u];
        r->level = uniq[u];
        r->hard_median = r->hard_q1 = r->hard_q3 = NAN;
        r->vhard_median = r->vhard_q1 = r->vhard_q3 = NAN;
        int n_bh = 0, n_bv = 0;

        for (int i = 0; i < J; i++) {
            const ChartMeta *c = &ds->charts[i];
            if (strcmp(c->level, r->level) != 0) continue;
            r->n_total++;
            if (!isfinite(c->b_hard) || !isfinite(c->b_vhard)) continue;
            if (!c->provisional) r->n_valid++;
            /* Filter folder anchors by play count (n >= min_anchor_n) rather than se_b_hard
             * to avoid directional survivorship bias at low (Lv 1-11) and high (Lv 29-Omega) ends. */
            if (c->n < min_anchor_n) continue;
            if (c->n_hard + c->n_vhard > 0) bh[n_bh++] = c->b_hard;
            if (c->n_vhard > 0) bv[n_bv++] = c->b_vhard;
        }
        if (n_bh > 0) {
            qsort(bh, (size_t)n_bh, sizeof(double), cmp_double);
            r->hard_median = percentile_sorted(bh, n_bh, 50.0);
            r->hard_q1     = percentile_sorted(bh, n_bh, 25.0);
            r->hard_q3     = percentile_sorted(bh, n_bh, 75.0);
        }
        if (n_bv > 0) {
            qsort(bv, (size_t)n_bv, sizeof(double), cmp_double);
            r->vhard_median = percentile_sorted(bv, n_bv, 50.0);
            r->vhard_q1     = percentile_sorted(bv, n_bv, 25.0);
            r->vhard_q3     = percentile_sorted(bv, n_bv, 75.0);
        }
    }
    free(bh); free(bv); free(uniq);

    qsort(rows, (size_t)n_levels, sizeof(LevelRow), cmp_level_row);

    char tmp[512], dst[512];
    FILE *f = open_tmp(out_dir, "level-summary.json", tmp, dst, sizeof(tmp));
    if (!f) { free(rows); return 0; }

    fputc('[', f);
    for (int u = 0; u < n_levels; u++) {
        const LevelRow *r = &rows[u];
        if (u > 0) fputs(", ", f);
        fputs("{\"level\": ", f); json_write_string(f, r->level);
        fprintf(f, ", \"n_charts_total\": %d, \"n_charts_valid\": %d", r->n_total, r->n_valid);
        fputs(", \"hard_median\": ", f);  write_double_or_null(f, r->hard_median, 6);
        fputs(", \"hard_q1\": ", f);      write_double_or_null(f, r->hard_q1, 6);
        fputs(", \"hard_q3\": ", f);      write_double_or_null(f, r->hard_q3, 6);
        fputs(", \"vhard_median\": ", f); write_double_or_null(f, r->vhard_median, 6);
        fputs(", \"vhard_q1\": ", f);     write_double_or_null(f, r->vhard_q1, 6);
        fputs(", \"vhard_q3\": ", f);     write_double_or_null(f, r->vhard_q3, 6);
        fputc('}', f);
    }
    fputc(']', f);
    free(rows);
    return close_and_commit(f, tmp, dst);
}

static int write_players_json(
    const Dataset *ds, const double *theta_eap, const double *theta_se, const char *out_dir
) {
    char tmp[512], dst[512];
    FILE *f = open_tmp(out_dir, "players.json", tmp, dst, sizeof(tmp));
    if (!f) return 0;

    fputc('{', f);
    int first_p = 1;
    for (int p = 0; p < ds->n_players; p++) {
        int s = ds->player_offsets[p];
        int e = ds->player_offsets[p + 1];
        if (s == e) continue;
        if (!first_p) fputc(',', f);
        first_p = 0;

        json_write_string(f, ds->player_ids[p]);
        fputs(":{\"t\":", f);
        write_double_or_null(f, theta_eap[p], 3);
        fputs(",\"se\":", f);
        write_double_or_null(f, theta_se[p], 3);
        fputs(",\"n\":", f);
        json_write_string(f, ds->player_names[p]);
        fputs(",\"c\":{", f);
        for (int k = s; k < e; k++) {
            if (k > s) fputc(',', f);
            int cid = ds->charts[ds->obs_chart[k]].id;
            fprintf(f, "\"%d\":%u", cid, (unsigned)ds->obs_status[k]);
        }
        fputs("}}", f);
    }
    fputc('}', f);
    return close_and_commit(f, tmp, dst);
}

static int write_sha512_to_id_json(const Dataset *ds, const char *out_dir) {
    char tmp[512], dst[512];
    FILE *f = open_tmp(out_dir, "sha512-to-id.json", tmp, dst, sizeof(tmp));
    if (!f) return 0;

    fputc('{', f);
    int first = 1;
    for (int i = 0; i < ds->n_charts; i++) {
        const ChartMeta *c = &ds->charts[i];
        if (!c->sha512 || c->sha512[0] == '\0') continue;
        if (!first) fputc(',', f);
        first = 0;
        json_write_string(f, c->sha512);
        fprintf(f, ":%d", c->id);
    }
    fputc('}', f);
    return close_and_commit(f, tmp, dst);
}

static int write_meta_json(
    const Dataset *ds,
    const NutsConfig *cfg,
    const NutsResult *nuts_res,
    const ConvergenceReport *conv,
    int n_quad,
    int prov_min_n,
    double prov_max_se,
    const double *th_eap,
    double theta_mean,
    double theta_std,
    double runtime_sec,
    const char *out_dir
) {
    char iso[64];
    time_t now = time(NULL);
    struct tm *utc = gmtime(&now);
    strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", utc);

    int n_prov = 0;
    for (int i = 0; i < ds->n_charts; i++) if (ds->charts[i].provisional) n_prov++;

    /* Precompute 35-bin player theta histogram matching questimator-types.ts:computeSamplePlayers */
    const double bin_min = -6.0;
    const double bin_max =  8.0;
    const int num_bins = 35;
    const double bin_step = (bin_max - bin_min) / (double)num_bins;
    int hist[35];
    memset(hist, 0, sizeof(hist));
    int n_finite_p = 0;
    for (int p = 0; p < ds->n_players; p++) {
        double tv = th_eap[p];
        if (!isfinite(tv)) continue;
        n_finite_p++;
        int idx;
        if (tv < bin_min) idx = 0;
        else if (tv >= bin_max) idx = num_bins - 1;
        else {
            idx = (int)floor((tv - bin_min) / bin_step);
            if (idx < 0) idx = 0;
            if (idx >= num_bins) idx = num_bins - 1;
        }
        hist[idx]++;
    }

    char tmp[512], dst[512];
    FILE *f = open_tmp(out_dir, "meta.json", tmp, dst, sizeof(tmp));
    if (!f) return 0;

    fprintf(f, "{\n");
    fprintf(f, "  \"generated_at\": \"%s\",\n", iso);
    fprintf(f, "  \"n_charts_total\": %d,\n", ds->n_charts);
    fprintf(f, "  \"n_charts_valid\": %d,\n", ds->n_charts - n_prov);
    fprintf(f, "  \"n_charts_provisional\": %d,\n", n_prov);
    fprintf(f, "  \"n_players\": %d,\n", ds->n_players);
    fprintf(f, "  \"n_clears\": %d,\n", ds->n_obs);
    fprintf(f, "  \"model\": \"Bayesian Graded Response Model (MCMC NUTS, \\u03b8 marginalized, C11)\",\n");
    fprintf(f, "  \"categories\": [\"FAILED\", \"NORMAL\", \"HARD\", \"V-HARD\"],\n");
    fprintf(f, "  \"provisional_rule\": \"n < %d OR se_b_hard > %.2f\",\n", prov_min_n, prov_max_se);
    fprintf(f, "  \"player_theta_mean\": %.10f,\n", theta_mean);
    fprintf(f, "  \"player_theta_std\": %.10f,\n", theta_std);
    fprintf(f, "  \"data_source\": \"Qwilight IR leaderboards (real player data)\",\n");
    fprintf(f, "  \"runtime_sec\": %.2f,\n", runtime_sec);
    fprintf(f, "  \"mcmc_chains\": %d,\n", cfg->num_chains);
    fprintf(f, "  \"mcmc_warmup\": %d,\n", cfg->num_warmup);
    fprintf(f, "  \"mcmc_samples_per_chain\": %d,\n", cfg->num_samples);
    fprintf(f, "  \"convergence\": {\n");
    fprintf(f, "    \"r_hat_method\": \"split-rank (Vehtari et al. 2021)\",\n");
    fprintf(f, "    \"r_hat_max\": "); write_double_or_null(f, conv->r_hat_max, 4); fprintf(f, ",\n");
    fprintf(f, "    \"ess_min\": %d,\n", (int)conv->ess_min);
    fprintf(f, "    \"tail_ess_min\": %d,\n", (int)conv->tail_ess_min);
    fprintf(f, "    \"convergence_ok\": %s,\n", conv->convergence_ok ? "true" : "false");
    fprintf(f, "    \"n_params_bad_rhat\": %d,\n", conv->n_bad_rhat);
    fprintf(f, "    \"n_params_low_ess\": %d,\n", conv->n_low_ess);
    fprintf(f, "    \"r_hat_threshold\": %.2f,\n", conv->r_hat_threshold);
    fprintf(f, "    \"ess_threshold\": %.0f,\n", conv->ess_threshold);
    fprintf(f, "    \"by_parameter_block\": {\n");
    for (int b = 0; b < 6; b++) {
        const BlockDiag *bd = &conv->blocks[b];
        fprintf(f, "      \"%s\": {\n", bd->name);
        fprintf(f, "        \"r_hat_max\": "); write_double_or_null(f, bd->r_hat_max, 6); fprintf(f, ",\n");
        fprintf(f, "        \"n_eff_min\": %.4f,\n", bd->n_eff_min);
        fprintf(f, "        \"tail_ess_min\": %.4f,\n", bd->tail_ess_min);
        fprintf(f, "        \"n_bad_rhat\": %d,\n", bd->n_bad_rhat);
        fprintf(f, "        \"n_low_ess\": %d\n", bd->n_low_ess);
        fprintf(f, "      }%s\n", (b < 5) ? "," : "");
    }
    fprintf(f, "    },\n");
    fprintf(f, "    \"nuts\": {\n");
    fprintf(f, "      \"divergences\": %d,\n", nuts_res->total_divergences);
    fprintf(f, "      \"num_steps_mean\": %.2f,\n", nuts_res->mean_num_steps);
    fprintf(f, "      \"num_steps_max\": %d,\n", nuts_res->max_num_steps);
    fprintf(f, "      \"tree_depth_mean\": %.2f,\n", nuts_res->mean_tree_depth);
    fprintf(f, "      \"tree_depth_max\": %d,\n", nuts_res->max_tree_depth_hit);
    fprintf(f, "      \"accept_prob_mean\": %.4f\n", nuts_res->mean_accept_prob);
    fprintf(f, "    }\n");
    fprintf(f, "  },\n");
    fprintf(f, "  \"identification\": {\n");
    fprintf(f, "    \"method\": \"orthonormal zero-sum Householder log-alpha contrasts\",\n");
    fprintf(f, "    \"theta_prior\": \"Normal(0, 1), marginalized out of the sampler (recovered by EAP)\",\n");
    fprintf(f, "    \"delta_parameterization\": \"centered (\\u03b4 ~ Normal(loc, scale))\",\n");
    fprintf(f, "    \"tau_prior\": \"HalfNormal(1.0)\",\n");
    fprintf(f, "    \"log_alpha_prior\": \"isotropic Normal(0, 0.3) on the zero-sum subspace\",\n");
    fprintf(f, "    \"quadrature_nodes\": %d\n", n_quad);
    fprintf(f, "  },\n");
    fprintf(f, "  \"player_distribution\": {\n");
    fprintf(f, "    \"theta_histogram\": [");
    for (int i = 0; i < num_bins; i++) fprintf(f, "%s%d", i ? ", " : "", hist[i]);
    fprintf(f, "],\n");
    fprintf(f, "    \"theta_edges\": [");
    for (int i = 0; i <= num_bins; i++) fprintf(f, "%s%.2f", i ? ", " : "", bin_min + (double)i * bin_step);
    fprintf(f, "],\n");
    fprintf(f, "    \"theta_mean\": %.6f,\n", theta_mean);
    fprintf(f, "    \"theta_std\": %.6f,\n", theta_std);
    fprintf(f, "    \"n_players\": %d\n", n_finite_p);
    fprintf(f, "  }\n");
    fprintf(f, "}\n");
    return close_and_commit(f, tmp, dst);
}

/* --------------------------------------------------------------------------
 * Built-in gradient check + micro-benchmark (--check-grad)
 * -------------------------------------------------------------------------- */
static int run_check_grad(const Dataset *ds, int n_quad) {
    GrmModel model;
    GrmWorkspace ws;
    if (!grm_model_init(&model, ds, n_quad) || !grm_workspace_init(&ws, &model, 1)) {
        fprintf(stderr, "Failed to init GRM model\n");
        return 1;
    }

    int D = model.dim;
    int J = ds->n_charts;
    double *x    = (double *)malloc((size_t)D * sizeof(double));
    double *grad = (double *)malloc((size_t)D * sizeof(double));
    double *g2   = (double *)malloc((size_t)D * sizeof(double));
    grm_init_params(&model, x);

    /* Perturb slightly so we test non-symmetric points (e.g. non-zero lac) */
    for (int i = 0; i < D; i++) {
        double s = sin((double)(i + 1) * 1.23456789);
        x[i] += 0.15 * s;
    }

    double lp0 = grm_logp_and_grad(&model, &ws, x, grad);
    printf("[check-grad] n_quad=%d, dim=%d, logp=%.10f\n", n_quad, D, lp0);

    /* Test representative coordinates across every parameter block */
    int test_idx[] = {
        0, 1,
        2, 2 + 10, 2 + J / 2, 2 + J - 1,
        2 + J, 2 + J + 10, 2 + 2 * J - 1,
        2 + 2 * J, 2 + 2 * J + 10, 2 + 3 * J - 1,
        2 + 3 * J, 2 + 3 * J + 10, 2 + 3 * J + J / 2, D - 1
    };
    int n_tests = (int)(sizeof(test_idx) / sizeof(test_idx[0]));
    double eps = 1e-5;
    double max_rel = 0.0;

    for (int t = 0; t < n_tests; t++) {
        int idx = test_idx[t];
        double orig = x[idx];
        x[idx] = orig + eps;
        double lp_p = grm_logp_and_grad(&model, &ws, x, g2);
        x[idx] = orig - eps;
        double lp_m = grm_logp_and_grad(&model, &ws, x, g2);
        x[idx] = orig;

        double fd = (lp_p - lp_m) / (2.0 * eps);
        double an = grad[idx];
        double rel = fabs(an - fd) / fmax(1.0, fmax(fabs(an), fabs(fd)));
        if (rel > max_rel) max_rel = rel;
        printf("  idx=%4d | analytic=%+14.7f | fd=%+14.7f | rel_err=%.3e\n", idx, an, fd, rel);
    }
    printf("[check-grad] max_rel_err = %.3e (%s)\n", max_rel, (max_rel < 2e-5) ? "PASS" : "FAIL");

    /* Micro-benchmark single-thread and 4-thread logp_and_grad speed */
    int iters = 50;
    double t0 = now_sec();
    double sink = 0.0;
    for (int i = 0; i < iters; i++) {
        sink += grm_logp_and_grad(&model, &ws, x, grad);
    }
    double dt1 = now_sec() - t0;
    printf("[benchmark] %d evals (1 thread, Q=%d): %.3f ms/eval (sink=%.1f)\n",
           iters, n_quad, (dt1 * 1000.0) / iters, sink);

    GrmWorkspace ws4;
    if (grm_workspace_init(&ws4, &model, 4)) {
        double lp4 = grm_logp_and_grad(&model, &ws4, x, g2);
        double max_mt_diff = fabs(lp4 - lp0);
        for (int i = 0; i < D; i++) {
            double d = fabs(g2[i] - grad[i]);
            if (d > max_mt_diff) max_mt_diff = d;
        }
        double t4 = now_sec();
        double sink4 = 0.0;
        for (int i = 0; i < iters; i++) {
            sink4 += grm_logp_and_grad(&model, &ws4, x, g2);
        }
        double dt4 = now_sec() - t4;
        printf("[benchmark] %d evals (4 threads, Q=%d): %.3f ms/eval | mt_diff=%.3e (sink=%.1f)\n",
               iters, n_quad, (dt4 * 1000.0) / iters, max_mt_diff, sink4);
        grm_workspace_free(&ws4);
    }

    free(x); free(grad); free(g2);
    grm_workspace_free(&ws);
    grm_model_free(&model);
    return (max_rel < 2e-5) ? 0 : 1;
}

/* --------------------------------------------------------------------------
 * Fast O(J log J) md5 -> chart_idx index for offline post-processing modes
 * -------------------------------------------------------------------------- */
typedef struct {
    const char *md5;
    int idx;
} Md5Idx;

static int cmp_md5_idx(const void *a, const void *b) {
    const Md5Idx *ma = (const Md5Idx *)a;
    const Md5Idx *mb = (const Md5Idx *)b;
    return strcmp(ma->md5, mb->md5);
}

static Md5Idx *build_md5_index(const Dataset *ds) {
    int J = ds->n_charts;
    Md5Idx *idx = (Md5Idx *)malloc((size_t)J * sizeof(Md5Idx));
    if (!idx) return NULL;
    for (int j = 0; j < J; j++) {
        idx[j].md5 = ds->charts[j].md5;
        idx[j].idx = j;
    }
    qsort(idx, (size_t)J, sizeof(Md5Idx), cmp_md5_idx);
    return idx;
}

static int find_md5_index(const Md5Idx *idx, int J, const char *md5) {
    Md5Idx key = { md5, -1 };
    const Md5Idx *hit = (const Md5Idx *)bsearch(&key, idx, (size_t)J, sizeof(Md5Idx), cmp_md5_idx);
    return hit ? hit->idx : -1;
}

/* --------------------------------------------------------------------------
 * Fast --recover-theta-only mode
 * -------------------------------------------------------------------------- */
static int run_recover_theta_only(const Dataset *ds, const char *out_dir) {
    char charts_path[512];
    int pn = snprintf(charts_path, sizeof(charts_path), "%s/charts.json", out_dir);
    if (pn < 0 || (size_t)pn >= sizeof(charts_path)) return 1;
    char err[256];
    JsonValue *root = json_parse_file(charts_path, err, sizeof(err));
    if (!root || root->type != JSON_ARRAY) {
        fprintf(stderr, "Error: cannot load %s (%s)\n", charts_path, err);
        json_free(root);
        return 1;
    }

    int J = ds->n_charts;
    double *a  = (double *)malloc((size_t)J * sizeof(double));
    double *bn = (double *)malloc((size_t)J * sizeof(double));
    double *bh = (double *)malloc((size_t)J * sizeof(double));
    double *bv = (double *)malloc((size_t)J * sizeof(double));
    Md5Idx *md5_idx = build_md5_index(ds);
    if (!a || !bn || !bh || !bv || !md5_idx) {
        free(a); free(bn); free(bh); free(bv); free(md5_idx);
        json_free(root);
        return 1;
    }
    for (int j = 0; j < J; j++) {
        a[j] = 1.0; bh[j] = 0.0; bv[j] = 0.8; bn[j] = -0.8;
    }

    for (size_t i = 0; i < root->u.arr.count; i++) {
        const JsonValue *c = root->u.arr.items[i];
        const char *md5 = json_get_str(c, "md5", NULL);
        if (!md5) continue;
        int j = find_md5_index(md5_idx, J, md5);
        if (j >= 0) {
            int ok_bn = 0;
            a[j]  = json_get_num(c, "a", 1.0, NULL);
            bh[j] = json_get_num(c, "b_hard", 0.0, NULL);
            bv[j] = json_get_num(c, "b_vhard", 0.8, NULL);
            bn[j] = json_get_num(c, "b_normal", bh[j] - (bv[j] - bh[j]), &ok_bn);
        }
    }
    free(md5_idx);
    json_free(root);

    double *th_eap = (double *)malloc((size_t)ds->n_players * sizeof(double));
    double *th_se  = (double *)malloc((size_t)ds->n_players * sizeof(double));
    if (!th_eap || !th_se) {
        free(a); free(bn); free(bh); free(bv); free(th_eap); free(th_se);
        return 1;
    }

    double t0 = now_sec();
    grm_eap_theta(ds, a, bn, bh, bv, 101, th_eap, th_se);
    double dt = now_sec() - t0;

    double mean = 0.0, vmin = th_eap[0], vmax = th_eap[0];
    for (int p = 0; p < ds->n_players; p++) {
        mean += th_eap[p];
        if (th_eap[p] < vmin) vmin = th_eap[p];
        if (th_eap[p] > vmax) vmax = th_eap[p];
    }
    mean /= (double)ds->n_players;
    double var = 0.0;
    for (int p = 0; p < ds->n_players; p++) {
        double d = th_eap[p] - mean;
        var += d * d;
    }
    double std = sqrt(var / (double)ds->n_players);

    printf("[recover-theta-only] 101-pt EAP for %d players in %.3fs (min=%.3f, mean=%.3f, std=%.3f, max=%.3f)\n",
           ds->n_players, dt, vmin, mean, std, vmax);

    if (!write_players_json(ds, th_eap, th_se, out_dir)) {
        fprintf(stderr, "Error writing players.json\n");
        free(a); free(bn); free(bh); free(bv); free(th_eap); free(th_se);
        return 1;
    }

    free(a); free(bn); free(bh); free(bv); free(th_eap); free(th_se);
    return 0;
}

/* Update provisional counts & rule in existing meta.json without losing MCMC diagnostics */
static int patch_meta_json_provisional(
    const char *out_dir, int n_total, int n_prov, int prov_min_n, double prov_max_se
) {
    char meta_path[512];
    int pn = snprintf(meta_path, sizeof(meta_path), "%s/meta.json", out_dir);
    if (pn < 0 || (size_t)pn >= sizeof(meta_path)) return 0;

    FILE *in = fopen(meta_path, "rb");
    if (!in) return 1; /* meta.json not present yet; skip quietly */
    if (fseek(in, 0, SEEK_END) != 0) { fclose(in); return 0; }
    long sz = ftell(in);
    if (sz < 0) { fclose(in); return 0; }
    rewind(in);
    char *buf = (char *)malloc((size_t)sz + 1);
    if (!buf) { fclose(in); return 0; }
    size_t rd = fread(buf, 1, (size_t)sz, in);
    fclose(in);
    buf[rd] = '\0';

    char tmp[512], dst[512];
    FILE *out = open_tmp(out_dir, "meta.json", tmp, dst, sizeof(tmp));
    if (!out) { free(buf); return 0; }

    /* Rewrite line-by-line, replacing only the 3 provisional metadata lines */
    const char *cur = buf;
    while (*cur) {
        const char *nl = strchr(cur, '\n');
        size_t line_len = nl ? (size_t)(nl - cur + 1) : strlen(cur);
        if (strstr(cur, "\"n_charts_valid\":") && (!nl || strstr(cur, "\"n_charts_valid\":") < nl)) {
            fprintf(out, "  \"n_charts_valid\": %d,\n", n_total - n_prov);
        } else if (strstr(cur, "\"n_charts_provisional\":") && (!nl || strstr(cur, "\"n_charts_provisional\":") < nl)) {
            fprintf(out, "  \"n_charts_provisional\": %d,\n", n_prov);
        } else if (strstr(cur, "\"provisional_rule\":") && (!nl || strstr(cur, "\"provisional_rule\":") < nl)) {
            fprintf(out, "  \"provisional_rule\": \"n < %d OR se_b_hard > %.2f\",\n", prov_min_n, prov_max_se);
        } else {
            fwrite(cur, 1, line_len, out);
        }
        cur += line_len;
    }
    free(buf);
    return close_and_commit(out, tmp, dst);
}

/* --------------------------------------------------------------------------
 * Fast --reaggregate-only mode (re-apply provisional rule, level-summary & meta.json)
 * -------------------------------------------------------------------------- */
static int run_reaggregate_only(Dataset *ds, const char *out_dir, int prov_min_n, double prov_max_se) {
    char charts_path[512];
    int pn = snprintf(charts_path, sizeof(charts_path), "%s/charts.json", out_dir);
    if (pn < 0 || (size_t)pn >= sizeof(charts_path)) return 1;
    char err[256];
    JsonValue *root = json_parse_file(charts_path, err, sizeof(err));
    if (!root || root->type != JSON_ARRAY) {
        fprintf(stderr, "Error: cannot load %s (%s)\n", charts_path, err);
        json_free(root);
        return 1;
    }

    int J = ds->n_charts;
    Md5Idx *md5_idx = build_md5_index(ds);
    if (!md5_idx) { json_free(root); return 1; }

    int matched = 0;
    int n_prov = 0;
    for (int j = 0; j < J; j++) {
        ds->charts[j].a = ds->charts[j].b_normal = ds->charts[j].b_hard = ds->charts[j].b_vhard = NAN;
        ds->charts[j].se_a = ds->charts[j].se_b_hard = ds->charts[j].se_b_vhard = NAN;
        ds->charts[j].cov_a_bh = ds->charts[j].cov_a_bv = ds->charts[j].max_played_theta = NAN;
    }

    for (size_t i = 0; i < root->u.arr.count; i++) {
        const JsonValue *c = root->u.arr.items[i];
        const char *md5 = json_get_str(c, "md5", NULL);
        if (!md5) continue;
        int j = find_md5_index(md5_idx, J, md5);
        if (j >= 0) {
            ChartMeta *cm = &ds->charts[j];
            cm->a                = json_get_num(c, "a", NAN, NULL);
            cm->b_normal         = json_get_num(c, "b_normal", NAN, NULL);
            cm->b_hard           = json_get_num(c, "b_hard", NAN, NULL);
            cm->b_vhard          = json_get_num(c, "b_vhard", NAN, NULL);
            cm->se_a             = json_get_num(c, "se_a", NAN, NULL);
            cm->se_b_hard        = json_get_num(c, "se_b_hard", NAN, NULL);
            cm->se_b_vhard       = json_get_num(c, "se_b_vhard", NAN, NULL);
            cm->cov_a_bh         = json_get_num(c, "cov_a_bh", NAN, NULL);
            cm->cov_a_bv         = json_get_num(c, "cov_a_bv", NAN, NULL);
            cm->max_played_theta = json_get_num(c, "max_played_theta", NAN, NULL);
            cm->provisional = (cm->n < prov_min_n || cm->se_b_hard > prov_max_se || !isfinite(cm->se_b_hard));
            if (cm->provisional) n_prov++;
            matched++;
        }
    }
    free(md5_idx);
    json_free(root);

    printf("[reaggregate-only] matched %d/%d charts | provisional=%d (valid=%d) with rule: n < %d OR se_b_hard > %.2f\n",
           matched, J, n_prov, J - n_prov, prov_min_n, prov_max_se);

    if (!write_charts_json(ds, out_dir) ||
        !write_level_summary_json(ds, prov_min_n, out_dir) ||
        !patch_meta_json_provisional(out_dir, J, n_prov, prov_min_n, prov_max_se)) {
        fprintf(stderr, "Error writing charts.json / level-summary.json / meta.json\n");
        return 1;
    }
    return 0;
}

/* --------------------------------------------------------------------------
 * Main entry point
 * -------------------------------------------------------------------------- */
int main(int argc, char **argv) {
    const char *enriched_path = "upload/UEtable_enriched.json";
    const char *lb_dir        = "upload/6Kleaderboards";
    const char *out_dir       = "public/data";

    NutsConfig cfg;
    cfg.num_chains     = 4;
    cfg.inner_threads  = 0; /* auto: utilizes all cores across chains */
    cfg.num_warmup     = 500;
    cfg.num_samples    = 500;
    cfg.max_tree_depth = 8;
    cfg.target_accept  = 0.90;
    cfg.seed           = 42ULL;
    cfg.verbose        = 1;

    int n_quad = 41;
    int check_grad = 0;
    int recover_only = 0;
    int reaggregate_only = 0;
    int dry_run = 0;
    int allow_bad_conv = 0;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--check-grad") == 0) check_grad = 1;
        else if (strcmp(argv[i], "--recover-theta-only") == 0) recover_only = 1;
        else if (strcmp(argv[i], "--reaggregate-only") == 0) reaggregate_only = 1;
        else if (strcmp(argv[i], "--dry-run") == 0) dry_run = 1;
        else if (strcmp(argv[i], "--allow-bad-convergence") == 0) allow_bad_conv = 1;
        else if (strcmp(argv[i], "--quiet") == 0) cfg.verbose = 0;
        else if (strcmp(argv[i], "--chains") == 0 && i + 1 < argc) cfg.num_chains = atoi(argv[++i]);
        else if (strcmp(argv[i], "--inner-threads") == 0 && i + 1 < argc) cfg.inner_threads = atoi(argv[++i]);
        else if (strcmp(argv[i], "--warmup") == 0 && i + 1 < argc) cfg.num_warmup = atoi(argv[++i]);
        else if (strcmp(argv[i], "--samples") == 0 && i + 1 < argc) cfg.num_samples = atoi(argv[++i]);
        else if (strcmp(argv[i], "--quad") == 0 && i + 1 < argc) n_quad = atoi(argv[++i]);
        else if (strcmp(argv[i], "--max-tree-depth") == 0 && i + 1 < argc) cfg.max_tree_depth = atoi(argv[++i]);
        else if (strcmp(argv[i], "--target-accept") == 0 && i + 1 < argc) cfg.target_accept = atof(argv[++i]);
        else if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc) cfg.seed = (uint64_t)strtoull(argv[++i], NULL, 10);
        else if (strcmp(argv[i], "--out-dir") == 0 && i + 1 < argc) out_dir = argv[++i];
        else if (strcmp(argv[i], "--enriched") == 0 && i + 1 < argc) enriched_path = argv[++i];
        else if (strcmp(argv[i], "--lb-dir") == 0 && i + 1 < argc) lb_dir = argv[++i];
        else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            printf("Usage: questimator_calc [options]\n"
                   "  --chains N              Number of parallel MCMC chains (default: 4)\n"
                   "  --inner-threads N       OpenMP threads per chain (default: auto, up to 4)\n"
                   "  --warmup N              Warmup iterations per chain (default: 500)\n"
                   "  --samples N             Posterior draws per chain (default: 500)\n"
                   "  --quad N                Gauss-Hermite nodes for MCMC (default: 41)\n"
                   "  --max-tree-depth N      NUTS max tree depth (default: 8)\n"
                   "  --target-accept F       Dual-averaging target accept prob (default: 0.90)\n"
                   "  --seed N                PRNG seed (default: 42)\n"
                   "  --out-dir PATH          Output directory (default: public/data)\n"
                   "  --enriched PATH         UEtable_enriched.json path\n"
                   "  --lb-dir PATH           6Kleaderboards directory path\n"
                   "  --check-grad            Verify analytic gradients via finite differences\n"
                   "  --recover-theta-only    Recompute players.json from existing charts.json\n"
                   "  --reaggregate-only      Recompute provisional flags, level-summary.json & meta.json\n"
                   "  --dry-run               Run calibration without writing JSON files\n"
                   "  --allow-bad-convergence Emit JSON even if R-hat/ESS thresholds fail\n"
                   "  --quiet                 Suppress per-chain NUTS progress logs\n");
            return 0;
        } else {
            fprintf(stderr, "Unknown argument: %s (try --help)\n", argv[i]);
            return 1;
        }
    }

    double t_start = now_sec();

    printf("[1/6] Loading %s & %s ...\n", enriched_path, lb_dir);
    Dataset ds;
    if (!dataset_load(&ds, enriched_path, lb_dir)) {
        return 1;
    }
    double t_loaded = now_sec();
    printf("      loaded %d charts, %d/%d IR files, %lld entries (%lld filtered), %d players, %d dedup clears (%.2fs)\n",
           ds.n_charts, ds.matched_files, ds.total_files,
           (long long)ds.total_entries, (long long)ds.filtered_out,
           ds.n_players, ds.n_obs, t_loaded - t_start);
    fflush(stdout);

    if (check_grad) {
        int rc = run_check_grad(&ds, n_quad);
        dataset_free(&ds);
        return rc;
    }

    if (recover_only) {
        int rc = run_recover_theta_only(&ds, out_dir);
        dataset_free(&ds);
        return rc;
    }

    if (reaggregate_only) {
        int rc = run_reaggregate_only(&ds, out_dir, DEFAULT_PROV_MIN_N, DEFAULT_PROV_MAX_SE);
        dataset_free(&ds);
        return rc;
    }

    printf("[2/6] Initializing %d-point Gauss-Hermite GRM model (dim=%d) ...\n",
           n_quad, 4 * ds.n_charts + 1);
    GrmModel model;
    if (!grm_model_init(&model, &ds, n_quad)) {
        fprintf(stderr, "Error: failed to initialize GRM model\n");
        dataset_free(&ds);
        return 1;
    }

    printf("[3/6] Fitting Bayesian GRM via parallel C11 NUTS (%d chains x (%d warmup + %d samples), quad=%d) ...\n",
           cfg.num_chains, cfg.num_warmup, cfg.num_samples, n_quad);
    fflush(stdout);

    double t_mcmc0 = now_sec();
    NutsResult nuts_res;
    if (!nuts_run(&model, &cfg, &nuts_res)) {
        fprintf(stderr, "Error: NUTS sampling failed\n");
        grm_model_free(&model);
        dataset_free(&ds);
        return 1;
    }
    double t_mcmc1 = now_sec();
    printf("      NUTS finished in %.2fs (%.2f min) | mean steps=%.1f (max %d) | mean depth=%.2f | mean acc=%.3f | div=%d\n",
           t_mcmc1 - t_mcmc0, (t_mcmc1 - t_mcmc0) / 60.0,
           nuts_res.mean_num_steps, nuts_res.max_num_steps,
           nuts_res.mean_tree_depth, nuts_res.mean_accept_prob,
           nuts_res.total_divergences);

    printf("[4/6] Checking convergence (split-rank R-hat, bulk & tail ESS, divergences) ...\n");
    ConvergenceReport conv;
    compute_convergence(&nuts_res, ds.n_charts, model.level_mean, 1.05, 200.0, &conv);
    printf("      Split-rank R-hat max: %.4f (thresh 1.05, bad=%d) | Bulk ESS min: %.0f | Tail ESS min: %.0f | %s\n",
           conv.r_hat_max, conv.n_bad_rhat, conv.ess_min, conv.tail_ess_min,
           conv.convergence_ok ? "OK" : "POOR");
    for (int b = 0; b < 6; b++) {
        printf("        %-18s: R-hat max=%.4f, bulk ESS min=%6.0f, tail ESS min=%6.0f, bad_rhat=%d, low_ess=%d\n",
               conv.blocks[b].name, conv.blocks[b].r_hat_max, conv.blocks[b].n_eff_min,
               conv.blocks[b].tail_ess_min, conv.blocks[b].n_bad_rhat, conv.blocks[b].n_low_ess);
    }

    if (!dry_run && !allow_bad_conv) {
        if (nuts_res.total_divergences > 0) {
            fprintf(stderr, "ERROR: %d post-warmup divergences detected; refusing to emit JSON artifacts.\n",
                    nuts_res.total_divergences);
            nuts_result_free(&nuts_res);
            grm_model_free(&model);
            dataset_free(&ds);
            return 2;
        }
        if (!conv.convergence_ok) {
            fprintf(stderr, "ERROR: convergence failed (R-hat max=%.4f, ESS min=%.0f); refusing to emit JSON artifacts.\n",
                    conv.r_hat_max, conv.ess_min);
            nuts_result_free(&nuts_res);
            grm_model_free(&model);
            dataset_free(&ds);
            return 2;
        }
    }

    /* Summarize posterior draws across all chains & samples */
    const int J = ds.n_charts;
    const int D = model.dim;
    const int N_draws = cfg.num_chains * cfg.num_samples;

    double *a_mean     = (double *)calloc((size_t)J, sizeof(double));
    double *a_m2       = (double *)calloc((size_t)J, sizeof(double));
    double *d_mean     = (double *)calloc((size_t)J, sizeof(double));
    double *d_m2       = (double *)calloc((size_t)J, sizeof(double));
    double *t1_mean    = (double *)calloc((size_t)J, sizeof(double));
    double *t2_mean    = (double *)calloc((size_t)J, sizeof(double));
    double *bh_mean    = (double *)calloc((size_t)J, sizeof(double));
    double *bh_m2      = (double *)calloc((size_t)J, sizeof(double));
    double *cov_abh_c  = (double *)calloc((size_t)J, sizeof(double));
    double *cov_abv_c  = (double *)calloc((size_t)J, sizeof(double));
    double *a_tmp      = (double *)malloc((size_t)J * sizeof(double));
    if (!a_mean || !a_m2 || !d_mean || !d_m2 || !t1_mean || !t2_mean ||
        !bh_mean || !bh_m2 || !cov_abh_c || !cov_abv_c || !a_tmp) {
        fprintf(stderr, "Error: out of memory allocating posterior summary buffers\n");
        return 1;
    }

    for (int n = 0; n < N_draws; n++) {
        const double *s = nuts_res.samples + (size_t)n * (size_t)D;
        const double *delta = s + 2;
        const double *lt1   = s + 2 + J;
        const double *lt2   = s + 2 + 2 * J;
        const double *lac   = s + 2 + 3 * J;
        grm_compute_alpha(lac, J, a_tmp);

        double inv_n = 1.0 / (double)(n + 1);
        for (int j = 0; j < J; j++) {
            double aj  = a_tmp[j];
            double dj  = delta[j];
            double t1j = exp(lt1[j]);
            double t2j = exp(lt2[j]);
            double bhj = dj - t2j;

            /* Pebay/Welford online mean, variance, and covariance co-moments */
            double da1 = aj - a_mean[j];   a_mean[j]  += da1 * inv_n; double da2 = aj  - a_mean[j];  a_m2[j]  += da1 * da2;
            double dd1 = dj - d_mean[j];   d_mean[j]  += dd1 * inv_n; double dd2 = dj  - d_mean[j];  d_m2[j]  += dd1 * dd2;
            double db1 = bhj - bh_mean[j]; bh_mean[j] += db1 * inv_n; double db2 = bhj - bh_mean[j]; bh_m2[j] += db1 * db2;
            cov_abh_c[j] += da1 * db2;
            cov_abv_c[j] += da1 * dd2;
            t1_mean[j] += t1j;
            t2_mean[j] += t2j;
        }
    }
    free(a_tmp);

    const int PROV_MIN_N = DEFAULT_PROV_MIN_N;
    const double PROV_MAX_SE = DEFAULT_PROV_MAX_SE;
    double *b_normal = (double *)malloc((size_t)J * sizeof(double));
    double *b_hard   = (double *)malloc((size_t)J * sizeof(double));
    double *b_vhard  = (double *)malloc((size_t)J * sizeof(double));
    if (!b_normal || !b_hard || !b_vhard) {
        fprintf(stderr, "Error: out of memory allocating threshold arrays\n");
        return 1;
    }
    int n_prov = 0;

    for (int j = 0; j < J; j++) {
        t1_mean[j] /= (double)N_draws;
        t2_mean[j] /= (double)N_draws;

        ChartMeta *cm = &ds.charts[j];
        cm->a                = a_mean[j];
        cm->b_vhard          = d_mean[j];
        cm->b_hard           = d_mean[j] - t2_mean[j];
        cm->b_normal         = d_mean[j] - t2_mean[j] - t1_mean[j];
        cm->se_a             = sqrt(a_m2[j] / (double)N_draws);
        cm->se_b_vhard       = sqrt(d_m2[j] / (double)N_draws);
        cm->se_b_hard        = sqrt(bh_m2[j] / (double)N_draws);
        cm->cov_a_bh         = cov_abh_c[j] / (double)N_draws;
        cm->cov_a_bv         = cov_abv_c[j] / (double)N_draws;
        cm->max_played_theta = -INFINITY;
        cm->provisional = (cm->n < PROV_MIN_N || cm->se_b_hard > PROV_MAX_SE || !isfinite(cm->se_b_hard));
        if (cm->provisional) n_prov++;

        b_normal[j] = cm->b_normal;
        b_hard[j]   = cm->b_hard;
        b_vhard[j]  = cm->b_vhard;
    }

    printf("[5/6] Recovering player theta via 101-point Gauss-Hermite EAP (%d provisional charts) ...\n", n_prov);
    double *th_eap = (double *)malloc((size_t)ds.n_players * sizeof(double));
    double *th_se  = (double *)malloc((size_t)ds.n_players * sizeof(double));
    if (!th_eap || !th_se) {
        fprintf(stderr, "Error: out of memory allocating player EAP buffers\n");
        return 1;
    }
    grm_eap_theta(&ds, a_mean, b_normal, b_hard, b_vhard, 101, th_eap, th_se);

    /* Precompute max_played_theta per chart so Charts/Detail UI don't require players.json */
    for (int p = 0; p < ds.n_players; p++) {
        double pt = th_eap[p];
        if (!isfinite(pt)) continue;
        int s = ds.player_offsets[p];
        int e = ds.player_offsets[p + 1];
        for (int k = s; k < e; k++) {
            int cj = ds.obs_chart[k];
            if (pt > ds.charts[cj].max_played_theta) {
                ds.charts[cj].max_played_theta = pt;
            }
        }
    }
    for (int j = 0; j < J; j++) {
        if (!isfinite(ds.charts[j].max_played_theta)) {
            ds.charts[j].max_played_theta = NAN;
        }
    }

    double th_mean = 0.0;
    for (int p = 0; p < ds.n_players; p++) th_mean += th_eap[p];
    th_mean /= (double)ds.n_players;
    double th_var = 0.0;
    for (int p = 0; p < ds.n_players; p++) {
        double d = th_eap[p] - th_mean;
        th_var += d * d;
    }
    double th_std = sqrt(th_var / (double)ds.n_players);

    double total_sec = now_sec() - t_start;

    if (dry_run) {
        printf("[6/6] Dry run complete in %.2fs (player theta mean=%.4f, std=%.4f). No files written.\n",
               total_sec, th_mean, th_std);
    } else {
        printf("[6/6] Emitting JSON artifacts to %s/ ...\n", out_dir);
#ifdef _WIN32
        _mkdir(out_dir);
#else
        mkdir(out_dir, 0755);
#endif
        int ok = write_charts_json(&ds, out_dir)
              && write_level_summary_json(&ds, PROV_MIN_N, out_dir)
              && write_players_json(&ds, th_eap, th_se, out_dir)
              && write_sha512_to_id_json(&ds, out_dir)
              && write_meta_json(&ds, &cfg, &nuts_res, &conv, n_quad,
                                 PROV_MIN_N, PROV_MAX_SE, th_eap, th_mean, th_std, total_sec, out_dir);
        if (!ok) {
            fprintf(stderr, "Error: failed writing one or more JSON artifacts\n");
            return 1;
        }
        printf("\n=== C11 Pipeline complete in %.2fs (%.2f min) ===\n", total_sec, total_sec / 60.0);
        printf("  Charts:  %d (valid %d, provisional %d)\n", ds.n_charts, ds.n_charts - n_prov, n_prov);
        printf("  Players: %d | Clears: %d | Split-rank R-hat max: %.4f | Bulk ESS min: %.0f | Tail ESS min: %.0f\n",
               ds.n_players, ds.n_obs, conv.r_hat_max, conv.ess_min, conv.tail_ess_min);
    }

    free(a_mean); free(a_m2); free(d_mean); free(d_m2);
    free(t1_mean); free(t2_mean); free(bh_mean); free(bh_m2);
    free(cov_abh_c); free(cov_abv_c);
    free(b_normal); free(b_hard); free(b_vhard);
    free(th_eap); free(th_se);
    nuts_result_free(&nuts_res);
    grm_model_free(&model);
    dataset_free(&ds);
    return 0;
}
