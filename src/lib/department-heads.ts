// ==================== Department heads (pure) ====================
// Two things used to answer "who is the head of this department":
//   - departments.headId — who the org chart names (and who got notified),
//   - staff.role === "department-head" in that department — who /api/db lets
//     decide the department step.
// They drifted apart (most departments had no headId; one named a head whose
// role was plain staff), so requests notified nobody who could act on them.
// The role is the one that grants the power, so it is the one that decides who
// gets asked; headId stays as the org-chart label and is checked against it.

export interface HeadStaff {
  id?: string;
  role?: string;
  departmentId?: string;
  isActive?: boolean;
  isDeleted?: boolean;
}

/** Everyone who can decide the department step for `departmentId`. */
export function departmentHeadIds(staff: HeadStaff[], departmentId: string): string[] {
  if (!departmentId) return [];
  return staff
    .filter(
      (s) =>
        s.id &&
        s.role === "department-head" &&
        s.departmentId === departmentId &&
        s.isActive !== false &&
        !s.isDeleted
    )
    .map((s) => s.id as string);
}

export type HeadIssue =
  /** The named head's role is not department-head, so they cannot approve. */
  | "head-not-approver"
  /** The named head is a department head of a different department. */
  | "head-other-department"
  /** Someone can approve, but no head is named on the department. */
  | "head-not-set"
  /** Nobody can decide the department step; requests wait for the admin alone. */
  | "no-approver";

export interface HeadStatus {
  approverIds: string[];
  issue: HeadIssue | null;
}

export function departmentHeadStatus(
  department: { id: string; headId?: string | null },
  staff: HeadStaff[]
): HeadStatus {
  const approverIds = departmentHeadIds(staff, department.id);
  if (department.headId) {
    const head = staff.find((s) => s.id === department.headId);
    if (head && head.role !== "department-head") return { approverIds, issue: "head-not-approver" };
    if (head && head.departmentId !== department.id) return { approverIds, issue: "head-other-department" };
    return { approverIds, issue: approverIds.length ? null : "no-approver" };
  }
  return { approverIds, issue: approverIds.length ? "head-not-set" : "no-approver" };
}
