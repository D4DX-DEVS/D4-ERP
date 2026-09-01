import { describe, it, expect } from "vitest";
import { evaluateCheckIn, normalizeSettings } from "./settings";
import type { AppSettings } from "./settings";

// Defaults: start 09:30, lateThresholdMinutes 15 → late strictly after 09:45.
// The attendance import confirm route derives its isLate flag from this, so the
// boundary behavior here is what decides whether a punch counts as a late mark.
describe("evaluateCheckIn", () => {
  const settings: AppSettings = normalizeSettings(null);

  const monday = (h: number, m: number) => new Date(2026, 6, 6, h, m); // Mon Jul 6 2026
  const sunday = (h: number, m: number) => new Date(2026, 6, 5, h, m); // Sun Jul 5 2026

  it("is not late within the grace window (boundary inclusive)", () => {
    expect(evaluateCheckIn(settings, monday(9, 30)).isLate).toBe(false);
    expect(evaluateCheckIn(settings, monday(9, 45)).isLate).toBe(false);
  });

  it("is late one minute past start + grace", () => {
    const result = evaluateCheckIn(settings, monday(9, 46));
    expect(result.isLate).toBe(true);
    expect(result.isOff).toBe(false);
  });

  it("never flags late on a weekly off day", () => {
    const result = evaluateCheckIn(settings, sunday(11, 0));
    expect(result.isOff).toBe(true);
    expect(result.isLate).toBe(false);
  });

  it("never flags late on a holiday, respecting company scoping", () => {
    const withHoliday: AppSettings = {
      ...settings,
      holidays: [{ date: "2026-07-06", name: "Founders Day", companyId: "c1" }],
    };
    // Holiday scoped to c1 — off for c1, a normal (late) working day for c2.
    expect(evaluateCheckIn(withHoliday, monday(11, 0), null, "c1").isLate).toBe(false);
    expect(evaluateCheckIn(withHoliday, monday(11, 0), null, "c1").isOff).toBe(true);
    expect(evaluateCheckIn(withHoliday, monday(11, 0), null, "c2").isLate).toBe(true);
  });

  it("uses a shift's start time and grace over the day schedule", () => {
    const shift = { startTime: "11:00", graceMinutes: 10 } as Parameters<typeof evaluateCheckIn>[2];
    expect(evaluateCheckIn(settings, monday(11, 10), shift).isLate).toBe(false);
    expect(evaluateCheckIn(settings, monday(11, 11), shift).isLate).toBe(true);
  });
});
