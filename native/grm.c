#include "grm.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _OPENMP
#include <omp.h>
#endif

/* --------------------------------------------------------------------------
 * Golub-Welsch Gauss-Hermite quadrature for N(0, 1) via implicit QL (tql2)
 *
 * For standard normal weight (1/sqrt(2*pi)) * exp(-x^2 / 2), the symmetric
 * tridiagonal Jacobi matrix has d[i] = 0 and e[i] = sqrt(i) (i = 1..n-1).
 * Eigenvalues are the quadrature nodes theta_q = sqrt(2) * z_q;
 * squared first components of normalized eigenvectors are weights W_q = w_q / sqrt(pi).
 * -------------------------------------------------------------------------- */
static double pythag(double a, double b) {
    double aa = fabs(a), ab = fabs(b);
    if (aa > ab) {
        double r = ab / aa;
        return aa * sqrt(1.0 + r * r);
    }
    if (ab == 0.0) return 0.0;
    double r = aa / ab;
    return ab * sqrt(1.0 + r * r);
}

int gauss_hermite_normal(int n, double *theta_q, double *log_w_q) {
    if (n <= 0) return 0;
    if (n == 1) {
        theta_q[0] = 0.0;
        log_w_q[0] = 0.0;
        return 1;
    }

    double *d = (double *)calloc((size_t)n, sizeof(double));
    double *e = (double *)calloc((size_t)n, sizeof(double));
    double *v0 = (double *)calloc((size_t)n, sizeof(double)); /* first row of eigenvector matrix */
    if (!d || !e || !v0) {
        free(d); free(e); free(v0);
        return 0;
    }

    /* Subdiagonal: e[i] = sqrt(i + 1) for i = 0..n-2, e[n-1] = 0 */
    for (int i = 0; i < n - 1; i++) {
        e[i] = sqrt((double)(i + 1));
    }
    e[n - 1] = 0.0;
    v0[0] = 1.0;

    for (int l = 0; l < n; l++) {
        int iter = 0;
        for (;;) {
            int m;
            for (m = l; m < n - 1; m++) {
                double dd = fabs(d[m]) + fabs(d[m + 1]);
                if (fabs(e[m]) <= 1e-15 * dd) break;
            }
            if (m == l) break;
            if (++iter > 100) {
                free(d); free(e); free(v0);
                return 0;
            }

            double g = (d[l + 1] - d[l]) / (2.0 * e[l]);
            double r = pythag(g, 1.0);
            g = d[m] - d[l] + e[l] / (g + (g >= 0.0 ? fabs(r) : -fabs(r)));
            double s = 1.0, c = 1.0, p = 0.0;

            int i;
            for (i = m - 1; i >= l; i--) {
                double f = s * e[i];
                double b = c * e[i];
                r = pythag(f, g);
                e[i + 1] = r;
                if (r == 0.0) {
                    d[i + 1] -= p;
                    e[m] = 0.0;
                    break;
                }
                s = f / r;
                c = g / r;
                g = d[i + 1] - p;
                r = (d[i] - g) * s + 2.0 * c * b;
                p = s * r;
                d[i + 1] = g + p;
                g = c * r - b;

                /* Accumulate only first row of Q (all we need for quadrature weights) */
                double f0 = v0[i + 1];
                v0[i + 1] = s * v0[i] + c * f0;
                v0[i] = c * v0[i] - s * f0;
            }
            if (r == 0.0 && i >= l) continue;
            d[l] -= p;
            e[l] = g;
            e[m] = 0.0;
        }
    }

    /* Sort nodes ascending */
    for (int i = 0; i < n - 1; i++) {
        int k = i;
        for (int j = i + 1; j < n; j++) {
            if (d[j] < d[k]) k = j;
        }
        if (k != i) {
            double td = d[i]; d[i] = d[k]; d[k] = td;
            double tv = v0[i]; v0[i] = v0[k]; v0[k] = tv;
        }
    }

    /* Symmetrize exact odd/even pairs and compute log weights */
    for (int i = 0; i < n; i++) {
        theta_q[i] = d[i];
        double w = v0[i] * v0[i];
        log_w_q[i] = (w > 0.0) ? log(w) : -700.0;
    }

    free(d);
    free(e);
    free(v0);
    return 1;
}

/* --------------------------------------------------------------------------
 * Model & workspace lifecycle
 * -------------------------------------------------------------------------- */
int grm_model_init(GrmModel *m, const Dataset *ds, int n_quad) {
    memset(m, 0, sizeof(*m));
    m->ds = ds;
    m->n_quad = n_quad;
    m->dim = 4 * ds->n_charts + 1;
    m->theta_q = (double *)malloc((size_t)n_quad * sizeof(double));
    m->log_w_q = (double *)malloc((size_t)n_quad * sizeof(double));
    if (!m->theta_q || !m->log_w_q) {
        grm_model_free(m);
        return 0;
    }
    if (!gauss_hermite_normal(n_quad, m->theta_q, m->log_w_q)) {
        grm_model_free(m);
        return 0;
    }
    double lsum = 0.0;
    int lcnt = 0;
    for (int j = 0; j < ds->n_charts; j++) {
        if (!ds->charts[j].is_gimmick) {
            lsum += ds->charts[j].level_num;
            lcnt++;
        }
    }
    m->level_mean = (lcnt > 0) ? (lsum / (double)lcnt) : 0.0;
    return 1;
}

void grm_model_free(GrmModel *m) {
    if (!m) return;
    free(m->theta_q);
    free(m->log_w_q);
    memset(m, 0, sizeof(*m));
}

static void *alloc_aligned32(size_t bytes) {
    size_t padded = (bytes + 31U) & ~31U;
#ifdef _WIN32
    return _aligned_malloc(padded, 32);
#else
    void *ptr = NULL;
    if (posix_memalign(&ptr, 32, padded) != 0) return NULL;
    return ptr;
#endif
}

static void free_aligned32(void *ptr) {
#ifdef _WIN32
    _aligned_free(ptr);
#else
    free(ptr);
#endif
}

int grm_workspace_init(GrmWorkspace *ws, const GrmModel *m, int n_threads) {
    memset(ws, 0, sizeof(*ws));
    int J = m->ds->n_charts;
    int Q = m->n_quad;
    int QP = (Q + 3) & ~3;
    if (n_threads < 1) n_threads = 1;
    ws->n_charts = J;
    ws->n_quad = Q;
    ws->q_pad = QP;
    ws->dim = m->dim;
    ws->n_threads = n_threads;

    size_t lut_elems = 4ULL * (size_t)J * (size_t)QP;
    ws->alpha       = (double *)alloc_aligned32((size_t)J * sizeof(double));
    ws->c1          = (double *)alloc_aligned32((size_t)J * (size_t)QP * sizeof(double));
    ws->c2          = (double *)alloc_aligned32((size_t)J * (size_t)QP * sizeof(double));
    ws->c3          = (double *)alloc_aligned32((size_t)J * (size_t)QP * sizeof(double));
    ws->log_p       = (double *)alloc_aligned32(lut_elems * sizeof(double));
    ws->d_log_p     = (double *)alloc_aligned32((size_t)n_threads * lut_elems * sizeof(double));
    ws->g_log_alpha = (double *)alloc_aligned32((size_t)J * sizeof(double));

    if (!ws->alpha || !ws->c1 || !ws->c2 || !ws->c3 ||
        !ws->log_p || !ws->d_log_p || !ws->g_log_alpha) {
        grm_workspace_free(ws);
        return 0;
    }
    memset(ws->log_p, 0, lut_elems * sizeof(double));
    return 1;
}

void grm_workspace_free(GrmWorkspace *ws) {
    if (!ws) return;
    free_aligned32(ws->alpha);
    free_aligned32(ws->c1);
    free_aligned32(ws->c2);
    free_aligned32(ws->c3);
    free_aligned32(ws->log_p);
    free_aligned32(ws->d_log_p);
    free_aligned32(ws->g_log_alpha);
    memset(ws, 0, sizeof(*ws));
}

/* --------------------------------------------------------------------------
 * Orthonormal zero-sum Householder contrast: lac[J-1] -> alpha[J]
 * Matches scripts/pipeline.py lines 254-258:
 *   x = [lac, 0], u = 1/sqrt(J), v = e_{J-1} - u
 *   log_alpha = x - 2 * v * (v . x) / (v . v)
 * -------------------------------------------------------------------------- */
void grm_compute_alpha(const double *lac, int n_charts, double *alpha_out) {
    double u = 1.0 / sqrt((double)n_charts);
    double v_dot_v = 2.0 * (1.0 - u);
    double sum_lac = 0.0;
    for (int j = 0; j < n_charts - 1; j++) sum_lac += lac[j];
    double v_dot_x = -u * sum_lac;
    double scale = 2.0 * v_dot_x / v_dot_v; /* subtract scale * v */

    for (int j = 0; j < n_charts - 1; j++) {
        /* v[j] = -u => x[j] - scale*(-u) = x[j] + scale*u */
        alpha_out[j] = exp(lac[j] + scale * u);
    }
    /* v[J-1] = 1 - u, x[J-1] = 0 */
    alpha_out[n_charts - 1] = exp(-scale * (1.0 - u));
}

void grm_init_params(const GrmModel *m, double *x_out) {
    int J = m->ds->n_charts;
    const ChartMeta *charts = m->ds->charts;
    x_out[0] = -3.0 + 0.2 * m->level_mean; /* prior_a_c = prior_a + prior_b * level_mean */
    x_out[1] =  0.2;                        /* prior_b */

    double *delta    = x_out + 2;
    double *log_tau1 = x_out + 2 + J;
    double *log_tau2 = x_out + 2 + 2 * J;
    double *lac      = x_out + 2 + 3 * J;

    double log_08 = log(0.8);
    for (int j = 0; j < J; j++) {
        delta[j] = charts[j].is_gimmick ? 0.0 : (-3.0 + 0.2 * charts[j].level_num);
        log_tau1[j] = log_08;
        log_tau2[j] = log_08;
    }
    for (int j = 0; j < J - 1; j++) {
        lac[j] = 0.0;
    }
}

void grm_init_inv_mass(const GrmModel *m, double *inv_mass_out, double *sqrt_mass_out) {
    const int J = m->ds->n_charts;
    const ChartMeta *charts = m->ds->charts;
    const double lmean = m->level_mean;
    double prec_a = 1.0 / 4.0;
    double prec_b = 1.0 / 0.04 + (lmean * lmean) / 4.0;
    for (int j = 0; j < J; j++) {
        if (!charts[j].is_gimmick) {
            double dl = charts[j].level_num - lmean;
            prec_a += 1.0 / 1.44;
            prec_b += (dl * dl) / 1.44;
        }
    }
    inv_mass_out[0] = 1.0 / prec_a;
    inv_mass_out[1] = 1.0 / prec_b;
    /* Reasonable initial posterior variances for delta, log_tau1, log_tau2, lac */
    for (int j = 0; j < J; j++) {
        double n_eff = (double)(charts[j].n > 0 ? charts[j].n : 1);
        double iv_d = 1.0 / ((charts[j].is_gimmick ? (1.0 / 9.0) : (1.0 / 1.44)) + 0.15 * n_eff);
        inv_mass_out[2 + j]         = iv_d;
        inv_mass_out[2 + J + j]     = 0.15;
        inv_mass_out[2 + 2 * J + j] = 0.15;
    }
    for (int j = 0; j < J - 1; j++) {
        inv_mass_out[2 + 3 * J + j] = 0.06;
    }
    for (int i = 0; i < m->dim; i++) {
        sqrt_mass_out[i] = 1.0 / sqrt(inv_mass_out[i]);
    }
}

/* --------------------------------------------------------------------------
 * Numerically exact sigmoid + log(sigmoid(u)) + log(sigmoid(-u))
 * -------------------------------------------------------------------------- */
static inline void sigmoid_logs(double u, double *c_out, double *lsp_out, double *lsm_out) {
    if (u >= 0.0) {
        double e = exp(-u);
        double lp = -log1p(e);
        *c_out   = 1.0 / (1.0 + e);
        *lsp_out = lp;
        *lsm_out = -u + lp;
    } else {
        double e = exp(u);
        double lm = -log1p(e);
        *c_out   = e / (1.0 + e);
        *lsm_out = lm;
        *lsp_out = u + lm;
    }
}

static inline double log_expm1_pos(double d) {
    if (d > 35.0) return d;
    return log(expm1(d));
}

static inline double inv_1m_exp_neg(double d) {
    if (d > 35.0) return 1.0;
    return -1.0 / expm1(-d);
}

/* Fast accurate -log(1 + e) for e >= 0 */
static inline double neg_log1p_fast(double e) {
    if (e < 1e-4) return -e * (1.0 - e * (0.5 - e * (1.0 / 3.0)));
    return -log(1.0 + e);
}

/* --------------------------------------------------------------------------
 * Fused GRM log posterior density + exact analytic gradient
 * -------------------------------------------------------------------------- */
double grm_logp_and_grad(
    const GrmModel *m,
    GrmWorkspace *ws,
    const double *restrict x,
    double *restrict grad_out
) {
    const Dataset *ds = m->ds;
    const int J = ds->n_charts;
    const int P = ds->n_players;
    const int Q = m->n_quad;
    const int QP = ws->q_pad;
    const double *restrict theta_q = m->theta_q;
    const double *restrict log_w_q = m->log_w_q;

    const double prior_a = x[0];
    const double prior_b = x[1];
    const double *restrict delta    = x + 2;
    const double *restrict log_tau1 = x + 2 + J;
    const double *restrict log_tau2 = x + 2 + 2 * J;
    const double *restrict lac      = x + 2 + 3 * J;

    if (!isfinite(prior_a) || !isfinite(prior_b)) return -INFINITY;

    /* 1. Compute alpha via Householder contrast & validate parameter bounds */
    double u_h = 1.0 / sqrt((double)J);
    double v_dot_v = 2.0 * (1.0 - u_h);
    double sum_lac = 0.0;
    for (int j = 0; j < J - 1; j++) {
        double lj = lac[j];
        if (!isfinite(lj) || fabs(lj) > 25.0) return -INFINITY;
        sum_lac += lj;
    }
    double scale_h = 2.0 * (-u_h * sum_lac) / v_dot_v;
    double *restrict alpha = ws->alpha;

    for (int j = 0; j < J - 1; j++) {
        double la = lac[j] + scale_h * u_h;
        if (fabs(la) > 20.0) return -INFINITY;
        alpha[j] = exp(la);
    }
    {
        double la = -scale_h * (1.0 - u_h);
        if (fabs(la) > 20.0) return -INFINITY;
        alpha[J - 1] = exp(la);
    }

    /* 2. Build per-chart log-probability LUT: log_p[(j*4 + k) * QP + q] */
    double *restrict c1_all = ws->c1;
    double *restrict c2_all = ws->c2;
    double *restrict c3_all = ws->c3;
    double *restrict log_p  = ws->log_p;
    const int T = ws->n_threads;
    int bad_param = 0;

    #pragma omp parallel for schedule(static) num_threads(T) if(T > 1)
    for (int j = 0; j < J; j++) {
        double lt1 = log_tau1[j];
        double lt2 = log_tau2[j];
        double dj  = delta[j];
        if (!isfinite(dj) || !isfinite(lt1) || !isfinite(lt2) ||
            lt1 > 20.0 || lt1 < -30.0 || lt2 > 20.0 || lt2 < -30.0) {
            #pragma omp atomic write
            bad_param = 1;
            continue;
        }
        double a  = alpha[j];
        double t1 = exp(lt1);
        double t2 = exp(lt2);
        double b2 = dj - t2;
        double b1 = b2 - t1;

        double d1 = a * t1;
        double d2 = a * t2;
        if (d1 <= 1e-15 || d2 <= 1e-15) {
            #pragma omp atomic write
            bad_param = 1;
            continue;
        }
        double le1 = log_expm1_pos(d1);
        double le2 = log_expm1_pos(d2);
        double ed1 = exp(-d1);
        double ed2 = exp(-d2);

        double *restrict c1_row = c1_all + (size_t)j * (size_t)QP;
        double *restrict c2_row = c2_all + (size_t)j * (size_t)QP;
        double *restrict c3_row = c3_all + (size_t)j * (size_t)QP;

        double *restrict lp0 = log_p + ((size_t)j * 4U + 0U) * (size_t)QP;
        double *restrict lp1 = log_p + ((size_t)j * 4U + 1U) * (size_t)QP;
        double *restrict lp2 = log_p + ((size_t)j * 4U + 2U) * (size_t)QP;
        double *restrict lp3 = log_p + ((size_t)j * 4U + 3U) * (size_t)QP;

        for (int q = 0; q < Q; q++) {
            double th = theta_q[q];
            double u1 = a * (b1 - th);
            double u2 = u1 + d1;
            double u3 = u2 + d2;
            double c1, lsp1, c2, lsp2, lsm2, c3, lsm3;

            if (u1 > 50.0) {
                /* Exact to >20 digits (exp(-50) < 2e-22) with zero libm calls */
                c1 = c2 = c3 = 1.0;
                lsp1 = lsp2 = 0.0;
                lsm2 = -u2;
                lsm3 = -u3;
            } else if (u3 < -50.0) {
                c1 = c2 = c3 = 0.0;
                lsp1 = u1;
                lsp2 = u2;
                lsm2 = lsm3 = 0.0;
            } else if (u1 >= -10.0) {
                /* 1-exp fast path: 3x fewer exp() calls, >12 digits precision */
                double e1 = exp(-u1);
                double e2 = e1 * ed1;
                double e3 = e2 * ed2;
                c1 = 1.0 / (1.0 + e1);
                c2 = 1.0 / (1.0 + e2);
                c3 = 1.0 / (1.0 + e3);
                lsp1 = neg_log1p_fast(e1);
                lsp2 = neg_log1p_fast(e2);
                lsm2 = -u2 + lsp2;
                lsm3 = -u3 + neg_log1p_fast(e3);
            } else {
                double lsm1, lsp3;
                sigmoid_logs(u1, &c1, &lsp1, &lsm1);
                sigmoid_logs(u2, &c2, &lsp2, &lsm2);
                sigmoid_logs(u3, &c3, &lsp3, &lsm3);
            }

            c1_row[q] = c1;
            c2_row[q] = c2;
            c3_row[q] = c3;

            lp0[q] = lsp1;
            lp1[q] = lsp1 + lsm2 + le1;
            lp2[q] = lsp2 + lsm3 + le2;
            lp3[q] = lsm3;
        }
    }
    if (bad_param) return -INFINITY;

    /* 3. Fused player loop: forward marginal log-likelihood + active-node backward scatter */
    const size_t lut_elems = 4ULL * (size_t)J * (size_t)QP;
    double *restrict d_log_p = ws->d_log_p;
    const int *restrict p_off = ds->player_offsets;
    const uint32_t *restrict codes = ds->obs_code;

    double total_lp = 0.0;

    if (T <= 1) {
        memset(d_log_p, 0, lut_elems * sizeof(double));
        __attribute__((aligned(32))) double lp_buf[256];
        __attribute__((aligned(32))) double w_buf[256];
        double *lp = (QP <= 256) ? lp_buf : (double *)alloc_aligned32((size_t)QP * sizeof(double));
        double *w  = (QP <= 256) ? w_buf  : (double *)alloc_aligned32((size_t)QP * sizeof(double));

        for (int p = 0; p < P; p++) {
            int s = p_off[p];
            int e = p_off[p + 1];
            if (s == e) continue;

            for (int q = 0; q < Q; q++) lp[q] = log_w_q[q];
            for (int q = Q; q < QP; q++) lp[q] = 0.0;

            for (int k = s; k < e; k++) {
                const double *restrict row = log_p + (size_t)codes[k] * (size_t)QP;
                for (int q = 0; q < QP; q++) lp[q] += row[q];
            }

            double max_lp = lp[0];
            for (int q = 1; q < Q; q++) {
                if (lp[q] > max_lp) max_lp = lp[q];
            }
            if (!isfinite(max_lp)) {
                if (QP > 256) { free_aligned32(lp); free_aligned32(w); }
                return -INFINITY;
            }

            /* Active non-zero quadrature range (omitted weights < exp(-40) = 4.2e-18) */
            double thresh = max_lp - 40.0;
            int q_lo = 0;
            while (q_lo < Q && lp[q_lo] < thresh) q_lo++;
            int q_hi = Q;
            while (q_hi > q_lo && lp[q_hi - 1] < thresh) q_hi--;

            double sum_w = 0.0;
            for (int q = q_lo; q < q_hi; q++) {
                double e_q = exp(lp[q] - max_lp);
                w[q] = e_q;
                sum_w += e_q;
            }
            total_lp += max_lp + log(sum_w);

            double inv_sum = 1.0 / sum_w;
            for (int q = q_lo; q < q_hi; q++) w[q] *= inv_sum;

            for (int k = s; k < e; k++) {
                double *restrict drow = d_log_p + (size_t)codes[k] * (size_t)QP;
                for (int q = q_lo; q < q_hi; q++) drow[q] += w[q];
            }
        }
        if (QP > 256) { free_aligned32(lp); free_aligned32(w); }
    } else {
        int nan_hit = 0;
        #pragma omp parallel num_threads(T) reduction(+:total_lp)
        {
            int tid = 0;
            #ifdef _OPENMP
            tid = omp_get_thread_num();
            #endif
            double *restrict d_local = d_log_p + (size_t)tid * lut_elems;
            memset(d_local, 0, lut_elems * sizeof(double));

            __attribute__((aligned(32))) double lp_buf[256];
            __attribute__((aligned(32))) double w_buf[256];
            double *lp = (QP <= 256) ? lp_buf : (double *)alloc_aligned32((size_t)QP * sizeof(double));
            double *w  = (QP <= 256) ? w_buf  : (double *)alloc_aligned32((size_t)QP * sizeof(double));

            #pragma omp for schedule(dynamic, 32)
            for (int p = 0; p < P; p++) {
                int s = p_off[p];
                int e = p_off[p + 1];
                if (s == e) continue;

                for (int q = 0; q < Q; q++) lp[q] = log_w_q[q];
                for (int q = Q; q < QP; q++) lp[q] = 0.0;

                for (int k = s; k < e; k++) {
                    const double *restrict row = log_p + (size_t)codes[k] * (size_t)QP;
                    for (int q = 0; q < QP; q++) lp[q] += row[q];
                }

                double max_lp = lp[0];
                for (int q = 1; q < Q; q++) {
                    if (lp[q] > max_lp) max_lp = lp[q];
                }
                if (!isfinite(max_lp)) {
                    #pragma omp atomic write
                    nan_hit = 1;
                    continue;
                }

                double thresh = max_lp - 40.0;
                int q_lo = 0;
                while (q_lo < Q && lp[q_lo] < thresh) q_lo++;
                int q_hi = Q;
                while (q_hi > q_lo && lp[q_hi - 1] < thresh) q_hi--;

                double sum_w = 0.0;
                for (int q = q_lo; q < q_hi; q++) {
                    double e_q = exp(lp[q] - max_lp);
                    w[q] = e_q;
                    sum_w += e_q;
                }
                total_lp += max_lp + log(sum_w);

                double inv_sum = 1.0 / sum_w;
                for (int q = q_lo; q < q_hi; q++) w[q] *= inv_sum;

                for (int k = s; k < e; k++) {
                    double *restrict drow = d_local + (size_t)codes[k] * (size_t)QP;
                    for (int q = q_lo; q < q_hi; q++) drow[q] += w[q];
                }
            }

            if (QP > 256) { free_aligned32(lp); free_aligned32(w); }

            /* Reduce thread-local d_log_p slices into slice 0 in parallel */
            #pragma omp for schedule(static)
            for (size_t idx = 0; idx < lut_elems; idx++) {
                double acc = d_log_p[idx];
                for (int t = 1; t < T; t++) {
                    acc += d_log_p[(size_t)t * lut_elems + idx];
                }
                d_log_p[idx] = acc;
            }
        }
        if (nan_hit) return -INFINITY;
    }

    /* 4. Per-chart chain rule + priors + Jacobians
     * x[0] = prior_a_c = prior_a + prior_b * level_mean (orthogonal to prior_b, Jacobian = 1). */
    const double lmean = m->level_mean;
    const double prior_a_orig = prior_a - lmean * prior_b;
    double g_pa_prior = -(prior_a_orig + 3.0) / 4.0;
    double g_pa = g_pa_prior;
    double g_pb = -(prior_b - 0.2) / 0.04 - lmean * g_pa_prior;
    total_lp += -0.5 * ((prior_a_orig + 3.0) * (prior_a_orig + 3.0) / 4.0);
    total_lp += -0.5 * ((prior_b - 0.2) * (prior_b - 0.2) / 0.04);

    double *restrict g_delta    = grad_out + 2;
    double *restrict g_log_tau1 = grad_out + 2 + J;
    double *restrict g_log_tau2 = grad_out + 2 + 2 * J;
    double *restrict g_lac      = grad_out + 2 + 3 * J;
    double *restrict g_log_alpha = ws->g_log_alpha;

    const ChartMeta *charts = ds->charts;

    #pragma omp parallel for schedule(static) reduction(+:total_lp, g_pa, g_pb) num_threads(T) if(T > 1)
    for (int j = 0; j < J; j++) {
        double a  = alpha[j];
        double t1 = exp(log_tau1[j]);
        double t2 = exp(log_tau2[j]);
        double b3 = delta[j];
        double b2 = b3 - t2;
        double b1 = b2 - t1;

        double inv1 = inv_1m_exp_neg(a * t1);
        double inv2 = inv_1m_exp_neg(a * t2);

        const double *restrict c1_row = c1_all + (size_t)j * (size_t)QP;
        const double *restrict c2_row = c2_all + (size_t)j * (size_t)QP;
        const double *restrict c3_row = c3_all + (size_t)j * (size_t)QP;

        const double *restrict dp0 = d_log_p + ((size_t)j * 4U + 0U) * (size_t)QP;
        const double *restrict dp1 = d_log_p + ((size_t)j * 4U + 1U) * (size_t)QP;
        const double *restrict dp2 = d_log_p + ((size_t)j * 4U + 2U) * (size_t)QP;
        const double *restrict dp3 = d_log_p + ((size_t)j * 4U + 3U) * (size_t)QP;

        double gd = 0.0, gt1 = 0.0, gt2 = 0.0, ga = 0.0;
        for (int q = 0; q < Q; q++) {
            double c1 = c1_row[q];
            double c2 = c2_row[q];
            double c3 = c3_row[q];
            double w0 = dp0[q];
            double w1 = dp1[q];
            double w2 = dp2[q];
            double w3 = dp3[q];

            double gu1 = w0 * (1.0 - c1) + w1 * ((1.0 - c1) - inv1);
            double gu2 = w1 * (inv1 - c2) + w2 * ((1.0 - c2) - inv2);
            double gu3 = w2 * (inv2 - c3) - w3 * c3;

            double th = theta_q[q];
            gd  += gu1 + gu2 + gu3;
            gt2 += gu1 + gu2;
            gt1 += gu1;
            ga  += gu1 * (b1 - th) + gu2 * (b2 - th) + gu3 * (b3 - th);
        }

        double g_d_lik  = a * gd;
        double g_t2_lik = -a * gt2;
        double g_t1_lik = -a * gt1;

        /* Priors on delta[j] */
        int gimm = charts[j].is_gimmick;
        double dl = charts[j].level_num - lmean;
        double loc = gimm ? 0.0 : (prior_a + prior_b * dl);
        double inv_var = gimm ? (1.0 / 9.0) : (1.0 / 1.44);
        double diff = b3 - loc;

        total_lp += -0.5 * diff * diff * inv_var;
        g_delta[j] = g_d_lik - diff * inv_var;
        if (!gimm) {
            double g_loc = diff * inv_var;
            g_pa += g_loc;
            g_pb += g_loc * dl;
        }

        /* HalfNormal(1.0) priors + log-transform Jacobians on tau1, tau2 */
        total_lp += -0.5 * t1 * t1 + log_tau1[j];
        total_lp += -0.5 * t2 * t2 + log_tau2[j];
        g_log_tau1[j] = g_t1_lik * t1 - t1 * t1 + 1.0;
        g_log_tau2[j] = g_t2_lik * t2 - t2 * t2 + 1.0;

        /* d(log L)/d(log alpha[j]) */
        g_log_alpha[j] = ga * a;
    }

    grad_out[0] = g_pa;
    grad_out[1] = g_pb;

    /* 5. Householder adjoint + Normal(0, 0.3) prior on lac[0..J-2] */
    double sum_gla = 0.0;
    for (int j = 0; j < J; j++) sum_gla += g_log_alpha[j];
    double v_dot_gla = g_log_alpha[J - 1] - u_h * sum_gla;
    double scale_g = 2.0 * v_dot_gla / v_dot_v;

    const double inv_lac_var = 1.0 / 0.09;
    for (int j = 0; j < J - 1; j++) {
        double lj = lac[j];
        total_lp += -0.5 * lj * lj * inv_lac_var;
        g_lac[j] = g_log_alpha[j] + scale_g * u_h - lj * inv_lac_var;
    }

    if (!isfinite(total_lp)) return -INFINITY;
    return total_lp;
}

/* --------------------------------------------------------------------------
 * Fast per-chart-LUT EAP player ability recovery (e.g. 101-point quadrature)
 * -------------------------------------------------------------------------- */
int grm_eap_theta(
    const Dataset *ds,
    const double *alpha,
    const double *b_normal,
    const double *b_hard,
    const double *b_vhard,
    int n_quad,
    double *theta_eap_out,
    double *theta_se_out
) {
    const int J = ds->n_charts;
    const int P = ds->n_players;
    const int Q = n_quad;

    double *theta_q = (double *)malloc((size_t)Q * sizeof(double));
    double *log_w_q = (double *)malloc((size_t)Q * sizeof(double));
    double *log_p   = (double *)malloc(4ULL * (size_t)J * (size_t)Q * sizeof(double));
    if (!theta_q || !log_w_q || !log_p) {
        free(theta_q); free(log_w_q); free(log_p);
        return 0;
    }

    if (!gauss_hermite_normal(Q, theta_q, log_w_q)) {
        free(theta_q); free(log_w_q); free(log_p);
        return 0;
    }

    /* Build per-chart LUT (5 MB at Q=101 vs 580 MB in naive Python!) */
    for (int j = 0; j < J; j++) {
        double a  = alpha[j];
        double b1 = b_normal[j];
        double b2 = b_hard[j];
        double b3 = b_vhard[j];
        double d1 = a * (b2 - b1);
        double d2 = a * (b3 - b2);
        double le1 = (d1 > 1e-15) ? log_expm1_pos(d1) : -69.07755278982137;
        double le2 = (d2 > 1e-15) ? log_expm1_pos(d2) : -69.07755278982137;

        double *lp0 = log_p + ((size_t)j * 4U + 0U) * (size_t)Q;
        double *lp1 = log_p + ((size_t)j * 4U + 1U) * (size_t)Q;
        double *lp2 = log_p + ((size_t)j * 4U + 2U) * (size_t)Q;
        double *lp3 = log_p + ((size_t)j * 4U + 3U) * (size_t)Q;

        for (int q = 0; q < Q; q++) {
            double th = theta_q[q];
            double c1, lsp1, lsm1, c2, lsp2, lsm2, c3, lsp3, lsm3;
            sigmoid_logs(a * (b1 - th), &c1, &lsp1, &lsm1);
            sigmoid_logs(a * (b2 - th), &c2, &lsp2, &lsm2);
            sigmoid_logs(a * (b3 - th), &c3, &lsp3, &lsm3);
            lp0[q] = lsp1;
            lp1[q] = lsp1 + lsm2 + le1;
            lp2[q] = lsp2 + lsm3 + le2;
            lp3[q] = lsm3;
        }
    }

    const int *p_off = ds->player_offsets;
    const uint32_t *codes = ds->obs_code;

    #pragma omp parallel for schedule(static)
    for (int p = 0; p < P; p++) {
        double lp[256];
        double *lpp = (Q <= 256) ? lp : (double *)malloc((size_t)Q * sizeof(double));
        for (int q = 0; q < Q; q++) lpp[q] = log_w_q[q];

        int s = p_off[p];
        int e = p_off[p + 1];
        for (int k = s; k < e; k++) {
            const double *row = log_p + (size_t)codes[k] * (size_t)Q;
            for (int q = 0; q < Q; q++) lpp[q] += row[q];
        }

        double max_lp = lpp[0];
        for (int q = 1; q < Q; q++) if (lpp[q] > max_lp) max_lp = lpp[q];

        double sum_w = 0.0, mean = 0.0;
        for (int q = 0; q < Q; q++) {
            double w = exp(lpp[q] - max_lp);
            lpp[q] = w;
            sum_w += w;
            mean += w * theta_q[q];
        }
        mean /= sum_w;

        double var = 0.0;
        for (int q = 0; q < Q; q++) {
            double d = theta_q[q] - mean;
            var += lpp[q] * d * d;
        }
        var /= sum_w;

        theta_eap_out[p] = mean;
        theta_se_out[p] = sqrt(var > 0.0 ? var : 0.0);
        if (Q > 256) free(lpp);
    }

    free(theta_q);
    free(log_w_q);
    free(log_p);
    return 1;
}
