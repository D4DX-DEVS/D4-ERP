// ==================== Document Auto-Numbering ====================
// Server-atomic, duplicate-free numbering for quotations, estimates,
// invoices and receipts. The running sequence is incremented through an
// atomic findOneAndUpdate ($inc, upsert) on the server, so two concurrent
// users can never be handed the same number (satisfies FR-QT-003).

import { getNextSequence, Timestamp } from "@/lib/firestore";
import { getAppSettings, type AppSettings, type NumberFormats } from "@/lib/settings";
import type { Company } from "@/types";

export type DocSeries = keyof NumberFormats; // "quotation" | "estimate" | "invoice" | "receipt"

export interface FinancialYear {
  /** Calendar year the financial year starts in (e.g. 2026 for FY 2026-27). */
  startYear: number;
  /** Calendar year the financial year ends in (e.g. 2027 for FY 2026-27). */
  endYear: number;
  /** Human label, e.g. "2026-27". */
  label: string;
}

/**
 * Resolves the financial year for a date given the configured start month.
 * @param fyStartMonth 1-based month the financial year begins (e.g. 4 = April).
 */
export function getFinancialYear(date: Date, fyStartMonth: number): FinancialYear {
  const month = date.getMonth() + 1; // 1-based
  const year = date.getFullYear();
  const startYear = month >= fyStartMonth ? year : year - 1;
  const endYear = startYear + 1;
  return { startYear, endYear, label: `${startYear}-${String(endYear).slice(-2)}` };
}

/** Derives a short company code for numbering, falling back gracefully. */
export function companyCode(company?: Pick<Company, "code" | "name"> | null): string {
  const explicit = company?.code?.trim();
  if (explicit) return explicit.toUpperCase();
  const name = company?.name?.trim();
  if (name) {
    // Build initials from the first two significant words, else first 2 chars.
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return "NA";
}

interface FormatTokens {
  comp: string;
  fy: FinancialYear;
  seq: number;
}

/** Replaces tokens in a number-format template with concrete values. */
export function formatDocNumber(template: string, tokens: FormatTokens): string {
  return template
    .replace(/\{COMP\}/g, tokens.comp)
    .replace(/\{YYYY\}/g, String(tokens.fy.startYear))
    .replace(/\{YY\}/g, String(tokens.fy.startYear).slice(-2))
    .replace(/\{FY\}/g, tokens.fy.label)
    .replace(/\{SEQ:(\d+)\}/g, (_m, n: string) => String(tokens.seq).padStart(Number(n), "0"))
    .replace(/\{SEQ\}/g, String(tokens.seq));
}

/** Builds the scope key the running sequence resets on (series + company + FY). */
function sequenceKey(series: DocSeries, comp: string, fy: FinancialYear): string {
  return `${series}__${comp}__${fy.startYear}`;
}

export interface GenerateNumberOptions {
  series: DocSeries;
  company?: Pick<Company, "code" | "name"> | null;
  settings?: AppSettings;
  /** Date the document is dated; defaults to now. */
  date?: Date;
}

/**
 * Generates the next document number for a series. Atomically reserves the
 * sequence value on the server so the returned number is always unique.
 */
export async function generateDocNumber(options: GenerateNumberOptions): Promise<string> {
  const settings = options.settings ?? (await getAppSettings());
  const date = options.date ?? new Date();
  const fyStartMonth = Number(settings.financialYearStart) || 4;
  const fy = getFinancialYear(date, fyStartMonth);
  const comp = companyCode(options.company);
  const template = settings.numberFormats?.[options.series] ?? "{COMP}/{YYYY}/{SEQ:3}";

  const seq = await getNextSequence(sequenceKey(options.series, comp, fy));
  return formatDocNumber(template, { comp, fy, seq });
}

/** Convenience helper returning a Timestamp-friendly issue date alongside the number. */
export async function generateDocNumberNow(options: Omit<GenerateNumberOptions, "date">): Promise<{
  number: string;
  date: Timestamp;
}> {
  const now = new Date();
  const number = await generateDocNumber({ ...options, date: now });
  return { number, date: Timestamp.fromDate(now) };
}
