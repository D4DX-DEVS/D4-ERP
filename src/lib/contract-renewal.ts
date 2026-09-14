// ==================== Contract renewal terms (pure helpers) ====================
// A renewal is more than a new end date: the same dialog revises pay and rewrites
// the job description, so one submit fans out into up to three writes. These
// helpers turn the form values into those writes — the staff patch, the contract
// history snapshot, and a salary history row only when pay actually moved. No DB
// access; the page converts the Dates to Timestamps. Sibling of contract-utils.ts.

import type { ContractType, SalaryHistory } from "@/types";
import { computeContractEndDate } from "@/lib/contract-utils";

/** What the staff record holds right now, before the renewal is applied. */
export interface ContractRenewalCurrent {
  contractEndDate: Date | null;
  salary: number;
  jobDescription: string;
}

/** The dialog's fields, already parsed out of their input strings. */
export interface ContractRenewalForm {
  contractType: ContractType;
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
  newEndDate: Date | null;
  salaryChanged: boolean;
  jobDescriptionChanged: boolean;
  /** Only the fields that actually move — an unchanged salary or JD is left alone. */
  staffUpdate: {
    contractType: ContractType;
    contractEndDate: Date | null;
    currentSalary?: number;
    jobDescription?: string;
  };
  contractEntry: {
    previousEndDate: Date | null;
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

/** Human-readable complaint, or null when the form is good to submit. */
export function validateContractRenewal(form: ContractRenewalForm): string | null {
  if (form.contractType === "custom" && !form.customEndDate) {
    return "Pick a new end date for the custom contract";
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
  renewedOn: Date = new Date()
): ContractRenewalPlan {
  const newEndDate = computeContractEndDate(renewedOn, form.contractType, form.customEndDate ?? undefined);

  const previousJobDescription = current.jobDescription ?? "";
  const newJobDescription = form.jobDescription.trim();
  const jobDescriptionChanged = newJobDescription !== previousJobDescription.trim();

  const previousSalary = current.salary;
  const newSalary = form.newSalary;
  const salaryChanged = newSalary !== previousSalary;

  const reason = form.reason.trim();

  const staffUpdate: ContractRenewalPlan["staffUpdate"] = {
    contractType: form.contractType,
    contractEndDate: newEndDate,
  };
  if (salaryChanged) staffUpdate.currentSalary = newSalary;
  if (jobDescriptionChanged) staffUpdate.jobDescription = newJobDescription;

  return {
    newEndDate,
    salaryChanged,
    jobDescriptionChanged,
    staffUpdate,
    contractEntry: {
      previousEndDate: current.contractEndDate,
      newEndDate,
      contractType: form.contractType,
      reason,
      previousSalary,
      newSalary,
      previousJobDescription,
      newJobDescription,
      extendedOn: renewedOn,
    },
    salaryEntry: salaryChanged
      ? {
          type: newSalary > previousSalary ? "increment" : "decrement",
          previousSalary,
          newSalary,
          reason: `Contract renewal — ${reason}`,
          effectiveDate: renewedOn,
        }
      : null,
  };
}
