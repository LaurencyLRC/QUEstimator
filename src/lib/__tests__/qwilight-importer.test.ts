import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import initSqlJs from "sql.js";
import { parseQwilightDb, QWILIGHT_HANDLED_TO_LAMP } from "@/lib/qwilight-importer";
import type { Chart } from "@/lib/questimator-types";

async function loadLocalSqlJs() {
  const wasmPath = join(process.cwd(), "public", "sql-wasm.wasm");
  const wasmBuf = readFileSync(wasmPath);
  return initSqlJs({ wasmBinary: wasmBuf.buffer.slice(wasmBuf.byteOffset, wasmBuf.byteOffset + wasmBuf.byteLength) });
}

function makeCharts(): Chart[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    md5: `md5_${i + 1}`,
    title: `Chart ${i + 1}`,
    artist: "Artist",
    level: String(15 + i),
    name_diff: "",
    video2: "",
    url: "",
    url_diff: "",
    comment: "",
    state: "",
    n: 100,
    n_failed: 10,
    n_normal: 20,
    n_hard: 40,
    n_vhard: 30,
    a: 1.1,
    b_normal: -2.0 + i * 0.25,
    b_hard: -1.0 + i * 0.25,
    b_vhard: 0.0 + i * 0.25,
    b_hard_display: -1.0 + i * 0.25,
    b_vhard_display: 0.0 + i * 0.25,
    se_a: 0.1,
    se_b_hard: 0.1,
    se_b_vhard: 0.1,
    provisional: false,
  }));
}

describe("Qwilight SQLite DB.db importer", () => {
  test("QWILIGHT_HANDLED_TO_LAMP maps FC/PFC to V-HARD and excludes Assist (7)", () => {
    expect(QWILIGHT_HANDLED_TO_LAMP[4]).toBe(0);
    expect(QWILIGHT_HANDLED_TO_LAMP[1]).toBe(1);
    expect(QWILIGHT_HANDLED_TO_LAMP[5]).toBe(2);
    expect(QWILIGHT_HANDLED_TO_LAMP[6]).toBe(3);
    expect(QWILIGHT_HANDLED_TO_LAMP[2]).toBe(3);
    expect(QWILIGHT_HANDLED_TO_LAMP[8]).toBe(3);
    expect(QWILIGHT_HANDLED_TO_LAMP[7]).toBeUndefined();
  });

  test("extracts deduplicated lamps, avatar name, and monthly progression history", async () => {
    const SQL = await loadLocalSqlJs();
    const db = new SQL.Database();
    db.run(`
      CREATE TABLE handled (Note_ID TEXT, Handled INTEGER);
      CREATE TABLE comment (Note_ID TEXT, Handled INTEGER, Date TEXT, Avatar_Name TEXT);
    `);

    const shaMap: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) {
      shaMap[`sha_${i}`] = i;
    }

    // Insert handled records including duplicate Note_ID variants, Assist (7), and unmapped chart
    db.run(`INSERT INTO handled VALUES ('SHA_1:0', 5)`); // HARD
    db.run(`INSERT INTO handled VALUES ('sha_1:1', 2)`); // FC -> V-HARD (should win max)
    db.run(`INSERT INTO handled VALUES ('sha_2:0', 5)`); // HARD
    db.run(`INSERT INTO handled VALUES ('sha_3:0', 7)`); // ASSIST -> excluded
    db.run(`INSERT INTO handled VALUES ('sha_4:0', 4)`); // FAILED
    db.run(`INSERT INTO handled VALUES ('sha_5:0', 1)`); // NORMAL
    db.run(`INSERT INTO handled VALUES ('unknown:0', 6)`); // not in U_E table

    // Insert 12 chronological comment records spanning 2 months (>= 10 events, >= 5 charts/month)
    const janDates = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10"];
    const febDates = ["2026-02-05", "2026-02-06", "2026-02-07", "2026-02-08", "2026-02-09", "2026-02-10"];
    janDates.forEach((d, idx) => {
      db.run(`INSERT INTO comment VALUES (?, ?, ?, ?)`, [`sha_${idx + 1}:0`, 4, d, "OldName"]);
    });
    febDates.forEach((d, idx) => {
      db.run(`INSERT INTO comment VALUES (?, ?, ?, ?)`, [`sha_${idx + 1}:0`, 6, d, "CurrentPlayer"]);
    });

    const bytes = db.export();
    db.close();
    const buf = new Uint8Array(bytes).buffer as ArrayBuffer;

    const res = await parseQwilightDb(
      buf,
      makeCharts(),
      { sqlStatic: SQL, sha512ToIdMap: shaMap }
    );

    expect(res.avatarName).toBe("CurrentPlayer");
    expect(res.matchedUeCharts).toBe(4);
    expect(res.clears).toEqual({ "1": 3, "2": 2, "4": 0, "5": 1 });
    expect(res.breakdown).toEqual({ failed: 1, normal: 1, hard: 1, vhard: 1 });
    expect(res.history?.length).toBe(2);
    expect(res.history?.[0].date).toBe("2026-01");
    expect(res.history?.[1].date).toBe("2026-02");
    // Improving from FAILED in Jan to V-HARD in Feb must increase theta
    expect(res.history![1].theta).toBeGreaterThan(res.history![0].theta);
  });

  test("rejects SQLite files missing the handled table", async () => {
    const SQL = await loadLocalSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE other (x INTEGER);`);
    const bytes = db.export();
    db.close();
    const buf = new Uint8Array(bytes).buffer as ArrayBuffer;

    await expect(
      parseQwilightDb(
        buf,
        [],
        { sqlStatic: SQL, sha512ToIdMap: {} }
      )
    ).rejects.toThrow("missing the 'handled' table");
  });
});
