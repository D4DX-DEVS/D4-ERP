import { describe, it, expect } from "vitest";
import { sequenceScope, formatDocNumber, getFinancialYear, companyCode } from "./numbering";

const fy = getFinancialYear(new Date(2026, 7, 29), 4); // Aug 2026 → FY 2026-27

describe("sequenceScope", () => {
  it("uses a continuous serial when the template has no year or company token", () => {
    const scope = sequenceScope("quotation", "D4-Q-{SEQ:3}", "DM", fy);
    expect(scope.key).toBe("quotation");
    // Seeds from any legacy `quotation__<comp>__<year>` counter.
    expect(scope.legacy).toEqual({ prefix: "quotation__" });
  });

  it("keeps the legacy series+company+FY key when the template uses both tokens", () => {
    const scope = sequenceScope("receipt", "RCPT-{COMP}/{YYYY}/{SEQ:3}", "DM", fy);
    expect(scope.key).toBe("receipt__DM__2026");
    expect(scope.legacy).toBeUndefined();
  });

  it("scopes per company without a yearly reset when only {COMP} is used", () => {
    const scope = sequenceScope("invoice", "{COMP}-{SEQ:4}", "DM", fy);
    expect(scope.key).toBe("invoice__DM");
    expect(scope.legacy).toEqual({ prefix: "invoice__DM__" });
  });

  it("scopes per FY across companies when only a year token is used", () => {
    const scope = sequenceScope("estimate", "EST-{FY}/{SEQ:3}", "DM", fy);
    expect(scope.key).toBe("estimate__2026");
    expect(scope.legacy).toEqual({ prefix: "estimate__", suffix: "__2026" });
  });
});

describe("formatDocNumber", () => {
  it("renders the default D4 quotation series", () => {
    expect(formatDocNumber("D4-Q-{SEQ:3}", { comp: "DM", fy, seq: 4 })).toBe("D4-Q-004");
  });

  it("replaces all supported tokens", () => {
    expect(formatDocNumber("{COMP}/{FY}/{YY}/{SEQ}", { comp: "DM", fy, seq: 12 })).toBe(
      "DM/2026-27/26/12"
    );
  });
});

describe("financial year and company code helpers", () => {
  it("rolls the FY on the configured start month", () => {
    expect(getFinancialYear(new Date(2026, 2, 31), 4).label).toBe("2025-26");
    expect(getFinancialYear(new Date(2026, 3, 1), 4).label).toBe("2026-27");
  });

  it("derives company initials when no explicit code exists", () => {
    expect(companyCode({ name: "D4 Media Pvt Ltd" })).toBe("DM");
    expect(companyCode(null)).toBe("NA");
  });
});
