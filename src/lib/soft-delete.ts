// Soft delete: collections where a "delete" must keep the row for history.
// Staff is the first — attendance, payroll and leave rows all point at a
// staffId, so a hard delete orphaned that history and the monthly grid then
// re-invented every missing day as "Absent".

/** Collections whose delete action flags the row instead of removing it. */
export const SOFT_DELETE_COLLECTIONS = new Set(["staff"]);

export function isSoftDeleteCollection(collectionName: string): boolean {
  return SOFT_DELETE_COLLECTIONS.has(collectionName);
}

/** The $set patch a soft delete writes. */
export function softDeletePatch(now: Date = new Date()): Record<string, unknown> {
  return { isDeleted: true, isActive: false, deletedAt: now, updatedAt: now };
}

/** The $set patch that restores a soft-deleted row. */
export function restorePatch(now: Date = new Date()): Record<string, unknown> {
  return { isDeleted: false, isActive: true, deletedAt: null, updatedAt: now };
}

/**
 * ANDs `isDeleted != true` into a read filter so removed rows drop out of every
 * normal listing. History views opt back in with includeDeleted.
 */
export function withoutDeleted(
  collectionName: string,
  filter: Record<string, unknown>,
  includeDeleted = false
): Record<string, unknown> {
  if (includeDeleted || !isSoftDeleteCollection(collectionName)) return filter;
  const notDeleted = { isDeleted: { $ne: true } };
  if (!filter || Object.keys(filter).length === 0) return notDeleted;
  return { $and: [filter, notDeleted] };
}
