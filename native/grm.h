#ifndef QUESTIMATOR_GRM_H
#define QUESTIMATOR_GRM_H

#include "data.h"

/* Generate n-point Gauss-Hermite nodes and log-weights for N(0, 1).
 * Nodes are theta_q = sqrt(2) * z_q, log_w_q = log(w_q / sqrt(pi)). */
int gauss_hermite_normal(int n, double *theta_q, double *log_w_q);

/* Per-chain scratch workspace for zero-allocation logp_and_grad calls. */
typedef struct {
    int n_charts;
    int n_quad;
    int q_pad; /* multiple of 4 for 32-byte AVX2 alignment */
    int dim;   /* 4 * n_charts + 1 */
    int n_threads; /* inner OpenMP threads per chain */

    double *alpha;       /* n_charts */
    double *c1;          /* n_charts * q_pad */
    double *c2;          /* n_charts * q_pad */
    double *c3;          /* n_charts * q_pad */
    double *log_p;       /* 4 * n_charts * q_pad (32-byte aligned) */
    double *d_log_p;     /* n_threads * 4 * n_charts * q_pad (32-byte aligned) */
    double *g_log_alpha; /* n_charts */
} GrmWorkspace;

typedef struct {
    const Dataset *ds;
    int n_quad;
    double *theta_q;
    double *log_w_q;
    double level_mean; /* mean level_num of non-gimmick charts for orthogonal (prior_a_c, prior_b) */
    int dim;
} GrmModel;

int grm_model_init(GrmModel *m, const Dataset *ds, int n_quad);
void grm_model_free(GrmModel *m);

int grm_workspace_init(GrmWorkspace *ws, const GrmModel *m, int n_threads);
void grm_workspace_free(GrmWorkspace *ws);

/* Transform unconstrained x[dim] into alpha[n_charts] via zero-sum Householder contrast. */
void grm_compute_alpha(const double *lac, int n_charts, double *alpha_out);

/* Evaluate unconstrained log posterior density and its exact analytic gradient.
 * Returns -INFINITY if parameters are out of numeric range. */
double grm_logp_and_grad(
    const GrmModel *m,
    GrmWorkspace *ws,
    const double *x,
    double *grad_out
);

/* Build initial unconstrained parameter vector matching pipeline.py init_strategy. */
void grm_init_params(const GrmModel *m, double *x_out);

/* Build analytical preconditioned diagonal inverse mass matrix (eliminates prior_b stiffness). */
void grm_init_inv_mass(const GrmModel *m, double *inv_mass_out, double *sqrt_mass_out);

/* Recover player theta (EAP mean & SE) using n_quad-point Gauss-Hermite quadrature. */
int grm_eap_theta(
    const Dataset *ds,
    const double *alpha,
    const double *b_normal,
    const double *b_hard,
    const double *b_vhard,
    int n_quad,
    double *theta_eap_out,
    double *theta_se_out
);

#endif /* QUESTIMATOR_GRM_H */
