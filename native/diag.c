#include "diag.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#ifdef _OPENMP
#include <omp.h>
#endif

/* Minimal iterative radix-2 Cooley-Tukey complex FFT (power-of-2 length n) */
static void fft_radix2(double *re, double *im, int n, int inverse) {
    for (int i = 1, j = 0; i < n; i++) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            double tr = re[i]; re[i] = re[j]; re[j] = tr;
            double ti = im[i]; im[i] = im[j]; im[j] = ti;
        }
    }

    const double pi = 3.1415926535897932384626433832795;
    for (int len = 2; len <= n; len <<= 1) {
        double ang = (inverse ? 2.0 : -2.0) * pi / (double)len;
        double wlen_r = cos(ang);
        double wlen_i = sin(ang);
        for (int i = 0; i < n; i += len) {
            double wr = 1.0, wi = 0.0;
            int half = len >> 1;
            for (int j = 0; j < half; j++) {
                int u = i + j;
                int v = u + half;
                double vr = re[v] * wr - im[v] * wi;
                double vi = re[v] * wi + im[v] * wr;
                re[v] = re[u] - vr;
                im[v] = im[u] - vi;
                re[u] += vr;
                im[u] += vi;
                double nwr = wr * wlen_r - wi * wlen_i;
                wi = wr * wlen_i + wi * wlen_r;
                wr = nwr;
            }
        }
    }

    if (inverse) {
        double inv_n = 1.0 / (double)n;
        for (int i = 0; i < n; i++) {
            re[i] *= inv_n;
            im[i] *= inv_n;
        }
    }
}

/* Acklam's rational approximation to standard normal inverse CDF Phi^{-1}(p)
 * Relative error < 1.15e-9 across (0, 1). */
static double norm_inv_cdf(double p) {
    if (p <= 0.0) return -8.5;
    if (p >= 1.0) return  8.5;

    static const double a[6] = {
        -3.969683028665376e+01,  2.209460984245205e+02,
        -2.759285104469687e+02,  1.383577518672690e+02,
        -3.066479806614716e+01,  2.506628277459239e+00
    };
    static const double b[5] = {
        -5.447609879822406e+01,  1.615858368580409e+02,
        -1.556989798598866e+02,  6.680131188771972e+01,
        -1.328068155288572e+01
    };
    static const double c[6] = {
        -7.784894002430293e-03, -3.223964580411365e-01,
        -2.400758277161838e+00, -2.549732539343734e+00,
         4.374664141464968e+00,  2.938163982698783e+00
    };
    static const double d[4] = {
         7.784695709041462e-03,  3.224671290700398e-01,
         2.445134137142996e+00,  3.754408661907416e+00
    };

    const double p_low  = 0.02425;
    const double p_high = 1.0 - p_low;

    if (p < p_low) {
        double q = sqrt(-2.0 * log(p));
        return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
               ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1.0);
    }
    if (p <= p_high) {
        double q = p - 0.5;
        double r = q * q;
        return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q /
               (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1.0);
    }
    double q = sqrt(-2.0 * log(1.0 - p));
    return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
            ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1.0);
}

typedef struct {
    double val;
    int idx;
} ValIdx;

static int cmp_validx(const void *a, const void *b) {
    double va = ((const ValIdx *)a)->val;
    double vb = ((const ValIdx *)b)->val;
    return (va > vb) - (va < vb);
}

/* Blom rank-normalization: z_i = Phi^{-1}((rank_i - 3/8) / (N + 1/4)), with average ranks for ties.
 * Also optionally writes median, q05, q95 from the sorted draws. */
static void rank_normalize(
    const double *src, int n, ValIdx *scratch, double *dst,
    double *med_out, double *q05_out, double *q95_out
) {
    for (int i = 0; i < n; i++) {
        scratch[i].val = src[i];
        scratch[i].idx = i;
    }
    qsort(scratch, (size_t)n, sizeof(ValIdx), cmp_validx);

    if (med_out) {
        *med_out = (n % 2 == 1) ? scratch[n / 2].val
                                : 0.5 * (scratch[n / 2 - 1].val + scratch[n / 2].val);
    }
    if (q05_out) {
        int i05 = (int)floor(0.05 * (double)(n - 1));
        *q05_out = scratch[i05 < 0 ? 0 : i05].val;
    }
    if (q95_out) {
        int i95 = (int)ceil(0.95 * (double)(n - 1));
        *q95_out = scratch[i95 >= n ? n - 1 : i95].val;
    }

    const double denom = (double)n + 0.25;
    int i = 0;
    while (i < n) {
        int j = i + 1;
        while (j < n && scratch[j].val == scratch[i].val) j++;
        /* Average 1-based rank across [i, j) */
        double avg_rank = 0.5 * ((double)(i + 1) + (double)j);
        double z = norm_inv_cdf((avg_rank - 0.375) / denom);
        for (int k = i; k < j; k++) {
            dst[scratch[k].idx] = z;
        }
        i = j;
    }
}

/* Compute Gelman-Rubin R-hat and Geyer initial-monotone-sequence ESS on M chains of length L */
static void chains_rhat_ess(
    const double *z, /* length M * L, chain m at z[m * L + s] */
    int M, int L,
    int nfft,
    double *re_buf, double *im_buf, double *acov_mean,
    double *rhat_out, double *ess_out
) {
    if (L < 4) {
        if (rhat_out) *rhat_out = NAN;
        if (ess_out)  *ess_out  = (double)(M * L);
        return;
    }

    double chain_means[128];
    double *cm = (M <= 128) ? chain_means : (double *)malloc((size_t)M * sizeof(double));
    memset(acov_mean, 0, (size_t)L * sizeof(double));

    double W = 0.0;
    for (int m = 0; m < M; m++) {
        const double *zm = z + (size_t)m * (size_t)L;
        double mean = 0.0;
        for (int s = 0; s < L; s++) mean += zm[s];
        mean /= (double)L;
        cm[m] = mean;

        double ss = 0.0;
        for (int s = 0; s < L; s++) {
            double d = zm[s] - mean;
            ss += d * d;
            re_buf[s] = d;
            im_buf[s] = 0.0;
        }
        W += ss / (double)(L - 1);

        for (int s = L; s < nfft; s++) {
            re_buf[s] = 0.0;
            im_buf[s] = 0.0;
        }
        fft_radix2(re_buf, im_buf, nfft, 0);
        for (int k = 0; k < nfft; k++) {
            re_buf[k] = re_buf[k] * re_buf[k] + im_buf[k] * im_buf[k];
            im_buf[k] = 0.0;
        }
        fft_radix2(re_buf, im_buf, nfft, 1);

        double inv_l = 1.0 / (double)L;
        for (int s = 0; s < L; s++) {
            acov_mean[s] += re_buf[s] * inv_l;
        }
    }

    W /= (double)M;
    for (int s = 0; s < L; s++) acov_mean[s] /= (double)M;

    double B = 0.0;
    if (M > 1) {
        double grand = 0.0;
        for (int m = 0; m < M; m++) grand += cm[m];
        grand /= (double)M;
        double bss = 0.0;
        for (int m = 0; m < M; m++) {
            double d = cm[m] - grand;
            bss += d * d;
        }
        B = (double)L * bss / (double)(M - 1);
    }
    if (M > 128) free(cm);

    double var_plus = ((double)(L - 1) / (double)L) * W + (M > 1 ? B / (double)L : 0.0);
    if (rhat_out) {
        if (M < 2) {
            *rhat_out = NAN;
        } else {
            double denom = (W > 1e-10) ? W : 1e-10;
            *rhat_out = sqrt(var_plus / denom);
        }
    }

    if (ess_out) {
        if (!isfinite(W) || W <= 0.0 || var_plus <= 0.0) {
            *ess_out = (double)(M * L);
            return;
        }
        double sum_pairs = 0.0;
        double prev_pair = INFINITY;
        int t = 0;
        while (2 * t + 1 < L) {
            double rho0 = (t == 0) ? 1.0 : (1.0 - (W - acov_mean[2 * t]) / var_plus);
            double rho1 = 1.0 - (W - acov_mean[2 * t + 1]) / var_plus;
            double pair = rho0 + rho1;
            if (t > 0 && pair < 0.0) break;
            if (pair > prev_pair) pair = prev_pair;
            prev_pair = pair;
            sum_pairs += pair;
            t++;
        }
        double tau = -1.0 + 2.0 * sum_pairs;
        if (tau < 1.0) tau = 1.0;
        *ess_out = (double)(M * L) / tau;
    }
}

/* Vehtari et al. (2021) Split-Rank R-hat, Bulk-ESS, and Tail-ESS (5%/95% quantile indicators) */
static void param_split_rank_diag(
    const double *raw, /* C * S layout, chain c at raw[c * S + s] */
    int C, int S,
    int nfft,
    double *split_buf, double *work_buf, ValIdx *sort_buf,
    double *re_buf, double *im_buf, double *acov_buf,
    double *rhat_out, double *bulk_ess_out, double *tail_ess_out
) {
    /* Split each chain into 2 equal halves when S >= 8 */
    int M, L;
    if (S >= 8) {
        M = 2 * C;
        L = S / 2;
        for (int c = 0; c < C; c++) {
            memcpy(split_buf + (size_t)(2 * c) * (size_t)L,
                   raw + (size_t)c * (size_t)S,
                   (size_t)L * sizeof(double));
            memcpy(split_buf + (size_t)(2 * c + 1) * (size_t)L,
                   raw + (size_t)c * (size_t)S + (size_t)(S - L),
                   (size_t)L * sizeof(double));
        }
    } else {
        M = C;
        L = S;
        memcpy(split_buf, raw, (size_t)M * (size_t)L * sizeof(double));
    }

    int N = M * L;
    double med = 0.0, q05 = 0.0, q95 = 0.0;

    /* 1. Bulk rank-normalized split R-hat and Bulk-ESS */
    rank_normalize(split_buf, N, sort_buf, work_buf, &med, &q05, &q95);
    double rhat_bulk = NAN, ess_bulk = (double)N;
    chains_rhat_ess(work_buf, M, L, nfft, re_buf, im_buf, acov_buf, &rhat_bulk, &ess_bulk);

    /* 2. Folded rank-normalized split R-hat around global median */
    for (int i = 0; i < N; i++) work_buf[i] = fabs(split_buf[i] - med);
    /* Re-use sort_buf; rank_normalize in-place via split_buf? Keep split_buf intact for tail-ESS */
    double *fold_z = re_buf; /* NOTE: nfft >= 2*L, may be smaller than N; use separate fold pass */
    (void)fold_z;
    /* Allocate/use rank_normalize into a dedicated buffer? Wait: rank_normalize only writes dst after reading src into sort_buf!
     * So src == dst is 100% safe! */
    rank_normalize(work_buf, N, sort_buf, work_buf, NULL, NULL, NULL);
    double rhat_fold = NAN;
    chains_rhat_ess(work_buf, M, L, nfft, re_buf, im_buf, acov_buf, &rhat_fold, NULL);

    /* 3. Tail-ESS = min(ESS(I(x <= q05)), ESS(I(x <= q95))) */
    for (int i = 0; i < N; i++) work_buf[i] = (split_buf[i] <= q05) ? 1.0 : 0.0;
    double ess_q05 = (double)N;
    chains_rhat_ess(work_buf, M, L, nfft, re_buf, im_buf, acov_buf, NULL, &ess_q05);

    for (int i = 0; i < N; i++) work_buf[i] = (split_buf[i] <= q95) ? 1.0 : 0.0;
    double ess_q95 = (double)N;
    chains_rhat_ess(work_buf, M, L, nfft, re_buf, im_buf, acov_buf, NULL, &ess_q95);

    if (isfinite(rhat_bulk) && isfinite(rhat_fold)) {
        *rhat_out = (rhat_bulk > rhat_fold) ? rhat_bulk : rhat_fold;
    } else if (isfinite(rhat_bulk)) {
        *rhat_out = rhat_bulk;
    } else {
        *rhat_out = rhat_fold;
    }
    *bulk_ess_out = ess_bulk;
    *tail_ess_out = (ess_q05 < ess_q95) ? ess_q05 : ess_q95;
}

void compute_convergence(
    const NutsResult *res,
    int n_charts,
    double level_mean,
    double r_hat_threshold,
    double ess_threshold,
    ConvergenceReport *out
) {
    memset(out, 0, sizeof(*out));
    out->r_hat_threshold = r_hat_threshold;
    out->ess_threshold = ess_threshold;

    const int C = res->num_chains;
    const int S = res->num_samples;
    const int D = res->dim;

    int L = (S >= 8) ? (S / 2) : S;
    int nfft = 2;
    while (nfft < 2 * L) nfft <<= 1;

    double *rhats     = (double *)malloc((size_t)D * sizeof(double));
    double *esses     = (double *)malloc((size_t)D * sizeof(double));
    double *tail_ess  = (double *)malloc((size_t)D * sizeof(double));

    int tau1_start = 2 + n_charts;
    int tau2_end   = 2 + 3 * n_charts; /* [tau1_start, tau2_end) are log_tau1, log_tau2 */

    #pragma omp parallel
    {
        size_t cs = (size_t)C * (size_t)S;
        double *raw_buf   = (double *)malloc(cs * sizeof(double));
        double *split_buf = (double *)malloc(cs * sizeof(double));
        double *work_buf  = (double *)malloc(cs * sizeof(double));
        ValIdx *sort_buf  = (ValIdx *)malloc(cs * sizeof(ValIdx));
        double *re_buf    = (double *)malloc((size_t)nfft * sizeof(double));
        double *im_buf    = (double *)malloc((size_t)nfft * sizeof(double));
        double *acov_buf  = (double *)malloc((size_t)S * sizeof(double));

        #pragma omp for schedule(static)
        for (int p = 0; p < D; p++) {
            int is_exp = (p >= tau1_start && p < tau2_end);
            for (int c = 0; c < C; c++) {
                const double *chain_base = res->samples + (size_t)c * (size_t)S * (size_t)D;
                double *dst = raw_buf + (size_t)c * (size_t)S;
                if (p == 0) {
                    /* Recover original prior_a = prior_a_c - level_mean * prior_b */
                    for (int s = 0; s < S; s++) {
                        const double *row = chain_base + (size_t)s * (size_t)D;
                        dst[s] = row[0] - level_mean * row[1];
                    }
                } else if (is_exp) {
                    for (int s = 0; s < S; s++) dst[s] = exp(chain_base[(size_t)s * (size_t)D + (size_t)p]);
                } else {
                    for (int s = 0; s < S; s++) dst[s] = chain_base[(size_t)s * (size_t)D + (size_t)p];
                }
            }
            param_split_rank_diag(
                raw_buf, C, S, nfft, split_buf, work_buf, sort_buf,
                re_buf, im_buf, acov_buf, &rhats[p], &esses[p], &tail_ess[p]
            );
        }

        free(raw_buf); free(split_buf); free(work_buf); free(sort_buf);
        free(re_buf); free(im_buf); free(acov_buf);
    }

    const char *block_names[6] = {
        "prior_a", "prior_b", "delta", "tau1", "tau2", "log_alpha_contrast"
    };
    int block_starts[6] = {
        0, 1, 2, 2 + n_charts, 2 + 2 * n_charts, 2 + 3 * n_charts
    };
    int block_ends[6] = {
        1, 2, 2 + n_charts, 2 + 2 * n_charts, 2 + 3 * n_charts, D
    };

    double global_rhat = 0.0;
    int has_finite_rhat = 0;
    double global_ess = INFINITY;
    double global_tail_ess = INFINITY;
    int total_bad_rhat = 0;
    int total_low_ess = 0;

    for (int b = 0; b < 6; b++) {
        BlockDiag *bd = &out->blocks[b];
        bd->name = block_names[b];
        bd->r_hat_max = NAN;
        bd->n_eff_min = INFINITY;
        bd->tail_ess_min = INFINITY;
        bd->n_bad_rhat = 0;
        bd->n_low_ess = 0;

        for (int p = block_starts[b]; p < block_ends[b]; p++) {
            double rh = rhats[p];
            double es = esses[p];
            double te = tail_ess[p];
            if (isfinite(rh)) {
                if (!isfinite(bd->r_hat_max) || rh > bd->r_hat_max) bd->r_hat_max = rh;
                if (!has_finite_rhat || rh > global_rhat) { global_rhat = rh; has_finite_rhat = 1; }
                if (rh > r_hat_threshold) { bd->n_bad_rhat++; total_bad_rhat++; }
            }
            if (es < bd->n_eff_min) bd->n_eff_min = es;
            if (es < global_ess) global_ess = es;
            if (te < bd->tail_ess_min) bd->tail_ess_min = te;
            if (te < global_tail_ess) global_tail_ess = te;
            if (es < ess_threshold) { bd->n_low_ess++; total_low_ess++; }
        }
    }

    out->r_hat_max = has_finite_rhat ? global_rhat : NAN;
    out->ess_min = global_ess;
    out->tail_ess_min = global_tail_ess;
    out->n_bad_rhat = total_bad_rhat;
    out->n_low_ess = total_low_ess;
    out->convergence_ok = ((!has_finite_rhat || global_rhat < r_hat_threshold) && (global_ess >= ess_threshold));

    free(rhats);
    free(esses);
    free(tail_ess);
}
