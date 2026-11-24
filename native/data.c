#include "data.h"
#include "json.h"

#include <ctype.h>
#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _OPENMP
#include <omp.h>
#endif

/* --------------------------------------------------------------------------
 * String utilities
 * -------------------------------------------------------------------------- */
static char *str_dup_trim(const char *s) {
    if (!s) {
        char *e = (char *)malloc(1);
        if (e) e[0] = '\0';
        return e;
    }
    const char *start = s;
    while (*start && isspace((unsigned char)*start)) start++;
    const char *end = start + strlen(start);
    while (end > start && isspace((unsigned char)*(end - 1))) end--;
    size_t len = (size_t)(end - start);
    char *out = (char *)malloc(len + 1);
    if (!out) return NULL;
    memcpy(out, start, len);
    out[len] = '\0';
    return out;
}

static char *str_dup(const char *s) {
    if (!s) s = "";
    size_t len = strlen(s);
    char *out = (char *)malloc(len + 1);
    if (!out) return NULL;
    memcpy(out, s, len + 1);
    return out;
}

/* --------------------------------------------------------------------------
 * String -> int open-addressing hash map (FNV-1a 64-bit)
 * -------------------------------------------------------------------------- */
typedef struct {
    char *key;
    int val;
} StrMapSlot;

typedef struct {
    StrMapSlot *slots;
    size_t cap;
    size_t count;
} StrMap;

static uint64_t fnv1a_str(const char *s) {
    uint64_t h = 14695981039346656037ULL;
    for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
        h ^= (uint64_t)(*p);
        h *= 1099511628211ULL;
    }
    return h;
}

static void strmap_init(StrMap *m, size_t init_cap) {
    size_t c = 64;
    while (c < init_cap) c <<= 1;
    m->slots = (StrMapSlot *)calloc(c, sizeof(StrMapSlot));
    m->cap = c;
    m->count = 0;
}

static void strmap_free(StrMap *m, int free_keys) {
    if (free_keys && m->slots) {
        for (size_t i = 0; i < m->cap; i++) free(m->slots[i].key);
    }
    free(m->slots);
    m->slots = NULL;
    m->cap = m->count = 0;
}

static void strmap_grow(StrMap *m) {
    size_t ncap = m->cap << 1;
    StrMapSlot *ns = (StrMapSlot *)calloc(ncap, sizeof(StrMapSlot));
    size_t mask = ncap - 1;
    for (size_t i = 0; i < m->cap; i++) {
        if (m->slots[i].key) {
            size_t idx = (size_t)(fnv1a_str(m->slots[i].key) & mask);
            while (ns[idx].key) idx = (idx + 1) & mask;
            ns[idx] = m->slots[i];
        }
    }
    free(m->slots);
    m->slots = ns;
    m->cap = ncap;
}

/* Returns 1 if found (writes *val_out), 0 otherwise. */
static int strmap_get(const StrMap *m, const char *key, int *val_out) {
    size_t mask = m->cap - 1;
    size_t idx = (size_t)(fnv1a_str(key) & mask);
    while (m->slots[idx].key) {
        if (strcmp(m->slots[idx].key, key) == 0) {
            if (val_out) *val_out = m->slots[idx].val;
            return 1;
        }
        idx = (idx + 1) & mask;
    }
    return 0;
}

/* Inserts key -> val if absent. Does NOT duplicate key (caller owns lifetime). */
static void strmap_put(StrMap *m, char *key, int val) {
    if ((m->count + 1) * 10 >= m->cap * 7) strmap_grow(m);
    size_t mask = m->cap - 1;
    size_t idx = (size_t)(fnv1a_str(key) & mask);
    while (m->slots[idx].key) {
        if (strcmp(m->slots[idx].key, key) == 0) {
            m->slots[idx].val = val;
            return;
        }
        idx = (idx + 1) & mask;
    }
    m->slots[idx].key = key;
    m->slots[idx].val = val;
    m->count++;
}

/* --------------------------------------------------------------------------
 * (player_idx, chart_idx) -> max_status hash table
 * -------------------------------------------------------------------------- */
typedef struct {
    uint64_t key; /* 0 = empty; stored as (((uint64_t)p << 32) | (uint32_t)c) + 1 */
    uint8_t status;
} PairSlot;

typedef struct {
    PairSlot *slots;
    size_t cap;
    size_t count;
} PairMap;

static uint64_t mix64(uint64_t x) {
    x ^= x >> 30;
    x *= 0xbf58476d1ce4e5b9ULL;
    x ^= x >> 27;
    x *= 0x94d049bb133111ebULL;
    x ^= x >> 31;
    return x;
}

static void pairmap_init(PairMap *m, size_t init_cap) {
    size_t c = 1024;
    while (c < init_cap) c <<= 1;
    m->slots = (PairSlot *)calloc(c, sizeof(PairSlot));
    m->cap = c;
    m->count = 0;
}

static void pairmap_grow(PairMap *m) {
    size_t ncap = m->cap << 1;
    PairSlot *ns = (PairSlot *)calloc(ncap, sizeof(PairSlot));
    size_t mask = ncap - 1;
    for (size_t i = 0; i < m->cap; i++) {
        if (m->slots[i].key) {
            size_t idx = (size_t)(mix64(m->slots[i].key) & mask);
            while (ns[idx].key) idx = (idx + 1) & mask;
            ns[idx] = m->slots[i];
        }
    }
    free(m->slots);
    m->slots = ns;
    m->cap = ncap;
}

static void pairmap_update_max(PairMap *m, int player_idx, int chart_idx, uint8_t status) {
    if ((m->count + 1) * 10 >= m->cap * 7) pairmap_grow(m);
    uint64_t k = (((uint64_t)(uint32_t)player_idx << 32) | (uint32_t)chart_idx) + 1ULL;
    size_t mask = m->cap - 1;
    size_t idx = (size_t)(mix64(k) & mask);
    while (m->slots[idx].key) {
        if (m->slots[idx].key == k) {
            if (status > m->slots[idx].status) m->slots[idx].status = status;
            return;
        }
        idx = (idx + 1) & mask;
    }
    m->slots[idx].key = k;
    m->slots[idx].status = status;
    m->count++;
}

static void pairmap_free(PairMap *m) {
    free(m->slots);
    m->slots = NULL;
    m->cap = m->count = 0;
}

/* --------------------------------------------------------------------------
 * Level parsing & sorting (matches scripts/pipeline.py)
 * -------------------------------------------------------------------------- */
static int is_all_digits(const char *s) {
    if (!s || !*s) return 0;
    for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
        if (!isdigit(*p)) return 0;
    }
    return 1;
}

void level_sort_key(const char *level, int *group_out, int *rank_out) {
    if (is_all_digits(level)) {
        *group_out = 0;
        *rank_out = atoi(level);
        return;
    }
    *group_out = 1;
    if (strcmp(level, "-_-") == 0) { *rank_out = 100; return; }
    if (strcmp(level, "?!") == 0)  { *rank_out = 101; return; }
    if (strcmp(level, "\xE2\x97\x86") == 0) { *rank_out = 102; return; } /* ◆ */
    if (strcmp(level, "\xCE\xA9") == 0)     { *rank_out = 103; return; } /* Ω */
    *rank_out = 999;
}

/* --------------------------------------------------------------------------
 * IR entry filter (exact match to scripts/load_ir_clears.py)
 * -------------------------------------------------------------------------- */
static int handled_to_grm(int handled) {
    switch (handled) {
        case 4: return 0; /* FAILED */
        case 1: return 1; /* NORMAL */
        case 5: return 2; /* HARD */
        case 6: return 3; /* V-HARD */
        case 2: return 3; /* FULL COMBO -> V-HARD+ */
        case 8: return 3; /* PERFECT -> V-HARD+ */
        default: return -1;
    }
}

typedef struct {
    char *avatar_id;
    char *avatar_name;
    uint8_t status;
} RawEntry;

typedef struct {
    int chart_idx;
    RawEntry *entries;
    int n_entries;
    int64_t total_seen;
    int64_t filtered_out;
} FileBatch;

static int cmp_str_ptr(const void *a, const void *b) {
    const char *sa = *(const char *const *)a;
    const char *sb = *(const char *const *)b;
    return strcmp(sa, sb);
}

static int parse_single_lb_file(const char *filepath, int chart_idx, FileBatch *out) {
    out->chart_idx = chart_idx;
    out->entries = NULL;
    out->n_entries = 0;
    out->total_seen = 0;
    out->filtered_out = 0;

    char err[256];
    JsonValue *root = json_parse_file(filepath, err, sizeof(err));
    if (!root) {
        fprintf(stderr, "Warning: failed to parse %s (%s)\n", filepath, err);
        return 0;
    }

    const JsonValue *comments = json_obj_get(root, "comments");
    if (!comments || comments->type != JSON_ARRAY || comments->u.arr.count == 0) {
        json_free(root);
        return 1;
    }

    size_t n = comments->u.arr.count;
    RawEntry *buf = (RawEntry *)malloc(n * sizeof(RawEntry));
    if (!buf) {
        json_free(root);
        return 0;
    }
    int count = 0;

    for (size_t i = 0; i < n; i++) {
        const JsonValue *entry = comments->u.arr.items[i];
        out->total_seen++;
        if (!entry || entry->type != JSON_OBJECT) {
            out->filtered_out++;
            continue;
        }

        double audio_mult = json_get_num(entry, "audioMultiplier", 1.0, NULL);
        int has_handled = 0;
        int handled = json_get_int(entry, "handled", -1, &has_handled);
        int status = has_handled ? handled_to_grm(handled) : -1;

        if (audio_mult < 1.0 ||
            (audio_mult > 1.0 && handled != 6 && handled != 2 && handled != 8) ||
            json_get_int(entry, "inputFavorMode", 0, NULL) != 0 ||
            json_get_int(entry, "longNoteMode", 0, NULL) != 0 ||
            json_get_bool(entry, "isPaused", 0, NULL) != 0 ||
            status < 0) {
            out->filtered_out++;
            continue;
        }

        const char *aid = json_get_str(entry, "avatarID", NULL);
        if (!aid || !*aid) {
            out->filtered_out++;
            continue;
        }
        const char *aname = json_get_str(entry, "avatarName", "");

        buf[count].avatar_id = str_dup(aid);
        buf[count].avatar_name = str_dup(aname);
        buf[count].status = (uint8_t)status;
        count++;
    }

    json_free(root);
    out->entries = buf;
    out->n_entries = count;
    return 1;
}

typedef struct {
    int chart_idx;
    uint8_t status;
} ChartStatus;

static int cmp_chart_status(const void *a, const void *b) {
    const ChartStatus *ca = (const ChartStatus *)a;
    const ChartStatus *cb = (const ChartStatus *)b;
    return ca->chart_idx - cb->chart_idx;
}

int dataset_load(Dataset *ds, const char *enriched_json_path, const char *lb_dir_path) {
    memset(ds, 0, sizeof(*ds));

    /* 1. Load UEtable_enriched.json */
    char err[256];
    JsonValue *root = json_parse_file(enriched_json_path, err, sizeof(err));
    if (!root || root->type != JSON_ARRAY) {
        fprintf(stderr, "Error: failed to load %s (%s)\n", enriched_json_path, err);
        json_free(root);
        return 0;
    }

    size_t raw_n = root->u.arr.count;
    ChartMeta *charts = (ChartMeta *)calloc(raw_n, sizeof(ChartMeta));
    if (!charts) { json_free(root); return 0; }

    StrMap md5_seen;
    StrMap sha512_to_idx;
    strmap_init(&md5_seen, raw_n * 2);
    strmap_init(&sha512_to_idx, raw_n * 2);

    int n_charts = 0;
    for (size_t i = 0; i < raw_n; i++) {
        const JsonValue *c = root->u.arr.items[i];
        if (!c || c->type != JSON_OBJECT) continue;

        char *md5 = str_dup_trim(json_get_str(c, "md5", ""));
        if (!md5 || md5[0] == '\0') {
            free(md5);
            continue;
        }
        if (strmap_get(&md5_seen, md5, NULL)) {
            free(md5);
            continue;
        }

        ChartMeta *cm = &charts[n_charts];
        int has_id = 0;
        int cid = json_get_int(c, "id", (int)i, &has_id);
        cm->id = has_id ? cid : (int)i;
        cm->md5 = md5;
        cm->sha512 = str_dup_trim(json_get_str(c, "sha512", ""));
        cm->title = str_dup_trim(json_get_str(c, "title", ""));
        cm->artist = str_dup_trim(json_get_str(c, "artist", ""));
        cm->level = str_dup_trim(json_get_str(c, "level", ""));
        cm->name_diff = str_dup_trim(json_get_str(c, "name_diff", ""));
        cm->video2 = str_dup_trim(json_get_str(c, "video2", ""));
        cm->url = str_dup_trim(json_get_str(c, "url", ""));
        cm->url_diff = str_dup_trim(json_get_str(c, "url_diff", ""));
        cm->comment = str_dup_trim(json_get_str(c, "comment", ""));
        cm->state = str_dup_trim(json_get_str(c, "state", ""));

        if (strcmp(cm->level, "\xCE\xA9") == 0) {
            cm->level_num = 31.0;
            cm->is_gimmick = 0;
        } else if (is_all_digits(cm->level)) {
            cm->level_num = (double)atoi(cm->level);
            cm->is_gimmick = 0;
        } else {
            cm->level_num = 0.0;
            cm->is_gimmick = 1;
        }

        strmap_put(&md5_seen, cm->md5, n_charts);
        if (cm->sha512 && cm->sha512[0] != '\0') {
            strmap_put(&sha512_to_idx, cm->sha512, n_charts);
        }
        n_charts++;
    }
    json_free(root);
    strmap_free(&md5_seen, 0);

    ds->charts = charts;
    ds->n_charts = n_charts;

    /* 2. List and sort upload/6Kleaderboards .json files */
    DIR *dir = opendir(lb_dir_path);
    if (!dir) {
        fprintf(stderr, "Error: cannot open leaderboard directory: %s\n", lb_dir_path);
        strmap_free(&sha512_to_idx, 0);
        dataset_free(ds);
        return 0;
    }

    size_t fcap = 2048, fcount = 0;
    char **fnames = (char **)malloc(fcap * sizeof(char *));
    struct dirent *de;
    while ((de = readdir(dir)) != NULL) {
        size_t flen = strlen(de->d_name);
        if (flen > 5 && strcmp(de->d_name + flen - 5, ".json") == 0) {
            if (fcount == fcap) {
                fcap *= 2;
                fnames = (char **)realloc(fnames, fcap * sizeof(char *));
            }
            fnames[fcount++] = str_dup(de->d_name);
        }
    }
    closedir(dir);

    qsort(fnames, fcount, sizeof(char *), cmp_str_ptr);
    ds->total_files = (int)fcount;

    /* Match filenames to charts */
    int *matched_chart = (int *)malloc(fcount * sizeof(int));
    int matched_count = 0;
    for (size_t i = 0; i < fcount; i++) {
        size_t flen = strlen(fnames[i]);
        char *stem = (char *)malloc(flen - 4);
        memcpy(stem, fnames[i], flen - 5);
        stem[flen - 5] = '\0';
        int cidx = -1;
        if (strmap_get(&sha512_to_idx, stem, &cidx)) {
            matched_chart[i] = cidx;
            matched_count++;
        } else {
            matched_chart[i] = -1;
        }
        free(stem);
    }
    ds->matched_files = matched_count;
    strmap_free(&sha512_to_idx, 0);

    /* 3. Parse all matched leaderboard JSONs in parallel */
    FileBatch *batches = (FileBatch *)calloc(fcount, sizeof(FileBatch));
    size_t dir_len = strlen(lb_dir_path);

    #pragma omp parallel for schedule(dynamic, 16)
    for (int i = 0; i < (int)fcount; i++) {
        if (matched_chart[i] < 0) continue;
        size_t flen = strlen(fnames[i]);
        char *full = (char *)malloc(dir_len + flen + 2);
        memcpy(full, lb_dir_path, dir_len);
        full[dir_len] = '/';
        memcpy(full + dir_len + 1, fnames[i], flen + 1);
        parse_single_lb_file(full, matched_chart[i], &batches[i]);
        free(full);
    }

    for (size_t i = 0; i < fcount; i++) free(fnames[i]);
    free(fnames);
    free(matched_chart);

    /* 4. Merge in deterministic sorted filename order & deduplicate */
    StrMap player_map;
    strmap_init(&player_map, 8192);
    size_t pcap = 4096;
    int n_players = 0;
    char **player_ids = (char **)malloc(pcap * sizeof(char *));
    char **player_names = (char **)malloc(pcap * sizeof(char *));

    PairMap best_clears;
    pairmap_init(&best_clears, 524288);

    for (size_t i = 0; i < fcount; i++) {
        FileBatch *b = &batches[i];
        ds->total_entries += b->total_seen;
        ds->filtered_out += b->filtered_out;
        if (!b->entries) continue;

        for (int j = 0; j < b->n_entries; j++) {
            RawEntry *re = &b->entries[j];
            int pid = -1;
            if (!strmap_get(&player_map, re->avatar_id, &pid)) {
                pid = n_players++;
                if ((size_t)n_players > pcap) {
                    pcap *= 2;
                    player_ids = (char **)realloc(player_ids, pcap * sizeof(char *));
                    player_names = (char **)realloc(player_names, pcap * sizeof(char *));
                }
                player_ids[pid] = re->avatar_id;      /* take ownership */
                player_names[pid] = re->avatar_name;  /* take ownership */
                strmap_put(&player_map, player_ids[pid], pid);
            } else {
                free(re->avatar_id);
                if (re->avatar_name && re->avatar_name[0] != '\0') {
                    free(player_names[pid]);
                    player_names[pid] = re->avatar_name;
                } else {
                    free(re->avatar_name);
                }
            }
            pairmap_update_max(&best_clears, pid, b->chart_idx, re->status);
        }
        free(b->entries);
    }
    free(batches);
    strmap_free(&player_map, 0);

    ds->n_players = n_players;
    ds->player_ids = player_ids;
    ds->player_names = player_names;
    ds->n_obs = (int)best_clears.count;

    if (ds->n_obs == 0) {
        fprintf(stderr, "Error: no valid clear records found.\n");
        pairmap_free(&best_clears);
        dataset_free(ds);
        return 0;
    }

    /* 5. Build player-CSR arrays */
    int *offsets = (int *)calloc((size_t)n_players + 1, sizeof(int));
    for (size_t i = 0; i < best_clears.cap; i++) {
        if (best_clears.slots[i].key) {
            uint64_t raw = best_clears.slots[i].key - 1ULL;
            int p = (int)(raw >> 32);
            offsets[p + 1]++;
        }
    }
    for (int p = 0; p < n_players; p++) {
        offsets[p + 1] += offsets[p];
    }

    ChartStatus *cs_tmp = (ChartStatus *)malloc((size_t)ds->n_obs * sizeof(ChartStatus));
    int *cursor = (int *)malloc((size_t)n_players * sizeof(int));
    memcpy(cursor, offsets, (size_t)n_players * sizeof(int));

    for (size_t i = 0; i < best_clears.cap; i++) {
        if (best_clears.slots[i].key) {
            uint64_t raw = best_clears.slots[i].key - 1ULL;
            int p = (int)(raw >> 32);
            int c = (int)(raw & 0xFFFFFFFFULL);
            int pos = cursor[p]++;
            cs_tmp[pos].chart_idx = c;
            cs_tmp[pos].status = best_clears.slots[i].status;
        }
    }
    free(cursor);
    pairmap_free(&best_clears);

    /* Sort each player's plays by chart_idx for cache locality and deterministic JSON */
    uint32_t *obs_code = (uint32_t *)malloc((size_t)ds->n_obs * sizeof(uint32_t));
    int *obs_chart = (int *)malloc((size_t)ds->n_obs * sizeof(int));
    uint8_t *obs_status = (uint8_t *)malloc((size_t)ds->n_obs * sizeof(uint8_t));

    for (int p = 0; p < n_players; p++) {
        int s = offsets[p];
        int e = offsets[p + 1];
        if (e - s > 1) {
            qsort(cs_tmp + s, (size_t)(e - s), sizeof(ChartStatus), cmp_chart_status);
        }
        for (int k = s; k < e; k++) {
            int c = cs_tmp[k].chart_idx;
            uint8_t st = cs_tmp[k].status;
            obs_chart[k] = c;
            obs_status[k] = st;
            obs_code[k] = (uint32_t)c * 4U + (uint32_t)st;

            ChartMeta *cm = &ds->charts[c];
            cm->n++;
            if (st == 0) cm->n_failed++;
            else if (st == 1) cm->n_normal++;
            else if (st == 2) cm->n_hard++;
            else cm->n_vhard++;
        }
    }
    free(cs_tmp);

    ds->player_offsets = offsets;
    ds->obs_code = obs_code;
    ds->obs_chart = obs_chart;
    ds->obs_status = obs_status;
    return 1;
}

void dataset_free(Dataset *ds) {
    if (!ds) return;
    if (ds->charts) {
        for (int i = 0; i < ds->n_charts; i++) {
            free(ds->charts[i].md5);
            free(ds->charts[i].sha512);
            free(ds->charts[i].title);
            free(ds->charts[i].artist);
            free(ds->charts[i].level);
            free(ds->charts[i].name_diff);
            free(ds->charts[i].video2);
            free(ds->charts[i].url);
            free(ds->charts[i].url_diff);
            free(ds->charts[i].comment);
            free(ds->charts[i].state);
        }
        free(ds->charts);
    }
    if (ds->player_ids) {
        for (int i = 0; i < ds->n_players; i++) free(ds->player_ids[i]);
        free(ds->player_ids);
    }
    if (ds->player_names) {
        for (int i = 0; i < ds->n_players; i++) free(ds->player_names[i]);
        free(ds->player_names);
    }
    free(ds->player_offsets);
    free(ds->obs_code);
    free(ds->obs_chart);
    free(ds->obs_status);
    memset(ds, 0, sizeof(*ds));
}
