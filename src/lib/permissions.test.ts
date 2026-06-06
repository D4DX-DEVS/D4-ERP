import { describe, it, expect } from "vitest";
import { hasFeature, roleHasFeature, featureMeta, FEATURES } from "@/lib/permissions";

describe("permissions framework", () => {
  it("admin implicitly has every feature", () => {
    for (const f of FEATURES) {
      expect(hasFeature({ role: "admin" }, f.key)).toBe(true);
      expect(roleHasFeature("admin", f.key)).toBe(true);
    }
  });

  it("respects role defaults", () => {
    // studio-booking defaults to admin + department-head
    expect(roleHasFeature("department-head", "studio-booking")).toBe(true);
    expect(roleHasFeature("accounts", "studio-booking")).toBe(false);
    expect(roleHasFeature("staff", "studio-booking")).toBe(false);
  });

  it("grants extra features additively to non-default roles", () => {
    const staff = { role: "staff", grantedFeatures: ["studio-booking"] };
    expect(hasFeature(staff, "studio-booking")).toBe(true);
    expect(hasFeature(staff, "asset-management")).toBe(false);
  });

  it("denies when no role default and no grant", () => {
    expect(hasFeature({ role: "staff" }, "studio-booking")).toBe(false);
    expect(hasFeature({ role: "staff", grantedFeatures: [] }, "asset-management")).toBe(false);
  });

  it("handles null/undefined subjects safely", () => {
    expect(hasFeature(null, "studio-booking")).toBe(false);
    expect(hasFeature(undefined, "studio-booking")).toBe(false);
    expect(roleHasFeature(null, "studio-booking")).toBe(false);
  });

  it("exposes feature metadata by key", () => {
    expect(featureMeta("studio-booking")?.label).toBe("Studio Booking");
    expect(featureMeta("nonexistent")).toBeUndefined();
  });
});
