import { describe, it, expect } from "vitest";
import { resolveDayCell, holidayMeta, type GridDay } from "./attendance-grid";
import { ATTENDANCE_STATUS_CONFIG, WEEKLY_OFF_META } from "./attendance-status";

const day = (over: Partial<GridDay> = {}): GridDay => ({
  key: "2026-08-12",
  isOff: false,
  holidayName: null,
  isFuture: false,
  ...over,
});

describe("resolveDayCell", () => {
  it("shows nothing for a past day with no record", () => {
    expect(resolveDayCell(null, day())).toBeNull();
  });

  it("shows the recorded status when a record exists", () => {
    expect(resolveDayCell({ status: "present" }, day())).toEqual(ATTENDANCE_STATUS_CONFIG.present);
    expect(resolveDayCell({ status: "absent" }, day())).toEqual(ATTENDANCE_STATUS_CONFIG.absent);
  });

  it("lets a holiday or weekly off win over an imported absent mark", () => {
    expect(resolveDayCell({ status: "absent" }, day({ holidayName: "Onam" }))).toEqual(holidayMeta("Onam"));
    expect(resolveDayCell({ status: "absent" }, day({ isOff: true }))).toEqual(WEEKLY_OFF_META);
    expect(resolveDayCell({ status: "week-off" }, day({ holidayName: "Onam" }))).toEqual(holidayMeta("Onam"));
  });

  it("still paints holidays and weekly offs when no record exists", () => {
    expect(resolveDayCell(null, day({ holidayName: "Onam" }))).toEqual(holidayMeta("Onam"));
    expect(resolveDayCell(null, day({ isOff: true }))).toEqual(WEEKLY_OFF_META);
  });

  it("shows nothing in the future or before joining", () => {
    expect(resolveDayCell(null, day({ isFuture: true }))).toBeNull();
    expect(resolveDayCell(null, day(), { joinedKey: "2026-08-20" })).toBeNull();
  });

  it("shows nothing after a removed staff member's last day", () => {
    expect(resolveDayCell(null, day({ key: "2026-08-20" }), { removedKey: "2026-08-12" })).toBeNull();
    // Real records before removal survive — that is the history we keep.
    expect(resolveDayCell({ status: "present" }, day({ key: "2026-08-10" }), { removedKey: "2026-08-12" }))
      .toEqual(ATTENDANCE_STATUS_CONFIG.present);
  });

  it("folds legacy statuses through the status config", () => {
    expect(resolveDayCell({ status: "late" }, day())).toEqual(ATTENDANCE_STATUS_CONFIG.present);
    expect(resolveDayCell({ status: "leave" }, day())).toEqual(ATTENDANCE_STATUS_CONFIG["full-leave"]);
  });
});
