import { describe, it, expect } from "vitest";
import {
  defaultRenewalStart,
  parseDateInput,
  planContractRenewal,
  validateContractRenewal,
} from "@/lib/contract-renewal";

const today = new Date(2026, 8, 14); // 14 Sep 2026
const startDate = new Date(2026, 8, 15); // 15 Sep 2026

const current = {
  contractStartDate: new Date(2024, 11, 2), // 02 Dec 2024
  contractEndDate: new Date(2025, 11, 2), // 02 Dec 2025
  salary: 24000,
  jobDescription: "Leads the video editing team.",
};

const baseForm = {
  contractType: "12-months" as const,
  startDate,
  reason: "Annual renewal",
  newSalary: 24000,
  jobDescription: "Leads the video editing team.",
};

describe("parseDateInput", () => {
  it("reads a picker value as a local calendar day", () => {
    expect(parseDateInput("2026-09-15")).toEqual(new Date(2026, 8, 15));
  });

  it("returns null for an empty or malformed value", () => {
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput(null)).toBeNull();
    expect(parseDateInput("15-09-2026")).toBeNull();
  });

  it("round-trips the en-CA value the pickers emit", () => {
    const day = new Date(2026, 8, 15);
    expect(parseDateInput(day.toLocaleDateString("en-CA"))).toEqual(day);
  });
});

describe("defaultRenewalStart", () => {
  it("starts the day after a contract that is still running", () => {
    expect(defaultRenewalStart(new Date(2026, 11, 2), today)).toEqual(new Date(2026, 11, 3));
  });

  it("starts today when the contract has already expired", () => {
    expect(defaultRenewalStart(new Date(2025, 11, 2), today)).toEqual(today);
  });

  it("starts today when there is no contract on file", () => {
    expect(defaultRenewalStart(null, today)).toEqual(today);
  });
});

describe("validateContractRenewal", () => {
  it("accepts a filled form", () => {
    expect(validateContractRenewal(baseForm)).toBeNull();
  });

  it("rejects a missing or unparseable start date", () => {
    expect(validateContractRenewal({ ...baseForm, startDate: null })).toMatch(/start date/i);
    expect(validateContractRenewal({ ...baseForm, startDate: new Date("nonsense") })).toMatch(/start date/i);
  });

  it("rejects a custom contract with no end date", () => {
    expect(validateContractRenewal({ ...baseForm, contractType: "custom" })).toMatch(/end date/i);
  });

  it("rejects a custom end date that is not after the start", () => {
    expect(
      validateContractRenewal({ ...baseForm, contractType: "custom", customEndDate: startDate })
    ).toMatch(/after the start/i);
  });

  it("accepts a custom contract once a later end date is picked", () => {
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
  it("runs the new term from the chosen start date, not from today", () => {
    const plan = planContractRenewal(current, baseForm, today);
    expect(plan.newStartDate).toEqual(startDate);
    expect(plan.newEndDate).toEqual(new Date(2027, 8, 15));
    expect(plan.staffUpdate.contractStartDate).toEqual(startDate);
    expect(plan.staffUpdate.contractEndDate).toEqual(new Date(2027, 8, 15));
    expect(plan.staffUpdate.contractType).toBe("12-months");
  });

  it("keeps the start date but drops the end date when renewed as permanent", () => {
    const plan = planContractRenewal(current, { ...baseForm, contractType: "permanent" }, today);
    expect(plan.newStartDate).toEqual(startDate);
    expect(plan.newEndDate).toBeNull();
    expect(plan.staffUpdate.contractEndDate).toBeNull();
  });

  it("uses the custom end date as given", () => {
    const plan = planContractRenewal(
      current,
      { ...baseForm, contractType: "custom", customEndDate: new Date(2027, 2, 31) },
      today
    );
    expect(plan.newEndDate).toEqual(new Date(2027, 2, 31));
  });

  it("writes no salary entry when pay is unchanged", () => {
    const plan = planContractRenewal(current, baseForm, today);
    expect(plan.salaryChanged).toBe(false);
    expect(plan.salaryEntry).toBeNull();
    expect(plan.staffUpdate.currentSalary).toBeUndefined();
  });

  it("records a raise as an increment effective on the contract start date", () => {
    const plan = planContractRenewal(current, { ...baseForm, newSalary: 28000 }, today);
    expect(plan.salaryChanged).toBe(true);
    expect(plan.staffUpdate.currentSalary).toBe(28000);
    expect(plan.salaryEntry).toEqual({
      type: "increment",
      previousSalary: 24000,
      newSalary: 28000,
      reason: "Contract renewal — Annual renewal",
      effectiveDate: startDate,
    });
  });

  it("records a pay cut as a decrement", () => {
    const plan = planContractRenewal(current, { ...baseForm, newSalary: 20000 }, today);
    expect(plan.salaryEntry?.type).toBe("decrement");
  });

  it("keeps the old job description when it was not edited", () => {
    const plan = planContractRenewal(current, baseForm, today);
    expect(plan.jobDescriptionChanged).toBe(false);
    expect(plan.staffUpdate.jobDescription).toBeUndefined();
  });

  it("ignores whitespace-only edits to the job description", () => {
    const plan = planContractRenewal(
      current,
      { ...baseForm, jobDescription: "  Leads the video editing team.  " },
      today
    );
    expect(plan.jobDescriptionChanged).toBe(false);
  });

  it("patches the staff record when the job description is rewritten", () => {
    const plan = planContractRenewal(current, { ...baseForm, jobDescription: "Heads post-production." }, today);
    expect(plan.jobDescriptionChanged).toBe(true);
    expect(plan.staffUpdate.jobDescription).toBe("Heads post-production.");
  });

  it("snapshots the full period and terms on the contract history entry", () => {
    const plan = planContractRenewal(
      current,
      { ...baseForm, newSalary: 28000, jobDescription: "Heads post-production." },
      today
    );
    expect(plan.contractEntry).toEqual({
      previousStartDate: current.contractStartDate,
      previousEndDate: current.contractEndDate,
      newStartDate: startDate,
      newEndDate: new Date(2027, 8, 15),
      contractType: "12-months",
      reason: "Annual renewal",
      previousSalary: 24000,
      newSalary: 28000,
      previousJobDescription: "Leads the video editing team.",
      newJobDescription: "Heads post-production.",
      extendedOn: today,
    });
  });

  it("trims the reason it stores", () => {
    const plan = planContractRenewal(current, { ...baseForm, reason: "  Renewed  " }, today);
    expect(plan.contractEntry.reason).toBe("Renewed");
  });

  it("handles a staff member with no prior contract or job description", () => {
    const plan = planContractRenewal(
      { contractStartDate: null, contractEndDate: null, salary: 0, jobDescription: "" },
      { ...baseForm, newSalary: 18000, jobDescription: "Junior editor." },
      today
    );
    expect(plan.contractEntry.previousStartDate).toBeNull();
    expect(plan.contractEntry.previousEndDate).toBeNull();
    expect(plan.contractEntry.previousJobDescription).toBe("");
    expect(plan.salaryEntry?.type).toBe("increment");
  });
});
