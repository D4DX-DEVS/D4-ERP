// Verification for the Google Sheet migration.
//
// The point of these tests is not that the helpers return some adjustments — it
// is that what the migration writes, fed through the real ledger, lands on the
// balance the register justifies. The sheet supplies entitlement; the daily
// grids supply what was taken. The rows below are verbatim from the CL/EL/ML
// tab, including its blanks.
//
// The migration writes a raw Date into Mongo and /api/db converts Date ->
// { seconds, nanoseconds } on the way out, so `asStored` mimics that boundary
// rather than trusting the in-memory shape.

import { describe, it, expect } from "vitest";
import {
  BUCKETS,
  CODE_MAP,
  buildEntitlement,
  buildFormerStaffDoc,
  buildVariance,
  employmentTypeForSection,
  isSectionRow,
  nameKey,
  parseCsv,
  readBalanceRow,
  resolveSheetRow,
  splitName,
  titleCase,
} from "../../scripts/lib/sheet-import.mjs";
import { computeLeaveLedger, ledgerBucket } from "@/lib/leave-ledger";
import type { LeaveAdjustment, LeaveBucket, LeaveQuota } from "@/types";

const YEAR = 2026;

/** Real rows from the balance tab, trailing blanks and all. */
const ROWS: Record<string, string[]> = {
  // Permanent: no allocation at all, and three buckets in deficit.
  "MUHAMMAD RASHID A P": ["1","MUHAMMAD RASHID A P","D4E-100","D4EVENTS LEAD","EVENTS","-3","0","-3","-1","3","","","1","1","2","1","","","","","","8","","","","3","0","3","9","MUHAMMAD RASHID A P","","","","2","","","","","","","","","","","","","2","","","2","","","","3","1","","3","2","","","","","","","","","","","","","","","","","","","","3","0","3","9"],
  // Contract: full 15/0/15 allocation, nine flexible days earned and taken.
  "FAROOQUE C T": ["6","FAROOQUE C T","D4A-102","CREATIVE DIRECTOR","PRODUCTIONS","14","0","15","1","3","3","","2","","1","1","","","","","","10","15","0","15","1","0","0","9","FAROOQUE C T","1","","","","","","","","","","","","","","","2","","","","2","","","","2","","","","3","","","","","","","","","","","","","","","","","","","","","1","0","0","9"],
  // Intern: a 12/0/12 allocation rather than the policy default.
  "MUHAMMED SHAMIL M P": ["2","MUHAMMED SHAMIL M P","INT-107","JR. CINEMATORGRAPHER","EVENTS","11","0","10","2","","","","2","2","2","3","","","","","","9","12","0","12","1","0","2","7","MUHAMMED SHAMIL M P","","","","","","","","","","","","","1","","","1","","","2","2","","","","2","","","","2","","","","","","","","","","","","","","","","","","","","","1","0","2","7"],
  // Medical leave taken down to exactly zero.
  "HILAL A P": ["16","HILAL A P","D4P-105","JR. VIDEO EDITOR","PRODUCTIONS","7","0","0","0","1","2","","","","","","","","","","","3","15","0","15","8","0","15","3","HILAL A P","2","","","","1","","1","2","","","3","","","","3","","1","","2","1","2","","3","","2","","3","","","","","","","","","","","","","","","","","","","","","","8","0","15","3"],
  // Nothing used except one flexible day.
  RAHEEF: ["15","RAHEEF","D4P-104","JR. GRAPHIC DESIGNER","PRODUCTIONS","15","0","15","1","","","","","","","2","","","","","","2","15","0","15","0","0","0","1","RAHEEF","","","","","","","","","","","","","","","","","","","","","","","","","","","","1","","","","","","","","","","","","","","","","","","","","","","","0","0","0","1"],
};

const BASE = { staffId: "s1", staffName: "Test", departmentId: "d1", importTag: "sheet-2026" };

/** Date -> { seconds, nanoseconds }, the way /api/db hands a document back. */
function asStored(adjustments: { date: Date }[]): LeaveAdjustment[] {
  return adjustments.map((a) => ({
    ...a,
    date: { seconds: Math.floor(a.date.getTime() / 1000), nanoseconds: 0 },
  })) as unknown as LeaveAdjustment[];
}

/**
 * The debits the reconcile posts: one per leave day marked on the register,
 * which is where usage comes from now that the balance tab supplies entitlement
 * only. `days` says how many days of each bucket the grids carry.
 */
function registerDebits(days: Partial<Record<LeaveBucket, number>>) {
  const rows: { date: Date }[] = [];
  for (const [bucket, count] of Object.entries(days)) {
    for (let i = 0; i < (count ?? 0); i++) {
      rows.push({
        ...BASE,
        bucket,
        kind: "attendance",
        days: -1,
        year: YEAR,
        // Spread across the year so the monthly columns are exercised too.
        date: new Date(YEAR, i % 12, 1),
        sourceAttendanceId: `a${bucket}${i}`,
        reason: `${bucket} marked on the attendance register`,
      } as unknown as { date: Date });
    }
  }
  return rows;
}

function ledgerFor(name: string, allowNegative: boolean, taken: Partial<Record<LeaveBucket, number>> = {}) {
  const { quota, adjustments, sheet } = buildEntitlement(ROWS[name], BASE, YEAR);
  const ledger = computeLeaveLedger({
    requests: [],
    adjustments: asStored([...adjustments, ...registerDebits(taken)]),
    sundayDuties: [],
    quota: quota as LeaveQuota,
    year: YEAR,
    allowNegative,
  });
  return { ledger, sheet, quota, adjustments };
}

describe("buildEntitlement — the sheet supplies what was granted, not what was taken", () => {
  it("carries the sheet's CURRENT allocation as the quota", () => {
    for (const name of Object.keys(ROWS)) {
      const { quota, sheet } = ledgerFor(name, false);
      expect(quota, name).toEqual({
        casualLeave: sheet.current.CL,
        sickLeave: sheet.current.ML,
        earnedLeave: sheet.current.EL,
      });
    }
  });

  it("writes no deduction of any kind — the register is what counts days", () => {
    for (const name of Object.keys(ROWS)) {
      const { adjustments } = ledgerFor(name, false);
      expect(adjustments.every((a) => a.kind === "opening"), name).toBe(true);
      expect(adjustments.every((a) => a.days > 0), name).toBe(true);
    }
  });

  it("credits flexible leave with what the sheet says was earned, never a quota", () => {
    const { ledger, sheet } = ledgerFor("FAROOQUE C T", false);
    expect(ledger.fl.quota).toBe(0);
    expect(ledger.fl.entitled).toBe(sheet.used.FL + sheet.balance.FL);
  });

  it("leaves a bucket at full entitlement until the register says otherwise", () => {
    const { ledger, sheet } = ledgerFor("FAROOQUE C T", false);
    expect(ledger.cl.used).toBe(0);
    expect(ledger.cl.balance).toBe(sheet.current.CL);
  });

  it("gives a permanent staff member no allocation at all", () => {
    const { quota } = ledgerFor("MUHAMMAD RASHID A P", true);
    expect(quota).toEqual({ casualLeave: 0, sickLeave: 0, earnedLeave: 0 });
  });

  it("writes nothing for a bucket the sheet leaves entirely empty", () => {
    const { adjustments } = ledgerFor("RAHEEF", false);
    expect(adjustments.some((a) => a.bucket === "EL")).toBe(false);
  });
});

describe("entitlement plus the register lands on a balance", () => {
  it("reproduces the sheet's balance where the grids agree with its USED column", () => {
    // Hilal's row is one the two halves of the sheet agree about: 8 CL and 15 ML
    // used, and the grids carry exactly that.
    const { ledger, sheet } = ledgerFor("HILAL A P", false, { CL: 8, ML: 15 });
    expect(ledger.cl.balance).toBe(sheet.balance.CL);
    expect(ledger.ml.balance).toBe(sheet.balance.ML);
  });

  it("follows the grids, not the sheet, where the two disagree", () => {
    // The August grid carries a CL day the balance tab never recorded.
    const { ledger, sheet } = ledgerFor("HILAL A P", false, { CL: 9, ML: 15 });
    expect(ledger.cl.used).toBe(9);
    expect(ledger.cl.balance).toBe(sheet.balance.CL - 1);
  });

  it("moves every bucket, not just the ones the sheet happens to fill", () => {
    const { ledger } = ledgerFor("FAROOQUE C T", false, { CL: 2, EL: 1, ML: 3, FL: 4 });
    for (const [bucket, taken] of [["CL", 2], ["EL", 1], ["ML", 3], ["FL", 4]] as [LeaveBucket, number][]) {
      expect(ledgerBucket(ledger, bucket).used, bucket).toBe(taken);
    }
  });

  it("takes a permanent staff member's balance negative, which needs the policy that allows it", () => {
    const taken = { CL: 8, ML: 3 };
    expect(ledgerFor("MUHAMMAD RASHID A P", false, taken).ledger.cl.balance).toBe(0);
    expect(ledgerFor("MUHAMMAD RASHID A P", true, taken).ledger.cl.balance).toBe(-8);
  });

  it("spends flexible leave against the opening credit rather than a quota", () => {
    const { ledger } = ledgerFor("MUHAMMAD RASHID A P", true, { FL: 9 });
    expect(ledger.fl.entitled).toBe(8); // 9 used + -1 balance, per the sheet
    expect(ledger.fl.used).toBe(9);
    expect(ledger.fl.balance).toBe(-1);
  });
});

describe("buildVariance — what to show the team", () => {
  it("reports no difference when the grids match the sheet", () => {
    const sheet = readBalanceRow(ROWS["HILAL A P"]);
    const rows = buildVariance(sheet, { CL: 8, EL: 0, ML: 15, FL: 3 });
    expect(rows.every((r) => r.diff === 0)).toBe(true);
  });

  it("reports the shortfall when the grids carry days the balance tab missed", () => {
    const sheet = readBalanceRow(ROWS["HILAL A P"]);
    const cl = buildVariance(sheet, { CL: 9, EL: 0, ML: 15, FL: 3 }).find((r) => r.bucket === "CL")!;
    expect(cl.sheetUsed).toBe(8);
    expect(cl.erpUsed).toBe(9);
    expect(cl.sheetBalance).toBe(7);
    expect(cl.erpBalance).toBe(6);
    expect(cl.diff).toBe(-1);
  });

  it("measures flexible leave against what the sheet says was earned", () => {
    const sheet = readBalanceRow(ROWS["FAROOQUE C T"]);
    const fl = buildVariance(sheet, { CL: 0, EL: 0, ML: 0, FL: 10 }).find((r) => r.bucket === "FL")!;
    expect(fl.entitled).toBe(10); // 9 used + 1 left, per the sheet
    expect(fl.erpBalance).toBe(0);
    expect(fl.diff).toBe(-1);
  });

  it("covers every bucket, so a blank one is still accounted for", () => {
    const rows = buildVariance(readBalanceRow(ROWS.RAHEEF), { CL: 0, EL: 0, ML: 0, FL: 0 });
    expect(rows.map((r) => r.bucket)).toEqual(BUCKETS);
  });
});

describe("buildFormerStaffDoc — people the sheet carries and the ERP never held", () => {
  const doc = buildFormerStaffDoc({
    name: "BILAL M SHAREEF",
    code: "D4A-101-EX",
    section: "CONTRACT",
    designation: "SR. PHOTOGRAPHER",
    firstMonth: 1,
    lastDay: new Date(YEAR, 7, 31),
    departmentId: "d9",
    companyId: "c1",
    now: new Date(YEAR, 8, 14),
  });

  it("creates them relieved and soft-deleted, so they leave every roster but keep their history", () => {
    expect(doc.status).toBe("relieved");
    expect(doc.isActive).toBe(false);
    expect(doc.isDeleted).toBe(true);
    expect(doc.deletedAt).toEqual(new Date(YEAR, 7, 31));
  });

  it("writes the name the way the roster does, not the way the sheet shouts it", () => {
    expect(doc.firstName).toBe("Bilal");
    expect(doc.lastName).toBe("M Shareef");
    expect(doc.designation).toBe("Sr. Photographer");
  });

  it("dates the joining from the first month they appear, which is an approximation", () => {
    expect(doc.dateOfJoining).toEqual(new Date(YEAR, 0, 1));
  });

  it("cannot be signed in as", () => {
    expect(doc.email).toBe("");
    expect(doc.isActive).toBe(false);
  });

  it("reads the employment category off the sheet's band", () => {
    expect(employmentTypeForSection("PERMANENT")).toBe("permanent");
    expect(employmentTypeForSection("INTERNS")).toBe("intern");
    expect(employmentTypeForSection("CONTRACT")).toBe("staff");
    expect(employmentTypeForSection("")).toBe("staff");
  });

  it("splits a name the way the roster stores it", () => {
    expect(splitName("MUHAMMAD RASHID A P")).toEqual({ firstName: "Muhammad", lastName: "Rashid A P" });
    expect(titleCase("AL AMEEN")).toBe("Al Ameen");
  });
});

describe("readBalanceRow — column offsets", () => {
  it("reads the three blocks off the row the sheet prints them on", () => {
    const r = readBalanceRow(ROWS["FAROOQUE C T"]);
    expect(r.balance).toEqual({ CL: 14, EL: 0, ML: 15, FL: 1 });
    expect(r.current).toEqual({ CL: 15, EL: 0, ML: 15, FL: 0 });
    expect(r.used).toEqual({ CL: 1, EL: 0, ML: 0, FL: 9 });
  });

  it("reads a blank CURRENT as no allocation rather than as missing", () => {
    expect(readBalanceRow(ROWS["MUHAMMAD RASHID A P"]).current).toEqual({ CL: 0, EL: 0, ML: 0, FL: 0 });
  });

  it("keeps twelve months per bucket", () => {
    const r = readBalanceRow(ROWS["HILAL A P"]);
    for (const code of BUCKETS) expect(r.monthly[code]).toHaveLength(12);
  });

  it("reads TOTAL off the end of the row, so a short row still reconciles", () => {
    // Rashid's row is one cell shorter than the header, so an absolute offset
    // would read the wrong four cells.
    const r = readBalanceRow(ROWS["MUHAMMAD RASHID A P"]);
    expect(r.total).toEqual(r.used);
  });

  it("spots the buckets whose months do not add up to USED — which is why they are not imported", () => {
    const r = readBalanceRow(ROWS["MUHAMMAD RASHID A P"]);
    expect(r.monthsReconcile).toMatchObject({ CL: true, EL: true, ML: true, FL: false });
    expect(r.monthly.FL.reduce((a, b) => a + b, 0)).toBe(12);
    expect(r.used.FL).toBe(9);
  });
});

describe("CODE_MAP — what each sheet day code means", () => {
  it("treats H as a holiday, not the ERP's half-day", () => {
    expect(CODE_MAP.H.status).toBe("public-holiday");
  });

  it("treats a worked holiday as worked, so the week-off scan can find it", () => {
    expect(CODE_MAP.HW.status).toBe("present");
    expect(CODE_MAP.HW.remarks).toMatch(/HW/);
  });

  it("keeps long leave out of every balance bucket", () => {
    expect(CODE_MAP.L.status).toBe("absent");
  });

  it("imports nothing for a person the sheet does not track", () => {
    expect(CODE_MAP.O).toBeNull();
  });

  it("maps every code that appears in the 2026 tabs", () => {
    for (const code of ["P", "WO", "OD", "H", "HW", "CL", "ML", "FL", "EL", "OT", "L", "O"]) {
      expect(CODE_MAP, `code ${code}`).toHaveProperty(code);
    }
  });
});

describe("resolveSheetRow — who a row belongs to", () => {
  it("sends somebody who left to their own code, not to the colleague who inherited it", () => {
    expect(resolveSheetRow("D4A-101", "BILAL M SHAREEF")).toMatchObject({ kind: "alias", code: "D4A-101-EX" });
    expect(resolveSheetRow("D4P-104", "MUHAMMAD HISHAM")).toMatchObject({ kind: "alias", code: "D4P-104-EX" });
  });

  it("keeps the live code with the person still working here", () => {
    expect(resolveSheetRow("INT-101", "SHAHID AMEEN T")).toMatchObject({ kind: "alias", code: "D4A-101" });
    expect(resolveSheetRow("D4P-104", "RAHEEF M")).toMatchObject({ kind: "alias", code: "D4P-104" });
  });

  it("sends a reused code to the right person by name", () => {
    expect(resolveSheetRow("D4D-103", "ALTHAF SS")).toMatchObject({ kind: "alias", code: "D4D-104" });
    expect(resolveSheetRow("D4O-102", "IRFAN KAVANUR")).toMatchObject({ kind: "alias", code: "D4O-104" });
  });

  it("keeps the person who legitimately owns the reused code", () => {
    expect(resolveSheetRow("D4D-103", "MUHAMMED RANTHEES")).toMatchObject({ kind: "code", code: "D4D-103" });
    expect(resolveSheetRow("D4O-102", "JEWAD P S")).toMatchObject({ kind: "code", code: "D4O-102" });
  });

  it("joins both of Shuhaib's codes onto one record", () => {
    expect(resolveSheetRow("INT-103", "SHUHAIB K L").code).toBe("D4E-103");
    expect(resolveSheetRow("D4E-103", "SHUHAIB KL").code).toBe("D4E-103");
  });

  it("matches Niyas across the two spellings of his name", () => {
    expect(resolveSheetRow("D4I-100", "NIYAS AKLIYATH")).toMatchObject({ kind: "alias", code: "D4I-100" });
  });

  it("falls back to the employee code for everyone else", () => {
    expect(resolveSheetRow("D4E-100", "MUHAMMAD RASHID A P")).toMatchObject({ kind: "code", code: "D4E-100" });
  });

  it("reports a row with no code at all rather than guessing", () => {
    expect(resolveSheetRow("", "SOMEONE NEW").kind).toBe("none");
  });
});

describe("sheet parsing helpers", () => {
  it("skips the section bands and the blank spacers between them", () => {
    for (const label of ["PERMANENT", "CONTRACT", "INTERNS", "", "  "]) {
      expect(isSectionRow(label), label).toBe(true);
    }
    expect(isSectionRow("MUHAMMAD RASHID A P")).toBe(false);
  });

  it("keeps a quoted cell that wraps onto a second line in one field", () => {
    const rows = parseCsv('a,"DIGITAL\nOUTREACH",c\n1,2,3\n');
    expect(rows[0]).toEqual(["a", "DIGITAL\nOUTREACH", "c"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });

  it("folds the case and punctuation the sheet is inconsistent about", () => {
    expect(nameKey(" muhammad  rashid a.p ")).toBe("MUHAMMAD RASHID AP");
  });
});
