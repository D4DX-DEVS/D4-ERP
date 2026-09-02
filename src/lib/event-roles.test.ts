import { describe, it, expect } from "vitest";
import {
  DEFAULT_EVENT_STAFF_ROLES,
  addEventRole,
  hasRole,
  mergeEventRoles,
  normalizeRoleName,
  removeEventRole,
} from "@/lib/event-roles";

describe("normalizeRoleName", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeRoleName("  Gimbal   Shoot ")).toBe("Gimbal Shoot");
    expect(normalizeRoleName("\tDrone Operator\n")).toBe("Drone Operator");
    expect(normalizeRoleName("   ")).toBe("");
  });
});

describe("hasRole", () => {
  it("matches case-insensitively on the normalized name", () => {
    expect(hasRole(["Gimbal Shoot"], "gimbal  shoot")).toBe(true);
    expect(hasRole(["Gimbal Shoot"], "Gimbal")).toBe(false);
  });

  it("never matches a blank role", () => {
    expect(hasRole(["Photographer"], "   ")).toBe(false);
  });
});

describe("mergeEventRoles", () => {
  it("keeps order and drops case-insensitive duplicates, first spelling wins", () => {
    expect(mergeEventRoles(["Photographer", "Light Man"], ["photographer", "Anchor"])).toEqual([
      "Photographer",
      "Light Man",
      "Anchor",
    ]);
  });

  it("skips blanks, non-strings and missing lists", () => {
    expect(
      mergeEventRoles(["Anchor", "  ", null as unknown as string], undefined, null, ["Anchor "])
    ).toEqual(["Anchor"]);
  });

  it("normalizes as it merges", () => {
    expect(mergeEventRoles(["  Video  Editor "])).toEqual(["Video Editor"]);
  });
});

describe("addEventRole", () => {
  it("appends a new role", () => {
    expect(addEventRole(["Anchor"], "Drone Operator")).toEqual(["Anchor", "Drone Operator"]);
  });

  it("returns the same reference for a duplicate or blank role", () => {
    const roles = ["Anchor"];
    expect(addEventRole(roles, "anchor")).toBe(roles);
    expect(addEventRole(roles, "  ")).toBe(roles);
  });
});

describe("removeEventRole", () => {
  it("removes case-insensitively", () => {
    expect(removeEventRole(["Anchor", "Helper"], "helper")).toEqual(["Anchor"]);
  });

  it("returns the same reference when the role is absent", () => {
    const roles = ["Anchor"];
    expect(removeEventRole(roles, "Driver")).toBe(roles);
  });
});

describe("DEFAULT_EVENT_STAFF_ROLES", () => {
  it("has no duplicates and no untrimmed entries", () => {
    expect(mergeEventRoles(DEFAULT_EVENT_STAFF_ROLES)).toEqual(DEFAULT_EVENT_STAFF_ROLES);
  });
});
