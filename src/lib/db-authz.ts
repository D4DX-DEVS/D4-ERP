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
