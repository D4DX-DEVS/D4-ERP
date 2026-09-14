import { describe, it, expect } from "vitest";
import {
  sanitizeCrew,
  sanitizeCrewMember,
  formatCrewNames,
  isExternalCrew,
  crewKey,
  buildCompletionPayload,
} from "@/lib/studio-crew";
import type { BookingCrewMember } from "@/types";

const staffUser = {
  uid: "u1",
  staffId: "st1",
  firstName: "Admin",
  lastName: "User",
};

describe("sanitizeCrew", () => {
  it("trims names and drops blank entries", () => {
    const input: BookingCrewMember[] = [
      { staffId: "a", name: "  Ilyas  " },
      { name: "   " },
      { name: "" },
      { name: "Freelancer" },
    ];
    expect(sanitizeCrew(input)).toEqual([
      { staffId: "a", name: "Ilyas" },
      { name: "Freelancer" },
    ]);
  });

  it("dedupes by staffId when present", () => {
    const input: BookingCrewMember[] = [
      { staffId: "a", name: "Ilyas" },
      { staffId: "a", name: "Ilyas K" },
    ];
    expect(sanitizeCrew(input)).toEqual([{ staffId: "a", name: "Ilyas" }]);
  });

  it("dedupes externals case-insensitively by name", () => {
    const input: BookingCrewMember[] = [{ name: "Ravi" }, { name: "ravi" }];
    expect(sanitizeCrew(input)).toEqual([{ name: "Ravi" }]);
  });

  it("keeps a staff member and a same-named external apart", () => {
    const input: BookingCrewMember[] = [{ staffId: "a", name: "Ravi" }, { name: "Ravi" }];
    expect(sanitizeCrew(input)).toHaveLength(2);
  });

  it("returns an empty array for undefined", () => {
    expect(sanitizeCrew(undefined)).toEqual([]);
  });

  it("never returns a staffId key for externals", () => {
    const [member] = sanitizeCrew([{ staffId: undefined, name: "Ravi" }]);
    expect(Object.hasOwn(member, "staffId")).toBe(false);
  });
});

describe("sanitizeCrewMember", () => {
  it("returns undefined for blank or missing members", () => {
    expect(sanitizeCrewMember(undefined)).toBeUndefined();
    expect(sanitizeCrewMember(null)).toBeUndefined();
    expect(sanitizeCrewMember({ name: "  " })).toBeUndefined();
  });

  it("trims a valid member", () => {
    expect(sanitizeCrewMember({ staffId: "a", name: " Ilyas " })).toEqual({ staffId: "a", name: "Ilyas" });
  });
});

describe("formatCrewNames", () => {
  it("joins names with commas", () => {
    expect(formatCrewNames([{ name: "A" }, { staffId: "b", name: "B" }])).toBe("A, B");
  });

  it("falls back to an em dash when empty", () => {
    expect(formatCrewNames([])).toBe("—");
    expect(formatCrewNames(undefined)).toBe("—");
  });
});

describe("isExternalCrew / crewKey", () => {
  it("flags members without a staffId as external", () => {
    expect(isExternalCrew({ name: "Ravi" })).toBe(true);
    expect(isExternalCrew({ staffId: "a", name: "Ilyas" })).toBe(false);
  });

  it("keys staff by id and externals by lowercased name", () => {
    expect(crewKey({ staffId: "a", name: "Ilyas" })).toBe("staff:a");
    expect(crewKey({ name: "Ravi K" })).toBe("ext:ravi k");
  });
});

describe("buildCompletionPayload", () => {
  it("omits crew keys entirely when nothing was entered", () => {
    const payload = buildCompletionPayload({ shooters: [], cardHolder: null, user: staffUser });
    expect(Object.hasOwn(payload, "shooters")).toBe(false);
    expect(Object.hasOwn(payload, "cardHolder")).toBe(false);
    expect(payload.completedBy).toBe("u1");
    expect(payload.completedByName).toBe("Admin User");
    expect(payload.completedAt).toBeDefined();
  });

  it("carries sanitized crew through", () => {
    const payload = buildCompletionPayload({
      shooters: [{ staffId: "a", name: " Ilyas " }, { name: "" }],
      cardHolder: { name: " Ravi " },
      user: staffUser,
    });
    expect(payload.shooters).toEqual([{ staffId: "a", name: "Ilyas" }]);
    expect(payload.cardHolder).toEqual({ name: "Ravi" });
  });
});
