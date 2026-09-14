import { describe, it, expect } from "vitest";
import { planContractRenewal, validateContractRenewal } from "@/lib/contract-renewal";

const renewedOn = new Date(2026, 8, 14); // 14 Sep 2026

const current = {
  contractEndDate: new Date(2025, 11, 2), // 02 Dec 2025
  salary: 24000,
  jobDescription: "Leads the video editing team.",
};

const baseForm = {
  contractType: "12-months" as const,
  reason: "Annual renewal",
  newSalary: 24000,
  jobDescription: "Leads the video editing team.",
};

describe("validateContractRenewal", () => {
  it("accepts a filled form", () => {
    expect(validateContractRenewal(baseForm)).toBeNull();
  });

  it("rejects a custom contract with no end date", () => {
    expect(validateContractRenewal({ ...baseForm, contractType: "custom" })).toMatch(/end date/i);
  });

  it("accepts a custom contract once a date is picked", () => {
    expect(
      validateContractRenewal({ ...baseForm, contractType: "custom", customEndDate: new Date(2027, 0, 1) })
    ).toBeNull();
  });

  it("rejects a blank reason", () => {
    expect(validateContractRenewal({ ...baseForm, reason: "   " })).toMatch(/reason/i);
  });

  it("rejects a negative or non-numeric salary", () => {
    expect(validateContractRenewal({ ...baseForm, newSalary: -1 })).toMatch(/salary/i);
    expect(validateContractRenewal({ ...baseForm, newSalary: Number.NaN })).toMatch(/salary/i);
  });
});

describe("planContractRenewal", () => {
  it("moves the end date forward by the chosen duration", () => {
    const plan = planContractRenewal(current, baseForm, renewedOn);
    expect(plan.newEndDate).toEqual(new Date(2027, 8, 14));
    expect(plan.staffUpdate.contractType).toBe("12-months");
    expect(plan.staffUpdate.contractEndDate).toEqual(new Date(2027, 8, 14));
  });

  it("has no end date when renewed as permanent", () => {
    const plan = planContractRenewal(current, { ...baseForm, contractType: "permanent" }, renewedOn);
    expect(plan.newEndDate).toBeNull();
    expect(plan.staffUpdate.contractEndDate).toBeNull();
  });

  it("uses the custom end date as given", () => {
    const plan = planContractRenewal(
      current,
      { ...baseForm, contractType: "custom", customEndDate: new Date(2027, 2, 31) },
      renewedOn
    );
    expect(plan.newEndDate).toEqual(new Date(2027, 2, 31));
  });

  it("writes no salary entry when pay is unchanged", () => {
    const plan = planContractRenewal(current, baseForm, renewedOn);
    expect(plan.salaryChanged).toBe(false);
    expect(plan.salaryEntry).toBeNull();
    expect(plan.staffUpdate.currentSalary).toBeUndefined();
  });

  it("records a raise as an increment effective on the renewal date", () => {
    const plan = planContractRenewal(current, { ...baseForm, newSalary: 28000 }, renewedOn);
    expect(plan.salaryChanged).toBe(true);
    expect(plan.staffUpdate.currentSalary).toBe(28000);
    expect(plan.salaryEntry).toEqual({
      type: "increment",
      previousSalary: 24000,
      newSalary: 28000,
      reason: "Contract renewal — Annual renewal",
      effectiveDate: renewedOn,
    });
  });

  it("records a pay cut as a decrement", () => {
    const plan = planContractRenewal(current, { ...baseForm, newSalary: 20000 }, renewedOn);
    expect(plan.salaryEntry?.type).toBe("decrement");
  });

  it("keeps the old job description when it was not edited", () => {
    const plan = planContractRenewal(current, baseForm, renewedOn);
    expect(plan.jobDescriptionChanged).toBe(false);
    expect(plan.staffUpdate.jobDescription).toBeUndefined();
  });

  it("ignores whitespace-only edits to the job description", () => {
    const plan = planContractRenewal(
      current,
      { ...baseForm, jobDescription: "  Leads the video editing team.  " },
      renewedOn
    );
    expect(plan.jobDescriptionChanged).toBe(false);
  });

  it("patches the staff record when the job description is rewritten", () => {
    const plan = planContractRenewal(current, { ...baseForm, jobDescription: "Heads post-production." }, renewedOn);
    expect(plan.jobDescriptionChanged).toBe(true);
    expect(plan.staffUpdate.jobDescription).toBe("Heads post-production.");
  });

  it("snapshots the full terms on the contract history entry", () => {
    const plan = planContractRenewal(
      current,
      { ...baseForm, newSalary: 28000, jobDescription: "Heads post-production." },
      renewedOn
    );
    expect(plan.contractEntry).toEqual({
      previousEndDate: current.contractEndDate,
      newEndDate: new Date(2027, 8, 14),
      contractType: "12-months",
      reason: "Annual renewal",
      previousSalary: 24000,
      newSalary: 28000,
      previousJobDescription: "Leads the video editing team.",
      newJobDescription: "Heads post-production.",
      extendedOn: renewedOn,
    });
  });

  it("trims the reason it stores", () => {
    const plan = planContractRenewal(current, { ...baseForm, reason: "  Renewed  " }, renewedOn);
    expect(plan.contractEntry.reason).toBe("Renewed");
  });

  it("handles a staff member with no prior contract or job description", () => {
    const plan = planContractRenewal(
      { contractEndDate: null, salary: 0, jobDescription: "" },
      { ...baseForm, newSalary: 18000, jobDescription: "Junior editor." },
      renewedOn
    );
    expect(plan.contractEntry.previousEndDate).toBeNull();
    expect(plan.contractEntry.previousJobDescription).toBe("");
    expect(plan.salaryEntry?.type).toBe("increment");
  });
});
