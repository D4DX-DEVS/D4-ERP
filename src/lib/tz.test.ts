import { describe, it, expect } from "vitest";
import {
  zoneOffsetMs,
  zonedTimeToUtc,
  zonedDateAt,
  dateKeyInZone,
  formatTimeInZone,
  timeInputValue,
} from "@/lib/tz";

const IST = "Asia/Kolkata";

describe("zoneOffsetMs", () => {
  it("reports India's fixed +05:30", () => {
    expect(zoneOffsetMs(new Date("2026-09-18T04:24:00Z"), IST)).toBe(5.5 * 3600_000);
    expect(zoneOffsetMs(new Date("2026-01-01T00:00:00Z"), IST)).toBe(5.5 * 3600_000);
  });

  it("follows DST where the zone has it", () => {
    expect(zoneOffsetMs(new Date("2026-07-01T16:00:00Z"), "America/New_York")).toBe(-4 * 3600_000);
    expect(zoneOffsetMs(new Date("2026-01-01T17:00:00Z"), "America/New_York")).toBe(-5 * 3600_000);
  });

  it("is zero for UTC", () => {
    expect(zoneOffsetMs(new Date("2026-09-18T04:24:00Z"), "UTC")).toBe(0);
  });
});

describe("zonedTimeToUtc", () => {
  it("reads a wall clock as the org's clock, not the host's", () => {
    // The punch the biometric device printed as 09:54 on 18 Sep is 04:24 UTC.
    expect(zonedTimeToUtc(2026, 9, 18, 9, 54, IST).toISOString()).toBe("2026-09-18T04:24:00.000Z");
  });

  it("puts midnight where the org's day starts", () => {
    expect(zonedTimeToUtc(2026, 9, 1, 0, 0, IST).toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });

  it("resolves a wall clock across a DST boundary", () => {
    // 2026-03-08 02:30 does not exist in New York; the zone jumps to 03:00 EDT.
    expect(zonedTimeToUtc(2026, 7, 1, 12, 0, "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedTimeToUtc(2026, 1, 1, 12, 0, "America/New_York").toISOString()).toBe("2026-01-01T17:00:00.000Z");
  });
});

describe("zonedDateAt", () => {
  it("combines an ISO day with an HH:mm punch in the org's zone", () => {
    expect(zonedDateAt("2026-09-18", "09:54", IST)?.toISOString()).toBe("2026-09-18T04:24:00.000Z");
  });

  it("returns undefined when there is no punch to place", () => {
    expect(zonedDateAt("2026-09-18", undefined, IST)).toBeUndefined();
    expect(zonedDateAt("2026-09-18", "", IST)).toBeUndefined();
  });

  it("rejects a malformed time rather than inventing one", () => {
    expect(zonedDateAt("2026-09-18", "9-54", IST)).toBeUndefined();
    expect(zonedDateAt("2026-09-18", "25:00", IST)).toBeUndefined();
  });
});

describe("dateKeyInZone", () => {
  it("keys a punch by the org's day, not the viewer's", () => {
    // 18 Sep 23:30 IST is still 18 Sep here, though it is 19 Sep in Tokyo.
    expect(dateKeyInZone(new Date("2026-09-18T18:00:00Z"), IST)).toBe("2026-09-18");
    expect(dateKeyInZone(new Date("2026-09-18T18:00:00Z"), "Asia/Tokyo")).toBe("2026-09-19");
  });

  it("accepts epoch seconds, the shape Mongo timestamps read back as", () => {
    expect(dateKeyInZone(Date.parse("2026-09-18T04:24:00Z") / 1000, IST)).toBe("2026-09-18");
  });
});

describe("formatTimeInZone", () => {
  it("prints the org's wall clock whatever the browser is set to", () => {
    expect(formatTimeInZone(new Date("2026-09-18T04:24:00Z"), IST)).toBe("09:54 am");
    expect(formatTimeInZone(new Date("2026-09-18T10:41:00Z"), IST)).toBe("04:11 pm");
  });

  it("prints noon and midnight as 12, not 00", () => {
    expect(formatTimeInZone(new Date("2026-09-18T06:30:00Z"), IST)).toBe("12:00 pm");
    expect(formatTimeInZone(new Date("2026-09-17T18:30:00Z"), IST)).toBe("12:00 am");
  });

  it("falls back to a dash for a missing punch", () => {
    expect(formatTimeInZone(undefined, IST)).toBe("—");
    expect(formatTimeInZone(null, IST)).toBe("—");
  });
});

describe("timeInputValue", () => {
  it("round-trips a punch through the 24h control the edit dialog uses", () => {
    const stored = zonedDateAt("2026-09-18", "09:54", IST)!;
    expect(timeInputValue(stored, IST)).toBe("09:54");
    expect(zonedDateAt("2026-09-18", timeInputValue(stored, IST), IST)?.getTime()).toBe(stored.getTime());
  });

  it("is empty when there is no punch, so the field clears instead of reading 12:00", () => {
    expect(timeInputValue(undefined, IST)).toBe("");
  });
});
