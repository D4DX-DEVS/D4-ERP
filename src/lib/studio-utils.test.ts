import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  timesOverlap,
  isValidTimeRange,
  findConflict,
  bookingStatusMeta,
  BLOCKING_STATUSES,
} from "@/lib/studio-utils";
import type { StudioBooking } from "@/types";

function booking(
  over: Partial<StudioBooking> & { id: string }
): StudioBooking & { id: string } {
  return {
    studioId: "s1",
    date: "2026-06-10",
    startTime: "10:00",
    endTime: "12:00",
    purpose: "Shoot",
    status: "approved",
    requestedBy: "u1",
    ...over,
  } as StudioBooking & { id: string };
}

describe("studio-utils time helpers", () => {
  it("parses HH:mm to minutes", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("10:30")).toBe(630);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("returns NaN for malformed time", () => {
    expect(Number.isNaN(timeToMinutes(""))).toBe(true);
    expect(Number.isNaN(timeToMinutes(undefined))).toBe(true);
    expect(Number.isNaN(timeToMinutes("abc"))).toBe(true);
  });

  it("detects overlapping ranges (half-open)", () => {
    expect(timesOverlap("10:00", "12:00", "11:00", "13:00")).toBe(true);
    expect(timesOverlap("10:00", "12:00", "12:00", "13:00")).toBe(false); // touching edge
    expect(timesOverlap("10:00", "12:00", "08:00", "10:00")).toBe(false);
    expect(timesOverlap("10:00", "12:00", "09:00", "13:00")).toBe(true); // fully contains
  });

  it("validates that end is after start", () => {
    expect(isValidTimeRange("10:00", "12:00")).toBe(true);
    expect(isValidTimeRange("12:00", "10:00")).toBe(false);
    expect(isValidTimeRange("10:00", "10:00")).toBe(false);
    expect(isValidTimeRange("bad", "10:00")).toBe(false);
  });
});

describe("findConflict", () => {
  const existing = [
    booking({ id: "b1", startTime: "10:00", endTime: "12:00", status: "approved" }),
    booking({ id: "b2", startTime: "14:00", endTime: "16:00", status: "pending" }),
    booking({ id: "b3", startTime: "10:00", endTime: "12:00", status: "rejected" }),
  ];

  it("flags an overlapping approved booking", () => {
    const c = findConflict(
      { studioId: "s1", date: "2026-06-10", startTime: "11:00", endTime: "13:00" },
      existing
    );
    expect(c?.id).toBe("b1");
  });

  it("flags an overlapping pending booking (pending blocks)", () => {
    const c = findConflict(
      { studioId: "s1", date: "2026-06-10", startTime: "15:00", endTime: "15:30" },
      existing
    );
    expect(c?.id).toBe("b2");
  });

  it("ignores rejected/cancelled bookings", () => {
    const c = findConflict(
      { studioId: "s1", date: "2026-06-10", startTime: "10:30", endTime: "11:00" },
      [existing[2]]
    );
    expect(c).toBeNull();
  });

  it("ignores a different studio or date", () => {
    expect(
      findConflict(
        { studioId: "s2", date: "2026-06-10", startTime: "10:30", endTime: "11:00" },
        existing
      )
    ).toBeNull();
    expect(
      findConflict(
        { studioId: "s1", date: "2026-06-11", startTime: "10:30", endTime: "11:00" },
        existing
      )
    ).toBeNull();
  });

  it("excludes the booking being edited via ignoreId", () => {
    const c = findConflict(
      { studioId: "s1", date: "2026-06-10", startTime: "10:00", endTime: "12:00" },
      existing,
      "b1"
    );
    expect(c).toBeNull();
  });

  it("returns null when the slot is free", () => {
    const c = findConflict(
      { studioId: "s1", date: "2026-06-10", startTime: "12:00", endTime: "13:00" },
      existing
    );
    expect(c).toBeNull();
  });
});

describe("status metadata", () => {
  it("pending and approved are blocking statuses", () => {
    expect(BLOCKING_STATUSES).toContain("pending");
    expect(BLOCKING_STATUSES).toContain("approved");
    expect(BLOCKING_STATUSES).not.toContain("rejected");
  });

  it("returns metadata for known and unknown statuses", () => {
    expect(bookingStatusMeta("approved").label).toBe("Approved");
    expect(bookingStatusMeta("weird").label).toBe("weird");
  });
});
