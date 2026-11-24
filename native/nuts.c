#include "nuts.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _OPENMP
#include <omp.h>
#endif

/* --------------------------------------------------------------------------
 * Fast reproducible PRNG: xoshiro256** seeded via SplitMix64
 * -------------------------------------------------------------------------- */
typedef struct {
    uint64_t s[4];
    int has_spare;
    double spare;
} Rng;

static uint64_t splitmix64(uint64_t *x) {
    uint64_t z = (*x += 0x9e3779b97f4a7c15ULL);
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
}

static void rng_seed(Rng *r, uint64_t seed) {
    uint64_t x = seed;
    r->s[0] = splitmix64(&x);
    r->s[1] = splitmix64(&x);
    r->s[2] = splitmix64(&x);
    r->s[3] = splitmix64(&x);
    r->has_spare = 0;
    r->spare = 0.0;
}

static inline uint64_t rotl64(uint64_t x, int k) {
    return (x << k) | (x >> (64 - k));
}

static inline uint64_t rng_u64(Rng *r) {
    const uint64_t result = rotl64(r->s[1] * 5ULL, 7) * 9ULL;
    const uint64_t t = r->s[1] << 17;
    r->s[2] ^= r->s[0];
    r->s[3] ^= r->s[1];
    r->s[1] ^= r->s[2];
    r->s[0] ^= r->s[3];
    r->s[2] ^= t;
    r->s[3] = rotl64(r->s[3], 45);
    return result;
}

static inline double rng_u01(Rng *r) {
    return (double)(rng_u64(r) >> 11) * (1.0 / 9007199254740992.0);
}

static double rng_normal(Rng *r) {
    if (r->has_spare) {
        r->has_spare = 0;
        return r->spare;
    }
    double u1, u2;
    do { u1 = rng_u01(r); } while (u1 <= 1e-300);
    u2 = rng_u01(r);
    double mag = sqrt(-2.0 * log(u1));
    double ang = 6.283185307179586476925286766559 * u2;
    r->spare = mag * sin(ang);
    r->has_spare = 1;
    return mag * cos(ang);
}

static inline double logaddexp(double a, double b) {
    if (a == -INFINITY) return b;
    if (b == -INFINITY) return a;
    if (a > b) return a + log1p(exp(b - a));
    return b + log1p(exp(a - b));
}

/* --------------------------------------------------------------------------
 * Dual Averaging (Hoffman & Gelman 2014 / Stan)
 * -------------------------------------------------------------------------- */
typedef struct {
    double mu;
    double log_eps_bar;
    double H_bar;
    double gamma;
    double t0;
    double kappa;
    double delta; /* target accept prob */
    int m;
} DualAvg;

static void da_init(DualAvg *da, double eps0, double target_accept) {
    da->mu = log(10.0 * eps0);
    da->log_eps_bar = 0.0;
    da->H_bar = 0.0;
    da->gamma = 0.05;
    da->t0 = 10.0;
    da->kappa = 0.75;
    da->delta = target_accept;
    da->m = 0;
}

static double da_update(DualAvg *da, double accept_stat) {
    da->m++;
    double m = (double)da->m;
    double w = 1.0 / (m + da->t0);
    da->H_bar = (1.0 - w) * da->H_bar + w * (da->delta - accept_stat);
    double log_eps = da->mu - (sqrt(m) / da->gamma) * da->H_bar;
    /* Clamp extreme step sizes to keep numerics sane */
    if (log_eps < -16.0) log_eps = -16.0;
    if (log_eps >   4.0) log_eps =   4.0;
    double mk = pow(m, -da->kappa);
    da->log_eps_bar = mk * log_eps + (1.0 - mk) * da->log_eps_bar;
    return exp(log_eps);
}

/* --------------------------------------------------------------------------
 * Online Welford diagonal variance estimator (Stan shrinkage)
 * -------------------------------------------------------------------------- */
typedef struct {
    int dim;
    int n;
    double *mean;
    double *m2;
} Welford;

static int welford_init(Welford *w, int dim) {
    w->dim = dim;
    w->n = 0;
    w->mean = (double *)calloc((size_t)dim, sizeof(double));
    w->m2   = (double *)calloc((size_t)dim, sizeof(double));
    if (!w->mean || !w->m2) {
        free(w->mean); free(w->m2);
        w->mean = w->m2 = NULL;
        return 0;
    }
    return 1;
}

static void welford_reset(Welford *w) {
    w->n = 0;
    memset(w->mean, 0, (size_t)w->dim * sizeof(double));
    memset(w->m2,   0, (size_t)w->dim * sizeof(double));
}

static void welford_add(Welford *w, const double *x) {
    w->n++;
    double inv_n = 1.0 / (double)w->n;
    for (int i = 0; i < w->dim; i++) {
        double d1 = x[i] - w->mean[i];
        w->mean[i] += d1 * inv_n;
        double d2 = x[i] - w->mean[i];
        w->m2[i] += d1 * d2;
    }
}

static void welford_to_inv_mass(
    const Welford *w, const double *prior_inv_mass, double *inv_mass, double *sqrt_mass
) {
    if (w->n < 2) return;
    double n = (double)w->n;
    double denom = (double)(w->n - 1);
    double shrink_data  = n / (n + 5.0);
    double shrink_prior = 5.0 / (n + 5.0);
    for (int i = 0; i < w->dim; i++) {
        double var = w->m2[i] / denom;
        double iv = var * shrink_data + prior_inv_mass[i] * shrink_prior;
        if (!isfinite(iv) || iv < 1e-10) iv = 1e-10;
        if (iv > 1e6) iv = 1e6;
        inv_mass[i] = iv;
        sqrt_mass[i] = 1.0 / sqrt(iv);
    }
}

static void welford_free(Welford *w) {
    free(w->mean);
    free(w->m2);
    w->mean = w->m2 = NULL;
}

/* --------------------------------------------------------------------------
 * Preallocated NUTS tree node buffers (zero malloc during sampling!)
 * -------------------------------------------------------------------------- */
typedef struct {
    double *q_l, *p_l, *g_l;
    double *q_r, *p_r, *g_r;
    double *q_prop, *g_prop;
    double *rho;
    double lp_l, lp_r, lp_prop;
    double log_w;
    int valid;
    int diverging;
    double sum_alpha;
    int n_alpha;
} Subtree;

static void subtree_free(Subtree *st);

static int subtree_alloc(Subtree *st, int D) {
    memset(st, 0, sizeof(*st));
    st->q_l    = (double *)malloc((size_t)D * sizeof(double));
    st->p_l    = (double *)malloc((size_t)D * sizeof(double));
    st->g_l    = (double *)malloc((size_t)D * sizeof(double));
    st->q_r    = (double *)malloc((size_t)D * sizeof(double));
    st->p_r    = (double *)malloc((size_t)D * sizeof(double));
    st->g_r    = (double *)malloc((size_t)D * sizeof(double));
    st->q_prop = (double *)malloc((size_t)D * sizeof(double));
    st->g_prop = (double *)malloc((size_t)D * sizeof(double));
    st->rho    = (double *)malloc((size_t)D * sizeof(double));
    if (!st->q_l || !st->p_l || !st->g_l || !st->q_r || !st->p_r ||
        !st->g_r || !st->q_prop || !st->g_prop || !st->rho) {
        subtree_free(st);
        return 0;
    }
    return 1;
}

static void subtree_free(Subtree *st) {
    free(st->q_l); free(st->p_l); free(st->g_l);
    free(st->q_r); free(st->p_r); free(st->g_r);
    free(st->q_prop); free(st->g_prop); free(st->rho);
}

typedef struct {
    const GrmModel *model;
    GrmWorkspace ws;
    Rng rng;
    int dim;
    int max_tree_depth;

    double *inv_mass;
    double *sqrt_mass; /* sqrt(mass) = 1 / sqrt(inv_mass) */

    /* Preallocated tree buffers: two per depth level (first & second half) + main tree */
    Subtree tree;
    Subtree *s1; /* length max_tree_depth + 1 */
    Subtree *s2; /* length max_tree_depth + 1 */
    double *rho_tmp;
} ChainCtx;

static double kinetic_energy(const double *p, const double *inv_mass, int D) {
    double ke = 0.0;
    for (int i = 0; i < D; i++) ke += inv_mass[i] * p[i] * p[i];
    return 0.5 * ke;
}

/* Generalized U-turn criterion (Stan / Betancourt):
 * rho_eff = rho - 0.5 * (p_l + p_r);
 * valid iff dot(M^{-1} * p_l, rho_eff) > 0 AND dot(M^{-1} * p_r, rho_eff) > 0 */
static int check_no_uturn(
    const double *p_l,
    const double *p_r,
    const double *rho,
    const double *inv_mass,
    int D
) {
    double dot_l = 0.0;
    double dot_r = 0.0;
    for (int i = 0; i < D; i++) {
        double re = rho[i] - 0.5 * (p_l[i] + p_r[i]);
        double iv = inv_mass[i];
        dot_l += (iv * p_l[i]) * re;
        dot_r += (iv * p_r[i]) * re;
    }
    return (dot_l > 0.0) && (dot_r > 0.0);
}

/* 3-way symmetric merge U-turn check between adjacent left & right subtrees */
static int check_merge_no_uturn(
    const Subtree *left,
    const Subtree *right,
    const double *rho_merged,
    double *rho_tmp,
    const double *inv_mass,
    int D
) {
    if (!check_no_uturn(left->p_l, right->p_r, rho_merged, inv_mass, D)) return 0;

    for (int i = 0; i < D; i++) rho_tmp[i] = left->rho[i] + right->p_l[i];
    if (!check_no_uturn(left->p_l, right->p_l, rho_tmp, inv_mass, D)) return 0;

    for (int i = 0; i < D; i++) rho_tmp[i] = left->p_r[i] + right->rho[i];
    if (!check_no_uturn(left->p_r, right->p_r, rho_tmp, inv_mass, D)) return 0;

    return 1;
}

/* Single leapfrog step */
static int leapfrog(
    ChainCtx *ctx,
    const double *q_in, const double *p_in, const double *g_in,
    double step,
    double *q_out, double *p_out, double *g_out, double *lp_out
) {
    const int D = ctx->dim;
    const double half = 0.5 * step;
    const double *iv = ctx->inv_mass;

    for (int i = 0; i < D; i++) {
        double p_half = p_in[i] + half * g_in[i];
        p_out[i] = p_half;
        q_out[i] = q_in[i] + step * iv[i] * p_half;
    }

    double lp = grm_logp_and_grad(ctx->model, &ctx->ws, q_out, g_out);
    *lp_out = lp;
    if (!isfinite(lp)) return 0;

    for (int i = 0; i < D; i++) {
        if (!isfinite(g_out[i])) return 0;
        p_out[i] += half * g_out[i];
    }
    return 1;
}

/* Recursive NUTS subtree builder (writes result into *out) */
static void build_tree(
    ChainCtx *ctx,
    const double *q_in, const double *p_in, const double *g_in,
    int dir, int depth, double eps, double H0,
    Subtree *out
) {
    const int D = ctx->dim;
    const size_t bytes = (size_t)D * sizeof(double);

    if (depth == 0) {
        double lp1 = -INFINITY;
        int ok = leapfrog(ctx, q_in, p_in, g_in, (double)dir * eps,
                          out->q_l, out->p_l, out->g_l, &lp1);
        double H1 = ok ? (-lp1 + kinetic_energy(out->p_l, ctx->inv_mass, D)) : INFINITY;
        double delta_H = H1 - H0;

        if (!ok || !isfinite(delta_H) || delta_H > 1000.0) {
            out->valid = 0;
            out->diverging = 1;
            out->log_w = -INFINITY;
            out->sum_alpha = 0.0;
            out->n_alpha = 1;
            return;
        }

        double log_w = -delta_H; /* H0 - H1 */
        double alpha = (delta_H <= 0.0) ? 1.0 : exp(-delta_H);

        memcpy(out->q_r, out->q_l, bytes);
        memcpy(out->p_r, out->p_l, bytes);
        memcpy(out->g_r, out->g_l, bytes);
        memcpy(out->q_prop, out->q_l, bytes);
        memcpy(out->g_prop, out->g_l, bytes);
        memcpy(out->rho, out->p_l, bytes);
        out->lp_l = out->lp_r = out->lp_prop = lp1;
        out->log_w = log_w;
        out->valid = 1;
        out->diverging = 0;
        out->sum_alpha = alpha;
        out->n_alpha = 1;
        return;
    }

    Subtree *sub1 = &ctx->s1[depth - 1];
    Subtree *sub2 = &ctx->s2[depth - 1];

    /* First half */
    build_tree(ctx, q_in, p_in, g_in, dir, depth - 1, eps, H0, sub1);
    if (!sub1->valid) {
        out->valid = 0;
        out->diverging = sub1->diverging;
        out->log_w = sub1->log_w;
        out->sum_alpha = sub1->sum_alpha;
        out->n_alpha = sub1->n_alpha;
        return;
    }

    /* Second half starts from the leading endpoint of sub1 */
    const double *q_next = (dir == 1) ? sub1->q_r : sub1->q_l;
    const double *p_next = (dir == 1) ? sub1->p_r : sub1->p_l;
    const double *g_next = (dir == 1) ? sub1->g_r : sub1->g_l;

    build_tree(ctx, q_next, p_next, g_next, dir, depth - 1, eps, H0, sub2);

    out->sum_alpha = sub1->sum_alpha + sub2->sum_alpha;
    out->n_alpha   = sub1->n_alpha   + sub2->n_alpha;
    out->diverging = sub1->diverging || sub2->diverging;

    if (!sub2->valid) {
        out->valid = 0;
        out->log_w = sub1->log_w;
        return;
    }

    /* Combine log weights and multinomially pick proposal between sub1 & sub2 */
    out->log_w = logaddexp(sub1->log_w, sub2->log_w);
    double prob2 = exp(sub2->log_w - out->log_w);
    const Subtree *chosen = (rng_u01(&ctx->rng) < prob2) ? sub2 : sub1;
    memcpy(out->q_prop, chosen->q_prop, bytes);
    memcpy(out->g_prop, chosen->g_prop, bytes);
    out->lp_prop = chosen->lp_prop;

    /* Orient left & right subtrees chronologically */
    const Subtree *left  = (dir == 1) ? sub1 : sub2;
    const Subtree *right = (dir == 1) ? sub2 : sub1;

    memcpy(out->q_l, left->q_l, bytes);
    memcpy(out->p_l, left->p_l, bytes);
    memcpy(out->g_l, left->g_l, bytes);
    out->lp_l = left->lp_l;

    memcpy(out->q_r, right->q_r, bytes);
    memcpy(out->p_r, right->p_r, bytes);
    memcpy(out->g_r, right->g_r, bytes);
    out->lp_r = right->lp_r;

    for (int i = 0; i < D; i++) out->rho[i] = left->rho[i] + right->rho[i];

    out->valid = check_merge_no_uturn(left, right, out->rho, ctx->rho_tmp, ctx->inv_mass, D);
}

/* Heuristic initial step size (Hoffman & Gelman Algorithm 4) */
static double find_reasonable_epsilon(
    ChainCtx *ctx, const double *q0, const double *g0, double lp0
) {
    const int D = ctx->dim;
    double *p0 = (double *)calloc((size_t)D, sizeof(double));
    double *q1 = (double *)malloc((size_t)D * sizeof(double));
    double *p1 = (double *)malloc((size_t)D * sizeof(double));
    double *g1 = (double *)malloc((size_t)D * sizeof(double));

    for (int i = 0; i < D; i++) p0[i] = ctx->sqrt_mass[i] * rng_normal(&ctx->rng);
    double H0 = -lp0 + kinetic_energy(p0, ctx->inv_mass, D);

    double eps = 0.05;
    double lp1 = -INFINITY;
    int ok = leapfrog(ctx, q0, p0, g0, eps, q1, p1, g1, &lp1);
    double H1 = ok ? (-lp1 + kinetic_energy(p1, ctx->inv_mass, D)) : INFINITY;
    double log_r = H0 - H1;
    int a = (isfinite(log_r) && log_r > log(0.5)) ? 1 : -1;

    for (int iter = 0; iter < 50; iter++) {
        if (a == 1 && (!isfinite(log_r) || log_r <= log(0.5))) break;
        if (a == -1 && isfinite(log_r) && log_r > log(0.5)) break;
        eps = (a == 1) ? (eps * 2.0) : (eps * 0.5);
        if (eps < 1e-7 || eps > 10.0) break;
        ok = leapfrog(ctx, q0, p0, g0, eps, q1, p1, g1, &lp1);
        H1 = ok ? (-lp1 + kinetic_energy(p1, ctx->inv_mass, D)) : INFINITY;
        log_r = H0 - H1;
    }

    free(p0); free(q1); free(p1); free(g1);
    if (eps < 1e-6) eps = 1e-6;
    if (eps > 1.0)  eps = 1.0;
    return eps;
}

/* Single NUTS transition from (q, g, lp) */
static void nuts_step(
    ChainCtx *ctx,
    double *q, double *g, double *lp,
    double eps,
    double *accept_stat_out,
    int *diverging_out,
    int *num_steps_out,
    int *tree_depth_out
) {
    const int D = ctx->dim;
    const size_t bytes = (size_t)D * sizeof(double);
    Subtree *tree = &ctx->tree;

    /* Resample momentum p ~ N(0, M) */
    for (int i = 0; i < D; i++) {
        double pi = ctx->sqrt_mass[i] * rng_normal(&ctx->rng);
        tree->p_l[i] = pi;
        tree->p_r[i] = pi;
        tree->rho[i] = pi;
    }
    memcpy(tree->q_l, q, bytes);
    memcpy(tree->q_r, q, bytes);
    memcpy(tree->q_prop, q, bytes);
    memcpy(tree->g_l, g, bytes);
    memcpy(tree->g_r, g, bytes);
    memcpy(tree->g_prop, g, bytes);
    tree->lp_l = tree->lp_r = tree->lp_prop = *lp;
    tree->log_w = 0.0; /* log weight of initial state is H0 - H0 = 0 */

    double H0 = -(*lp) + kinetic_energy(tree->p_l, ctx->inv_mass, D);

    double sum_alpha = 0.0;
    int n_alpha = 0;
    int diverging = 0;
    int depth_reached = 0;

    Subtree *sub = &ctx->s1[ctx->max_tree_depth];

    for (int d = 0; d < ctx->max_tree_depth; d++) {
        int dir = (rng_u01(&ctx->rng) < 0.5) ? -1 : 1;
        const double *q_start = (dir == 1) ? tree->q_r : tree->q_l;
        const double *p_start = (dir == 1) ? tree->p_r : tree->p_l;
        const double *g_start = (dir == 1) ? tree->g_r : tree->g_l;

        build_tree(ctx, q_start, p_start, g_start, dir, d, eps, H0, sub);

        sum_alpha += sub->sum_alpha;
        n_alpha   += sub->n_alpha;
        depth_reached = d + 1;

        if (sub->diverging) {
            diverging = 1;
            break;
        }
        if (!sub->valid) {
            break;
        }

        /* Biased progressive transition (Betancourt 2017) */
        double log_prob = sub->log_w - tree->log_w;
        if (log_prob >= 0.0 || rng_u01(&ctx->rng) < exp(log_prob)) {
            memcpy(tree->q_prop, sub->q_prop, bytes);
            memcpy(tree->g_prop, sub->g_prop, bytes);
            tree->lp_prop = sub->lp_prop;
        }
        tree->log_w = logaddexp(tree->log_w, sub->log_w);

        /* Merge endpoints & check global U-turn */
        const Subtree *left  = (dir == 1) ? tree : sub;
        const Subtree *right = (dir == 1) ? sub  : tree;

        double *rho_merged = ctx->s2[ctx->max_tree_depth].rho;
        for (int i = 0; i < D; i++) rho_merged[i] = left->rho[i] + right->rho[i];

        int ok_uturn = check_merge_no_uturn(left, right, rho_merged, ctx->rho_tmp, ctx->inv_mass, D);

        if (dir == 1) {
            memcpy(tree->q_r, sub->q_r, bytes);
            memcpy(tree->p_r, sub->p_r, bytes);
            memcpy(tree->g_r, sub->g_r, bytes);
            tree->lp_r = sub->lp_r;
        } else {
            memcpy(tree->q_l, sub->q_l, bytes);
            memcpy(tree->p_l, sub->p_l, bytes);
            memcpy(tree->g_l, sub->g_l, bytes);
            tree->lp_l = sub->lp_l;
        }
        memcpy(tree->rho, rho_merged, bytes);

        if (!ok_uturn) break;
    }

    memcpy(q, tree->q_prop, bytes);
    memcpy(g, tree->g_prop, bytes);
    *lp = tree->lp_prop;

    *accept_stat_out = (n_alpha > 0) ? (sum_alpha / (double)n_alpha) : 0.0;
    *diverging_out = diverging;
    *num_steps_out = n_alpha;
    *tree_depth_out = depth_reached;
}

/* Compute Stan 3-stage warmup window schedule */
typedef struct {
    int start; /* first iter of slow adaptation */
    int end;   /* last iter of slow adaptation (inclusive) */
    int next_window_end;
    int window_size;
} WarmupSchedule;

static void schedule_init(WarmupSchedule *ws, int num_warmup) {
    if (num_warmup < 20) {
        ws->start = num_warmup;
        ws->end = -1;
        ws->next_window_end = -1;
        ws->window_size = 0;
        return;
    }
    int init_buf = 75;
    int term_buf = 50;
    int base_win = 25;
    if (init_buf + term_buf + base_win > num_warmup) {
        init_buf = (int)(0.15 * num_warmup);
        term_buf = (int)(0.10 * num_warmup);
        base_win = num_warmup - init_buf - term_buf;
    }
    ws->start = init_buf;
    ws->end = num_warmup - term_buf - 1;
    ws->window_size = base_win;
    ws->next_window_end = ws->start + ws->window_size - 1;
    if (ws->next_window_end > ws->end) ws->next_window_end = ws->end;
}

static void schedule_advance(WarmupSchedule *ws) {
    int next_start = ws->next_window_end + 1;
    ws->window_size *= 2;
    int next_end = next_start + ws->window_size - 1;
    /* If the window after this wouldn't fit, absorb remainder into this window */
    if (next_end + ws->window_size * 2 > ws->end) {
        next_end = ws->end;
    }
    if (next_end > ws->end) next_end = ws->end;
    ws->next_window_end = next_end;
}

/* --------------------------------------------------------------------------
 * Multi-chain parallel NUTS driver
 * -------------------------------------------------------------------------- */
int nuts_run(const GrmModel *model, const NutsConfig *cfg, NutsResult *out) {
    memset(out, 0, sizeof(*out));
    const int C = cfg->num_chains;
    const int S = cfg->num_samples;
    const int W = cfg->num_warmup;
    const int D = model->dim;

    out->num_chains = C;
    out->num_samples = S;
    out->dim = D;
    out->samples = (double *)malloc((size_t)C * (size_t)S * (size_t)D * sizeof(double));
    out->final_step_sizes = (double *)calloc((size_t)C, sizeof(double));
    if (!out->samples || !out->final_step_sizes) {
        nuts_result_free(out);
        return 0;
    }

    int *chain_divs      = (int *)calloc((size_t)C, sizeof(int));
    int64_t *chain_steps = (int64_t *)calloc((size_t)C, sizeof(int64_t));
    int *chain_max_steps = (int *)calloc((size_t)C, sizeof(int));
    int64_t *chain_depth = (int64_t *)calloc((size_t)C, sizeof(int64_t));
    int *chain_max_depth = (int *)calloc((size_t)C, sizeof(int));
    double *chain_accept = (double *)calloc((size_t)C, sizeof(double));
    int fail_flag = 0;

    int inner_t = cfg->inner_threads;
    #ifdef _OPENMP
    if (inner_t <= 0) {
        int max_t = omp_get_max_threads();
        inner_t = max_t / C;
        if (inner_t < 1) inner_t = 1;
        if (inner_t > 4) inner_t = 4;
    }
    if (inner_t > 1) {
        omp_set_max_active_levels(2);
    }
    #else
    inner_t = 1;
    #endif

    #pragma omp parallel for schedule(static, 1) num_threads(C)
    for (int c = 0; c < C; c++) {
        ChainCtx ctx;
        memset(&ctx, 0, sizeof(ctx));
        ctx.model = model;
        ctx.dim = D;
        ctx.max_tree_depth = cfg->max_tree_depth;
        rng_seed(&ctx.rng, cfg->seed ^ (0x9e3779b97f4a7c15ULL * (uint64_t)(c + 1)));

        if (!grm_workspace_init(&ctx.ws, model, inner_t)) {
            #pragma omp atomic write
            fail_flag = 1;
            continue;
        }

        ctx.inv_mass  = (double *)malloc((size_t)D * sizeof(double));
        ctx.sqrt_mass = (double *)malloc((size_t)D * sizeof(double));
        ctx.rho_tmp   = (double *)malloc((size_t)D * sizeof(double));
        double *prior_inv_mass = (double *)malloc((size_t)D * sizeof(double));
        double *q = (double *)malloc((size_t)D * sizeof(double));
        double *g = (double *)malloc((size_t)D * sizeof(double));
        ctx.s1 = (Subtree *)calloc((size_t)(cfg->max_tree_depth + 1), sizeof(Subtree));
        ctx.s2 = (Subtree *)calloc((size_t)(cfg->max_tree_depth + 1), sizeof(Subtree));
        Welford welf;
        memset(&welf, 0, sizeof(welf));

        int alloc_ok = (ctx.inv_mass && ctx.sqrt_mass && ctx.rho_tmp && prior_inv_mass &&
                        q && g && ctx.s1 && ctx.s2 && subtree_alloc(&ctx.tree, D) && welford_init(&welf, D));
        if (alloc_ok) {
            for (int d = 0; d <= cfg->max_tree_depth; d++) {
                if (!subtree_alloc(&ctx.s1[d], D) || !subtree_alloc(&ctx.s2[d], D)) {
                    alloc_ok = 0;
                    break;
                }
            }
        }
        if (!alloc_ok) {
            #pragma omp atomic write
            fail_flag = 1;
            free(q); free(g); free(prior_inv_mass);
            welford_free(&welf);
            if (ctx.s1) { for (int d = 0; d <= cfg->max_tree_depth; d++) subtree_free(&ctx.s1[d]); free(ctx.s1); }
            if (ctx.s2) { for (int d = 0; d <= cfg->max_tree_depth; d++) subtree_free(&ctx.s2[d]); free(ctx.s2); }
            subtree_free(&ctx.tree);
            free(ctx.inv_mass); free(ctx.sqrt_mass); free(ctx.rho_tmp);
            grm_workspace_free(&ctx.ws);
            continue;
        }

        grm_init_inv_mass(model, ctx.inv_mass, ctx.sqrt_mass);
        memcpy(prior_inv_mass, ctx.inv_mass, (size_t)D * sizeof(double));
        grm_init_params(model, q);
        /* Scale-aware per-chain dispersion around init_strategy for honest R-hat */
        for (int i = 0; i < D; i++) {
            q[i] += (rng_u01(&ctx.rng) - 0.5) * 0.25 * sqrt(ctx.inv_mass[i]);
        }

        double lp = grm_logp_and_grad(model, &ctx.ws, q, g);
        double eps = find_reasonable_epsilon(&ctx, q, g, lp);

        DualAvg da;
        da_init(&da, eps, cfg->target_accept);
        WarmupSchedule sched;
        schedule_init(&sched, W);

        const int total_iters = W + S;
        int warmup_divs = 0;

        for (int it = 0; it < total_iters; it++) {
            double acc = 0.0;
            int div = 0, nsteps = 0, tdepth = 0;
            nuts_step(&ctx, q, g, &lp, eps, &acc, &div, &nsteps, &tdepth);

            if (it < W) {
                if (div) warmup_divs++;
                eps = da_update(&da, acc);

                if (it >= sched.start && it <= sched.end) {
                    welford_add(&welf, q);
                    if (it == sched.next_window_end) {
                        welford_to_inv_mass(&welf, prior_inv_mass, ctx.inv_mass, ctx.sqrt_mass);
                        welford_reset(&welf);
                        /* Re-anchor step size to updated mass matrix */
                        eps = find_reasonable_epsilon(&ctx, q, g, lp);
                        da_init(&da, eps, cfg->target_accept);
                        if (it < sched.end) schedule_advance(&sched);
                    }
                }
                if (it == W - 1) {
                    eps = exp(da.log_eps_bar);
                    out->final_step_sizes[c] = eps;
                }
            } else {
                int sidx = it - W;
                double *dst = out->samples + ((size_t)c * (size_t)S + (size_t)sidx) * (size_t)D;
                memcpy(dst, q, (size_t)D * sizeof(double));

                chain_divs[c]  += div;
                chain_steps[c] += nsteps;
                if (nsteps > chain_max_steps[c]) chain_max_steps[c] = nsteps;
                chain_depth[c] += tdepth;
                if (tdepth > chain_max_depth[c]) chain_max_depth[c] = tdepth;
                chain_accept[c] += acc;
            }

            int log_stride = (total_iters <= 250) ? 25 : 100;
            if (cfg->verbose && ((it + 1) % log_stride == 0 || it + 1 == W || it + 1 == total_iters)) {
                #pragma omp critical
                {
                    const char *phase = (it < W) ? "warmup" : "sample";
                    printf("      [chain %d/%d] %s %4d/%4d | eps=%.4f | steps=%3d | acc=%.2f | div=%d\n",
                           c + 1, C, phase,
                           (it < W) ? (it + 1) : (it - W + 1),
                           (it < W) ? W : S,
                           eps, nsteps, acc, (it < W) ? warmup_divs : chain_divs[c]);
                    fflush(stdout);
                }
            }
        }

        free(q); free(g); free(prior_inv_mass);
        welford_free(&welf);
        for (int d = 0; d <= cfg->max_tree_depth; d++) {
            subtree_free(&ctx.s1[d]);
            subtree_free(&ctx.s2[d]);
        }
        free(ctx.s1); free(ctx.s2);
        subtree_free(&ctx.tree);
        free(ctx.inv_mass); free(ctx.sqrt_mass); free(ctx.rho_tmp);
        grm_workspace_free(&ctx.ws);
    }

    int64_t total_steps = 0, total_depth = 0;
    double total_acc = 0.0;
    for (int c = 0; c < C; c++) {
        out->total_divergences += chain_divs[c];
        total_steps += chain_steps[c];
        total_depth += chain_depth[c];
        total_acc   += chain_accept[c];
        if (chain_max_steps[c] > out->max_num_steps) out->max_num_steps = chain_max_steps[c];
        if (chain_max_depth[c] > out->max_tree_depth_hit) out->max_tree_depth_hit = chain_max_depth[c];
    }
    double denom = (double)C * (double)S;
    if (denom > 0.0) {
        out->mean_num_steps   = (double)total_steps / denom;
        out->mean_tree_depth  = (double)total_depth / denom;
        out->mean_accept_prob = total_acc / denom;
    }

    free(chain_divs); free(chain_steps); free(chain_max_steps);
    free(chain_depth); free(chain_max_depth); free(chain_accept);

    if (fail_flag) {
        nuts_result_free(out);
        return 0;
    }
    return 1;
}

void nuts_result_free(NutsResult *res) {
    if (!res) return;
    free(res->samples);
    free(res->final_step_sizes);
    memset(res, 0, sizeof(*res));
}
