import { describe, it, expect } from "vitest";
import PDFParser from "pdf2json";
import { parseAttendancePdf } from "./parsers";

// Synthetic pdf2json Output mimicking the ESSL "Basic Work Duration" layout:
// title row, date-range row, day-header row (7 numeric columns + weekday
// letters that must be ignored), then two employee blocks. Employee 2 has a
// gap (no InTime/OutTime) on day 5 to exercise column-bucketing on blanks,
// and an unknown status code on day 7.
function text(x: number, y: number, t: string) {
  return { x, y, w: 0, sw: 0, A: "left" as const, R: [{ T: t, S: 0, TS: [0, 10, 0, 0] as [number, number, 0 | 1, 0 | 1] }] };
}

const page = {
  Width: 100,
  Height: 100,
  HLines: [],
  VLines: [],
  Fills: [],
  Fields: [],
  Boxsets: [],
  Texts: [
    text(5, 0, "Monthly Status Report (Basic Work Duration)"),
    text(5, 1, "Jul 01 2026 To Jul 07 2026"),
    text(2, 2, "Days"),
    text(10, 2, "1"), text(11, 2, "W"),
    text(15, 2, "2"), text(16, 2, "Th"),
    text(20, 2, "3"), text(21, 2, "F"),
    text(25, 2, "4"), text(26, 2, "St"),
    text(30, 2, "5"), text(31, 2, "S"),
    text(35, 2, "6"), text(36, 2, "M"),
    text(40, 2, "7"), text(41, 2, "T"),

    // Employee 1: full week, all present
    text(2, 3, "Emp. Code:"), text(6, 3, "1000"), text(9, 3, "Emp. Name:"), text(14, 3, "MUHAMMAD RASHID"),
    text(2, 4, "Status"),
    text(10, 4, "P"), text(15, 4, "P"), text(20, 4, "P"), text(25, 4, "P"), text(30, 4, "P"), text(35, 4, "P"), text(40, 4, "P"),
    text(2, 5, "InTime"),
    text(10, 5, "09:32"), text(15, 5, "09:01"), text(20, 5, "09:27"), text(25, 5, "09:10"), text(30, 5, "09:00"), text(35, 5, "09:12"), text(40, 5, "09:31"),
    text(2, 6, "OutTime"),
    text(10, 6, "20:00"), text(15, 6, "22:10"), text(20, 6, "17:52"), text(25, 6, "18:00"), text(30, 6, "18:00"), text(35, 6, "20:56"), text(40, 6, "18:00"),

    // Employee 2: gap on day 5 (no In/Out), unknown status "H" on day 7
    text(2, 7, "Emp. Code:"), text(6, 7, "1001"), text(9, 7, "Emp. Name:"), text(14, 7, "AHMED JASIM"),
    text(2, 8, "Status"),
    text(10, 8, "P"), text(15, 8, "A"), text(20, 8, "A"), text(25, 8, "A"), text(30, 8, "WO"), text(35, 8, "P"), text(40, 8, "H"),
    text(2, 9, "InTime"),
    text(10, 9, "09:28"), text(15, 9, "09:59"), text(20, 9, "09:26"), text(25, 9, "09:29"), text(35, 9, "10:07"), text(40, 9, "09:30"),
    text(2, 10, "OutTime"),
    text(10, 10, "16:51"), text(35, 10, "17:25"),
  ],
};

const fixture = { Transcoder: "test", Meta: {}, Pages: [page] };

// Stubs PDFParser to emit a canned fixture instead of decoding a real PDF binary.
function stubParser(data: unknown) {
  const originalParseBuffer = PDFParser.prototype.parseBuffer;
  const originalOn = PDFParser.prototype.on;
  type StubbedParser = { _readyCb?: (arg: unknown) => void };
  PDFParser.prototype.on = function (this: StubbedParser, event: string, cb: (arg: unknown) => void) {
    if (event === "pdfParser_dataReady") this._readyCb = cb;
    return this as unknown as PDFParser;
  } as typeof PDFParser.prototype.on;
  PDFParser.prototype.parseBuffer = function (this: StubbedParser) {
    this._readyCb?.(data);
  } as typeof PDFParser.prototype.parseBuffer;
  return () => {
    PDFParser.prototype.parseBuffer = originalParseBuffer;
    PDFParser.prototype.on = originalOn;
  };
}

describe("parseAttendancePdf (ESSL basic work duration)", () => {
  it("reconstructs employees, day columns and gaps from positioned text", async () => {
    const restore = stubParser(fixture);
    try {
      const result = await parseAttendancePdf(Buffer.from(""));

      expect(result.format).toBe("essl-basic-work-duration");
      expect(result.dateRange).toEqual({ start: "2026-07-01", end: "2026-07-07" });
      expect(result.employees).toHaveLength(2);

      const emp1 = result.employees[0];
      expect(emp1.empCode).toBe("1000");
      expect(emp1.empName).toBe("MUHAMMAD RASHID");
      expect(emp1.records).toHaveLength(7);
      expect(emp1.records[0]).toMatchObject({ date: "2026-07-01", status: "present", checkIn: "09:32", checkOut: "20:00" });

      const emp2 = result.employees[1];
      expect(emp2.empCode).toBe("1001");
      // Day 5 (index 4): status WO -> public-holiday, no check-in/out (the gap).
      expect(emp2.records[4]).toMatchObject({ date: "2026-07-05", status: "public-holiday", rawStatus: "WO" });
      expect(emp2.records[4].checkIn).toBeUndefined();
      expect(emp2.records[4].checkOut).toBeUndefined();
      // Day 7: unknown "H" code defaults to absent with a warning, not silently dropped.
      expect(emp2.records[6].status).toBe("absent");
      expect(emp2.records[6].warnings.some((w) => w.includes("Unknown status"))).toBe(true);
    } finally {
      restore();
    }
  });

  it("rejects an unrecognized report format", async () => {
    const notEssl = { Transcoder: "t", Meta: {}, Pages: [{ ...page, Texts: [text(0, 0, "Some other report")] }] };
    const restore = stubParser(notEssl);
    try {
      await expect(parseAttendancePdf(Buffer.from(""))).rejects.toThrow("Unsupported attendance report format.");
    } finally {
      restore();
    }
  });
});
