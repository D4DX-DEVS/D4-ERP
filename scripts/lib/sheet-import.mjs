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
 *
 * The two `-EX` codes are the other half of that: where a code was handed on,
 * the person still working here keeps it and the person who left takes the
 * suffixed one, so both histories exist and neither lands on the other.
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
  // Left, and their code went to somebody still here.
  "BILAL M SHAREEF": "D4A-101-EX",
  "MUHAMMAD HISHAM": "D4P-104-EX",
  "MUHAMMED HISHAM": "D4P-104-EX",
};

/**
 * Sheet band -> ERP employment category. The bands are the black rows the grids
 * are grouped under, and the only statement the sheet makes about how somebody
 * is employed.
 */
export function employmentTypeForSection(section) {
  switch (clean(section).toUpperCase()) {
    case "PERMANENT":
      return "permanent";
    case "INTERNS":
      return "intern";
    default:
      return "staff";
  }
}

/** "BILAL M SHAREEF" -> "Bilal M Shareef", the casing the roster is written in. */
export function titleCase(name) {
  return clean(name)
    .toLowerCase()
    .replace(/(^|[\s.-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

/** First token is the first name, everything after it the last — as the roster stores it. */
export function splitName(name) {
  const parts = titleCase(name).split(" ").filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/**
 * A staff record for somebody the sheet carries but the ERP has never held.
 *
 * They are created relieved and soft-deleted: that keeps them out of every
 * roster, dropdown and payroll listing while their attendance and leave history
 * stays attached to a real record, which is the whole reason for creating them.
 * `dateOfJoining` is the first day of the first month they appear on — an
 * approximation, and reported as one by the importer.
 */
export function buildFormerStaffDoc({
  name,
  code,
  section,
  designation = "",
  firstMonth,
  lastDay,
  departmentId = "",
  companyId = "",
  year = YEAR,
  now = new Date(),
}) {
  const { firstName, lastName } = splitName(name);
  return {
    employeeCode: code,
    firstName,
    lastName,
    email: "",
    mobile: "",
    address: { street: "", city: "", state: "", pincode: "" },
    gender: "Male",
    dateOfJoining: midnight(year, firstMonth, 1),
    departmentId,
    companyId,
    designation: designation ? titleCase(designation) : "",
    baseSalary: 0,
    currentSalary: 0,
    role: "staff",
    status: "relieved",
    isActive: false,
    isDeleted: true,
    deletedAt: lastDay ?? null,
    employmentType: employmentTypeForSection(section),
    importTag: IMPORT_TAG,
    createdAt: now,
    updatedAt: now,
  };
}

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
 * Returns `{ kind }` of "alias" (the name is the trustworthy key for this row)
 * or "code" (the ordinary path). Nobody is dropped here: a code with no ERP
 * staff behind it belongs to somebody who has left, and the importer creates
 * them a relieved record rather than throwing their months away.
 */
export function resolveSheetRow(code, sheetName) {
  const who = nameKey(sheetName);
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
 * Turns one balance row into the entitlement the ERP should start the year with
 * — and nothing else.
 *
 * Leave taken is deliberately not read off this row. The balance tab is
 * hand-kept: its AUG..DEC month cells are empty while the August grid is full,
 * and for Jan..Jul its USED column falls short of the grids for about half the
 * roster. The daily grids are the record that gets marked as the month runs, so
 * they are what the ERP counts usage from, day by day, through the ordinary
 * attendance reconcile. Posting the USED column here as well would deduct every
 * one of those days twice.
 *
 * What the sheet alone can say is what each person was entitled to: the CURRENT
 * allocation for CL/EL/ML, and — for flexible leave, which is earned rather than
 * granted — the days they ended up holding. `HW` marks stop appearing on the
 * grids after May even though FL keeps being taken, so FL cannot be derived and
 * is credited as an opening balance.
 */
export function buildEntitlement(row, base, year = YEAR) {
  const sheet = readBalanceRow(row);
  const { current, used, balance } = sheet;
  const quota = { casualLeave: current.CL, sickLeave: current.ML, earnedLeave: current.EL };
  const adjustments = [];

  const earnedFl = round2(used.FL + balance.FL);
  if (earnedFl > 0) {
    adjustments.push({
      ...base,
      bucket: "FL",
      kind: "opening",
      days: earnedFl,
      date: midnight(year, 1, 1),
      year,
      reason: "Flexible leave earned, migrated from attendance sheet",
    });
  }

  return { quota, adjustments, sheet };
}

/**
 * What the ERP now says against what the sheet says, for one person.
 *
 * The two are expected to differ — that is the point of migrating off a
 * hand-kept tab — so this is what gets printed for the team to read rather than
 * anything the import acts on. `erpUsed` is the count of leave days the grids
 * actually carry; `sheet.used` is what the balance tab claims.
 */
export function buildVariance(sheet, erpUsed) {
  return BUCKETS.map((bucket) => {
    const entitled = bucket === "FL" ? round2(sheet.used.FL + sheet.balance.FL) : sheet.current[bucket];
    const used = round2(erpUsed[bucket] ?? 0);
    const erpBalance = round2(entitled - used);
    return {
      bucket,
      entitled,
      sheetUsed: sheet.used[bucket],
      erpUsed: used,
      sheetBalance: sheet.balance[bucket],
      erpBalance,
      diff: round2(erpBalance - sheet.balance[bucket]),
    };
  });
}
