import { describe, it, expect } from "vitest";
import {
  MOVEMENT_ACTIONS,
  authorizeMovementAction,
  movementConditions,
  assetStatusAfterCheckout,
  assetStatusAfterReturn,
  damageTypeFor,
  reportSlice,
  REPORT_EXPORT_MAX,
} from "@/lib/asset-movements";

const admin = { role: "admin", grantedFeatures: [] };
const deptHead = { role: "department-head", grantedFeatures: [] };
const staff = { role: "staff", grantedFeatures: [] };
const grantedStaff = { role: "staff", grantedFeatures: ["asset-management"] };
const accounts = { role: "accounts", grantedFeatures: [] };

describe("authorizeMovementAction", () => {
  it("lets admin and department-head run every known action", () => {
    for (const action of MOVEMENT_ACTIONS) {
      expect(authorizeMovementAction(admin, action)).toBeNull();
      expect(authorizeMovementAction(deptHead, action)).toBeNull();
    }
  });

  it("denies staff and accounts without the asset-management grant", () => {
    expect(authorizeMovementAction(staff, "checkout")).toBeTruthy();
    expect(authorizeMovementAction(staff, "get-reports")).toBeTruthy();
    expect(authorizeMovementAction(accounts, "check-availability")).toBeTruthy();
  });

  it("lets granted staff run movement actions", () => {
    expect(authorizeMovementAction(grantedStaff, "checkout")).toBeNull();
    expect(authorizeMovementAction(grantedStaff, "return")).toBeNull();
    expect(authorizeMovementAction(grantedStaff, "get-reports")).toBeNull();
  });

  it("rejects an unknown action even for admin", () => {
    expect(authorizeMovementAction(admin, "drop-database")).toBeTruthy();
    expect(authorizeMovementAction(admin, "")).toBeTruthy();
  });

  it("rejects a missing subject", () => {
    expect(authorizeMovementAction(null, "checkout")).toBeTruthy();
  });
});

describe("movementConditions", () => {
  it("reads the split fields when present", () => {
    expect(
      movementConditions({ status: "IN", outCondition: "good", inCondition: "damaged", condition: "damaged" })
    ).toEqual({ out: "good", in: "damaged" });
  });

  it("treats a legacy OUT movement's condition as the issue condition", () => {
    expect(movementConditions({ status: "OUT", condition: "defective" })).toEqual({
      out: "defective",
      in: null,
    });
  });

  it("treats a legacy IN movement's condition as the return condition, issue unknown", () => {
    expect(movementConditions({ status: "IN", condition: "damaged" })).toEqual({
      out: null,
      in: "damaged",
    });
  });

  it("defaults a bare OUT movement to good", () => {
    expect(movementConditions({ status: "OUT" })).toEqual({ out: "good", in: null });
  });

  it("never reports an in-condition while the asset is still out", () => {
    expect(movementConditions({ status: "OUT", outCondition: "good", inCondition: "damaged" }).in).toBeNull();
  });
});

describe("assetStatusAfterCheckout", () => {
  it("marks an available asset as assigned", () => {
    expect(assetStatusAfterCheckout("available")).toBe("assigned");
    expect(assetStatusAfterCheckout(undefined)).toBe("assigned");
  });

  it("leaves a retired asset alone", () => {
    expect(assetStatusAfterCheckout("retired")).toBe("retired");
  });
});

describe("assetStatusAfterReturn", () => {
  it("frees the asset when it comes back good", () => {
    expect(assetStatusAfterReturn("assigned", "good")).toBe("available");
  });

  it("sends damaged and defective returns to maintenance", () => {
    expect(assetStatusAfterReturn("assigned", "damaged")).toBe("maintenance");
    expect(assetStatusAfterReturn("assigned", "defective")).toBe("maintenance");
  });

  it("keeps a missing asset assigned — it is not back in the store", () => {
    expect(assetStatusAfterReturn("assigned", "missing")).toBe("assigned");
  });

  it("leaves a retired asset retired whatever the condition", () => {
    expect(assetStatusAfterReturn("retired", "good")).toBe("retired");
    expect(assetStatusAfterReturn("retired", "damaged")).toBe("retired");
  });
});

describe("damageTypeFor", () => {
  it("maps each bad condition to its report type", () => {
    expect(damageTypeFor("damaged")).toBe("damage");
    expect(damageTypeFor("defective")).toBe("defect");
    expect(damageTypeFor("missing")).toBe("missing");
  });

  it("returns null for a good condition, so no report is raised", () => {
    expect(damageTypeFor("good")).toBeNull();
    expect(damageTypeFor(undefined)).toBeNull();
  });
});

describe("reportSlice", () => {
  it("pages normally when not exporting", () => {
    expect(reportSlice({ page: 3, limit: 10 })).toEqual({ skip: 20, limit: 10 });
  });

  it("clamps a silly page size", () => {
    expect(reportSlice({ page: 1, limit: 100000 }).limit).toBe(REPORT_EXPORT_MAX);
    expect(reportSlice({ page: 1, limit: 0 }).limit).toBe(10);
    expect(reportSlice({ page: 0, limit: 10 }).skip).toBe(0);
  });

  it("returns the whole filtered set for an export, capped", () => {
    expect(reportSlice({ page: 4, limit: 10, all: true })).toEqual({ skip: 0, limit: REPORT_EXPORT_MAX });
  });
});
