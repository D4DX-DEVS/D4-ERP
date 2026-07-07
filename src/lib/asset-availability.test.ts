import { describe, it, expect } from "vitest";
import {
  itemBusyReason,
  type AvailabilityContext,
  type BookingLike,
  type MovementLike,
  type AssetEventLike,
} from "@/lib/asset-availability";

const asset = { id: "cam1", kind: "asset" as const };
const equip = { id: "eq1", kind: "equipment" as const };

function ctx(over: Partial<AvailabilityContext> = {}): AvailabilityContext {
  return { outMovements: [], assetEvents: [], studioBookings: [], ...over };
}

const eventJul10to11: AssetEventLike = {
  id: "ev1",
  name: "Wedding Shoot",
  fromDate: "2026-07-10T00:00:00Z",
  toDate: "2026-07-11T00:00:00Z",
};
const outMovement: MovementLike = { assetId: "cam1", eventId: "ev1", eventName: "Wedding Shoot", status: "OUT" };

const booking = (over: Partial<BookingLike>): BookingLike => ({
  id: "b1",
  date: "2026-07-10",
  startTime: "10:00",
  endTime: "12:00",
  status: "approved",
  reservedItems: [{ itemId: "cam1", name: "Camera", kind: "asset" }],
  purpose: "Podcast",
  ...over,
});

describe("itemBusyReason — studio win", () => {
  const win = { kind: "studio" as const, date: "2026-07-10", startTime: "11:00", endTime: "13:00" };

  it("free when nothing conflicts", () => {
    expect(itemBusyReason(asset, win, ctx()).busy).toBe(false);
  });

  it("busy: asset is OUT to an overlapping event (day-level)", () => {
    const r = itemBusyReason(asset, win, ctx({ outMovements: [outMovement], assetEvents: [eventJul10to11] }));
    expect(r.busy).toBe(true);
    expect(r.reason?.type).toBe("event");
    expect(r.reason?.name).toBe("Wedding Shoot");
  });

  it("free when the OUT event is on a different day", () => {
    const window2 = { kind: "studio" as const, date: "2026-07-20", startTime: "11:00", endTime: "13:00" };
    const r = itemBusyReason(asset, window2, ctx({ outMovements: [outMovement], assetEvents: [eventJul10to11] }));
    expect(r.busy).toBe(false);
  });

  it("busy: another booking reserves it with an overlapping time (hour-level)", () => {
    const r = itemBusyReason(asset, win, ctx({ studioBookings: [booking({})] }));
    expect(r.busy).toBe(true);
    expect(r.reason?.type).toBe("studio");
  });

  it("free when the other booking's time does not overlap", () => {
    const r = itemBusyReason(asset, win, ctx({ studioBookings: [booking({ startTime: "08:00", endTime: "10:00" })] }));
    expect(r.busy).toBe(false);
  });

  it("equipment is blocked by a studio booking of the same kind", () => {
    const b = booking({ reservedItems: [{ itemId: "eq1", name: "Boom Mic", kind: "equipment" }] });
    expect(itemBusyReason(equip, win, ctx({ studioBookings: [b] })).busy).toBe(true);
  });

  it("kind mismatch does not collide (same id, different pool)", () => {
    const b = booking({ reservedItems: [{ itemId: "eq1", name: "X", kind: "asset" }] });
    expect(itemBusyReason(equip, win, ctx({ studioBookings: [b] })).busy).toBe(false);
  });

  it("non-reserving booking status is ignored (rejected/cancelled/completed)", () => {
    expect(itemBusyReason(asset, win, ctx({ studioBookings: [booking({ status: "rejected" })] })).busy).toBe(false);
    expect(itemBusyReason(asset, win, ctx({ studioBookings: [booking({ status: "cancelled" })] })).busy).toBe(false);
    expect(itemBusyReason(asset, win, ctx({ studioBookings: [booking({ status: "completed" })] })).busy).toBe(false);
  });

  it("confirmed and in-progress bookings reserve their assets", () => {
    expect(itemBusyReason(asset, win, ctx({ studioBookings: [booking({ status: "confirmed" })] })).busy).toBe(true);
    expect(itemBusyReason(asset, win, ctx({ studioBookings: [booking({ status: "in-progress" })] })).busy).toBe(true);
  });

  it("ignoreBookingId excludes the booking being edited", () => {
    const c = ctx({ studioBookings: [booking({ id: "b1" })], ignoreBookingId: "b1" });
    expect(itemBusyReason(asset, win, c).busy).toBe(false);
  });
});

describe("itemBusyReason — event win", () => {
  const win = { kind: "event" as const, fromDate: "2026-07-10T00:00:00Z", toDate: "2026-07-10T00:00:00Z" };

  it("busy: asset reserved by an overlapping studio booking (day-level)", () => {
    const r = itemBusyReason(asset, win, ctx({ studioBookings: [booking({})] }));
    expect(r.busy).toBe(true);
    expect(r.reason?.type).toBe("studio");
  });

  it("busy: asset OUT to another overlapping event (range overlap)", () => {
    const r = itemBusyReason(asset, win, ctx({ outMovements: [outMovement], assetEvents: [eventJul10to11] }));
    expect(r.busy).toBe(true);
  });

  it("ignoreEventId skips the current event's own movements", () => {
    const c = ctx({ outMovements: [outMovement], assetEvents: [eventJul10to11], ignoreEventId: "ev1" });
    expect(itemBusyReason(asset, win, c).busy).toBe(false);
  });

  it("free when booking day is outside the event win", () => {
    const r = itemBusyReason(asset, win, ctx({ studioBookings: [booking({ date: "2026-07-20" })] }));
    expect(r.busy).toBe(false);
  });
});
