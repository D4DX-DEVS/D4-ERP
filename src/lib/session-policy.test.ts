import { describe, it, expect } from "vitest";
import { isSessionDeniedStatus, SESSION_DENIED_STATUSES } from "./auth";

describe("session status policy", () => {
  it("denies exactly the statuses that mean the account is switched off", () => {
    expect(isSessionDeniedStatus("terminated")).toBe(true);
    expect(isSessionDeniedStatus("suspended")).toBe(true);
  });

  it("allows everyone still employed, including those temporarily away", () => {
    // These people use the app daily; denying them would be the opposite of the
    // bug this work set out to fix.
    for (const status of ["active", "on-leave", "notice-period", "relieved"]) {
      expect(isSessionDeniedStatus(status), status).toBe(false);
    }
  });

  it("treats a missing or malformed status as allowed", () => {
    expect(isSessionDeniedStatus(undefined)).toBe(false);
    expect(isSessionDeniedStatus(null)).toBe(false);
    expect(isSessionDeniedStatus(42)).toBe(false);
    expect(isSessionDeniedStatus({})).toBe(false);
  });

  it("is the single list every auth route shares", () => {
    expect([...SESSION_DENIED_STATUSES].sort()).toEqual(["suspended", "terminated"]);
  });
});
