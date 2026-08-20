import { describe, it, expect } from "vitest";

// The task form's min= relies on en-CA producing the local yyyy-mm-dd that
// DatePicker parses. If that ever stops holding, past due dates open back up.
describe("en-CA date value", () => {
  it("formats as local yyyy-mm-dd", () => {
    const d = new Date(2026, 7, 20); // 20 Aug 2026, local
    expect(d.toLocaleDateString("en-CA")).toBe("2026-08-20");
  });

  it("uses the local day, not the UTC one", () => {
    const earlyMorningIST = new Date(2026, 7, 20, 2, 0, 0);
    expect(earlyMorningIST.toLocaleDateString("en-CA")).toBe("2026-08-20");
  });
});
