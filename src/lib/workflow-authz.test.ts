import { describe, it, expect } from "vitest";
import {
  authorizeRequestCreate,
  authorizeRequestUpdate,
  authorizeRequestDelete,
  requestUpdatePrecondition,
  authorizeReportWrite,
  reportUpdatePrecondition,
  reportDeletePrecondition,
  type WorkflowActor,
} from "@/lib/workflow-authz";

const admin: WorkflowActor = { uid: "adm", role: "admin", departmentId: null };
const head: WorkflowActor = { uid: "head", role: "department-head", departmentId: "events" };
const otherHead: WorkflowActor = { uid: "head2", role: "department-head", departmentId: "kids" };
const staff: WorkflowActor = { uid: "stf", role: "staff", departmentId: "events" };
const accounts: WorkflowActor = { uid: "acc", role: "accounts", departmentId: "ops" };

const pending = { status: "pending" };

function newRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    staffId: "stf",
    departmentId: "events",
    type: "leave",
    leaveType: "CL",
    startDate: new Date("2026-09-24T00:00:00Z"),
    endDate: new Date("2026-09-25T00:00:00Z"),
    reason: "family",
    deptHead: pending,
    admin: pending,
    status: "pending",
    ...overrides,
  };
}

/** A stored two-step request, as the guard reads it back from the database. */
function stored(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return newRequest(overrides);
}

const approvedBy = (by: string) => ({ status: "approved", by, byName: "X", at: new Date() });
const rejectedBy = (by: string) => ({ status: "rejected", by, byName: "X", at: new Date() });

describe("authorizeRequestCreate", () => {
  it("lets staff file a pending request for themselves", () => {
    expect(authorizeRequestCreate(staff, newRequest())).toBeNull();
  });

  it("refuses a request filed in someone else's name", () => {
    expect(authorizeRequestCreate(staff, newRequest({ staffId: "someone-else" }))).toMatch(/yourself/i);
  });

  it("refuses a request filed under another department (it would dodge the right head)", () => {
    expect(authorizeRequestCreate(staff, newRequest({ departmentId: "kids" }))).toMatch(/department/i);
  });

  it("refuses a request that arrives already approved", () => {
    expect(authorizeRequestCreate(staff, newRequest({ status: "approved" }))).toMatch(/pending/i);
    expect(
      authorizeRequestCreate(staff, newRequest({ admin: { status: "approved" } }))
    ).toMatch(/decision/i);
    expect(
      authorizeRequestCreate(staff, newRequest({ deptHead: { status: "approved" } }))
    ).toMatch(/decision/i);
    expect(authorizeRequestCreate(staff, newRequest({ adminOverride: true }))).toMatch(/decision/i);
  });

  it("refuses a request without both approval steps (single-step legacy shape skips the head)", () => {
    const noHead = newRequest();
    delete noHead.deptHead;
    expect(authorizeRequestCreate(staff, noHead)).toMatch(/approval steps/i);
  });

  it("refuses an end date before the start date", () => {
    expect(
      authorizeRequestCreate(
        staff,
        newRequest({
          startDate: new Date("2026-09-25T00:00:00Z"),
          endDate: new Date("2026-09-24T00:00:00Z"),
        })
      )
    ).toMatch(/end date/i);
  });

  it("refuses overtime whose start and end time are the same (would read as 24 hours)", () => {
    expect(
      authorizeRequestCreate(staff, newRequest({ type: "overtime", startTime: "18:00", endTime: "18:00" }))
    ).toMatch(/same/i);
  });

  it("refuses overtime without a valid HH:MM window", () => {
    expect(
      authorizeRequestCreate(staff, newRequest({ type: "overtime", startTime: "", endTime: "22:00" }))
    ).toMatch(/time/i);
    expect(
      authorizeRequestCreate(staff, newRequest({ type: "overtime", startTime: "25:00", endTime: "22:00" }))
    ).toMatch(/time/i);
  });

  it("accepts overnight overtime", () => {
    expect(
      authorizeRequestCreate(staff, newRequest({ type: "overtime", startTime: "22:00", endTime: "02:00" }))
    ).toBeNull();
  });

  it("still holds an admin to the pending start (approval must go through the decision)", () => {
    expect(authorizeRequestCreate(admin, newRequest({ status: "approved" }))).toMatch(/pending/i);
    expect(authorizeRequestCreate(admin, newRequest({ staffId: "stf" }))).toBeNull();
  });
});

describe("authorizeRequestUpdate — department head", () => {
  const decide = (step: unknown, status: string) => ({ deptHead: step, status, updatedAt: new Date() });

  it("lets the head of the department approve the department step", () => {
    expect(authorizeRequestUpdate(head, stored(), decide(approvedBy("head"), "pending"))).toBeNull();
  });

  it("lets the head reject, which ends the request", () => {
    expect(authorizeRequestUpdate(head, stored(), decide(rejectedBy("head"), "rejected"))).toBeNull();
  });

  it("refuses a head writing a final 'approved' status — only the admin step finalises", () => {
    expect(authorizeRequestUpdate(head, stored(), decide(approvedBy("head"), "approved"))).toMatch(
      /approval steps/i
    );
    expect(authorizeRequestUpdate(head, stored(), { status: "approved" })).toMatch(/department step/i);
  });

  it("refuses a head cancelling somebody else's request", () => {
    expect(authorizeRequestUpdate(head, stored(), { status: "cancelled" })).toMatch(/department step/i);
  });

  it("refuses the head of another department", () => {
    expect(authorizeRequestUpdate(otherHead, stored(), decide(approvedBy("head2"), "pending"))).toMatch(
      /own department/i
    );
  });

  it("refuses a head with no department on file (used to pass as a wildcard)", () => {
    const orphan = { ...head, departmentId: null };
    expect(authorizeRequestUpdate(orphan, stored(), decide(approvedBy("head"), "pending"))).toMatch(
      /own department/i
    );
  });

  it("refuses a head deciding their own request", () => {
    const own = stored({ staffId: "head" });
    expect(authorizeRequestUpdate(head, own, decide(approvedBy("head"), "pending"))).toMatch(/your own/i);
  });

  it("lets a head cancel their own pending request", () => {
    const own = stored({ staffId: "head" });
    expect(authorizeRequestUpdate(head, own, { status: "cancelled" })).toBeNull();
  });

  it("refuses re-deciding a step that was already decided", () => {
    const decided = stored({ deptHead: approvedBy("head") });
    expect(authorizeRequestUpdate(head, decided, decide(rejectedBy("head"), "rejected"))).toMatch(
      /already been decided/i
    );
  });

  it("refuses a decision stamped with somebody else's name", () => {
    expect(authorizeRequestUpdate(head, stored(), decide(approvedBy("adm"), "pending"))).toMatch(
      /your own name/i
    );
  });

  it("refuses a step status that is not a decision", () => {
    expect(authorizeRequestUpdate(head, stored(), decide({ status: "pending", by: "head" }, "pending"))).toMatch(
      /approve or reject/i
    );
  });

  it("refuses writing the admin step", () => {
    expect(
      authorizeRequestUpdate(head, stored(), { admin: approvedBy("head"), status: "approved" })
    ).toMatch(/department step/i);
  });

  it("refuses legacy single-step requests (admin decides those)", () => {
    const legacy = { staffId: "stf", departmentId: "events", status: "pending" };
    expect(authorizeRequestUpdate(head, legacy, decide(approvedBy("head"), "pending"))).toMatch(/admin/i);
  });
});

describe("authorizeRequestUpdate — admin", () => {
  it("approves after the head approved", () => {
    const afterHead = stored({ deptHead: approvedBy("head") });
    expect(authorizeRequestUpdate(admin, afterHead, { admin: approvedBy("adm"), status: "approved" })).toBeNull();
  });

  it("approves directly while the head is still pending (override)", () => {
    expect(
      authorizeRequestUpdate(admin, stored(), { admin: approvedBy("adm"), status: "approved", adminOverride: true })
    ).toBeNull();
  });

  it("rejects", () => {
    expect(authorizeRequestUpdate(admin, stored(), { admin: rejectedBy("adm"), status: "rejected" })).toBeNull();
  });

  it("refuses a bare status flip that skips recording the decision", () => {
    expect(authorizeRequestUpdate(admin, stored(), { status: "approved" })).toMatch(/approval steps/i);
  });

  it("refuses re-deciding once the request is final", () => {
    const done = stored({ admin: approvedBy("adm"), status: "approved" });
    expect(authorizeRequestUpdate(admin, done, { admin: rejectedBy("adm"), status: "rejected" })).toMatch(
      /finalised/i
    );
  });

  it("refuses reviving a request the head rejected", () => {
    const rejected = stored({ deptHead: rejectedBy("head"), status: "rejected" });
    expect(authorizeRequestUpdate(admin, rejected, { admin: approvedBy("adm"), status: "approved" })).toMatch(
      /finalised/i
    );
  });

  it("decides a legacy single-step request by status", () => {
    const legacy = { staffId: "stf", status: "pending" };
    expect(authorizeRequestUpdate(admin, legacy, { status: "approved", approvedBy: "adm" })).toBeNull();
  });
});

describe("authorizeRequestUpdate — staff and other roles", () => {
  it("lets the owner cancel their own pending request", () => {
    expect(authorizeRequestUpdate(staff, stored(), { status: "cancelled", updatedAt: new Date() })).toBeNull();
  });

  it("refuses the owner cancelling a decided request", () => {
    const done = stored({ admin: approvedBy("adm"), status: "approved" });
    expect(authorizeRequestUpdate(staff, done, { status: "cancelled" })).toMatch(/finalised/i);
  });

  it("refuses the owner approving their own request", () => {
    expect(authorizeRequestUpdate(staff, stored(), { admin: approvedBy("stf"), status: "approved" })).toMatch(
      /cancel/i
    );
  });

  it("refuses staff touching someone else's request", () => {
    expect(authorizeRequestUpdate(staff, stored({ staffId: "x" }), { status: "cancelled" })).toMatch(
      /your own/i
    );
  });

  it("refuses accounts deciding a request (used to fall through unrestricted)", () => {
    expect(
      authorizeRequestUpdate(accounts, stored(), { admin: approvedBy("acc"), status: "approved" })
    ).toMatch(/your own/i);
  });
});

describe("authorizeRequestDelete", () => {
  it("is admin-only — anyone else could erase an approved request and its history", () => {
    expect(authorizeRequestDelete(admin)).toBeNull();
    for (const u of [head, staff, accounts]) {
      expect(authorizeRequestDelete(u)).toMatch(/admin/i);
    }
  });
});

describe("requestUpdatePrecondition", () => {
  it("pins a decision to a still-pending request and a still-pending step", () => {
    expect(requestUpdatePrecondition({ deptHead: approvedBy("head"), status: "pending" })).toEqual({
      status: "pending",
      "deptHead.status": "pending",
    });
    expect(requestUpdatePrecondition({ admin: approvedBy("adm"), status: "approved" })).toEqual({
      status: "pending",
      "admin.status": "pending",
    });
  });

  it("pins a cancel to a pending request", () => {
    expect(requestUpdatePrecondition({ status: "cancelled" })).toEqual({ status: "pending" });
  });

  it("adds nothing for a write outside the workflow", () => {
    expect(requestUpdatePrecondition({ reason: "typo fix" })).toEqual({});
  });
});

describe("authorizeReportWrite", () => {
  const draft = { departmentId: "events", status: "draft", generatedBy: "head" };
  const submitted = { ...draft, status: "submitted" };
  const rejected = { ...draft, status: "rejected", reviewNote: "add numbers" };

  it("lets a head start a draft for their own department", () => {
    expect(authorizeReportWrite(head, "create", null, { departmentId: "events", status: "draft" })).toBeNull();
  });

  it("refuses a head filing for another department", () => {
    expect(authorizeReportWrite(head, "create", null, { departmentId: "kids", status: "draft" })).toMatch(
      /own department/i
    );
    expect(authorizeReportWrite(otherHead, "update", draft, { body: "x" })).toMatch(/own department/i);
  });

  it("refuses a head creating a document that is already submitted or published", () => {
    expect(authorizeReportWrite(head, "create", null, { departmentId: "events", status: "published" })).toMatch(
      /draft/i
    );
  });

  it("lets a head edit and submit a draft or a sent-back document", () => {
    expect(authorizeReportWrite(head, "update", draft, { body: "x" })).toBeNull();
    expect(
      authorizeReportWrite(head, "update", draft, { body: "x", status: "submitted", reviewNote: "" })
    ).toBeNull();
    expect(authorizeReportWrite(head, "update", rejected, { status: "submitted", reviewNote: "" })).toBeNull();
  });

  it("refuses a head editing a document already with the admin", () => {
    expect(authorizeReportWrite(head, "update", submitted, { body: "rewrite" })).toMatch(/submitted/i);
  });

  it("refuses a head publishing or reviewing their own filing", () => {
    expect(authorizeReportWrite(head, "update", draft, { status: "published" })).toMatch(/draft or submit/i);
    expect(authorizeReportWrite(head, "update", draft, { reviewNote: "looks great" })).toMatch(/review/i);
    expect(authorizeReportWrite(head, "update", draft, { reviewedBy: "head" })).toMatch(/review/i);
  });

  it("lets a head delete only their own department's draft", () => {
    expect(authorizeReportWrite(head, "delete", draft, undefined)).toBeNull();
    expect(authorizeReportWrite(head, "delete", submitted, undefined)).toMatch(/submitted/i);
  });

  it("leaves the admin unrestricted (send back, publish)", () => {
    expect(authorizeReportWrite(admin, "update", submitted, { status: "rejected", reviewNote: "x" })).toBeNull();
    expect(authorizeReportWrite(admin, "update", submitted, { status: "published" })).toBeNull();
  });
});

describe("override and report races", () => {
  it("refuses an override flag once the head has decided (stale admin view)", () => {
    const afterHead = stored({ deptHead: approvedBy("head") });
    expect(
      authorizeRequestUpdate(admin, afterHead, { admin: approvedBy("adm"), status: "approved", adminOverride: true })
    ).toMatch(/override/i);
  });

  it("pins an override to a still-pending department step", () => {
    expect(
      requestUpdatePrecondition({ admin: approvedBy("adm"), status: "approved", adminOverride: true })
    ).toEqual({ status: "pending", "admin.status": "pending", "deptHead.status": "pending" });
  });

  it("pins a report status change to the status the guard read", () => {
    expect(reportUpdatePrecondition({ status: "submitted" }, { status: "published" })).toEqual({
      status: "submitted",
    });
  });

  it("pins a head's edit to a document still on their desk", () => {
    expect(reportUpdatePrecondition({ status: "draft" }, { body: "x" }, "department-head")).toEqual({
      status: { $in: ["draft", "rejected"] },
    });
  });

  it("adds nothing for an admin edit that does not move the status", () => {
    expect(reportUpdatePrecondition({ status: "submitted" }, { body: "x" }, "admin")).toEqual({});
  });

  it("pins a head's delete to a document still on their desk (a stale tab cannot delete a submission)", () => {
    expect(reportDeletePrecondition("department-head")).toEqual({ status: { $in: ["draft", "rejected"] } });
  });

  it("adds nothing for an admin delete", () => {
    expect(reportDeletePrecondition("admin")).toEqual({});
  });
});

describe("flexible-leave wallet on create", () => {
  it("accepts FL or OT on flexible leave", () => {
    expect(authorizeRequestCreate(staff, newRequest({ leaveType: "CO", leaveWallet: "OT" }))).toBeNull();
    expect(authorizeRequestCreate(staff, newRequest({ leaveType: "CO", leaveWallet: "FL" }))).toBeNull();
  });

  it("requires flexible leave to name its wallet", () => {
    expect(authorizeRequestCreate(staff, newRequest({ leaveType: "CO" }))).toMatch(/which balance/i);
    expect(authorizeRequestCreate(staff, newRequest({ leaveType: "CO", leaveWallet: "XX" }))).toMatch(/which balance/i);
  });

  it("refuses a wallet on anything but flexible leave", () => {
    expect(authorizeRequestCreate(staff, newRequest({ leaveType: "CL", leaveWallet: "OT" }))).toMatch(/flexible/i);
  });
});

describe("report approval is the admin's", () => {
  const draft = { departmentId: "events", status: "draft", generatedBy: "head" };
  it("refuses a head approving their own filing", () => {
    expect(authorizeReportWrite(head, "update", draft, { status: "approved" })).toMatch(/draft or submit/i);
  });
  it("refuses a head editing an approved filing", () => {
    expect(authorizeReportWrite(head, "update", { ...draft, status: "approved" }, { body: "x" })).toMatch(/submitted/i);
  });
  it("lets the admin approve with feedback", () => {
    expect(
      authorizeReportWrite(admin, "update", { ...draft, status: "submitted" }, { status: "approved", reviewNote: "great" })
    ).toBeNull();
  });
});
