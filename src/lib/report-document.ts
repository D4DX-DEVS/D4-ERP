// ==================== The written department document ====================
// A real D4Media department report is a document someone typed: headings,
// nested bullets, rupee figures, mostly Malayalam. It has no fixed shape, so
// the head writes one piece of rich text and the organization report reprints
// it as given. These are the pure helpers around that body — reading it out of
// whichever era a row was filed in, and reducing it to text.

import type { DepartmentReport, ReportSection } from "@/types";

export interface NumberedSection {
  number: string;
  depth: number;
  section: ReportSection;
}

/** Flattens a legacy section tree into printing order, "1", "1.1", "2". */
export function numberSections(sections: ReportSection[], prefix = ""): NumberedSection[] {
  return sections.flatMap((section, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
    const depth = prefix.split(".").filter(Boolean).length;
    return [{ number, depth, section }, ...numberSections(section.children ?? [], number)];
  });
}

/** Strips tags without a DOM, so this works on the server and in tests too. */
export function htmlToPlainText(html: string): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Folds a legacy section tree down into one body, so an old filing reads as the
 * same kind of document as a new one. The numbering carries the nesting, since
 * the sanitizer keeps no indentation.
 */
export function sectionsToHtml(sections: ReportSection[]): string {
  return numberSections(sections)
    .map(({ number, section }) => {
      const heading = section.title?.trim()
        ? `<p><strong>${number}. ${escapeHtml(section.title.trim())}</strong></p>`
        : "";
      return `${heading}${section.body ?? ""}`;
    })
    .filter(Boolean)
    .join("");
}

const LEGACY_FIELDS: { key: keyof DepartmentReport; title: string }[] = [
  { key: "summary", title: "Summary" },
  { key: "activities", title: "Key activities" },
  { key: "achievements", title: "Achievements" },
  { key: "challenges", title: "Issues / challenges" },
  { key: "remarks", title: "Remarks" },
];

/**
 * Reports filed before the document model existed carry narrative fields.
 * They are shown and printed as part of the body so an old filing still reads
 * as one document instead of disappearing from the new screens.
 */
export function sectionsFromLegacyReport(report: DepartmentReport): ReportSection[] {
  return LEGACY_FIELDS.flatMap(({ key, title }) => {
    const value = (report[key] as string | undefined)?.trim();
    if (!value) return [];
    return [{ id: `legacy-${String(key)}`, title, body: `<p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>` }];
  });
}

/**
 * The document body to render for a filing, whichever era it was written in:
 * the free body first, then the section tree, then the old narrative fields.
 */
export function documentBody(report: DepartmentReport): string {
  if (report.body?.trim()) return report.body;
  if (report.sections?.length) return sectionsToHtml(report.sections);
  return sectionsToHtml(sectionsFromLegacyReport(report));
}

/** True when nothing has actually been written yet — `<p></p>` included. */
export function isEmptyDocument(html: string): boolean {
  return htmlToPlainText(html).length === 0;
}

/** The document as plain text — for emptiness checks and short previews. */
export function documentPlainText(report: DepartmentReport): string {
  return htmlToPlainText(documentBody(report));
}
