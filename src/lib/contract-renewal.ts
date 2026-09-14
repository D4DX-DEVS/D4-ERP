// ==================== Contract renewal terms (pure helpers) ====================
// A renewal is a fresh period — from a start date to an end date — and the same
// dialog revises pay and rewrites the job description, so one submit fans out
// into up to three writes. These helpers turn the form values into those writes:
// the staff patch, the contract history snapshot, and a salary history row only
// when pay actually moved. No DB access; the page converts the Dates to
// Timestamps. Sibling of contract-utils.ts.

import type { ContractType, SalaryHistory } from "@/types";
import { computeContractEndDate } from "@/lib/contract-utils";

const MS_PER_DAY = 86_400_000;

/** What the staff record holds right now, before the renewal is applied. */
export interface ContractRenewalCurrent {
  contractStartDate: Date | null;
  contractEndDate: Date | null;
  salary: number;
  jobDescription: string;
}

/** The dialog's fields, already parsed out of their input strings. */
export interface ContractRenewalForm {
  contractType: ContractType;
  /** First day of the new term. Null only while the field is empty. */
  startDate: Date | null;
  customEndDate?: Date | null;
  reason: string;
  newSalary: number;
  jobDescription: string;
}

export interface ContractRenewalSalaryEntry {
  type: SalaryHistory["type"];
  previousSalary: number;
  newSalary: number;
  reason: string;
  effectiveDate: Date;
}

export interface ContractRenewalPlan {
  newStartDate: Date;
  newEndDate: Date | null;
  salaryChanged: boolean;
  jobDescriptionChanged: boolean;
  /** Only the fields that actually move — an unchanged salary or JD is left alone. */
  staffUpdate: {
    contractType: ContractType;
    contractStartDate: Date;
    contractEndDate: Date | null;
    currentSalary?: number;
    jobDescription?: string;
  };
  contractEntry: {
    previousStartDate: Date | null;
    previousEndDate: Date | null;
    newStartDate: Date;
    newEndDate: Date | null;
    contractType: ContractType;
    reason: string;
    previousSalary: number;
    newSalary: number;
    previousJobDescription: string;
    newJobDescription: string;
    extendedOn: Date;
  };
  salaryEntry: ContractRenewalSalaryEntry | null;
}

function isValidDate(d: Date | null | undefined): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Parse a DatePicker value ("yyyy-mm-dd") as a LOCAL calendar day. `new Date(value)`
 * would read it as UTC midnight, which lands on the previous day west of UTC.
 */
export function parseDateInput(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value || "").trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return isValidDate(parsed) ? parsed : null;
}

/**
 * Where the new term should begin by default: the day after a contract that is
 * still running (so the periods join with no gap or overlap), otherwise today.
 */
export function defaultRenewalStart(currentEnd: Date | null | undefined, today: Date = new Date()): Date {
  if (!isValidDate(currentEnd)) return today;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfEnd = new Date(currentEnd.getFullYear(), currentEnd.getMonth(), currentEnd.getDate());
  if (startOfEnd.getTime() < startOfToday.getTime()) return today;
  return new Date(startOfEnd.getTime() + MS_PER_DAY);
}

/** Human-readable complaint, or null when the form is good to submit. */
export function validateContractRenewal(form: ContractRenewalForm): string | null {
  if (!isValidDate(form.startDate)) {
    return "Pick the contract start date";
  }
  if (form.contractType === "custom") {
    if (!isValidDate(form.customEndDate)) {
      return "Pick a new end date for the custom contract";
    }
    if (form.customEndDate.getTime() <= form.startDate.getTime()) {
      return "The end date must be after the start date";
    }
  }
  if (!form.reason.trim()) {
    return "Reason is required";
  }
  if (!Number.isFinite(form.newSalary) || form.newSalary < 0) {
    return "New salary must be a number of zero or more";
  }
  return null;
}

export function planContractRenewal(
  current: ContractRenewalCurrent,
  form: ContractRenewalForm,
  recordedOn: Date = new Date()
): ContractRenewalPlan {
  // Callers validate first; falling back to `recordedOn` keeps the types honest
  // rather than letting an Invalid Date reach the writes.
  const newStartDate = isValidDate(form.startDate) ? form.startDate : recordedOn;
  const newEndDate = computeContractEndDate(newStartDate, form.contractType, form.customEndDate ?? undefined);

  const previousJobDescription = current.jobDescription ?? "";
  const newJobDescription = form.jobDescription.trim();
  const jobDescriptionChanged = newJobDescription !== previousJobDescription.trim();

  const previousSalary = current.salary;
  const newSalary = form.newSalary;
  const salaryChanged = newSalary !== previousSalary;

  const reason = form.reason.trim();

  const staffUpdate: ContractRenewalPlan["staffUpdate"] = {
    contractType: form.contractType,
    contractStartDate: newStartDate,
    contractEndDate: newEndDate,
  };
  if (salaryChanged) staffUpdate.currentSalary = newSalary;
  if (jobDescriptionChanged) staffUpdate.jobDescription = newJobDescription;

  return {
    newStartDate,
    newEndDate,
    salaryChanged,
    jobDescriptionChanged,
    staffUpdate,
    contractEntry: {
      previousStartDate: current.contractStartDate,
      previousEndDate: current.contractEndDate,
      newStartDate,
      newEndDate,
      contractType: form.contractType,
      reason,
      previousSalary,
      newSalary,
      previousJobDescription,
      newJobDescription,
      extendedOn: recordedOn,
    },
    // New pay belongs to the new term, so it takes effect the day the term does.
    salaryEntry: salaryChanged
      ? {
          type: newSalary > previousSalary ? "increment" : "decrement",
          previousSalary,
          newSalary,
          reason: `Contract renewal — ${reason}`,
          effectiveDate: newStartDate,
        }
      : null,
  };
}
