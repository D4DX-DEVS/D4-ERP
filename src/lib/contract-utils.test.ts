import { describe, it, expect } from "vitest";
import {
  addMonths,
  computeContractEndDate,
  getDaysRemaining,
  getContractStatus,
  CONTRACT_DURATIONS,
} from "@/lib/contract-utils";

describe("addMonths", () => {
  it("adds months across a year boundary", () => {
    expect(addMonths(new Date(2026, 10, 15), 3)).toEqual(new Date(2027, 1, 15));
  });
});

describe("computeContractEndDate", () => {
  const start = new Date(2026, 0, 1); // Jan 1 2026

  it("permanent has no end date", () => {
    expect(computeContractEndDate(start, "permanent")).toBeNull();
  });

  it("custom uses the given date", () => {
    const custom = new Date(2027, 5, 1);
    expect(computeContractEndDate(start, "custom", custom)).toEqual(custom);
  });

  it("custom with no date given is null", () => {
    expect(computeContractEndDate(start, "custom")).toBeNull();
  });

  it("12-months preset adds a year", () => {
    expect(computeContractEndDate(start, "12-months")).toEqual(new Date(2027, 0, 1));
  });

  it("3-months preset adds 3 months", () => {
    expect(computeContractEndDate(start, "3-months")).toEqual(new Date(2026, 3, 1));
  });
});

describe("getDaysRemaining", () => {
  const today = new Date(2026, 6, 7); // Jul 7 2026

  it("null when no end date", () => {
    expect(getDaysRemaining(null, today)).toBeNull();
  });

  it("positive when end date is in the future", () => {
    expect(getDaysRemaining(new Date(2026, 6, 17), today)).toBe(10);
  });

  it("negative when end date is in the past", () => {
    expect(getDaysRemaining(new Date(2026, 6, 1), today)).toBe(-6);
  });

  it("zero on the end date itself", () => {
    expect(getDaysRemaining(new Date(2026, 6, 7), today)).toBe(0);
  });
});

describe("getContractStatus", () => {
  const today = new Date(2026, 6, 7); // Jul 7 2026

  it("none when no end date", () => {
    expect(getContractStatus(null, today)).toBe("none");
  });

  it("active when more than 30 days remain", () => {
    expect(getContractStatus(new Date(2026, 8, 1), today)).toBe("active");
  });

  it("expiring-soon at exactly 30 days remaining", () => {
    expect(getContractStatus(new Date(2026, 7, 6), today)).toBe("expiring-soon");
  });

  it("active at 31 days remaining (boundary)", () => {
    expect(getContractStatus(new Date(2026, 7, 7), today)).toBe("active");
  });

  it("expired when end date has passed", () => {
    expect(getContractStatus(new Date(2026, 6, 1), today)).toBe("expired");
  });
});

describe("CONTRACT_DURATIONS", () => {
  it("includes all 7 preset values in UI order", () => {
    const values = CONTRACT_DURATIONS.map((d) => d.value);
    expect(values).toEqual([
      "3-months", "6-months", "12-months", "24-months", "36-months", "permanent", "custom",
    ]);
  });
});
