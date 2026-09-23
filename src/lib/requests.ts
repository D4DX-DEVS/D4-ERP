"use client";

import {
  createDocument,
  getDocuments,
  updateDocument,
  where,
  Timestamp,
} from "@/lib/firestore";
import {
  approverRecipientIds,
  createNotification,
  createBulkNotifications,
  departmentHeadRecipientIds,
} from "@/lib/notifications";
import { loadStaffLedger } from "@/lib/leave-adjustments";
import { consumesLeaveBalance, type LeaveLedger } from "@/lib/leave-ledger";
import { applyRequestWriteback, withdrawRequestWriteback } from "@/lib/leave-writeback";
import { isLegacyRequest, resolveRequestStatus } from "@/lib/request-status";
import { REQUEST_TYPE_LABELS } from "@/lib/request-labels";
import type {
  ApprovalStep,
  AuthUser,
  StaffRequest,
  StaffRequestType,
} from "@/types";

// Labels live in a pure module so server messages use the same words.
export {
  REQUEST_TYPE_LABELS,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPE_CODES,
  OT_LEAVE_LABEL,
  leaveTypeLabel,
  leaveTypeCode,
} from "@/lib/request-labels";

const COLLECTION = "leaveRequests";
const PENDING_STEP: ApprovalStep = { status: "pending" };

// The status rules live in a pure module so the /api/db guard applies the same ones.
export { resolveRequestStatus, isLegacyRequest };

/**
 * Admins to notify. Resolved server-side because a department head filing their
 * own request cannot read staff outside their department.
 */
export async function getAdminStaffIds(): Promise<string[]> {
  return approverRecipientIds();
}

/**
 * The department heads who can decide this department's step. Not
 * `departments.headId`: that was unset for most departments (and named a
 * plain-staff head for one), so requests notified nobody able to act on them.
 */
export async function getDeptHeadStaffIds(departmentId: string): Promise<string[]> {
  return departmentHeadRecipientIds(departmentId);
}

export interface CreateRequestInput {
  type: StaffRequestType;
  leaveType?: StaffRequest["leaveType"];
  leaveWallet?: StaffRequest["leaveWallet"];
  isHalfDay?: boolean;
  session?: StaffRequest["session"];
  startDate: Timestamp;
  endDate: Timestamp;
  startTime?: string;
  endTime?: string;
  requestedAmount?: number;
  reason: string;
  attachments?: StaffRequest["attachments"];
}

/** Create a request (both steps pending) and notify dept head + admins. */
export async function createStaffRequest(input: CreateRequestInput, user: AuthUser): Promise<string> {
  // Guard against Invalid Date → NaN seconds → "01 Jan 1970" records
  if (!Number.isFinite(input.startDate?.seconds) || input.startDate.seconds <= 0) {
    throw new Error("Please select a valid start date");
  }
  if (!Number.isFinite(input.endDate?.seconds) || input.endDate.seconds <= 0) {
    throw new Error("Please select a valid end date");
  }
  const doc: Omit<StaffRequest, "id"> = {
    staffId: user.staffId,
    staffName: `${user.firstName} ${user.lastName}`,
    departmentId: user.departmentId,
    ...input,
    deptHead: PENDING_STEP,
    admin: PENDING_STEP,
    status: "pending",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const id = await createDocument(COLLECTION, doc as unknown as Record<string, unknown>);

  const label = REQUEST_TYPE_LABELS[input.type];
  const headIds = await getDeptHeadStaffIds(user.departmentId);
  const adminIds = await getAdminStaffIds();
  const recipients = new Set<string>([...adminIds, ...headIds]);
  recipients.delete(user.staffId); // don't notify self
  await createBulkNotifications([...recipients], {
    type: "leave",
    title: `New ${label.toLowerCase()} request`,
    message: `${doc.staffName} submitted a ${label.toLowerCase()} request.`,
    link: "/dashboard/leaves",
    entityId: id,
    entityType: "staff_request",
  });
  return id;
}

export interface DecideInput {
  request: StaffRequest;
  step: "deptHead" | "admin";
  decision: "approved" | "rejected";
  remarks?: string;
}

/**
 * Record a step decision, resolve overall status, fan out notifications,
 * and run overtime side-effects on final approval.
 */
export async function decideRequest({ request, step, decision, remarks }: DecideInput, user: AuthUser): Promise<StaffRequest> {
  if (request.status !== "pending") {
    throw new Error("Request already finalised");
  }
  const stepData: ApprovalStep = {
    status: decision,
    by: user.staffId,
    byName: `${user.firstName} ${user.lastName}`,
    at: Timestamp.now(),
    ...(remarks ? { remarks } : {}),
  };
  const next: StaffRequest = { ...request, [step]: stepData };
  next.status = resolveRequestStatus(next);
  const adminOverride = step === "admin" && decision === "approved" && next.deptHead.status === "pending";
  if (adminOverride) next.adminOverride = true;

  await updateDocument(COLLECTION, request.id!, {
    [step]: stepData,
    status: next.status,
    ...(adminOverride ? { adminOverride: true } : {}),
    updatedAt: Timestamp.now(),
  });

  const label = REQUEST_TYPE_LABELS[request.type] ?? request.type;

  // Notify staff on any decision
  await createNotification({
    recipientId: request.staffId,
    type: "leave",
    title: `${label} request ${next.status === "pending" ? "update" : next.status}`,
    message:
      next.status === "pending"
        ? `Your ${label.toLowerCase()} request was approved by your department head and awaits admin approval.`
        : `Your ${label.toLowerCase()} request has been ${next.status}${remarks ? `: ${remarks}` : "."}`,
    link: "/staff-portal/my-leaves",
    entityId: request.id,
    entityType: "staff_request",
  });

  // Dept-head approval moves it to admin's desk
  if (step === "deptHead" && decision === "approved") {
    const adminIds = await getAdminStaffIds();
    await createBulkNotifications(
      adminIds.filter((id) => id !== user.staffId),
      {
        type: "leave",
        title: `${label} request awaiting admin approval`,
        message: `${request.staffName}'s ${label.toLowerCase()} request was approved by the department head.`,
        link: "/dashboard/leaves",
        entityId: request.id,
        entityType: "staff_request",
      }
    );
  }

  // Admin's decision is final — keep the dept head in the loop even on override
  if (step === "admin" && next.status !== "pending") {
    const headIds = (await getDeptHeadStaffIds(request.departmentId)).filter(
      (id) => id !== request.staffId && id !== user.staffId
    );
    await createBulkNotifications(headIds, {
      type: "leave",
      title: `${label} request ${next.status} by admin`,
      message: `${request.staffName}'s ${label.toLowerCase()} request was ${next.status} by admin${next.adminOverride ? " (override — covers department head approval)" : ""}.`,
      link: "/dashboard/leaves",
      entityId: request.id,
      entityType: "staff_request",
    });
  }

  if (next.status === "approved" && request.type === "overtime") {
    await createOvertimeCalendarEvent(next, user);
  }

  // Keep the register in step with the decision. Approving leave claims the
  // days it covers so the biometric import’s "absent" stops standing for an
  // approved absence; withdrawing approval releases them again. Each claimed
  // row carries the request id, which is what stops the attendance reconcile
  // deducting the same day a second time.
  if (consumesLeaveBalance(request.type)) {
    if (next.status === "approved") await applyRequestWriteback(next, user);
    else if (next.status === "rejected") await withdrawRequestWriteback(next, user);
  }

  return next;
}

/** True when an overtime calendar event already exists for this request (idempotency). */
async function overtimeEventExists(requestId: string): Promise<boolean> {
  const existing = await getDocuments("calendar_events", [
    where("sourceRequestId", "==", requestId),
  ]);
  return existing.length > 0;
}

/** Staff cancels their own still-pending request. */
export async function cancelRequest(request: StaffRequest): Promise<void> {
  if (request.status !== "pending") throw new Error("Request already finalised");
  await updateDocument(COLLECTION, request.id!, { status: "cancelled", updatedAt: Timestamp.now() });
}

/** Approved overtime shows on the staff member's calendar (item 20). */
async function createOvertimeCalendarEvent(request: StaffRequest, approver: AuthUser): Promise<void> {
  try {
    if (await overtimeEventExists(request.id!)) return; // retry-safe: never duplicate
    await createDocument("calendar_events", {
      sourceRequestId: request.id,
      title: `Overtime — ${request.staffName}`,
      description: request.reason,
      type: "reminder",
      startDate: request.startDate,
      endDate: request.endDate,
      startTime: request.startTime || "",
      endTime: request.endTime || "",
      isAllDay: !request.startTime,
      scope: "personal",
      assignedStaff: [request.staffId],
      requirements: [],
      status: "scheduled",
      departmentId: request.departmentId,
      createdBy: approver.staffId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    // ponytail: calendar event is a courtesy artifact — approval must not fail on it
    console.error("Failed to create overtime calendar event:", error);
  }
}

// The day/overtime arithmetic and the balance rollup live in leave-ledger.ts so
// the admin matrix, the staff profile tab and the staff portal cannot drift
// apart. Re-exported here because callers have always imported them from this
// module.
export { overtimeCompOffDays, requestLeaveDays } from "@/lib/leave-ledger";
export type { LeaveLedger } from "@/lib/leave-ledger";

/**
 * Current-year leave ledger for one staff member: quota, days used, remaining
 * balance, flexible leave earned from week-off duty, and every admin
 * adjustment. The same function backs the admin views, so what an admin edits
 * is what the employee sees.
 */
export async function getStaffLeaveLedger(staffId: string, year?: number): Promise<LeaveLedger> {
  const { ledger } = await loadStaffLedger(staffId, year ?? new Date().getFullYear());
  return ledger;
}
