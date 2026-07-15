"use client";

import { createDocument, getDocument, updateDocument, Timestamp } from "@/lib/firestore";
import { createNotification } from "@/lib/notifications";
import { canTransitionTask, transitionNeedsRemark, TASK_STATUS_LABELS } from "@/lib/task-workflow";
import type { AuthUser, Department, Task, TaskStatus, TaskStatusChange } from "@/types";

type TaskDoc = Task & { id: string };

/**
 * Validate + apply a status transition: writes status, statusHistory,
 * review/completion audit fields; posts the return remark as a comment;
 * fans out notifications. Returns the fields written (merge into local state).
 * Throws Error with a user-readable message on invalid moves.
 */
export async function changeTaskStatus(
  task: TaskDoc,
  to: TaskStatus,
  user: AuthUser,
  remarks?: string
): Promise<Partial<Task>> {
  const from = task.status;
  const isAssignee = task.assigneeId === user.staffId;

  if (!canTransitionTask(user.role, isAssignee, from, to)) {
    throw new Error(`You can't move this task from ${TASK_STATUS_LABELS[from]} to ${TASK_STATUS_LABELS[to]}.`);
  }
  const isReturn = transitionNeedsRemark(from, to) && !isAssignee;
  if (isReturn && !remarks?.trim()) {
    throw new Error("A reason is required when returning a task from review.");
  }

  const now = Timestamp.now();
  const byName = `${user.firstName} ${user.lastName}`;
  const entry: TaskStatusChange = {
    status: to,
    by: user.staffId,
    byName,
    at: now,
    ...(remarks?.trim() ? { remarks: remarks.trim() } : {}),
  };

  const update: Partial<Task> = {
    status: to,
    statusHistory: [...(task.statusHistory ?? []), entry],
    ...(to === "done" ? { completedAt: now, completedBy: user.staffId } : {}),
    ...(from === "review" && !isAssignee ? { reviewedBy: user.staffId, reviewedAt: now } : {}),
  };

  await updateDocument("tasks", task.id, update as Record<string, unknown>);

  if (isReturn) {
    await createDocument("comments", {
      entityType: "task",
      entityId: task.id,
      text: `Returned from review: ${remarks!.trim()}`,
      authorId: user.uid,
      authorName: byName,
      attachments: [],
      createdAt: now,
    });
  }

  await notifyTransition(task, to, user, byName, remarks);
  return update;
}

async function deptHeadStaffId(departmentId?: string): Promise<string | null> {
  if (!departmentId) return null;
  const dept = await getDocument<Department>("departments", departmentId);
  return dept?.headId || null;
}

async function notifyTransition(
  task: TaskDoc,
  to: TaskStatus,
  actor: AuthUser,
  actorName: string,
  remarks?: string
): Promise<void> {
  const base = { entityId: task.id, entityType: "task", senderName: actorName } as const;

  if (to === "review") {
    // Submitted for review → dept head + whoever assigned the task
    const headId = await deptHeadStaffId(task.departmentId);
    const recipients = new Set([headId, task.assignedBy].filter(Boolean) as string[]);
    recipients.delete(actor.staffId);
    await Promise.allSettled(
      [...recipients].map((recipientId) =>
        createNotification({
          ...base,
          recipientId,
          type: "task",
          title: "Task submitted for review",
          message: `${actorName} submitted "${task.title}" for review.`,
          link: "/dashboard/tasks",
        })
      )
    );
    return;
  }

  // Approve / return / other moves → tell the assignee (unless self-move)
  if (task.assigneeId && task.assigneeId !== actor.staffId) {
    const returned = to === "in-progress";
    await createNotification({
      ...base,
      recipientId: task.assigneeId,
      type: "task",
      title: to === "done" ? "Task approved" : returned ? "Task returned from review" : "Task updated",
      message:
        to === "done"
          ? `"${task.title}" was reviewed and marked done by ${actorName}.`
          : returned
            ? `"${task.title}" was returned by ${actorName}${remarks ? `: ${remarks}` : "."}`
            : `"${task.title}" moved to ${TASK_STATUS_LABELS[to]} by ${actorName}.`,
      link: `/staff-portal/my-tasks/${task.id}`,
    });
  }
}
