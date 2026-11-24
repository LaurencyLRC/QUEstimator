#include "json.h"

#include <ctype.h>
#include <errno.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const char *src;
    size_t len;
    size_t pos;
    char *errbuf;
    size_t errcap;
} Parser;

static void set_err(Parser *p, const char *msg) {
    if (p->errbuf && p->errcap > 0 && p->errbuf[0] == '\0') {
        snprintf(p->errbuf, p->errcap, "JSON error at byte %zu: %s", p->pos, msg);
    }
}

static void skip_ws(Parser *p) {
    while (p->pos < p->len) {
        unsigned char c = (unsigned char)p->src[p->pos];
        if (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
            p->pos++;
        } else {
            break;
        }
    }
}

static int hex_val(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static int parse_hex4(Parser *p, uint32_t *out) {
    if (p->pos + 4 > p->len) return 0;
    uint32_t v = 0;
    for (int i = 0; i < 4; i++) {
        int h = hex_val(p->src[p->pos + (size_t)i]);
        if (h < 0) return 0;
        v = (v << 4) | (uint32_t)h;
    }
    p->pos += 4;
    *out = v;
    return 1;
}

static int buf_ensure(char **buf, size_t *cap, size_t need) {
    if (need <= *cap) return 1;
    size_t ncap = (*cap == 0) ? 64 : (*cap * 2);
    while (ncap < need) ncap *= 2;
    char *nb = (char *)realloc(*buf, ncap);
    if (!nb) return 0;
    *buf = nb;
    *cap = ncap;
    return 1;
}

static int append_utf8(char **buf, size_t *len, size_t *cap, uint32_t cp) {
    if (!buf_ensure(buf, cap, *len + 5)) return 0;
    if (cp <= 0x7F) {
        (*buf)[(*len)++] = (char)cp;
    } else if (cp <= 0x7FF) {
        (*buf)[(*len)++] = (char)(0xC0 | (cp >> 6));
        (*buf)[(*len)++] = (char)(0x80 | (cp & 0x3F));
    } else if (cp <= 0xFFFF) {
        (*buf)[(*len)++] = (char)(0xE0 | (cp >> 12));
        (*buf)[(*len)++] = (char)(0x80 | ((cp >> 6) & 0x3F));
        (*buf)[(*len)++] = (char)(0x80 | (cp & 0x3F));
    } else if (cp <= 0x10FFFF) {
        (*buf)[(*len)++] = (char)(0xF0 | (cp >> 18));
        (*buf)[(*len)++] = (char)(0x80 | ((cp >> 12) & 0x3F));
        (*buf)[(*len)++] = (char)(0x80 | ((cp >> 6) & 0x3F));
        (*buf)[(*len)++] = (char)(0x80 | (cp & 0x3F));
    } else {
        return 0;
    }
    return 1;
}

static char *parse_string_raw(Parser *p, size_t *out_len) {
    if (p->pos >= p->len || p->src[p->pos] != '"') {
        set_err(p, "expected '\"'");
        return NULL;
    }
    p->pos++; /* skip opening quote */

    /* Fast path: scan for closing quote without escapes */
    size_t start = p->pos;
    size_t scan = start;
    while (scan < p->len) {
        unsigned char c = (unsigned char)p->src[scan];
        if (c == '"') {
            size_t slen = scan - start;
            char *s = (char *)malloc(slen + 1);
            if (!s) { set_err(p, "OOM"); return NULL; }
            memcpy(s, p->src + start, slen);
            s[slen] = '\0';
            p->pos = scan + 1;
            if (out_len) *out_len = slen;
            return s;
        }
        if (c == '\\' || c < 0x20) break;
        scan++;
    }

    size_t cap = 64;
    size_t slen = 0;
    char *buf = (char *)malloc(cap);
    if (!buf) { set_err(p, "OOM"); return NULL; }

    /* Copy prefix scanned before first escape */
    if (scan > start) {
        size_t pre = scan - start;
        if (!buf_ensure(&buf, &cap, pre + 1)) { free(buf); set_err(p, "OOM"); return NULL; }
        memcpy(buf, p->src + start, pre);
        slen = pre;
        p->pos = scan;
    }

    while (p->pos < p->len) {
        unsigned char c = (unsigned char)p->src[p->pos++];
        if (c == '"') {
            if (!buf_ensure(&buf, &cap, slen + 1)) { free(buf); set_err(p, "OOM"); return NULL; }
            buf[slen] = '\0';
            if (out_len) *out_len = slen;
            return buf;
        }
        if (c == '\\') {
            if (p->pos >= p->len) { free(buf); set_err(p, "unterminated escape"); return NULL; }
            char esc = p->src[p->pos++];
            char out_c = 0;
            switch (esc) {
                case '"':  out_c = '"'; break;
                case '\\': out_c = '\\'; break;
                case '/':  out_c = '/'; break;
                case 'b':  out_c = '\b'; break;
                case 'f':  out_c = '\f'; break;
                case 'n':  out_c = '\n'; break;
                case 'r':  out_c = '\r'; break;
                case 't':  out_c = '\t'; break;
                case 'u': {
                    uint32_t cp = 0;
                    if (!parse_hex4(p, &cp)) { free(buf); set_err(p, "invalid \\u escape"); return NULL; }
                    if (cp >= 0xD800 && cp <= 0xDBFF) {
                        if (p->pos + 2 <= p->len && p->src[p->pos] == '\\' && p->src[p->pos + 1] == 'u') {
                            p->pos += 2;
                            uint32_t low = 0;
                            if (!parse_hex4(p, &low) || low < 0xDC00 || low > 0xDFFF) {
                                free(buf); set_err(p, "invalid surrogate pair"); return NULL;
                            }
                            cp = 0x10000 + (((cp - 0xD800) << 10) | (low - 0xDC00));
                        }
                    }
                    if (!append_utf8(&buf, &slen, &cap, cp)) { free(buf); set_err(p, "OOM"); return NULL; }
                    continue;
                }
                default:
                    free(buf);
                    set_err(p, "unknown escape sequence");
                    return NULL;
            }
            if (!buf_ensure(&buf, &cap, slen + 2)) { free(buf); set_err(p, "OOM"); return NULL; }
            buf[slen++] = out_c;
        } else {
            if (!buf_ensure(&buf, &cap, slen + 2)) { free(buf); set_err(p, "OOM"); return NULL; }
            buf[slen++] = (char)c;
        }
    }

    free(buf);
    set_err(p, "unterminated string");
    return NULL;
}

static JsonValue *parse_value(Parser *p);

static JsonValue *alloc_val(JsonType t) {
    JsonValue *v = (JsonValue *)calloc(1, sizeof(JsonValue));
    if (v) v->type = t;
    return v;
}

static JsonValue *parse_array(Parser *p) {
    p->pos++; /* skip '[' */
    JsonValue *arr = alloc_val(JSON_ARRAY);
    if (!arr) { set_err(p, "OOM"); return NULL; }

    skip_ws(p);
    if (p->pos < p->len && p->src[p->pos] == ']') {
        p->pos++;
        return arr;
    }

    for (;;) {
        skip_ws(p);
        JsonValue *item = parse_value(p);
        if (!item) { json_free(arr); return NULL; }

        if (arr->u.arr.count == arr->u.arr.cap) {
            size_t ncap = arr->u.arr.cap ? arr->u.arr.cap * 2 : 16;
            JsonValue **ni = (JsonValue **)realloc(arr->u.arr.items, ncap * sizeof(JsonValue *));
            if (!ni) { json_free(item); json_free(arr); set_err(p, "OOM"); return NULL; }
            arr->u.arr.items = ni;
            arr->u.arr.cap = ncap;
        }
        arr->u.arr.items[arr->u.arr.count++] = item;

        skip_ws(p);
        if (p->pos >= p->len) { json_free(arr); set_err(p, "unterminated array"); return NULL; }
        if (p->src[p->pos] == ',') {
            p->pos++;
            continue;
        }
        if (p->src[p->pos] == ']') {
            p->pos++;
            return arr;
        }
        json_free(arr);
        set_err(p, "expected ',' or ']'");
        return NULL;
    }
}

static JsonValue *parse_object(Parser *p) {
    p->pos++; /* skip '{' */
    JsonValue *obj = alloc_val(JSON_OBJECT);
    if (!obj) { set_err(p, "OOM"); return NULL; }

    skip_ws(p);
    if (p->pos < p->len && p->src[p->pos] == '}') {
        p->pos++;
        return obj;
    }

    for (;;) {
        skip_ws(p);
        char *key = parse_string_raw(p, NULL);
        if (!key) { json_free(obj); return NULL; }

        skip_ws(p);
        if (p->pos >= p->len || p->src[p->pos] != ':') {
            free(key);
            json_free(obj);
            set_err(p, "expected ':'");
            return NULL;
        }
        p->pos++;

        skip_ws(p);
        JsonValue *val = parse_value(p);
        if (!val) { free(key); json_free(obj); return NULL; }

        if (obj->u.obj.count == obj->u.obj.cap) {
            size_t ncap = obj->u.obj.cap ? obj->u.obj.cap * 2 : 8;
            JsonMember *nm = (JsonMember *)realloc(obj->u.obj.members, ncap * sizeof(JsonMember));
            if (!nm) { free(key); json_free(val); json_free(obj); set_err(p, "OOM"); return NULL; }
            obj->u.obj.members = nm;
            obj->u.obj.cap = ncap;
        }
        obj->u.obj.members[obj->u.obj.count].key = key;
        obj->u.obj.members[obj->u.obj.count].val = val;
        obj->u.obj.count++;

        skip_ws(p);
        if (p->pos >= p->len) { json_free(obj); set_err(p, "unterminated object"); return NULL; }
        if (p->src[p->pos] == ',') {
            p->pos++;
            continue;
        }
        if (p->src[p->pos] == '}') {
            p->pos++;
            return obj;
        }
        json_free(obj);
        set_err(p, "expected ',' or '}'");
        return NULL;
    }
}

static JsonValue *parse_number(Parser *p) {
    size_t start = p->pos;
    if (p->pos < p->len && p->src[p->pos] == '-') p->pos++;
    while (p->pos < p->len && isdigit((unsigned char)p->src[p->pos])) p->pos++;
    if (p->pos < p->len && p->src[p->pos] == '.') {
        p->pos++;
        while (p->pos < p->len && isdigit((unsigned char)p->src[p->pos])) p->pos++;
    }
    if (p->pos < p->len && (p->src[p->pos] == 'e' || p->src[p->pos] == 'E')) {
        p->pos++;
        if (p->pos < p->len && (p->src[p->pos] == '+' || p->src[p->pos] == '-')) p->pos++;
        while (p->pos < p->len && isdigit((unsigned char)p->src[p->pos])) p->pos++;
    }
    size_t nlen = p->pos - start;
    if (nlen == 0 || nlen >= 128) {
        set_err(p, "invalid number");
        return NULL;
    }
    char tmp[128];
    memcpy(tmp, p->src + start, nlen);
    tmp[nlen] = '\0';
    char *endptr = NULL;
    errno = 0;
    double val = strtod(tmp, &endptr);
    if (endptr != tmp + nlen) {
        set_err(p, "malformed number");
        return NULL;
    }
    JsonValue *v = alloc_val(JSON_NUMBER);
    if (!v) { set_err(p, "OOM"); return NULL; }
    v->u.num = val;
    return v;
}

static JsonValue *parse_value(Parser *p) {
    skip_ws(p);
    if (p->pos >= p->len) {
        set_err(p, "unexpected EOF");
        return NULL;
    }
    char c = p->src[p->pos];
    if (c == '{') return parse_object(p);
    if (c == '[') return parse_array(p);
    if (c == '"') {
        size_t slen = 0;
        char *s = parse_string_raw(p, &slen);
        if (!s) return NULL;
        JsonValue *v = alloc_val(JSON_STRING);
        if (!v) { free(s); set_err(p, "OOM"); return NULL; }
        v->u.str.ptr = s;
        v->u.str.len = slen;
        return v;
    }
    if (c == '-' || (c >= '0' && c <= '9')) return parse_number(p);
    if (p->pos + 4 <= p->len && memcmp(p->src + p->pos, "true", 4) == 0) {
        p->pos += 4;
        JsonValue *v = alloc_val(JSON_BOOL);
        if (!v) { set_err(p, "OOM"); return NULL; }
        v->u.b = 1;
        return v;
    }
    if (p->pos + 5 <= p->len && memcmp(p->src + p->pos, "false", 5) == 0) {
        p->pos += 5;
        JsonValue *v = alloc_val(JSON_BOOL);
        if (!v) { set_err(p, "OOM"); return NULL; }
        v->u.b = 0;
        return v;
    }
    if (p->pos + 4 <= p->len && memcmp(p->src + p->pos, "null", 4) == 0) {
        p->pos += 4;
        JsonValue *v = alloc_val(JSON_NULL);
        if (!v) { set_err(p, "OOM"); return NULL; }
        return v;
    }
    set_err(p, "unexpected character");
    return NULL;
}

JsonValue *json_parse(const char *src, size_t len, char *errbuf, size_t errcap) {
    if (errbuf && errcap > 0) errbuf[0] = '\0';
    Parser p = { src, len, 0, errbuf, errcap };
    /* Skip UTF-8 BOM if present */
    if (len >= 3 && (unsigned char)src[0] == 0xEF &&
        (unsigned char)src[1] == 0xBB && (unsigned char)src[2] == 0xBF) {
        p.pos = 3;
    }
    return parse_value(&p);
}

JsonValue *json_parse_file(const char *path, char *errbuf, size_t errcap) {
    if (errbuf && errcap > 0) errbuf[0] = '\0';
    FILE *f = fopen(path, "rb");
    if (!f) {
        if (errbuf && errcap > 0) snprintf(errbuf, errcap, "Cannot open file: %s", path);
        return NULL;
    }
    if (fseek(f, 0, SEEK_END) != 0) { fclose(f); return NULL; }
    long sz = ftell(f);
    if (sz < 0) { fclose(f); return NULL; }
    rewind(f);
    char *buf = (char *)malloc((size_t)sz + 1);
    if (!buf) { fclose(f); return NULL; }
    size_t rd = fread(buf, 1, (size_t)sz, f);
    fclose(f);
    buf[rd] = '\0';
    JsonValue *v = json_parse(buf, rd, errbuf, errcap);
    free(buf);
    return v;
}

void json_free(JsonValue *v) {
    if (!v) return;
    switch (v->type) {
        case JSON_STRING:
            free(v->u.str.ptr);
            break;
        case JSON_ARRAY:
            for (size_t i = 0; i < v->u.arr.count; i++) json_free(v->u.arr.items[i]);
            free(v->u.arr.items);
            break;
        case JSON_OBJECT:
            for (size_t i = 0; i < v->u.obj.count; i++) {
                free(v->u.obj.members[i].key);
                json_free(v->u.obj.members[i].val);
            }
            free(v->u.obj.members);
            break;
        default:
            break;
    }
    free(v);
}

const JsonValue *json_obj_get(const JsonValue *obj, const char *key) {
    if (!obj || obj->type != JSON_OBJECT) return NULL;
    for (size_t i = 0; i < obj->u.obj.count; i++) {
        if (strcmp(obj->u.obj.members[i].key, key) == 0) {
            return obj->u.obj.members[i].val;
        }
    }
    return NULL;
}

const char *json_get_str(const JsonValue *obj, const char *key, const char *def) {
    const JsonValue *v = json_obj_get(obj, key);
    if (!v || v->type != JSON_STRING) return def;
    return v->u.str.ptr;
}

double json_get_num(const JsonValue *obj, const char *key, double def, int *found) {
    const JsonValue *v = json_obj_get(obj, key);
    if (!v || v->type != JSON_NUMBER) {
        if (found) *found = 0;
        return def;
    }
    if (found) *found = 1;
    return v->u.num;
}

int json_get_int(const JsonValue *obj, const char *key, int def, int *found) {
    int ok = 0;
    double d = json_get_num(obj, key, (double)def, &ok);
    if (found) *found = ok;
    return ok ? (int)llround(d) : def;
}

int json_get_bool(const JsonValue *obj, const char *key, int def, int *found) {
    const JsonValue *v = json_obj_get(obj, key);
    if (!v || v->type != JSON_BOOL) {
        if (found) *found = 0;
        return def;
    }
    if (found) *found = 1;
    return v->u.b;
}

void json_write_string(FILE *f, const char *s) {
    fputc('"', f);
    if (s) {
        for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
            unsigned char c = *p;
            switch (c) {
                case '"':  fputs("\\\"", f); break;
                case '\\': fputs("\\\\", f); break;
                case '\b': fputs("\\b", f); break;
                case '\f': fputs("\\f", f); break;
                case '\n': fputs("\\n", f); break;
                case '\r': fputs("\\r", f); break;
                case '\t': fputs("\\t", f); break;
                default:
                    if (c < 0x20) {
                        fprintf(f, "\\u%04x", (unsigned)c);
                    } else {
                        fputc((int)c, f);
                    }
                    break;
            }
        }
    }
    fputc('"', f);
}
