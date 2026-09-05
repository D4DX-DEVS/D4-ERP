import type { StaffRole, TaskStatus } from "@/types";

/**
 * ClickUp-style review-gated task workflow.
 *
 *   todo → in-progress → review → done
 *                          ↺ returned (review → in-progress, remark required)
 *
 * Shared by UI (button visibility) and /api/db (enforcement) — keep pure.
 */

const ASSIGNEE_MOVES: Record<string, TaskStatus[]> = {
  todo: ["in-progress"],
  "in-progress": ["review"],
  review: ["in-progress"], // self pull-back
};

const REVIEWER_MOVES: Record<string, TaskStatus[]> = {
  todo: ["in-progress"], // kick off assigned work
  review: ["done", "in-progress"], // approve / return
};

export function canTransitionTask(
  role: StaffRole,
  isAssignee: boolean,
  from: TaskStatus,
  to: TaskStatus
): boolean {
  if (from === to) return false;
  if (role === "admin") return true;
  const allowed = new Set<TaskStatus>();
  if (isAssignee) for (const s of ASSIGNEE_MOVES[from] ?? []) allowed.add(s);
  if (role === "department-head") for (const s of REVIEWER_MOVES[from] ?? []) allowed.add(s);
  return allowed.has(to);
}

/** The ownership fields a delete decision needs (subset of a task document). */
export interface TaskOwnership {
  createdBy?: string | null;
  assignedBy?: string | null;
  departmentId?: string | null;
}

/**
 * Who may delete a task. Admin: any. Department-head: own department's
 * tasks. Anyone (including staff holding a Task Management grant): tasks
 * they created or assigned. Being the assignee is not enough. Legacy tasks
 * without departmentId are deletable only by admin or their creator.
 * Enforced by /api/db; the UI shows the delete control to everyone.
 */
export function canDeleteTask(
  role: StaffRole,
  uid: string,
  departmentId: string | null,
  task: TaskOwnership
): boolean {
  if (role === "admin") return true;
  if (task.createdBy === uid || task.assignedBy === uid) return true;
  if (role === "department-head") return !!departmentId && task.departmentId === departmentId;
  return false;
}

/** Returning a task from review needs a reason (becomes a TaskComment). */
export function transitionNeedsRemark(from: TaskStatus, to: TaskStatus): boolean {
  return from === "review" && to === "in-progress";
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  review: "Review",
  done: "Done",
};
