// ==================== Studio booking crew helpers ====================
// Pure helpers for the crew captured when a studio booking is completed:
// who shot the job, and who ended up holding the memory card. Crew members
// are either linked staff (`staffId` set) or free-text externals.

import { Timestamp } from "@/lib/firestore";
import type { BookingCrewMember, StudioBookingCompletion } from "@/types";

/** Stable identity for a crew member: staff id when linked, name otherwise. */
export function crewKey(member: BookingCrewMember): string {
  return member.staffId ? `staff:${member.staffId}` : `ext:${member.name.trim().toLowerCase()}`;
}

/** A crew member entered as free text rather than picked from the roster. */
export function isExternalCrew(member: BookingCrewMember): boolean {
  return !member.staffId;
}

/**
 * Trim a single member and drop it when the name is blank. Externals come back
 * without a `staffId` key at all — Firestore rejects `undefined` values.
 */
export function sanitizeCrewMember(
  member: BookingCrewMember | null | undefined
): BookingCrewMember | undefined {
  if (!member) return undefined;
  const name = (member.name || "").trim();
  if (!name) return undefined;
  return member.staffId ? { staffId: member.staffId, name } : { name };
}

/** Trim names, drop blanks, and collapse duplicates (by staff id, else name). */
export function sanitizeCrew(members: BookingCrewMember[] | undefined | null): BookingCrewMember[] {
  if (!members?.length) return [];
  const seen = new Set<string>();
  const out: BookingCrewMember[] = [];
  for (const raw of members) {
    const member = sanitizeCrewMember(raw);
    if (!member) continue;
    const key = crewKey(member);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(member);
  }
  return out;
}

/** Comma-joined names for table sub-lines and detail rows. */
export function formatCrewNames(members: BookingCrewMember[] | undefined | null): string {
  const names = sanitizeCrew(members).map((m) => m.name);
  return names.length ? names.join(", ") : "—";
}

interface CompletionUser {
  uid: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Build the `completion` block written by the Complete action. Crew keys are
 * omitted rather than set to `undefined` so an empty submission leaves no
 * half-filled object behind.
 */
export function buildCompletionPayload(input: {
  shooters: BookingCrewMember[] | undefined | null;
  cardHolder: BookingCrewMember | null | undefined;
  user: CompletionUser;
}): StudioBookingCompletion {
  const shooters = sanitizeCrew(input.shooters);
  const cardHolder = sanitizeCrewMember(input.cardHolder);
  const name = `${input.user.firstName || ""} ${input.user.lastName || ""}`.trim();
  return {
    ...(shooters.length ? { shooters } : {}),
    ...(cardHolder ? { cardHolder } : {}),
    completedAt: Timestamp.now(),
    completedBy: input.user.uid,
    ...(name ? { completedByName: name } : {}),
  };
}
