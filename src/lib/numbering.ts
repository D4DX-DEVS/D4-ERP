// ==================== Document Auto-Numbering ====================
// Server-atomic, duplicate-free numbering for quotations, estimates,
// invoices and receipts. The running sequence is incremented through an
// atomic findOneAndUpdate ($inc, upsert) on the server, so two concurrent
// users can never be handed the same number (satisfies FR-QT-003).

import { getDocuments, getNextSequence, Timestamp, where } from "@/lib/firestore";
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

/** Strips trailing separators/case so "MC-", "mc" and "MC /" are the same prefix. */
export function normalizePrefix(prefix?: string | null): string {
  return (prefix ?? "").trim().replace(/[\s\-/_.]+$/, "").toUpperCase();
}

type NumberingCompany = Pick<Company, "name"> & Partial<Pick<Company, "code" | "invoicePrefix">>;

/**
 * A company's own invoice prefix overrides the shared template's leading text
 * so each company runs its own series (MC-001, MC-002 …) instead of every
 * company printing the main company's prefix. The company whose prefix already
 * matches the template keeps the shared series. Templates that already render
 * {COMP} are left alone so their existing counters keep running.
 */
export function resolveSeriesTemplate(
  series: DocSeries,
  template: string,
  company?: NumberingCompany | null
): { template: string; comp: string } {
  const comp = companyCode(company);
  const prefix = normalizePrefix(company?.invoicePrefix);
  if (series !== "invoice" || !prefix || template.includes("{COMP}")) return { template, comp };

  const firstToken = template.indexOf("{");
  if (firstToken < 0) return { template, comp };
  const literal = template.slice(0, firstToken);
  if (normalizePrefix(literal) === prefix) return { template, comp };

  const separator = literal.match(/[\-/_.]+$/)?.[0] ?? "-";
  return { template: `{COMP}${separator}${template.slice(firstToken)}`, comp: prefix };
}

/** YYYY-MM-DD of the local calendar day (toISOString would give the UTC day). */
export function toLocalDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

export interface SequenceScope {
  key: string;
  /** When set, a brand-new sequence is seeded from the highest legacy counter
   * matching prefix/suffix so numbering continues instead of restarting at 1. */
  legacy?: { prefix: string; suffix?: string };
}

/**
 * Builds the scope key the running sequence resets on. The scope only includes
 * parts the template can actually render: a template without a year token
 * ({YYYY}/{YY}/{FY}) never resets — one continuous serial — and a template
 * without {COMP} shares a single series across companies. Legacy keys were
 * always `${series}__${comp}__${startYear}`.
 */
export function sequenceScope(
  series: DocSeries,
  template: string,
  comp: string,
  fy: FinancialYear
): SequenceScope {
  const usesComp = template.includes("{COMP}");
  const usesYear = /\{YYYY\}|\{YY\}|\{FY\}/.test(template);
  const parts: string[] = [series];
  if (usesComp) parts.push(comp);
  if (usesYear) parts.push(String(fy.startYear));
  const key = parts.join("__");

  if (usesComp && usesYear) return { key }; // same shape as legacy keys — nothing to migrate
  if (usesComp) return { key, legacy: { prefix: `${key}__` } };
  if (usesYear) return { key, legacy: { prefix: `${series}__`, suffix: `__${fy.startYear}` } };
  return { key, legacy: { prefix: `${series}__` } };
}

export interface GenerateNumberOptions {
  series: DocSeries;
  company?: NumberingCompany | null;
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
  const { template, comp } = resolveSeriesTemplate(
    options.series,
    settings.numberFormats?.[options.series] ?? "{COMP}/{YYYY}/{SEQ:3}",
    options.company
  );

  const scope = sequenceScope(options.series, template, comp, fy);
  const seq = await getNextSequence(scope.key, scope.legacy);
  return formatDocNumber(template, { comp, fy, seq });
}

/**
 * True when another document of the same type already uses this number.
 * Guards hand-typed numbers; auto-generated ones are unique by construction.
 */
export async function isDocNumberTaken(
  number: string,
  type: string,
  excludeId?: string
): Promise<boolean> {
  const matches = await getDocuments<{ type: string }>("invoices", [
    where("invoiceNumber", "==", number),
    where("type", "==", type),
  ]);
  return matches.some((doc) => doc.id !== excludeId);
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
