import { describe, expect, it } from "vitest";
import { clampDiscount, discountAmount } from "./invoice-discount";

describe("discountAmount", () => {
  it("computes a fixed discount", () => {
    expect(discountAmount({ type: "fixed", value: 30 }, 100)).toBe(30);
  });

  it("computes a percentage discount", () => {
    expect(discountAmount({ type: "percentage", value: 10 }, 200)).toBe(20);
  });

  it("clamps a fixed discount above the subtotal", () => {
    expect(discountAmount({ type: "fixed", value: 150 }, 100)).toBe(100);
  });

  it("clamps a percentage discount above 100%", () => {
    expect(discountAmount({ type: "percentage", value: 150 }, 100)).toBe(100);
  });

  it("clamps negative values to zero", () => {
    expect(discountAmount({ type: "fixed", value: -5 }, 100)).toBe(0);
  });

  it("handles a missing discount", () => {
    expect(discountAmount(undefined, 100)).toBe(0);
  });
});

describe("clampDiscount", () => {
  it("stores what the totals were computed with: fixed capped to subtotal", () => {
    expect(clampDiscount({ type: "fixed", value: 150 }, 100)).toEqual({ type: "fixed", value: 100 });
  });

  it("percentage capped to 100", () => {
    expect(clampDiscount({ type: "percentage", value: 150 }, 100)).toEqual({ type: "percentage", value: 100 });
  });

  it("negative floored to 0", () => {
    expect(clampDiscount({ type: "percentage", value: -10 }, 100)).toEqual({ type: "percentage", value: 0 });
  });

  it("valid values pass through unchanged", () => {
    expect(clampDiscount({ type: "fixed", value: 40 }, 100)).toEqual({ type: "fixed", value: 40 });
  });
});
