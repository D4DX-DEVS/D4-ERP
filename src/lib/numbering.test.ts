import { describe, it, expect } from "vitest";
import {
  sequenceScope,
  formatDocNumber,
  getFinancialYear,
  companyCode,
  normalizePrefix,
  resolveSeriesTemplate,
  toLocalDateKey,
} from "./numbering";

const fy = getFinancialYear(new Date(2026, 7, 29), 4); // Aug 2026 → FY 2026-27

describe("resolveSeriesTemplate", () => {
  const d4 = { name: "D4 Media Pvt Ltd", code: "", invoicePrefix: "D4" };
  const mc = { name: "MEDIA COMPANY", code: "MC", invoicePrefix: "MC-" };

  it("keeps the shared series for the company whose prefix matches the template", () => {
    const r = resolveSeriesTemplate("invoice", "D4-{SEQ:3}", d4);
    expect(r.template).toBe("D4-{SEQ:3}");
    expect(sequenceScope("invoice", r.template, r.comp, fy).key).toBe("invoice");
  });

  it("gives a company with its own prefix a separate per-company series", () => {
    const r = resolveSeriesTemplate("invoice", "D4-{SEQ:3}", mc);
    expect(r.template).toBe("{COMP}-{SEQ:3}");
    expect(r.comp).toBe("MC");
    expect(formatDocNumber(r.template, { comp: r.comp, fy, seq: 1 })).toBe("MC-001");
    expect(sequenceScope("invoice", r.template, r.comp, fy).key).toBe("invoice__MC");
  });

  it("keeps the template's own separator", () => {
    const r = resolveSeriesTemplate("invoice", "D4/{FY}/{SEQ:3}", mc);
    expect(formatDocNumber(r.template, { comp: r.comp, fy, seq: 7 })).toBe("MC/2026-27/007");
  });

  it("leaves templates without a prefix override untouched", () => {
    expect(resolveSeriesTemplate("invoice", "D4-{SEQ:3}", { name: "X Co", invoicePrefix: "" }).template).toBe("D4-{SEQ:3}");
    expect(resolveSeriesTemplate("invoice", "D4-{SEQ:3}", null).template).toBe("D4-{SEQ:3}");
    expect(resolveSeriesTemplate("quotation", "D4-Q-{SEQ:3}", mc).template).toBe("D4-Q-{SEQ:3}");
    expect(resolveSeriesTemplate("invoice", "{COMP}/{YYYY}/{SEQ:3}", mc).template).toBe("{COMP}/{YYYY}/{SEQ:3}");
  });

  it("normalizes prefixes with trailing separators", () => {
    expect(normalizePrefix("MC-")).toBe("MC");
    expect(normalizePrefix(" d4 / ")).toBe("D4");
    expect(normalizePrefix(undefined)).toBe("");
  });
});

describe("toLocalDateKey", () => {
  it("uses the local calendar day, not the UTC one", () => {
    expect(toLocalDateKey(new Date(2026, 9, 19, 0, 30))).toBe("2026-10-19");
    expect(toLocalDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

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
