#ifndef QUESTIMATOR_DATA_H
#define QUESTIMATOR_DATA_H

#include <stddef.h>
#include <stdint.h>

typedef struct {
    int id;
    char *md5;
    char *sha512;
    char *title;
    char *artist;
    char *level;
    char *name_diff;
    char *video2;
    char *url;
    char *url_diff;
    char *comment;
    char *state;

    double level_num;
    int is_gimmick;

    /* Empirical clear counts (deduplicated per player) */
    int n_failed;
    int n_normal;
    int n_hard;
    int n_vhard;
    int n;

    /* Posterior estimates */
    double a;
    double b_normal;
    double b_hard;
    double b_vhard;
    double se_a;
    double se_b_hard;
    double se_b_vhard;
    double cov_a_bh;
    double cov_a_bv;
    double max_played_theta;
    int provisional;
} ChartMeta;

typedef struct {
    int n_charts;
    ChartMeta *charts;

    int n_players;
    char **player_ids;    /* avatarID */
    char **player_names;  /* avatarName */

    int n_obs;
    int *player_offsets;  /* length n_players + 1, CSR offsets into obs arrays */
    uint32_t *obs_code;   /* chart_idx * 4 + status, length n_obs */
    int *obs_chart;       /* chart_idx (0..n_charts-1), length n_obs */
    uint8_t *obs_status;  /* 0=FAILED, 1=NORMAL, 2=HARD, 3=V-HARD+, length n_obs */

    /* Diagnostics */
    int total_files;
    int matched_files;
    int64_t total_entries;
    int64_t filtered_out;
} Dataset;

int dataset_load(Dataset *ds, const char *enriched_json_path, const char *lb_dir_path);
void dataset_free(Dataset *ds);

/* Helper for level ordering matching pipeline.py:level_sort_key */
void level_sort_key(const char *level, int *group_out, int *rank_out);

#endif /* QUESTIMATOR_DATA_H */
