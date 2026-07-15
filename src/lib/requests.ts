"use client";

import {
  createDocument,
  getDocument,
  getDocuments,
  updateDocument,
  where,
  Timestamp,
} from "@/lib/firestore";
import { createNotification, createBulkNotifications } from "@/lib/notifications";
import type {
  ApprovalStep,
  AuthUser,
  Department,
  RequestStatus,
  Staff,
  StaffRequest,
  StaffRequestType,
} from "@/types";

export const REQUEST_TYPE_LABELS: Record<StaffRequestType, string> = {
  leave: "Leave",
  wfh: "Work From Home",
  "long-leave": "Long Leave",
  "salary-increment": "Salary Increment",
  overtime: "Overtime",
  "on-duty": "On Duty",
  other: "Other",
};

const COLLECTION = "leaveRequests";
const PENDING_STEP: ApprovalStep = { status: "pending" };

/** Overall status from the two approval steps. Terminal states are immutable. */
export function resolveRequestStatus(
  req: Pick<StaffRequest, "deptHead" | "admin"> & { status?: RequestStatus }
): RequestStatus {
  if (req.status === "cancelled") return "cancelled";
  if (req.admin?.status === "rejected" || req.deptHead?.status === "rejected") return "rejected";
  if (req.admin?.status === "approved") return "approved";
  return "pending";
}

/** Legacy docs (pre two-step) have no deptHead/admin fields. */
export function isLegacyRequest(req: Partial<StaffRequest>): boolean {
  return !req.deptHead && !req.admin;
}

async function getAdminStaffIds(): Promise<string[]> {
  const admins = await getDocuments<Staff>("staff", [
    where("role", "==", "admin"),
    where("isActive", "==", true),
  ]);
  return admins.map((a) => a.id!);
}

async function getDeptHeadStaffId(departmentId: string): Promise<string | null> {
  if (!departmentId) return null;
  const dept = await getDocument<Department>("departments", departmentId);
  return dept?.headId || null;
}

export interface CreateRequestInput {
  type: StaffRequestType;
  leaveType?: StaffRequest["leaveType"];
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
  const headId = await getDeptHeadStaffId(user.departmentId);
  const adminIds = await getAdminStaffIds();
  const recipients = new Set<string>([...adminIds, ...(headId ? [headId] : [])]);
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

  if (next.status === "approved" && request.type === "overtime") {
    await createOvertimeCalendarEvent(next, user);
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
