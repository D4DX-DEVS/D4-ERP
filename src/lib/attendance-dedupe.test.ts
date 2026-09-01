import { describe, expect, it } from "vitest";
import { dayKeyFromSec, dedupeAttendance, pickAttendanceRecord } from "./attendance-dedupe";

type Rec = Parameters<typeof pickAttendanceRecord>[0] & { id: string; staffId: string };

const ts = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000) });

const rec = (over: Partial<Rec>): Rec => ({
  id: "r1",
  staffId: "s1",
  status: "present",
  date: ts("2026-09-01T00:00:00+05:30"),
  ...over,
});

describe("pickAttendanceRecord", () => {
  it("correction beats a stale non-absent import row regardless of order", () => {
    const imported = rec({ id: "imp", source: "biometric", status: "present" });
    const corrected = rec({ id: "cor", source: "correction", status: "on-duty" });
    expect(pickAttendanceRecord(imported, corrected).id).toBe("cor");
    expect(pickAttendanceRecord(corrected, imported).id).toBe("cor");
  });

  it("correction beats a manual row", () => {
    const manual = rec({ id: "man", source: "manual" });
    const corrected = rec({ id: "cor", source: "correction" });
    expect(pickAttendanceRecord(manual, corrected).id).toBe("cor");
  });

  it("manual beats an import row", () => {
    const imported = rec({ id: "imp", source: "biometric" });
    const manual = rec({ id: "man", source: "manual" });
    expect(pickAttendanceRecord(imported, manual).id).toBe("man");
    expect(pickAttendanceRecord(manual, imported).id).toBe("man");
  });

  it("same source class: newer updatedAt wins", () => {
    const older = rec({ id: "old", source: "biometric", updatedAt: ts("2026-09-01T10:00:00Z") });
    const newer = rec({ id: "new", source: "biometric", updatedAt: ts("2026-09-02T10:00:00Z") });
    expect(pickAttendanceRecord(older, newer).id).toBe("new");
    expect(pickAttendanceRecord(newer, older).id).toBe("new");
  });

  it("no timestamps and same class: non-absent beats absent (legacy healing rule)", () => {
    const absent = rec({ id: "abs", status: "absent" });
    const present = rec({ id: "pre", status: "present" });
    expect(pickAttendanceRecord(absent, present).id).toBe("pre");
    expect(pickAttendanceRecord(present, absent).id).toBe("pre");
  });

  it("fully equal rows: keeps the first (stable)", () => {
    const a = rec({ id: "a" });
    const b = rec({ id: "b" });
    expect(pickAttendanceRecord(a, b).id).toBe("a");
  });
});

describe("dedupeAttendance", () => {
  it("collapses duplicate rows per staff+local-day, preferring corrections", () => {
    const rows: Rec[] = [
      // Import stored at UTC midnight, correction stored at IST midnight — same IST day
      rec({ id: "imp", source: "biometric", status: "present", date: ts("2026-09-01T00:00:00Z") }),
      rec({ id: "cor", source: "correction", status: "on-duty", date: ts("2026-09-01T00:00:00+05:30") }),
      rec({ id: "other-staff", staffId: "s2", source: "biometric", date: ts("2026-09-01T00:00:00Z") }),
      rec({ id: "other-day", source: "biometric", date: ts("2026-09-02T00:00:00Z") }),
    ];
    const out = dedupeAttendance(rows);
    expect(out).toHaveLength(3);
    expect(out.find((r) => r.staffId === "s1" && dayKeyFromSec(r.date!.seconds) === "2026-09-01")?.id).toBe("cor");
  });

  it("drops rows without a usable date", () => {
    const out = dedupeAttendance([rec({ id: "no-date", date: undefined })]);
    expect(out).toHaveLength(0);
  });
});
