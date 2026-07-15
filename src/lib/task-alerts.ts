// End-of-day task update alerts: after 6 PM, open tasks that received no
// update today are flagged "update pending" for the dept head and admins.
// No server cron exists, so notifications are fired from page loads —
// idempotent per recipient per day via a metadata dateKey marker.

import { createDocument, getDocuments, where } from "@/lib/firestore";
import { getAdminStaffIds, getDeptHeadStaffId } from "@/lib/requests";
import type { Task } from "@/types";

type TsLike = { seconds: number };

/** Local hour after which un-updated open tasks count as pending. */
export const EOD_CUTOFF_HOUR = 18; // 6 PM

const localDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type TaskLike = Pick<Task, "status"> & {
  updatedAt?: TsLike;
  createdAt?: TsLike;
};

/**
 * True when it's past the 6 PM cutoff and this open task was neither created
 * nor updated at any point today (its last touch is before local midnight).
 */
export function isUpdatePendingTask(task: TaskLike, now: Date = new Date()): boolean {
  if (task.status === "done") return false;
  if (now.getHours() < EOD_CUTOFF_HOUR) return false;
  const touchSec = task.updatedAt?.seconds ?? task.createdAt?.seconds;
  if (!touchSec) return true;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return touchSec * 1000 < startOfToday.getTime();
}

/**
 * Staleness in whole days for a pending task (0 = not pending).
 * Last touch yesterday → 1, two days back → 2, etc.
 */
export function updatePendingDays(task: TaskLike, now: Date = new Date()): number {
  if (!isUpdatePendingTask(task, now)) return 0;
  const touchSec = task.updatedAt?.seconds ?? task.createdAt?.seconds;
  if (!touchSec) return 3;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return Math.max(1, Math.ceil((startOfToday.getTime() - touchSec * 1000) / 86_400_000));
}

/** Badge severity: 1 day amber, 2 days orange, 3+ days red. */
export function pendingBadgeClasses(days: number): string {
  if (days >= 3) return "bg-red-50 text-red-700";
  if (days === 2) return "bg-orange-50 text-orange-700";
  return "bg-amber-50 text-amber-700";
}

export function pendingBadgeLabel(days: number): string {
  return days <= 1 ? "No update today" : `No update ${days} days`;
}

/**
 * Notify each affected department head (about their dept's count) and every
 * admin (about the total) that open tasks got no update today. Safe to call
 * on every page load — it no-ops before 6 PM, with no pending tasks, or when
 * today's notification already exists for a recipient.
 */
export async function notifyPendingTaskUpdates(
  tasks: (Task & { id: string })[],
  now: Date = new Date()
): Promise<void> {
  const pending = tasks.filter((t) => isUpdatePendingTask(t, now));
  if (pending.length === 0) return;
  const dateKey = localDateKey(now);

  const byDept = new Map<string, number>();
  for (const t of pending) {
    if (t.departmentId) byDept.set(t.departmentId, (byDept.get(t.departmentId) ?? 0) + 1);
  }

  const recipients = new Map<string, number>(); // staffId → pending count shown to them
  for (const id of await getAdminStaffIds()) recipients.set(id, pending.length);
  for (const [deptId, count] of byDept) {
    const headId = await getDeptHeadStaffId(deptId);
    if (headId && !recipients.has(headId)) recipients.set(headId, count);
  }

  for (const [recipientId, count] of recipients) {
    // ponytail: check-then-create; a duplicate from a page-load race is harmless
    const existing = await getDocuments("notifications", [
      where("recipientId", "==", recipientId),
      where("metadata.kind", "==", "task-update-pending"),
      where("metadata.dateKey", "==", dateKey),
    ]);
    if (existing.length > 0) continue;
    await createDocument("notifications", {
      recipientId,
      type: "system",
      title: "Tasks with no update today",
      message: `${count} open task${count === 1 ? "" : "s"} had no update by 6 PM on ${now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}.`,
      link: "/dashboard/tasks",
      isRead: false,
      metadata: { kind: "task-update-pending", dateKey },
    });
  }
}
