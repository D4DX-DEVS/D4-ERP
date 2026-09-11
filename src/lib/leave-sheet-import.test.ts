// Verification for the Google Sheet migration.
//
// The point of these tests is not that the helper returns some adjustments — it
// is that feeding those adjustments through the real ledger reproduces the
// numbers the team already reads off the printed sheet, to the day. The rows
// below are verbatim from the CL/EL/ML tab, including its blanks.
//
// The migration writes a raw Date into Mongo and /api/db converts Date ->
// { seconds, nanoseconds } on the way out, so `asStored` mimics that boundary
// rather than trusting the in-memory shape.

import { describe, it, expect } from "vitest";
import {
  BUCKETS,
  CODE_MAP,
  buildBalanceAdjustments,
  isSectionRow,
  nameKey,
  parseCsv,
  readBalanceRow,
  resolveSheetRow,
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

function ledgerFor(name: string, allowNegative: boolean) {
  const { quota, adjustments, sheet } = buildBalanceAdjustments(ROWS[name], BASE, YEAR);
  const ledger = computeLeaveLedger({
    requests: [],
    adjustments: asStored(adjustments),
    sundayDuties: [],
    quota: quota as LeaveQuota,
    year: YEAR,
    allowNegative,
  });
  return { ledger, sheet, quota, adjustments };
}

describe("buildBalanceAdjustments — the ERP reproduces the printed sheet", () => {
  // Permanent staff are the ones carrying deficits, so they need the policy that
  // lets a bucket go below zero; everyone else is clamped either way.
  const PEOPLE: [string, boolean][] = [
    ["MUHAMMAD RASHID A P", true],
    ["FAROOQUE C T", false],
    ["MUHAMMED SHAMIL M P", false],
    ["HILAL A P", false],
    ["RAHEEF", false],
  ];

  for (const [name, allowNegative] of PEOPLE) {
    describe(name, () => {
      it("lands on the sheet's BALANCE for every bucket", () => {
        const { ledger, sheet } = ledgerFor(name, allowNegative);
        for (const code of BUCKETS as LeaveBucket[]) {
          expect(ledgerBucket(ledger, code).balance, `${name} ${code} balance`).toBe(sheet.balance[code]);
        }
      });

      it("lands on the sheet's USED for every bucket", () => {
        const { ledger, sheet } = ledgerFor(name, allowNegative);
        for (const code of BUCKETS as LeaveBucket[]) {
          expect(ledgerBucket(ledger, code).used, `${name} ${code} used`).toBe(sheet.used[code]);
        }
      });

      it("carries the sheet's CURRENT allocation as the quota", () => {
        const { quota, sheet } = ledgerFor(name, allowNegative);
        expect(quota).toEqual({
          casualLeave: sheet.current.CL,
          sickLeave: sheet.current.ML,
          earnedLeave: sheet.current.EL,
        });
      });

      it("never attributes more to the months than the year's used total", () => {
        const { ledger } = ledgerFor(name, allowNegative);
        for (const code of BUCKETS as LeaveBucket[]) {
          const b = ledgerBucket(ledger, code);
          const monthSum = b.monthly.reduce((x, y) => x + y, 0);
          expect(monthSum, `${name} ${code} months`).toBeLessThanOrEqual(b.used + 1e-9);
        }
      });
    });
  }

  it("credits flexible leave with what the sheet says was earned, never a quota", () => {
    const { ledger, sheet } = ledgerFor("FAROOQUE C T", false);
    expect(ledger.fl.quota).toBe(0);
    expect(ledger.fl.entitled).toBe(sheet.used.FL + sheet.balance.FL);
  });

  it("gives a permanent staff member no allocation at all", () => {
    const { quota } = ledgerFor("MUHAMMAD RASHID A P", true);
    expect(quota).toEqual({ casualLeave: 0, sickLeave: 0, earnedLeave: 0 });
  });

  it("clamps a deficit to zero when the policy forbids negatives, so the sheet needs one that allows them", () => {
    const clamped = ledgerFor("MUHAMMAD RASHID A P", false).ledger;
    expect(clamped.cl.balance).toBe(0);
    const allowed = ledgerFor("MUHAMMAD RASHID A P", true).ledger;
    expect(allowed.cl.balance).toBe(-3);
  });

  it("writes nothing for a bucket the sheet leaves entirely empty", () => {
    const { adjustments } = ledgerFor("RAHEEF", false);
    expect(adjustments.some((a) => a.bucket === "EL")).toBe(false);
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
});

describe("a row the sheet itself does not add up", () => {
  // Rashid's row is one cell shorter than the header, so its tail is shifted:
  // the month cells read as JAN 2, MAY 2, JUN 3, JUL 2 and DEC 3 — twelve days
  // of flexible leave in a sheet that stops at August, against a USED of nine.
  it("reads TOTAL off the end of the row, so a short row still reconciles", () => {
    const r = readBalanceRow(ROWS["MUHAMMAD RASHID A P"]);
    expect(r.total).toEqual(r.used);
  });

  it("spots the buckets whose months do not add up to USED", () => {
    const r = readBalanceRow(ROWS["MUHAMMAD RASHID A P"]);
    expect(r.monthsReconcile).toMatchObject({ CL: true, EL: true, ML: true, FL: false });
    expect(r.monthly.FL.reduce((a, b) => a + b, 0)).toBe(12);
    expect(r.used.FL).toBe(9);
  });

  it("still lands on the sheet USED, dropping the month detail it cannot trust", () => {
    const { ledger } = ledgerFor("MUHAMMAD RASHID A P", true);
    expect(ledger.fl.used).toBe(9);
    expect(ledger.fl.monthly.reduce((a, b) => a + b, 0)).toBe(9);
    // December is not attributed, because the sheet has no December data.
    expect(ledger.fl.monthly[11]).toBe(0);
  });

  it("keeps the month detail for the buckets that do reconcile", () => {
    const { ledger } = ledgerFor("MUHAMMAD RASHID A P", true);
    expect(ledger.cl.monthly[4]).toBe(2); // May
    expect(ledger.cl.monthly[6]).toBe(1); // July
  });

  it("attributes every month for a row that is whole", () => {
    const r = readBalanceRow(ROWS["FAROOQUE C T"]);
    expect(Object.values(r.monthsReconcile).every(Boolean)).toBe(true);
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
  it("drops someone who has left before looking at their code", () => {
    expect(resolveSheetRow("D4A-101", "BILAL M SHAREEF").kind).toBe("resigned");
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
