// ==================== /api/db authorization policy ====================
// Pure, dependency-free access-control rules for the generic DB proxy.
// Kept separate from the route handler so it can be unit-tested in isolation.

import type { TokenPayload } from "@/lib/auth";
import { hasFeature, type FeatureKey } from "@/lib/permissions";

/**
 * Authorization subject. `grantedFeatures` must be the CURRENT grants resolved
 * from the staff document by the caller — never the (possibly stale) JWT claim.
 */
export interface AuthzUser {
  role: string;
  grantedFeatures?: string[] | null;
}

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
  attendance: ["admin", "department-head"],
  banners: ["admin"],
  employee_documents: ["admin", "department-head"],
  letterTemplates: ["admin"],
  issuedLetters: ["admin"],
  studios: ["admin"],
  studio_equipment: ["admin"],
  department_reports: ["admin", "department-head"],
  custom_kpis: ["admin", "department-head"],
  attendance_imports: ["admin", "department-head"],
  // Category management is an admin/accounts capability, not part of the
  // accounting feature grant (granted staff can add transactions only).
  categories: ["admin", "accounts"],
};

/**
 * Collections whose write access requires a feature: role defaults from the
 * feature registry OR an explicit grant, evaluated with the canonical
 * hasFeature() semantics on CURRENT grants.
 */
export const FEATURE_WRITE: Record<string, FeatureKey> = {
  studio_bookings: "studio-booking",
  work_logs: "work-logs",
  payroll: "payroll",
  transactions: "accounting",
  items: "items",
  invoice_payments: "invoices",
  events: "events",
  clients: "clients",
  assets: "asset-management",
  "asset-categories": "asset-management",
  "asset-persons": "asset-management",
  "asset-events": "asset-management",
  // tasks intentionally absent: staff must update their own assigned tasks;
  // the task-workflow guard (role/assignee/status) is the write authority.
};

/**
 * Collections whose READS require at least one of the listed features.
 * Collections not listed keep their existing behavior (open read + scoping).
 */
export const FEATURE_READ: Record<string, FeatureKey[]> = {
  transactions: ["accounting", "reports"],
  categories: ["accounting", "reports"],
  invoices: ["invoices", "quotations", "reports"],
  invoice_payments: ["invoices", "quotations", "reports"],
  items: ["items", "invoices", "quotations"],
};

/**
 * The `invoices` collection holds both invoices and quotations, distinguished
 * by `type`. The required write feature follows the document type so an
 * invoices grant does not implicitly grant quotations (and vice versa).
 */
export function invoiceFeature(docType: unknown): FeatureKey {
  return docType === "quotation" ? "quotations" : "invoices";
}

/** Error if the user may not read the collection at all, else null. */
export function authorizeRead(user: AuthzUser, collectionName: string): string | null {
  const required = FEATURE_READ[collectionName];
  if (!required) return null;
  return required.some((f) => hasFeature(user, f))
    ? null
    : "You do not have permission to view this resource.";
}

/**
 * Extra filter AND-ed into invoices reads for users who hold only one of the
 * two document-type features. Null = no restriction needed.
 */
export function featureReadFilter(user: AuthzUser, collectionName: string): Record<string, unknown> | null {
  if (collectionName !== "invoices" || hasFeature(user, "reports")) return null;
  const inv = hasFeature(user, "invoices");
  const quo = hasFeature(user, "quotations");
  if (inv && quo) return null;
  if (inv) return { type: { $ne: "quotation" } };
  if (quo) return { type: "quotation" };
  return null; // unreachable: authorizeRead already denied
}

/** Per-document read check (findOne on type-split collections). */
export function authorizeReadDoc(
  user: AuthzUser,
  collectionName: string,
  doc: Record<string, unknown>
): string | null {
  if (collectionName !== "invoices" || hasFeature(user, "reports")) return null;
  return hasFeature(user, invoiceFeature(doc.type))
    ? null
    : "You do not have permission to view this resource.";
}

/** Collections that are append-only from the client (no update/delete). */
export const APPEND_ONLY_COLLECTIONS = new Set(["audit_logs"]);

/**
 * Collections any authenticated user may CREATE (submit a request), but only
 * the listed roles may update/delete (review it). Prevents staff from
 * approving their own submissions with a hand-crafted API call.
 */
export const MANAGER_REVIEWED: Record<string, string[]> = {
  attendance_corrections: ["admin", "department-head"],
};

/** Hard ceiling on how many documents a single query may return (DoS backstop). */
export const MAX_QUERY_LIMIT = 50000;

export function isWriteAction(action: string): boolean {
  return action === "create" || action === "update" || action === "delete";
}

/**
 * Returns an error message if the user may not perform the action, else null.
 * `docType` is only consulted for writes to the type-split `invoices`
 * collection (pass the document's `type`: existing doc for update/delete,
 * payload for create).
 */
export function authorize(
  user: AuthzUser,
  action: string,
  collectionName: string,
  docType?: unknown
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
    const reviewRoles = MANAGER_REVIEWED[collectionName];
    if (reviewRoles && action !== "create" && !reviewRoles.includes(user.role)) {
      return "Only a manager can review this resource.";
    }
    if (collectionName === "invoices" && !hasFeature(user, invoiceFeature(docType))) {
      return "You do not have permission to modify this resource.";
    }
    const featureKey = FEATURE_WRITE[collectionName];
    if (featureKey && !hasFeature(user, featureKey)) {
      return "You do not have permission to modify this resource.";
    }
    const allowed = WRITE_ROLES[collectionName];
    if (allowed && !allowed.includes(user.role)) {
      return "You do not have permission to modify this resource.";
    }
  }
  if (isReadAction(action) || action === "findOne") {
    return authorizeRead(user, collectionName);
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
export const DEPT_SCOPED_BY_STAFF = new Set(["attendance", "payroll", "attendance_corrections"]);

/** Collections where a `staff` role user may only read their own records. */
export const OWN_SCOPED_FOR_STAFF: Record<string, string> = {
  leaveRequests: "staffId",
  attendance: "staffId",
  attendance_corrections: "staffId",
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
