import { describe, it, expect } from "vitest";
import {
  isSoftDeleteCollection,
  softDeletePatch,
  restorePatch,
  withoutDeleted,
} from "./soft-delete";

describe("soft-delete", () => {
  it("marks staff as soft-deletable and other collections as not", () => {
    expect(isSoftDeleteCollection("staff")).toBe(true);
    expect(isSoftDeleteCollection("attendance")).toBe(false);
  });

  it("flags the row instead of removing it", () => {
    const now = new Date("2026-09-10T00:00:00Z");
    expect(softDeletePatch(now)).toEqual({
      isDeleted: true,
      isActive: false,
      deletedAt: now,
      updatedAt: now,
    });
  });

  it("restores a removed row", () => {
    const now = new Date("2026-09-10T00:00:00Z");
    expect(restorePatch(now)).toEqual({
      isDeleted: false,
      isActive: true,
      deletedAt: null,
      updatedAt: now,
    });
  });

  it("hides removed staff from an empty filter", () => {
    expect(withoutDeleted("staff", {})).toEqual({ isDeleted: { $ne: true } });
  });

  it("ANDs the guard into an existing filter", () => {
    expect(withoutDeleted("staff", { departmentId: "d1" })).toEqual({
      $and: [{ departmentId: "d1" }, { isDeleted: { $ne: true } }],
    });
  });

  it("leaves non-soft-delete collections untouched", () => {
    expect(withoutDeleted("attendance", { staffId: "s1" })).toEqual({ staffId: "s1" });
  });

  it("keeps removed rows when history explicitly asks for them", () => {
    expect(withoutDeleted("staff", { departmentId: "d1" }, true)).toEqual({ departmentId: "d1" });
  });
});
