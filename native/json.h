#ifndef QUESTIMATOR_JSON_H
#define QUESTIMATOR_JSON_H

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

typedef enum {
    JSON_NULL = 0,
    JSON_BOOL,
    JSON_NUMBER,
    JSON_STRING,
    JSON_ARRAY,
    JSON_OBJECT
} JsonType;

typedef struct JsonValue JsonValue;

typedef struct {
    char *key;
    JsonValue *val;
} JsonMember;

struct JsonValue {
    JsonType type;
    union {
        int b;
        double num;
        struct {
            char *ptr;
            size_t len;
        } str;
        struct {
            JsonValue **items;
            size_t count;
            size_t cap;
        } arr;
        struct {
            JsonMember *members;
            size_t count;
            size_t cap;
        } obj;
    } u;
};

/* Parse a UTF-8 JSON buffer. Returns NULL on error (writes message to errbuf if provided). */
JsonValue *json_parse(const char *src, size_t len, char *errbuf, size_t errcap);
JsonValue *json_parse_file(const char *path, char *errbuf, size_t errcap);
void json_free(JsonValue *v);

/* Object field accessors (return NULL / default if missing or wrong type). */
const JsonValue *json_obj_get(const JsonValue *obj, const char *key);
const char *json_get_str(const JsonValue *obj, const char *key, const char *def);
double json_get_num(const JsonValue *obj, const char *key, double def, int *found);
int json_get_int(const JsonValue *obj, const char *key, int def, int *found);
int json_get_bool(const JsonValue *obj, const char *key, int def, int *found);

/* Write a properly escaped JSON string (including surrounding quotes) to FILE*. */
void json_write_string(FILE *f, const char *s);

#endif /* QUESTIMATOR_JSON_H */
