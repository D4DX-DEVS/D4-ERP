/**
 * Pure half of the attendance-sheet migration: the mappings, the staff-matching
 * rules and the arithmetic that turns one row of the CL/EL/ML tab into ledger
 * adjustments. No network, no database — so it can be unit-tested against real
 * sheet rows, which is the only way to know the migration reproduces the
 * numbers the team already reads off the sheet.
 *
 * scripts/import-attendance-sheet.mjs owns the IO and imports everything here.
 */

export const YEAR = 2026;
export const IMPORT_TAG = "sheet-2026";
export const SHEET_ID = "1WM0Ou_-SqJTsMNPapYhcI4GdClgLONRzZHOK3PU1hFI";
export const BALANCE_GID = "167599112";

/**
 * Every monthly tab, each confirmed against the 2026 calendar by the weekday
 * its first column carries and the number of days it holds. The sheet stops at
 * August; September onward is biometric only.
 */
export const MONTH_TABS = [
  { month: 1, name: "JANUARY", gid: "1419532194" },
  { month: 2, name: "FEBRUARY", gid: "1455936088" },
  { month: 3, name: "MARCH", gid: "1552878692" },
  { month: 4, name: "APRIL", gid: "1525285917" },
  { month: 5, name: "MAY", gid: "1770043999" },
  { month: 6, name: "JUNE", gid: "150468414" },
  { month: 7, name: "JULY", gid: "1903230963" },
  { month: 8, name: "AUGUST", gid: "604453459" },
];

/**
 * Sheet day code -> ERP attendance status.
 *
 * `H` is a holiday, not a half-day: it lands org-wide on Mar 20-22, Apr 9,
 * May 28-30, Jun 26, Aug 15 and Aug 25-26. The ERP's own `H` display code means
 * half-day, so this mapping deliberately disagrees with it. `HW` is a holiday or
 * week-off that was worked, which is what earns flexible leave, so it stores as
 * worked with a remark and the existing week-off scan picks it up. `L` is the
 * long unpaid absence the sheet keeps outside every leave bucket. `O` marks the
 * few people the sheet does not track at all and imports nothing.
 */
export const CODE_MAP = {
  P: { status: "present" },
  WO: { status: "week-off" },
  OD: { status: "on-duty" },
  H: { status: "public-holiday" },
  HW: { status: "present", remarks: "Holiday / week-off worked (HW)" },
  CL: { status: "casual-leave" },
  ML: { status: "medical-leave" },
  EL: { status: "earned-leave" },
  FL: { status: "full-leave" },
  OT: { status: "overtime" },
  L: { status: "absent", remarks: "Long leave (L)" },
  O: null, // present on the sheet, deliberately untracked
};

/**
 * Sheet name -> ERP employee code, consulted before the code itself.
 *
 * The sheet files two different people under one code in every monthly tab —
 * D4A-101 is both Bilal M Shareef and Shahid Ameen T, D4O-102 is both Jewad P S
 * and Irfan Kavanur, D4D-103 is both Muhammed Ranthees and Althaf SS in June —
 * and the balance tab codes four people differently again. Matching on the code
 * alone therefore drops current employees or files their days on a colleague.
 * These are the rows where the name is the reliable key; everyone else still
 * matches on code.
 */
export const NAME_TO_CODE = {
  "IRFAN KAVANUR": "D4O-104",
  "ALTHAF SS": "D4D-104",
  "SHAHID AMEEN": "D4A-101",
  "SHAHID AMEEN T": "D4A-101",
  // One person, two codes: an intern as INT-103 through March, contract staff
  // as D4E-103 from June. The months never overlap.
  "SHUHAIB KL": "D4E-103",
  "SHUHAIB K L": "D4E-103",
  "NIYAS AKLIYATH": "D4I-100",
  RAHEEF: "D4P-104",
  "RAHEEF M": "D4P-104",
  "ALI HASSAN": "D4D-102",
};

/**
 * People who have left. The sheet keeps their rows for the months they worked,
 * and Bilal's code was handed on to Shahid Ameen T, so importing him would file
 * a departed employee's days on a current one. Confirmed with the team rather
 * than inferred from the roster.
 */
export const RESIGNED = new Set([
  "BILAL M SHAREEF",
  "MUHAMMAD HISHAM",
  "MUHAMMED HISHAM",
  "JUMAIL P P",
  "SHAMEER BABU",
  "ASLAM ALI S",
  "ADIL FAYAS",
  "SHAFEEH K",
  "BADEEU ZAMAN",
]);

export const BUCKETS = ["CL", "EL", "ML", "FL"];

/** Column offsets on the CL/EL/ML tab, verified against its two header rows. */
export const COL = { balance: 5, current: 22, used: 25, monthBlocks: 30, total: 78 };

export const SECTION_LABELS = ["PERMANENT", "CONTRACT", "INTERNS"];

export const clean = (v) => (v ?? "").replace(/\s+/g, " ").trim();
export const codeOf = (v) => clean(v).toUpperCase();
export const nameKey = (v) => clean(v).toUpperCase().replace(/[^A-Z ]/g, "");
export const midnight = (y, m, d) => new Date(y, m - 1, d, 0, 0, 0, 0);
export const round2 = (n) => Math.round(n * 100) / 100;

export function num(v) {
  const n = Number(clean(v));
  return Number.isFinite(n) ? n : 0;
}

/** Minimal RFC-4180 reader: the sheet wraps cells that contain a newline. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** True for the black section bands and the blank spacer rows between them. */
export function isSectionRow(sheetName) {
  const n = clean(sheetName).toUpperCase();
  return !n || SECTION_LABELS.includes(n);
}

/**
 * Which ERP employee code a sheet row belongs to, and why.
 *
 * Returns `{ kind }` of "resigned" (skip, they have left), "alias" (the name is
 * the trustworthy key for this row) or "code" (the ordinary path).
 */
export function resolveSheetRow(code, sheetName) {
  const who = nameKey(sheetName);
  if (RESIGNED.has(who)) return { kind: "resigned", who };
  const aliased = NAME_TO_CODE[who];
  if (aliased) return { kind: "alias", who, code: aliased };
  const key = codeOf(code);
  return key ? { kind: "code", who, code: key } : { kind: "none", who };
}

/** The sheet's three number blocks for one person, read off one row. */
export function readBalanceRow(row) {
  const current = {
    CL: num(row[COL.current]),
    EL: num(row[COL.current + 1]),
    ML: num(row[COL.current + 2]),
    FL: 0,
  };
  const used = Object.fromEntries(BUCKETS.map((b, i) => [b, num(row[COL.used + i])]));
  const balance = Object.fromEntries(BUCKETS.map((b, i) => [b, num(row[COL.balance + i])]));
  const monthly = Object.fromEntries(
    BUCKETS.map((b, i) => [b, Array.from({ length: 12 }, (_, m) => num(row[COL.monthBlocks + m * 4 + i]))])
  );
  // The TOTAL block is read from the end of the row, not from a fixed offset.
  // Some rows are a cell short of the header, which shifts everything after the
  // gap left by one; anchoring on the end survives that, an absolute index does
  // not.
  const tail = row.slice(-4);
  const total = Object.fromEntries(BUCKETS.map((b, i) => [b, num(tail[i])]));
  // Per bucket, do the month cells actually add up to what USED claims? Where
  // they do not the row is misaligned or hand-edited, and the months cannot be
  // trusted for that bucket even though USED still can.
  const monthsReconcile = Object.fromEntries(
    BUCKETS.map((b) => [b, round2(monthly[b].reduce((x, y) => x + y, 0)) === round2(used[b])])
  );
  return { current, used, balance, monthly, total, monthsReconcile };
}

/**
 * Turns one balance row into the quota override and the ledger adjustments that
 * reproduce it.
 *
 * The three blocks do not always agree — the sheet is hand-kept, so a month
 * block can fall short of the USED column and a BALANCE can be overridden by
 * hand. USED is trusted over the months, and BALANCE over both, with the
 * shortfall posted so the ERP lands on exactly the number the team reads.
 *
 * Flexible leave has no quota: it is earned, so it is credited with whatever
 * the sheet says the person ended up entitled to.
 */
export function buildBalanceAdjustments(row, base, year = YEAR) {
  const { current, used, balance, monthly, total, monthsReconcile } = readBalanceRow(row);
  const quota = { casualLeave: current.CL, sickLeave: current.ML, earnedLeave: current.EL };
  const adjustments = [];
  const add = (bucket, kind, days, date, reason) =>
    adjustments.push({ ...base, bucket, kind, days: round2(days), date, year, reason });

  for (const bucket of BUCKETS) {
    if (bucket === "FL") {
      const earned = round2(used.FL + balance.FL);
      if (earned > 0) {
        add("FL", "opening", earned, midnight(year, 1, 1), "Flexible leave earned, migrated from attendance sheet");
      }
    }

    // USED is the number the team reads and the one BALANCE is struck from, so
    // it always wins. The month cells are only used when they agree with it.
    if (monthsReconcile[bucket]) {
      for (let m = 0; m < 12; m++) {
        const v = monthly[bucket][m];
        if (v <= 0) continue;
        const monthName = new Date(year, m, 1).toLocaleString("en", { month: "long" });
        add(bucket, "deduction", -v, midnight(year, m + 1, 1), `${bucket} taken in ${monthName}, migrated from attendance sheet`);
      }
    } else if (used[bucket] > 0) {
      add(
        bucket,
        "deduction",
        -used[bucket],
        midnight(year, 1, 1),
        `${bucket} used, month breakdown on the sheet does not add up to it`
      );
    }

    const entitled = bucket === "FL" ? round2(used.FL + balance.FL) : current[bucket];
    const drift = round2(balance[bucket] - (entitled - used[bucket]));
    if (drift !== 0) {
      add(bucket, "correction", drift, midnight(year, 1, 1), `Reconciled to the sheet ${bucket} balance of ${balance[bucket]}`);
    }
  }

  return { quota, adjustments, sheet: { current, used, balance, monthly, total, monthsReconcile } };
}
