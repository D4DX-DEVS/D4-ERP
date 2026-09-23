// ==================== Request labels (pure) ====================
// Display vocabulary for staff requests, shared by client pages and server
// messages. Stored leave-type codes are legacy (SL/CO) — labels use the org's
// terms (ML = Medical Leave, FL = Flexible Leave from Sunday/holiday duty,
// OT = leave earned by overtime, stored as CO with leaveWallet "OT").

import type { FlexWallet, StaffRequestType } from "@/types";

export const REQUEST_TYPE_LABELS: Record<StaffRequestType, string> = {
  leave: "Leave",
  wfh: "Work From Home",
  "long-leave": "Long Leave",
  "salary-increment": "Salary Increment",
  overtime: "Overtime",
  "on-duty": "On Duty",
  other: "Other",
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  CL: "Casual Leave (CL)",
  SL: "Medical Leave (ML)",
  EL: "Earned Leave (EL)",
  CO: "Flexible Leave (FL)",
  HD: "Half Day",
  LOP: "Loss of Pay (LOP)",
};

/** Display code for a stored leave-type value (SL shows as ML, CO as FL). */
export const LEAVE_TYPE_CODES: Record<string, string> = {
  CL: "CL",
  SL: "ML",
  EL: "EL",
  CO: "FL",
  HD: "HD",
  LOP: "LOP",
};

export const OT_LEAVE_LABEL = "Overtime Leave (OT)";

/** Label for a request's leave type, naming the OT wallet when it pays. */
export function leaveTypeLabel(req: { leaveType?: string; leaveWallet?: FlexWallet }): string {
  if (req.leaveType === "CO" && req.leaveWallet === "OT") return OT_LEAVE_LABEL;
  return req.leaveType ? LEAVE_TYPE_LABELS[req.leaveType] ?? req.leaveType : "";
}

/** Short code for a request's leave type: OT when the overtime wallet pays. */
export function leaveTypeCode(req: { leaveType?: string; leaveWallet?: FlexWallet }): string {
  if (req.leaveType === "CO" && req.leaveWallet === "OT") return "OT";
  return req.leaveType ? LEAVE_TYPE_CODES[req.leaveType] ?? req.leaveType : "";
}
