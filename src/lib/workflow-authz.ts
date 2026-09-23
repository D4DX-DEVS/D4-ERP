// ==================== Approval workflow write rules ====================
// Server-side authority for the two review workflows the generic /api/db proxy
// carries: staff requests (leave, WFH, overtime, on-duty — `leaveRequests`) and
// department filings (`department_reports`). The pages already hide buttons a
// role should not press; these rules are what stops the same write arriving
// straight at the API. Pure and dependency-free so they can be unit-tested.

import { isLegacyRequest, resolveRequestStatus } from "@/lib/request-status";
import type { StaffRequest } from "@/types";

/** The caller, resolved from their staff document — never from the request body. */
export interface WorkflowActor {
  uid: string;
  role: string;
  departmentId: string | null;
}

type Doc = Record<string, unknown>;

const TERMINAL = new Set(["approved", "rejected", "cancelled"]);
const WORKFLOW_KEYS = ["deptHead", "admin", "status", "adminOverride"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const stepStatus = (step: unknown): string | undefined =>
  step && typeof step === "object" ? ((step as Doc).status as string | undefined) : undefined;

const stepBy = (step: unknown): string | undefined =>
  step && typeof step === "object" ? ((step as Doc).by as string | undefined) : undefined;

/** True when every key written is in `keys` (updatedAt always rides along). */
const onlyKeys = (data: Doc, keys: string[]) =>
  Object.keys(data).every((k) => keys.includes(k) || k === "updatedAt");

/** What the steps in `doc` overlaid with `data` resolve to. */
function statusFromSteps(doc: Doc, data: Doc) {
  return resolveRequestStatus({
    deptHead: ("deptHead" in data ? data.deptHead : doc.deptHead) as StaffRequest["deptHead"],
    admin: ("admin" in data ? data.admin : doc.admin) as StaffRequest["admin"],
  });
}

// ── leaveRequests ────────────────────────────────────────────────────────────

/**
 * A new request is always the caller's own, filed under their own department,
 * and starts with both steps pending: approval only happens through a recorded
 * decision, which is also what runs the attendance writeback and notifications.
 */
export function authorizeRequestCreate(actor: WorkflowActor, data: Doc): string | null {
  if (actor.role !== "admin") {
    if (data.staffId !== actor.uid) return "You may only file a request for yourself.";
    if (actor.departmentId && data.departmentId !== actor.departmentId) {
      return "A request must be filed under your own department.";
    }
  }
  if ((data.status ?? "pending") !== "pending") return "A new request must start as pending.";
  if (!("deptHead" in data) || !("admin" in data)) {
    return "A new request must carry both approval steps.";
  }
  if (stepStatus(data.deptHead) !== "pending" || stepStatus(data.admin) !== "pending" || data.adminOverride) {
    return "A new request cannot carry an approval decision.";
  }
  if (data.startDate instanceof Date && data.endDate instanceof Date && data.endDate < data.startDate) {
    return "The end date cannot be before the start date.";
  }
  // Flexible leave is paid from one of two balances, and must say which.
  if (data.leaveType === "CO" && data.leaveWallet !== "FL" && data.leaveWallet !== "OT") {
    return "Choose which balance pays for this leave: flexible leave (FL) or overtime leave (OT).";
  }
  if (data.leaveWallet !== undefined && data.leaveType !== "CO") {
    return "Only flexible leave draws on the FL or OT balance.";
  }
  if (data.type === "overtime") {
    const { startTime, endTime } = data;
    if (typeof startTime !== "string" || typeof endTime !== "string" || !HHMM.test(startTime) || !HHMM.test(endTime)) {
      return "Overtime needs a valid start and end time.";
    }
    if (startTime === endTime) return "Overtime start and end time cannot be the same.";
  }
  return null;
}

/**
 * Who may write what on an existing request.
 * - A terminal request's workflow (steps, status, override flag) is immutable
 *   for everyone. An admin may still correct other fields on it; nothing in
 *   the app does, and such an edit does not re-run the attendance writeback.
 * - The owner (any role) may cancel their own pending request, nothing more.
 * - A department head decides only the department step, on other people's
 *   requests in their own department, once, under their own name. The overall
 *   status they write must be what the steps resolve to — so a head can end a
 *   request by rejecting it, but never finalise an approval.
 * - The admin decides the admin step (override allowed while the head is still
 *   pending); the status must again follow the steps. Legacy single-step rows
 *   are decided by status alone.
 * - Every other role (staff, accounts) has no say in the workflow.
 */
export function authorizeRequestUpdate(actor: WorkflowActor, doc: Doc, data: Doc): string | null {
  const touchesWorkflow = WORKFLOW_KEYS.some((k) => k in data);
  if (touchesWorkflow && TERMINAL.has(doc.status as string)) return "Request already finalised.";

  const isOwner = doc.staffId === actor.uid;
  const isCancel = onlyKeys(data, ["status"]) && data.status === "cancelled";
  if (isOwner && isCancel) return null; // pending, or the terminal check above fired

  const legacy = isLegacyRequest(doc as Partial<StaffRequest>);

  if (actor.role === "admin") {
    if (!touchesWorkflow || legacy) return null;
    if ("deptHead" in data && stepStatus(doc.deptHead) !== "pending") {
      return "The department step has already been decided.";
    }
    if ("admin" in data && stepStatus(doc.admin) !== "pending") {
      return "The admin step has already been decided.";
    }
    // Read from a stale screen, the flag would tell the head their own recorded
    // approval was overridden.
    if (data.adminOverride && stepStatus(doc.deptHead) !== "pending") {
      return "The department head has already decided — this is no longer an override. Refresh and decide again.";
    }
    if ("status" in data && data.status !== "cancelled" && data.status !== statusFromSteps(doc, data)) {
      return "The status must follow the approval steps — record the decision on a step.";
    }
    return null;
  }

  if (actor.role === "department-head") {
    if (isOwner) return "You cannot decide your own request — an admin will.";
    if (!actor.departmentId || doc.departmentId !== actor.departmentId) {
      return "You may only act on requests from your own department.";
    }
    if (!onlyKeys(data, ["deptHead", "status"]) || !("deptHead" in data)) {
      return "Department heads may only decide the department step.";
    }
    if (legacy) return "This request predates two-step approval; an admin decides it.";
    if (stepStatus(doc.deptHead) !== "pending") return "The department step has already been decided.";
    const decision = stepStatus(data.deptHead);
    if (decision !== "approved" && decision !== "rejected") {
      return "The department step can only approve or reject.";
    }
    if (stepBy(data.deptHead) !== actor.uid) return "Record the decision under your own name.";
    if (data.status !== statusFromSteps(doc, data)) {
      return "The status must follow the approval steps — only the admin step can finalise an approval.";
    }
    return null;
  }

  if (!isOwner) return "You may only modify your own requests.";
  return "You may only cancel your own pending request.";
}

/** Requests are history — approvals, the register rows they claimed, the audit trail. */
export function authorizeRequestDelete(actor: WorkflowActor): string | null {
  return actor.role === "admin" ? null : "Only an admin can delete a request.";
}

/**
 * Extra match conditions for the update itself, so two people deciding the same
 * request at once cannot both succeed: the guard reads the document, but only
 * this filter makes "still pending" true at the moment of the write.
 */
export function requestUpdatePrecondition(data: Doc): Record<string, string> {
  const cond: Record<string, string> = {};
  if (!WORKFLOW_KEYS.some((k) => k in data)) return cond;
  cond.status = "pending";
  if ("deptHead" in data) cond["deptHead.status"] = "pending";
  if ("admin" in data) cond["admin.status"] = "pending";
  if (data.adminOverride) cond["deptHead.status"] = "pending";
  return cond;
}

// ── department_reports ───────────────────────────────────────────────────────

const HEAD_EDITABLE = new Set(["draft", "rejected"]);
const HEAD_WRITABLE_STATUS = new Set(["draft", "submitted"]);
const REVIEW_FIELDS = ["reviewedAt", "reviewedBy"];

/**
 * A department head files for their own department only: they write drafts and
 * submit them, may rework a document the admin sent back, and never touch a
 * filing once it is with the admin — nor review, publish or delete it.
 * The admin is unrestricted (send back, publish). `existing` is null on create.
 */
export function authorizeReportWrite(
  actor: WorkflowActor,
  action: string,
  existing: Doc | null,
  data: Doc | undefined
): string | null {
  if (actor.role === "admin") return null;
  if (actor.role !== "department-head") return "Only a department head can file department documents.";

  const target = action === "create" ? data : existing;
  if (!target) return null; // update/delete of a missing row no-ops
  if (!actor.departmentId || target.departmentId !== actor.departmentId) {
    return "You may only file documents for your own department.";
  }
  if (action !== "create" && data && "departmentId" in data && data.departmentId !== actor.departmentId) {
    return "You may only file documents for your own department.";
  }

  if (action === "create") {
    if ((data?.status ?? "draft") !== "draft") return "A new document starts as a draft.";
    return null;
  }

  if (!HEAD_EDITABLE.has(String(existing?.status ?? "draft"))) {
    return "This document is already submitted. Ask an admin to send it back to make changes.";
  }
  if (action === "delete") return null;
  if (!data) return null;
  if ("status" in data && !HEAD_WRITABLE_STATUS.has(String(data.status))) {
    return "You may only save a draft or submit it.";
  }
  if (REVIEW_FIELDS.some((f) => f in data) || ("reviewNote" in data && data.reviewNote !== "")) {
    return "Review fields may only be written by an admin.";
  }
  return null;
}

/**
 * Match conditions for a report update, so the write lands on the state the
 * guard read: two admins publishing and sending back the same filing at once
 * cannot both win, and a head's edit cannot land after it left their desk.
 */
/**
 * Match conditions for a report delete. A head may only remove a document still
 * on their desk; pinning that to the delete itself stops a stale tab from
 * removing a filing that was submitted from another one in the meantime.
 */
export function reportDeletePrecondition(role?: string): Record<string, unknown> {
  return role === "department-head" ? { status: { $in: [...HEAD_EDITABLE] } } : {};
}

export function reportUpdatePrecondition(
  existing: Doc,
  data: Doc,
  role?: string
): Record<string, unknown> {
  if ("status" in data) return { status: existing.status };
  if (role === "department-head") return { status: { $in: [...HEAD_EDITABLE] } };
  return {};
}
