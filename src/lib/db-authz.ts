// ==================== /api/db authorization policy ====================
// Pure, dependency-free access-control rules for the generic DB proxy.
// Kept separate from the route handler so it can be unit-tested in isolation.

import type { TokenPayload } from "@/lib/auth";

/** Collections whose contents must never be returned to the client. */
export const FORBIDDEN_COLLECTIONS = new Set(["number_sequences"]);

/** Fields stripped from every document before it leaves the server. */
export const SENSITIVE_FIELDS = ["password", "passwordHash"];

/** Write access (create/update/delete) restricted to these roles per collection. */
export const WRITE_ROLES: Record<string, string[]> = {
  settings: ["admin"],
  companies: ["admin"],
  departments: ["admin"],
  staff: ["admin", "department-head"],
  payroll: ["admin", "accounts"],
  banners: ["admin"],
  employee_documents: ["admin", "department-head"],
  letterTemplates: ["admin"],
  issuedLetters: ["admin"],
  studios: ["admin"],
  studio_equipment: ["admin"],
  events: ["admin", "department-head"],
  department_reports: ["admin", "department-head"],
  custom_kpis: ["admin", "department-head"],
  attendance_imports: ["admin", "department-head"],
};

/**
 * Collections whose write access is gated by a granted feature (carried in the
 * JWT) in addition to default roles. A user may write if their role is in the
 * default list OR they have been granted the feature.
 */
export const FEATURE_WRITE: Record<string, { roles: string[]; feature: string }> = {
  studio_bookings: { roles: ["admin", "department-head"], feature: "studio-booking" },
  work_logs: { roles: ["admin", "department-head"], feature: "work-logs" },
};

/** Collections that are append-only from the client (no update/delete). */
export const APPEND_ONLY_COLLECTIONS = new Set(["audit_logs"]);

/** Hard ceiling on how many documents a single query may return (DoS backstop). */
export const MAX_QUERY_LIMIT = 50000;

export function isWriteAction(action: string): boolean {
  return action === "create" || action === "update" || action === "delete";
}

/** Returns an error message if the user may not perform the action, else null. */
export function authorize(
  user: TokenPayload,
  action: string,
  collectionName: string
): string | null {
  if (FORBIDDEN_COLLECTIONS.has(collectionName) && action !== "nextSequence") {
    return "This collection is not accessible.";
  }
  if (
    APPEND_ONLY_COLLECTIONS.has(collectionName) &&
    (action === "update" || action === "delete")
  ) {
    return "This resource is append-only and cannot be modified.";
  }
  if (isWriteAction(action)) {
    const featureRule = FEATURE_WRITE[collectionName];
    if (featureRule) {
      const allowedByRole = featureRule.roles.includes(user.role);
      const allowedByFeature =
        Array.isArray(user.features) && user.features.includes(featureRule.feature);
      if (!allowedByRole && !allowedByFeature) {
        return "You do not have permission to modify this resource.";
      }
    }
    const allowed = WRITE_ROLES[collectionName];
    if (allowed && !allowed.includes(user.role)) {
      return "You do not have permission to modify this resource.";
    }
  }
  return null;
}

/** Remove sensitive fields from a single document (shallow, mutates input). */
export function sanitizeDoc(d: Record<string, unknown>): Record<string, unknown> {
  for (const field of SENSITIVE_FIELDS) {
    if (field in d) delete d[field];
  }
  return d;
}

// ==================== Department / own-record scoping ====================
// Server-side enforcement: client-side where() filters are UI convenience only.

/**
 * Collections a department-head may only read within their own department,
 * keyed by the field that carries the department id.
 */
export const DEPT_SCOPED_BY_FIELD: Record<string, string> = {
  staff: "departmentId",
  leaveRequests: "departmentId",
  tasks: "departmentId",
  work_logs: "departmentId",
  department_reports: "departmentId",
};

/**
 * Collections scoped for dept heads via membership (doc.staffId must belong
 * to a staff member of their department) because the docs carry no departmentId.
 */
export const DEPT_SCOPED_BY_STAFF = new Set(["attendance", "payroll"]);

/** Collections where a `staff` role user may only read their own records. */
export const OWN_SCOPED_FOR_STAFF: Record<string, string> = {
  leaveRequests: "staffId",
  attendance: "staffId",
  payroll: "staffId",
  employee_documents: "staffId",
};

export function isReadAction(action: string): boolean {
  return action === "find" || action === "count" || action === "paginate";
}

/**
 * Returns a Mongo filter fragment to AND into read queries, or null when no
 * scoping applies. `deptStaffIds` is only consulted for membership-scoped
 * collections (pass the department's staff ids).
 */
export function scopeFilter(
  user: TokenPayload,
  collectionName: string,
  departmentId: string | null,
  deptStaffIds: string[] | null
): Record<string, unknown> | null {
  if (user.role === "admin" || user.role === "accounts") return null;
  if (user.role === "department-head") {
    const field = DEPT_SCOPED_BY_FIELD[collectionName];
    if (field && departmentId) return { [field]: departmentId };
    if (DEPT_SCOPED_BY_STAFF.has(collectionName) && deptStaffIds) {
      return { staffId: { $in: deptStaffIds } };
    }
    return null;
  }
  if (user.role === "staff") {
    const field = OWN_SCOPED_FOR_STAFF[collectionName];
    if (field) return { [field]: user.uid };
  }
  return null;
}
