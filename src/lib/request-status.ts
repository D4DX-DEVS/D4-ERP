// ==================== Staff request status rules ====================
// Pure: shared by the client helpers in requests.ts and the server guard in
// workflow-authz.ts, so both sides agree on what a pair of steps means.

import type { RequestStatus, StaffRequest } from "@/types";

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
