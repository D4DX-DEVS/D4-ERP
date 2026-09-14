import { describe, it, expect } from "vitest";
import {
  rangeBounds,
  filterByRange,
  isActiveBooking,
  bookingMinutes,
  summarize,
  perStudio,
  countByType,
  countByStatus,
  peakHours,
  busiestDay,
  topClients,
  crewLeaderboard,
  completedReportRows,
  toCsv,
} from "@/lib/studio-reports";
import type { StudioBooking } from "@/types";

function booking(over: Partial<StudioBooking> & { id: string }): StudioBooking & { id: string } {
  return {
    studioId: "s1",
    studioName: "Studio A",
    date: "2026-09-10",
    startTime: "10:00",
    endTime: "12:00",
    duration: 120,
    purpose: "Shoot",
    status: "completed",
    requestedBy: "u1",
    ...over,
  } as StudioBooking & { id: string };
}

const TODAY = new Date(2026, 8, 14); // 2026-09-14, local

describe("rangeBounds", () => {
  it("bounds the current month", () => {
    expect(rangeBounds("this-month", TODAY)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });

  it("bounds the previous month, crossing a year boundary", () => {
    expect(rangeBounds("last-month", TODAY)).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(rangeBounds("last-month", new Date(2026, 0, 5))).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });

  it("bounds the trailing 90 days inclusive of today", () => {
    expect(rangeBounds("last-90", TODAY)).toEqual({ start: "2026-06-17", end: "2026-09-14" });
  });

  it("returns no bounds for all time", () => {
    expect(rangeBounds("all", TODAY)).toEqual({});
  });
});

describe("filterByRange", () => {
  const rows = [
    booking({ id: "in", date: "2026-09-02" }),
    booking({ id: "edge-start", date: "2026-09-01" }),
    booking({ id: "edge-end", date: "2026-09-30" }),
    booking({ id: "out", date: "2026-08-31" }),
  ];

  it("keeps bookings inside the bounds, inclusive", () => {
    const ids = filterByRange(rows, "this-month", TODAY).map((b) => b.id);
    expect(ids).toEqual(["in", "edge-start", "edge-end"]);
  });

  it("keeps everything for all time", () => {
    expect(filterByRange(rows, "all", TODAY)).toHaveLength(4);
  });
});

describe("bookingMinutes", () => {
  it("prefers the stored duration", () => {
    expect(bookingMinutes(booking({ id: "a", duration: 90 }))).toBe(90);
  });

  it("falls back to the time window", () => {
    expect(
      bookingMinutes(booking({ id: "a", duration: undefined, startTime: "09:00", endTime: "10:30" }))
    ).toBe(90);
  });

  it("returns 0 when times are unusable", () => {
    expect(bookingMinutes(booking({ id: "a", duration: undefined, startTime: "", endTime: "" }))).toBe(0);
  });

  it("never returns a negative span", () => {
    expect(
      bookingMinutes(booking({ id: "a", duration: undefined, startTime: "12:00", endTime: "10:00" }))
    ).toBe(0);
  });
});

describe("isActiveBooking", () => {
  it("excludes cancelled and rejected", () => {
    expect(isActiveBooking(booking({ id: "a", status: "completed" }))).toBe(true);
    expect(isActiveBooking(booking({ id: "a", status: "cancelled" }))).toBe(false);
    expect(isActiveBooking(booking({ id: "a", status: "rejected" }))).toBe(false);
  });
});

describe("summarize", () => {
  const rows = [
    booking({ id: "a", status: "completed", duration: 120 }),
    booking({ id: "b", status: "confirmed", duration: 60 }),
    booking({ id: "c", status: "cancelled", duration: 300 }),
    booking({ id: "d", status: "rejected", duration: 300 }),
  ];

  it("counts statuses and sums only active minutes", () => {
    const s = summarize(rows);
    expect(s.total).toBe(4);
    expect(s.completed).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.bookedMinutes).toBe(180);
  });

  it("averages over the same set it sums", () => {
    expect(summarize(rows).avgDurationMinutes).toBe(90);
  });

  it("rounds the cancellation rate over all bookings", () => {
    expect(summarize(rows).cancellationRate).toBe(25);
  });

  it("is safe on an empty list", () => {
    expect(summarize([])).toEqual({
      total: 0,
      completed: 0,
      cancelled: 0,
      bookedMinutes: 0,
      avgDurationMinutes: 0,
      cancellationRate: 0,
    });
  });
});

describe("perStudio", () => {
  it("aggregates count and minutes, resolving names from the studio list", () => {
    const rows = [
      booking({ id: "a", studioId: "s1", studioName: "", duration: 60 }),
      booking({ id: "b", studioId: "s1", studioName: "Studio A", duration: 120 }),
      booking({ id: "c", studioId: "s2", studioName: "", duration: 30 }),
      booking({ id: "d", studioId: "s1", status: "cancelled", duration: 999 }),
    ];
    const out = perStudio(rows, [{ id: "s1", name: "Studio One" }]);
    expect(out[0]).toEqual({ studioId: "s1", name: "Studio One", count: 2, minutes: 180 });
    expect(out[1].name).toBe("Unknown studio");
  });

  it("sorts by minutes descending", () => {
    const rows = [
      booking({ id: "a", studioId: "s1", duration: 30 }),
      booking({ id: "b", studioId: "s2", duration: 300 }),
    ];
    expect(perStudio(rows, []).map((r) => r.studioId)).toEqual(["s2", "s1"]);
  });
});

describe("countByType / countByStatus", () => {
  it("buckets missing types as other and sorts descending", () => {
    const rows = [
      booking({ id: "a", bookingType: "podcast" }),
      booking({ id: "b", bookingType: undefined }),
      booking({ id: "c", bookingType: "podcast" }),
    ];
    expect(countByType(rows)).toEqual([
      { key: "podcast", count: 2 },
      { key: "other", count: 1 },
    ]);
  });

  it("counts every status including cancelled", () => {
    const rows = [
      booking({ id: "a", status: "cancelled" }),
      booking({ id: "b", status: "completed" }),
    ];
    expect(
      countByStatus(rows)
        .map((r) => r.key)
        .sort()
    ).toEqual(["cancelled", "completed"]);
  });
});

describe("peakHours", () => {
  it("counts active bookings against every hour they span", () => {
    const rows = [
      booking({ id: "a", startTime: "10:00", endTime: "12:00" }),
      booking({ id: "b", startTime: "11:30", endTime: "12:30" }),
      booking({ id: "c", status: "cancelled", startTime: "10:00", endTime: "11:00" }),
    ];
    const byHour = Object.fromEntries(peakHours(rows).map((h) => [h.hour, h.count]));
    expect(byHour[10]).toBe(1);
    expect(byHour[11]).toBe(2);
    expect(byHour[12]).toBe(1);
    expect(byHour[9]).toBe(0);
  });

  it("returns all 24 hours so the strip renders a stable width", () => {
    expect(peakHours([])).toHaveLength(24);
  });
});

describe("busiestDay", () => {
  it("returns the active day with the most bookings", () => {
    const rows = [
      booking({ id: "a", date: "2026-09-01" }),
      booking({ id: "b", date: "2026-09-02" }),
      booking({ id: "c", date: "2026-09-02" }),
      booking({ id: "d", date: "2026-09-03", status: "cancelled" }),
    ];
    expect(busiestDay(rows)).toEqual({ date: "2026-09-02", count: 2 });
  });

  it("returns null when there is nothing active", () => {
    expect(busiestDay([])).toBeNull();
  });
});

describe("topClients", () => {
  it("ranks by booking count and ignores unnamed clients", () => {
    const rows = [
      booking({ id: "a", clientName: "Acme" }),
      booking({ id: "b", clientName: "Acme" }),
      booking({ id: "c", clientName: "Globex" }),
      booking({ id: "d", clientName: "" }),
    ];
    expect(topClients(rows, 5)).toEqual([
      { name: "Acme", count: 2, minutes: 240 },
      { name: "Globex", count: 1, minutes: 120 },
    ]);
  });

  it("honours the limit", () => {
    const rows = [
      booking({ id: "a", clientName: "A" }),
      booking({ id: "b", clientName: "B" }),
      booking({ id: "c", clientName: "C" }),
    ];
    expect(topClients(rows, 2)).toHaveLength(2);
  });
});

describe("crewLeaderboard", () => {
  it("counts shoots per shooter across completed bookings", () => {
    const rows = [
      booking({
        id: "a",
        completion: {
          shooters: [{ staffId: "s1", name: "Ilyas" }, { name: "Ravi" }],
        },
      } as Partial<StudioBooking> & { id: string }),
      booking({
        id: "b",
        completion: { shooters: [{ staffId: "s1", name: "Ilyas K" }] },
      } as Partial<StudioBooking> & { id: string }),
      booking({ id: "c" }),
    ];
    expect(crewLeaderboard(rows)).toEqual([
      { key: "staff:s1", name: "Ilyas", shoots: 2, isExternal: false },
      { key: "ext:ravi", name: "Ravi", shoots: 1, isExternal: true },
    ]);
  });

  it("returns an empty list when nothing was recorded", () => {
    expect(crewLeaderboard([booking({ id: "a" })])).toEqual([]);
  });
});

describe("completedReportRows / toCsv", () => {
  it("lists only completed bookings, newest first", () => {
    const rows = [
      booking({ id: "a", date: "2026-09-01" }),
      booking({ id: "b", date: "2026-09-05" }),
      booking({ id: "c", status: "confirmed", date: "2026-09-09" }),
    ];
    expect(completedReportRows(rows, []).map((r) => r.date)).toEqual(["2026-09-05", "2026-09-01"]);
  });

  it("flattens crew into the row", () => {
    const rows = [
      booking({
        id: "a",
        completion: {
          shooters: [{ name: "Ravi" }],
          cardHolder: { staffId: "s1", name: "Ilyas" },
        },
      } as Partial<StudioBooking> & { id: string }),
    ];
    const [row] = completedReportRows(rows, []);
    expect(row.shooters).toBe("Ravi");
    expect(row.cardHolder).toBe("Ilyas");
  });

  it("escapes quotes and commas in CSV output", () => {
    const csv = toCsv([
      {
        date: "2026-09-05",
        studio: 'Studio "A"',
        time: "10:00-12:00",
        durationMinutes: 120,
        type: "podcast",
        purpose: "Shoot, edit",
        client: "Acme",
        shooters: "Ravi",
        cardHolder: "Ilyas",
      },
    ]);
    const [header, line] = csv.split("\n");
    expect(header).toBe("Date,Studio,Time,Duration (min),Type,Purpose,Client,Shooters,Card holder");
    expect(line).toContain('"Studio ""A"""');
    expect(line).toContain('"Shoot, edit"');
  });

  it("returns only a header for no rows", () => {
    expect(toCsv([]).split("\n")).toHaveLength(1);
  });
});
