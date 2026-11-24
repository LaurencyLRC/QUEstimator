#include "diag.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#ifdef _OPENMP
#include <omp.h>
#endif

/* Minimal iterative radix-2 Cooley-Tukey complex FFT (power-of-2 length n) */
static void fft_radix2(double *re, double *im, int n, int inverse) {
    /* Bit-reversal permutation */
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

/* Compute Gelman-Rubin R-hat and Geyer initial-monotone-sequence ESS
 * for one scalar parameter given draws z[C][S]. Matches pipeline.py:_rhat_numpy & _ess_numpy. */
static void param_rhat_ess(
    const double *z, /* length C * S, chain c at z[c * S + s] */
    int C, int S,
    int nfft,
    double *re_buf, double *im_buf, double *acov_mean,
    double *rhat_out, double *ess_out
) {
    if (S < 4) {
        *rhat_out = NAN;
        *ess_out = (double)(C * S);
        return;
    }

    double chain_means[64];
    double *cm = (C <= 64) ? chain_means : (double *)malloc((size_t)C * sizeof(double));
    memset(acov_mean, 0, (size_t)S * sizeof(double));

    double W = 0.0;
    for (int c = 0; c < C; c++) {
        const double *zc = z + (size_t)c * (size_t)S;
        double mean = 0.0;
        for (int s = 0; s < S; s++) mean += zc[s];
        mean /= (double)S;
        cm[c] = mean;

        double ss = 0.0;
        for (int s = 0; s < S; s++) {
            double d = zc[s] - mean;
            ss += d * d;
            re_buf[s] = d;
            im_buf[s] = 0.0;
        }
        W += ss / (double)(S - 1);

        for (int s = S; s < nfft; s++) {
            re_buf[s] = 0.0;
            im_buf[s] = 0.0;
        }
        fft_radix2(re_buf, im_buf, nfft, 0);
        for (int k = 0; k < nfft; k++) {
            re_buf[k] = re_buf[k] * re_buf[k] + im_buf[k] * im_buf[k];
            im_buf[k] = 0.0;
        }
        fft_radix2(re_buf, im_buf, nfft, 1);

        double inv_s = 1.0 / (double)S;
        for (int s = 0; s < S; s++) {
            acov_mean[s] += re_buf[s] * inv_s;
        }
    }

    W /= (double)C;
    for (int s = 0; s < S; s++) acov_mean[s] /= (double)C;

    double B = 0.0;
    if (C > 1) {
        double grand = 0.0;
        for (int c = 0; c < C; c++) grand += cm[c];
        grand /= (double)C;
        double bss = 0.0;
        for (int c = 0; c < C; c++) {
            double d = cm[c] - grand;
            bss += d * d;
        }
        B = (double)S * bss / (double)(C - 1);
    }
    if (C > 64) free(cm);

    double var_plus = ((double)(S - 1) / (double)S) * W + (C > 1 ? B / (double)S : 0.0);
    if (C < 2) {
        *rhat_out = NAN;
    } else {
        double denom = (W > 1e-10) ? W : 1e-10;
        *rhat_out = sqrt(var_plus / denom);
    }

    if (!isfinite(W) || W <= 0.0 || var_plus <= 0.0) {
        *ess_out = (double)(C * S);
        return;
    }

    /* Geyer initial positive + monotone sequence */
    double sum_pairs = 0.0;
    double prev_pair = INFINITY;
    int t = 0;
    while (2 * t + 1 < S) {
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
    *ess_out = (double)(C * S) / tau;
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

    int nfft = 2;
    while (nfft < 2 * S) nfft <<= 1;

    double *rhats = (double *)malloc((size_t)D * sizeof(double));
    double *esses = (double *)malloc((size_t)D * sizeof(double));

    int tau1_start = 2 + n_charts;
    int tau2_end   = 2 + 3 * n_charts; /* [tau1_start, tau2_end) are log_tau1, log_tau2 */

    #pragma omp parallel
    {
        double *z_buf    = (double *)malloc((size_t)C * (size_t)S * sizeof(double));
        double *re_buf   = (double *)malloc((size_t)nfft * sizeof(double));
        double *im_buf   = (double *)malloc((size_t)nfft * sizeof(double));
        double *acov_buf = (double *)malloc((size_t)S * sizeof(double));

        #pragma omp for schedule(static)
        for (int p = 0; p < D; p++) {
            int is_exp = (p >= tau1_start && p < tau2_end);
            for (int c = 0; c < C; c++) {
                const double *chain_base = res->samples + (size_t)c * (size_t)S * (size_t)D;
                double *dst = z_buf + (size_t)c * (size_t)S;
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
            param_rhat_ess(z_buf, C, S, nfft, re_buf, im_buf, acov_buf, &rhats[p], &esses[p]);
        }

        free(z_buf); free(re_buf); free(im_buf); free(acov_buf);
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
    int total_bad_rhat = 0;
    int total_low_ess = 0;

    for (int b = 0; b < 6; b++) {
        BlockDiag *bd = &out->blocks[b];
        bd->name = block_names[b];
        bd->r_hat_max = NAN;
        bd->n_eff_min = INFINITY;
        bd->n_bad_rhat = 0;
        bd->n_low_ess = 0;

        for (int p = block_starts[b]; p < block_ends[b]; p++) {
            double rh = rhats[p];
            double es = esses[p];
            if (isfinite(rh)) {
                if (!isfinite(bd->r_hat_max) || rh > bd->r_hat_max) bd->r_hat_max = rh;
                if (!has_finite_rhat || rh > global_rhat) { global_rhat = rh; has_finite_rhat = 1; }
                if (rh > r_hat_threshold) { bd->n_bad_rhat++; total_bad_rhat++; }
            }
            if (es < bd->n_eff_min) bd->n_eff_min = es;
            if (es < global_ess) global_ess = es;
            if (es < ess_threshold) { bd->n_low_ess++; total_low_ess++; }
        }
    }

    out->r_hat_max = has_finite_rhat ? global_rhat : NAN;
    out->ess_min = global_ess;
    out->n_bad_rhat = total_bad_rhat;
    out->n_low_ess = total_low_ess;
    out->convergence_ok = ((!has_finite_rhat || global_rhat < r_hat_threshold) && (global_ess >= ess_threshold));

    free(rhats);
    free(esses);
}
