#ifndef QUESTIMATOR_NUTS_H
#define QUESTIMATOR_NUTS_H

#include "grm.h"
#include <stdint.h>

typedef struct {
    int num_chains;
    int inner_threads; /* threads per chain (0 = auto) */
    int num_warmup;
    int num_samples;
    int max_tree_depth;
    double target_accept;
    uint64_t seed;
    int verbose;
} NutsConfig;

typedef struct {
    int num_chains;
    int num_samples;
    int dim;

    /* Unconstrained posterior draws: shape [num_chains][num_samples][dim] */
    double *samples;

    /* NUTS transition statistics (post-warmup only) */
    int total_divergences;
    double mean_num_steps;
    int max_num_steps;
    double mean_tree_depth;
    int max_tree_depth_hit;
    double mean_accept_prob;
    double *final_step_sizes; /* length num_chains */
} NutsResult;

int nuts_run(const GrmModel *model, const NutsConfig *cfg, NutsResult *out);
void nuts_result_free(NutsResult *res);

#endif /* QUESTIMATOR_NUTS_H */
