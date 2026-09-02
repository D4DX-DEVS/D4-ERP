// ==================== Event staff role catalog ====================
// Roles offered in the "Assigned Staff" picker on an event. The catalog lives
// in the settings document so admins can extend it, but the pure helpers below
// carry all the merge/dedupe rules so they can be unit-tested in isolation.

/** Seed catalog used until an admin edits the list in Settings → Event Roles. */
export const DEFAULT_EVENT_STAFF_ROLES: string[] = [
  "Photography",
  "Gimbal Shoot",
  "Video Recording",
  "iPhone Reels",
  "Live Streaming",
  "Video Console Operation",
];

/** Fallback stored on an assignment when no role was picked. */
export const FALLBACK_EVENT_STAFF_ROLE = "Team Member";

/** Sentinel option value that opens the free-text "new role" input. */
export const CUSTOM_ROLE_OPTION = "__custom__";

/** Trims and collapses inner whitespace so "  Gimbal   Shoot " => "Gimbal Shoot". */
export function normalizeRoleName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Case-insensitive membership test on a normalized role name. */
export function hasRole(roles: string[], role: string): boolean {
  const needle = normalizeRoleName(role).toLowerCase();
  if (!needle) return false;
  return roles.some((r) => normalizeRoleName(r).toLowerCase() === needle);
}

/**
 * Merges role lists in order, dropping blanks and case-insensitive duplicates.
 * The first spelling of a role wins, so the admin-curated casing survives a
 * merge with roles typed ad hoc on older events.
 */
export function mergeEventRoles(...lists: (string[] | undefined | null)[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (typeof raw !== "string") continue;
      const name = normalizeRoleName(raw);
      if (!name || hasRole(out, name)) continue;
      out.push(name);
    }
  }
  return out;
}

/** Appends a role if it is new; returns the same array reference when unchanged. */
export function addEventRole(roles: string[], role: string): string[] {
  const name = normalizeRoleName(role);
  if (!name || hasRole(roles, name)) return roles;
  return [...roles, name];
}

/** Removes a role (case-insensitive); returns the same reference when absent. */
export function removeEventRole(roles: string[], role: string): string[] {
  const needle = normalizeRoleName(role).toLowerCase();
  const next = roles.filter((r) => normalizeRoleName(r).toLowerCase() !== needle);
  return next.length === roles.length ? roles : next;
}
