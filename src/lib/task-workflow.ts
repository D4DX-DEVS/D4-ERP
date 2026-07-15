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
