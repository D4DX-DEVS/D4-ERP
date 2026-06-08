"use client";

import { Timestamp } from "@/lib/firestore";
import type { StatusHistoryEntry } from "@/types";

/**
 * Creates a new status history entry for appending to an entity's statusHistory array.
 */
export function createStatusEntry(
  newStatus: string,
  user: { uid: string; firstName: string; lastName: string },
  remarks?: string
): StatusHistoryEntry {
  return {
    status: newStatus,
    changedBy: user.uid,
    changedByName: `${user.firstName} ${user.lastName}`,
    changedAt: Timestamp.now(),
    remarks,
  };
}

/**
 * Appends a new status entry to the existing history array.
 * Returns the new array (does not mutate original).
 */
export function pushStatusChange(
  history: StatusHistoryEntry[] | undefined,
  newStatus: string,
  user: { uid: string; firstName: string; lastName: string },
  remarks?: string
): StatusHistoryEntry[] {
  const entry = createStatusEntry(newStatus, user, remarks);
  return [...(history || []), entry];
}
