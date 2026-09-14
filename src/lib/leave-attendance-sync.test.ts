import { describe, it, expect } from "vitest";
import {
  attendanceStatusForBucket,
  bucketForAttendanceStatus,
  planAttendanceReconcile,
  planRequestWriteback,
  requestDayKeys,
} from "@/lib/leave-attendance-sync";
import { Timestamp } from "@/lib/firestore";
import type { Attendance, AttendanceStatus, LeaveAdjustment, StaffRequest } from "@/types";

function ts(date: string): Timestamp {
  return Timestamp.fromDate(new Date(`${date}T00:00:00`));
}

function request(
  leaveType: StaffRequest["leaveType"],
  start: string,
  end = start,
  extra: Partial<StaffRequest> = {}
): StaffRequest & { id: string } {
  return {
    id: "req-1",
    staffId: "s1",
    type: "leave",
    leaveType,
    startDate: ts(start),
    endDate: ts(end),
    reason: "Personal",
    status: "approved",
    ...extra,
  } as StaffRequest & { id: string };
}

function row(
  id: string,
  date: string,
  status: AttendanceStatus,
  extra: Partial<Attendance> = {}
): Attendance & { id: string } {
  return { id, staffId: "s1", date: ts(date), status, ...extra } as Attendance & { id: string };
}

function adjustment(
  id: string,
  sourceAttendanceId: string,
  extra: Partial<LeaveAdjustment> = {}
): LeaveAdjustment & { id: string } {
  return {
    id,
    staffId: "s1",
    year: 2026,
    bucket: "CL",
    kind: "attendance",
    days: -1,
    date: ts("2026-09-07"),
    reason: "attendance",
    sourceAttendanceId,
    ...extra,
  } as LeaveAdjustment & { id: string };
}

describe("bucket ↔ attendance status", () => {
  it("maps every balance bucket onto the status the grid shows", () => {
    expect(attendanceStatusForBucket("CL")).toBe("casual-leave");
    expect(attendanceStatusForBucket("EL")).toBe("earned-leave");
    expect(attendanceStatusForBucket("ML")).toBe("medical-leave");
    expect(attendanceStatusForBucket("FL")).toBe("full-leave");
  });

  it("maps back again, so a round trip never changes the bucket", () => {
    for (const bucket of ["CL", "EL", "ML", "FL"] as const) {
      expect(bucketForAttendanceStatus(attendanceStatusForBucket(bucket))).toBe(bucket);
    }
  });

  it("reads a legacy 'leave' record as flexible leave, the way the grid does", () => {
    expect(bucketForAttendanceStatus("leave" as AttendanceStatus)).toBe("FL");
  });

  it("returns null for a day that is not leave at all", () => {
    expect(bucketForAttendanceStatus("present")).toBeNull();
    expect(bucketForAttendanceStatus("absent")).toBeNull();
    expect(bucketForAttendanceStatus("week-off")).toBeNull();
    expect(bucketForAttendanceStatus("on-duty")).toBeNull();
  });
});

describe("planRequestWriteback — days it writes", () => {
  it("writes one day per date the request covers", () => {
    const plan = planRequestWriteback({ request: request("CL", "2026-09-07", "2026-09-09"), existingRows: [] });
    expect(plan.upserts.map((u) => u.dayKey)).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
    expect(plan.upserts.every((u) => u.status === "casual-leave")).toBe(true);
  });

  it("carries the request across a month boundary", () => {
    const plan = planRequestWriteback({ request: request("CL", "2026-08-31", "2026-09-01"), existingRows: [] });
    expect(plan.upserts.map((u) => u.dayKey)).toEqual(["2026-08-31", "2026-09-01"]);
  });

  it("writes the medical status for a legacy SL request", () => {
    const plan = planRequestWriteback({ request: request("SL", "2026-09-07"), existingRows: [] });
    expect(plan.upserts[0].status).toBe("medical-leave");
  });

  it("marks a half-day request as half a day", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07", "2026-09-07", { isHalfDay: true }),
      existingRows: [],
    });
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0].isHalfDay).toBe(true);
  });

  it("writes nothing for a request that draws on no balance", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07", "2026-09-07", { type: "overtime" }),
      existingRows: [],
    });
    expect(plan.upserts).toEqual([]);
  });
});

describe("planRequestWriteback — what it will and will not overwrite", () => {
  it("overwrites an absence, because they were on approved leave", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07"),
      existingRows: [row("a1", "2026-09-07", "absent")],
    });
    expect(plan.upserts.map((u) => u.dayKey)).toEqual(["2026-09-07"]);
    expect(plan.conflicts).toEqual([]);
  });

  it("leaves a day they actually worked alone, and reports it", () => {
    for (const status of ["present", "on-duty", "overtime", "half-day"] as AttendanceStatus[]) {
      const plan = planRequestWriteback({
        request: request("CL", "2026-09-07"),
        existingRows: [row("a1", "2026-09-07", status)],
      });
      expect(plan.upserts).toEqual([]);
      expect(plan.conflicts).toEqual([
        { dayKey: "2026-09-07", attendanceId: "a1", existingStatus: status, reason: "worked" },
      ]);
    }
  });

  it("leaves a week-off or holiday alone — it was never a working day", () => {
    for (const status of ["week-off", "public-holiday"] as AttendanceStatus[]) {
      const plan = planRequestWriteback({
        request: request("CL", "2026-09-07"),
        existingRows: [row("a1", "2026-09-07", status)],
      });
      expect(plan.upserts).toEqual([]);
      expect(plan.conflicts[0].reason).toBe("non-working");
    }
  });

  it("leaves a day another request already owns alone", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07"),
      existingRows: [row("a1", "2026-09-07", "earned-leave", { leaveRequestId: "req-other" })],
    });
    expect(plan.upserts).toEqual([]);
    expect(plan.conflicts[0].reason).toBe("other-request");
  });

  it("rewrites a day this same request already owns, so a re-run stays correct", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07"),
      existingRows: [row("a1", "2026-09-07", "casual-leave", { leaveRequestId: "req-1" })],
    });
    expect(plan.upserts.map((u) => u.dayKey)).toEqual(["2026-09-07"]);
    expect(plan.conflicts).toEqual([]);
  });

  it("supersedes a leave day someone marked by hand", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07"),
      existingRows: [row("a1", "2026-09-07", "medical-leave")],
    });
    expect(plan.upserts.map((u) => u.dayKey)).toEqual(["2026-09-07"]);
    expect(plan.conflicts).toEqual([]);
  });

  it("ignores a soft-deleted row and writes the day", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07"),
      existingRows: [row("a1", "2026-09-07", "present", { isDeleted: true })],
    });
    expect(plan.upserts.map((u) => u.dayKey)).toEqual(["2026-09-07"]);
    expect(plan.conflicts).toEqual([]);
  });
});

describe("planAttendanceReconcile — posting the adjustment", () => {
  it("posts one debit for a leave day nobody requested", () => {
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-07", "casual-leave")],
      adjustments: [],
    });
    expect(plan.remove).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toMatchObject({
      attendanceId: "a1",
      dayKey: "2026-09-07",
      bucket: "CL",
      days: -1,
      year: 2026,
    });
  });

  it("skips a day an approved request already consumed", () => {
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-07", "casual-leave", { leaveRequestId: "req-1" })],
      adjustments: [],
    });
    expect(plan.create).toEqual([]);
  });

  it("skips days that are not leave", () => {
    const plan = planAttendanceReconcile({
      rows: [
        row("a1", "2026-09-07", "present"),
        row("a2", "2026-09-08", "absent"),
        row("a3", "2026-09-09", "week-off"),
        row("a4", "2026-09-10", "on-duty"),
      ],
      adjustments: [],
    });
    expect(plan.create).toEqual([]);
  });
});

describe("planAttendanceReconcile — running it twice", () => {
  it("changes nothing the second time", () => {
    const rows = [row("a1", "2026-09-07", "casual-leave")];
    const adjustments = [adjustment("adj-1", "a1")];
    const plan = planAttendanceReconcile({ rows, adjustments });
    expect(plan).toEqual({ create: [], update: [], remove: [], mismatches: [] });
  });

  it("updates rather than duplicates when the day's leave type changed", () => {
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-07", "medical-leave")],
      adjustments: [adjustment("adj-1", "a1", { bucket: "CL" })],
    });
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].adjustmentId).toBe("adj-1");
    expect(plan.update[0].entry.bucket).toBe("ML");
  });

  it("removes the adjustment when the day stopped being leave", () => {
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-07", "present")],
      adjustments: [adjustment("adj-1", "a1")],
    });
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual(["adj-1"]);
  });

  it("removes the adjustment when the attendance row is gone", () => {
    const plan = planAttendanceReconcile({ rows: [], adjustments: [adjustment("adj-1", "a1")] });
    expect(plan.remove).toEqual(["adj-1"]);
  });

  it("removes the adjustment once a request takes the day over", () => {
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-07", "casual-leave", { leaveRequestId: "req-1" })],
      adjustments: [adjustment("adj-1", "a1")],
    });
    expect(plan.remove).toEqual(["adj-1"]);
    expect(plan.create).toEqual([]);
  });

  it("never touches an adjustment that did not come from attendance", () => {
    const manual = adjustment("adj-manual", "", { kind: "grant", days: 2 });
    delete (manual as { sourceAttendanceId?: string }).sourceAttendanceId;
    const plan = planAttendanceReconcile({ rows: [], adjustments: [manual] });
    expect(plan.remove).toEqual([]);
  });
});

describe("the double-deduction guard", () => {
  it("never counts a day through both a request and an adjustment", () => {
    // The request writes the day and stamps it with its own id...
    const writeback = planRequestWriteback({
      request: request("CL", "2026-09-07"),
      existingRows: [row("a1", "2026-09-07", "absent")],
    });
    expect(writeback.upserts).toHaveLength(1);

    // ...and the row that write produces is then skipped by the reconcile.
    const written = row("a1", "2026-09-07", "casual-leave", { leaveRequestId: "req-1" });
    expect(planAttendanceReconcile({ rows: [written], adjustments: [] }).create).toEqual([]);
  });
});

describe("planRequestWriteback — remembering what it replaced", () => {
  it("records the status it is about to overwrite, so withdrawing can put it back", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07"),
      existingRows: [row("a1", "2026-09-07", "absent")],
    });
    expect(plan.upserts[0].replacesStatus).toBe("absent");
  });

  it("records a hand-marked leave day it supersedes", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07"),
      existingRows: [row("a1", "2026-09-07", "medical-leave")],
    });
    expect(plan.upserts[0].replacesStatus).toBe("medical-leave");
  });

  it("records nothing for a day that had no record at all", () => {
    const plan = planRequestWriteback({ request: request("CL", "2026-09-07"), existingRows: [] });
    expect(plan.upserts[0].replacesStatus).toBeUndefined();
  });

  it("does not record its own earlier write when the request is re-run", () => {
    const plan = planRequestWriteback({
      request: request("CL", "2026-09-07"),
      existingRows: [row("a1", "2026-09-07", "casual-leave", { leaveRequestId: "req-1" })],
    });
    expect(plan.upserts[0].replacesStatus).toBeUndefined();
  });
});

describe("planAttendanceReconcile — days an approved request already covers", () => {
  const covered = (staffId: string, dayKey: string) => new Set([`${staffId}|${dayKey}`]);

  it("skips a day an approved request covers even when the row carries no stamp", () => {
    // Requests approved before the writeback existed never stamped their days.
    // Matching on staff and date is what stops those being deducted twice.
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-07", "full-leave")],
      adjustments: [],
      coveredDays: covered("s1", "2026-09-07"),
    });
    expect(plan.create).toEqual([]);
  });

  it("reports the day when the register and the request disagree on the bucket", () => {
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-07", "full-leave")],
      adjustments: [],
      coveredDays: covered("s1", "2026-09-07"),
    });
    expect(plan.mismatches).toEqual([
      { attendanceId: "a1", staffId: "s1", dayKey: "2026-09-07", bucket: "FL" },
    ]);
  });

  it("withdraws a debit posted before the request was noticed", () => {
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-07", "full-leave")],
      adjustments: [adjustment("adj-1", "a1", { bucket: "FL" })],
      coveredDays: covered("s1", "2026-09-07"),
    });
    expect(plan.remove).toEqual(["adj-1"]);
    expect(plan.create).toEqual([]);
  });

  it("still posts for another staff member on the same date", () => {
    const plan = planAttendanceReconcile({
      rows: [{ ...row("a2", "2026-09-07", "casual-leave"), staffId: "s2" }],
      adjustments: [],
      coveredDays: covered("s1", "2026-09-07"),
    });
    expect(plan.create).toHaveLength(1);
  });

  it("still posts for the same person on a date no request covers", () => {
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-08", "casual-leave")],
      adjustments: [],
      coveredDays: covered("s1", "2026-09-07"),
    });
    expect(plan.create).toHaveLength(1);
  });

  it("behaves as before when no coverage is supplied", () => {
    const plan = planAttendanceReconcile({
      rows: [row("a1", "2026-09-07", "casual-leave")],
      adjustments: [],
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.mismatches).toEqual([]);
  });
});

describe("requestDayKeys", () => {
  it("expands a request into the days it covers", () => {
    expect(requestDayKeys(request("CL", "2026-09-07", "2026-09-09"))).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
    ]);
  });

  it("returns nothing for a request with no dates on it", () => {
    const undated = request("CL", "2026-09-07");
    delete (undated as { startDate?: unknown }).startDate;
    expect(requestDayKeys(undated)).toEqual([]);
  });
});
