import initSqlJs, { type SqlJsStatic } from "sql.js";

let sqlPromise: Promise<SqlJsStatic> | null = null;
let sha512ToIdPromise: Promise<Record<string, number>> | null = null;

// Qwilight Handled ID enum -> QUEstimator lamp status
// 0: Not (unplayed)
// 1: Clear -> NORMAL (1)
// 2: Band1 (Full Combo) -> V-HARD (3)
// 4: F (Failed) -> FAILED (0)
// 5: HigherClear (Hard Clear) -> HARD (2)
// 6: HighestClear (Very Hard Clear) -> V-HARD (3)
// 7: AssistClear -> null (excluded)
// 8: Yell1 (Perfect / All Cool) -> V-HARD (3)
export const QWILIGHT_HANDLED_TO_LAMP: Record<number, number> = {
  4: 0, // FAILED
  1: 1, // NORMAL
  5: 2, // HARD
  6: 3, // V-HARD
  2: 3, // FULL COMBO (strictly harder than V-HARD gauge survival)
  8: 3, // PERFECT
};

export interface QwilightImportResult {
  totalParsedNotes: number;
  matchedUeCharts: number;
  clears: Record<string, number>; // chart_id -> lamp status (0..3)
  breakdown: {
    failed: number;
    normal: number;
    hard: number;
    vhard: number;
  };
  avatarName?: string;
}

export async function getSqlStatic(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const basePath =
      typeof window !== "undefined" && window.location.pathname.startsWith("/QUEstimator")
        ? "/QUEstimator"
        : "";
    sqlPromise = initSqlJs({
      locateFile: (file) => `${basePath}/${file}`,
    });
  }
  return sqlPromise;
}

export async function getSha512ToIdMap(): Promise<Record<string, number>> {
  if (!sha512ToIdPromise) {
    const basePath =
      typeof window !== "undefined" && window.location.pathname.startsWith("/QUEstimator")
        ? "/QUEstimator"
        : "";
    sha512ToIdPromise = fetch(`${basePath}/data/sha512-to-id.json`).then(async (res) => {
      if (!res.ok) {
        throw new Error(`Failed to load hash mapping: ${res.statusText}`);
      }
      return res.json() as Promise<Record<string, number>>;
    });
  }
  return sha512ToIdPromise;
}

/**
 * Parses an uploaded Qwilight SQLite DB.db file buffer and extracts all cleared charts
 * matched against the U_E table.
 */
export async function parseQwilightDb(buffer: ArrayBuffer): Promise<QwilightImportResult> {
  const [SQL, sha512ToIdMap] = await Promise.all([
    getSqlStatic(),
    getSha512ToIdMap(),
  ]);

  const db = new SQL.Database(new Uint8Array(buffer));

  try {
    // 1. Verify that this is a valid Qwilight database
    const tableCheck = db.exec(
      "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='handled'"
    );
    const hasHandledTable =
      tableCheck.length > 0 &&
      tableCheck[0].values.length > 0 &&
      Number(tableCheck[0].values[0][0]) > 0;

    if (!hasHandledTable) {
      throw new Error(
        "Uploaded file is missing the 'handled' table. Please ensure you selected Qwilight's DB.db file."
      );
    }

    // 2. Query Avatar_Name from comment table if available
    let avatarName: string | undefined;
    try {
      const avatarCheck = db.exec(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='comment'"
      );
      if (
        avatarCheck.length > 0 &&
        avatarCheck[0].values.length > 0 &&
        Number(avatarCheck[0].values[0][0]) > 0
      ) {
        const avatarRes = db.exec(
          "SELECT Avatar_Name FROM comment WHERE Avatar_Name IS NOT NULL AND Avatar_Name != '' ORDER BY Date DESC LIMIT 1"
        );
        if (
          avatarRes.length > 0 &&
          avatarRes[0].values.length > 0 &&
          typeof avatarRes[0].values[0][0] === "string"
        ) {
          avatarName = avatarRes[0].values[0][0];
        }
      }
    } catch {
      // Non-fatal if comment table cannot be read
    }

    // 3. Extract clear records from handled table
    const rows = db.exec("SELECT Note_ID, Handled FROM handled WHERE Handled != 0");
    const clears: Record<string, number> = {};
    const breakdown = { failed: 0, normal: 0, hard: 0, vhard: 0 };
    let totalParsedNotes = 0;
    let matchedUeCharts = 0;

    if (rows.length > 0 && rows[0].values.length > 0) {
      totalParsedNotes = rows[0].values.length;

      for (const [rawNoteId, rawHandled] of rows[0].values) {
        if (typeof rawNoteId !== "string" || typeof rawHandled !== "number") {
          continue;
        }

        // Qwilight format: "<sha512>:0"
        const sha512 = rawNoteId.split(":")[0].toLowerCase();
        const chartId = sha512ToIdMap[sha512];

        if (chartId !== undefined) {
          const lamp = QWILIGHT_HANDLED_TO_LAMP[rawHandled];
          if (lamp !== undefined) {
            clears[String(chartId)] = lamp;
            matchedUeCharts++;

            if (lamp === 0) breakdown.failed++;
            else if (lamp === 1) breakdown.normal++;
            else if (lamp === 2) breakdown.hard++;
            else if (lamp === 3) breakdown.vhard++;
          }
        }
      }
    }

    return {
      totalParsedNotes,
      matchedUeCharts,
      clears,
      breakdown,
      avatarName,
    };
  } finally {
    db.close();
  }
}
