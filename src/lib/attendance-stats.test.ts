import { describe, it, expect } from "vitest";
import { attendanceStats } from "@/lib/attendance-stats";
import type { Attendance, AttendanceStatus } from "@/types";

function rec(status: AttendanceStatus, extra: Partial<Attendance> = {}): Attendance {
  return { staffId: "s1", status, ...extra } as Attendance;
}

describe("attendanceStats — leave days", () => {
  it("counts every leave bucket the grid can show", () => {
    const stats = attendanceStats(
      [
        rec("casual-leave"),
        rec("earned-leave"),
        rec("medical-leave"),
        rec("full-leave"),
      ],
      []
    );
    expect(stats.leaveDays).toBe(4);
  });

  it("counts a legacy 'leave' record, which reads as flexible leave", () => {
    expect(attendanceStats([rec("leave" as AttendanceStatus)], []).leaveDays).toBe(1);
  });

  it("does not count absence, week-off or a holiday as leave", () => {
    const stats = attendanceStats(
      [rec("absent"), rec("week-off"), rec("public-holiday"), rec("present")],
      []
    );
    expect(stats.leaveDays).toBe(0);
  });
});

describe("attendanceStats — present days", () => {
  it("counts a day the person actually worked, however it was logged", () => {
    const stats = attendanceStats(
      [
        rec("present"),
        rec("late" as AttendanceStatus),
        rec("wfh" as AttendanceStatus),
        rec("half-day"),
        rec("on-duty"),
        rec("overtime"),
      ],
      []
    );
    expect(stats.presentDays).toBe(6);
  });

  it("leaves leave, absence and non-working days out of the present count", () => {
    const stats = attendanceStats(
      [rec("absent"), rec("casual-leave"), rec("week-off"), rec("public-holiday")],
      []
    );
    expect(stats.presentDays).toBe(0);
  });

  it("never counts one day as both present and leave", () => {
    const records = [rec("present"), rec("casual-leave"), rec("absent"), rec("overtime")];
    const stats = attendanceStats(records, []);
    expect(stats.presentDays + stats.leaveDays).toBeLessThanOrEqual(records.length);
    expect(stats.presentDays).toBe(2);
    expect(stats.leaveDays).toBe(1);
  });
});

describe("attendanceStats — late marks and headcount", () => {
  it("counts the rows flagged late, whatever status they carry", () => {
    const stats = attendanceStats([rec("present", { isLate: true }), rec("present")], []);
    expect(stats.lateMarks).toBe(1);
  });

  it("counts the live roster and leaves removed staff out of the headcount", () => {
    const stats = attendanceStats([], [{ isDeleted: false }, {}, { isDeleted: true }]);
    expect(stats.staff).toBe(2);
  });

  it("reports zeroes for an empty month", () => {
    expect(attendanceStats([], [])).toEqual({
      staff: 0,
      presentDays: 0,
      leaveDays: 0,
      lateMarks: 0,
    });
  });
});

describe("attendanceStats — deleted records", () => {
  it("ignores a soft-deleted record in every counter", () => {
    const stats = attendanceStats(
      [
        rec("present", { isDeleted: true }),
        rec("casual-leave", { isDeleted: true }),
        rec("present", { isLate: true, isDeleted: true }),
        rec("present"),
      ],
      []
    );
    expect(stats).toEqual({ staff: 0, presentDays: 1, leaveDays: 0, lateMarks: 0 });
  });
});
