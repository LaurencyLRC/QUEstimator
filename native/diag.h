#ifndef QUESTIMATOR_DIAG_H
#define QUESTIMATOR_DIAG_H

#include "nuts.h"

typedef struct {
    const char *name;
    double r_hat_max;
    double n_eff_min;
    int n_bad_rhat;
    int n_low_ess;
} BlockDiag;

typedef struct {
    double r_hat_max;
    double ess_min;
    int convergence_ok;
    int n_bad_rhat;
    int n_low_ess;
    double r_hat_threshold;
    double ess_threshold;

    /* 6 blocks matching pipeline.py: prior_a, prior_b, delta, tau1, tau2, log_alpha_contrast */
    BlockDiag blocks[6];
} ConvergenceReport;

void compute_convergence(
    const NutsResult *res,
    int n_charts,
    double level_mean,
    double r_hat_threshold,
    double ess_threshold,
    ConvergenceReport *out
);

#endif /* QUESTIMATOR_DIAG_H */
