/**
 * Department-head visibility scoping.
 *
 * Admins (and every other role a page's own guard lets through) see everything;
 * a department head sees only their own department. A head with no department on
 * record fails closed — an empty scope matches nothing rather than leaking every
 * department's records.
 */

/** `null` = unscoped. A string = the only departmentId allowed through. */
export function deptScopeFor(role: string | undefined, departmentId: string | undefined): string | null {
  return role === "department-head" ? departmentId ?? "" : null;
}

export function inDeptScope(scope: string | null, departmentId: string | undefined): boolean {
  return scope === null || departmentId === scope;
}
