import { describe, it, expect } from "vitest";
import {
  numberSections,
  htmlToPlainText,
  sectionsToHtml,
  documentBody,
  documentPlainText,
  isEmptyDocument,
  sectionsFromLegacyReport,
} from "@/lib/report-document";
import type { DepartmentReport, ReportSection } from "@/types";

function section(id: string, title: string, body = "", children?: ReportSection[]): ReportSection {
  return { id, title, body, ...(children ? { children } : {}) };
}

const TREE: ReportSection[] = [
  section("a", "D4Productions", "<p>Inhouse</p>", [
    section("a1", "Design Squad", "<p>1,689 outputs</p>"),
    section("a2", "Edit Suite", "<p>157 short videos</p>"),
  ]),
  section("b", "D4Kids", "<p>Workshops</p>"),
];

const report = (patch: Partial<DepartmentReport>): DepartmentReport => patch as DepartmentReport;

describe("numberSections", () => {
  it("walks a legacy tree in printing order with 1 / 1.1 numbering", () => {
    expect(numberSections(TREE).map((n) => [n.number, n.section.title, n.depth])).toEqual([
      ["1", "D4Productions", 0],
      ["1.1", "Design Squad", 1],
      ["1.2", "Edit Suite", 1],
      ["2", "D4Kids", 0],
    ]);
  });
});

describe("htmlToPlainText", () => {
  it("drops markup and keeps the words", () => {
    expect(htmlToPlainText("<p>Revenue <strong>up</strong></p>")).toBe("Revenue up");
  });

  it("keeps non-Latin content intact — these reports are written in Malayalam", () => {
    expect(htmlToPlainText("<p>മൊത്തം ഔട്ട്പുട്ട്: 1,689</p>")).toBe("മൊത്തം ഔട്ട്പുട്ട്: 1,689");
  });
});

describe("sectionsToHtml", () => {
  it("folds a legacy tree into one body, numbering carrying the nesting", () => {
    const html = sectionsToHtml(TREE);
    expect(html).toContain("<strong>1. D4Productions</strong>");
    expect(html).toContain("<strong>1.1. Design Squad</strong>");
    expect(html).toContain("<p>157 short videos</p>");
  });

  it("escapes a title rather than letting it inject markup", () => {
    expect(sectionsToHtml([section("x", "<img src=x>")])).toContain("&lt;img src=x&gt;");
  });
});

describe("documentBody", () => {
  it("prefers the body the head typed", () => {
    expect(documentBody(report({ body: "<p>Written straight out</p>", sections: TREE }))).toBe(
      "<p>Written straight out</p>"
    );
  });

  it("falls back to a section-era document", () => {
    expect(documentBody(report({ sections: TREE }))).toContain("D4Productions");
  });

  it("falls back again to the oldest narrative fields", () => {
    const body = documentBody(report({ summary: "Steady month", challenges: "Two editors on leave" }));
    expect(body).toContain("Steady month");
    expect(body).toContain("Two editors on leave");
  });

  it("is empty when the filing has nothing at all", () => {
    expect(documentBody(report({}))).toBe("");
  });
});

describe("isEmptyDocument", () => {
  it("treats blank markup as nothing typed", () => {
    expect(isEmptyDocument("")).toBe(true);
    expect(isEmptyDocument("<p></p>")).toBe(true);
  });

  it("is not empty once something is written", () => {
    expect(isEmptyDocument("<p>Revenue up</p>")).toBe(false);
  });
});

describe("documentPlainText", () => {
  it("reads a whole filing as text, markup and all", () => {
    const text = documentPlainText(report({ body: "<p>₹18,40,000 billed</p>" }));
    expect(text).toBe("₹18,40,000 billed");
  });
});

describe("sectionsFromLegacyReport", () => {
  const legacy = report({
    summary: "Steady month",
    activities: "Shoots and edits",
    achievements: "",
    challenges: "Two editors on leave",
  });

  it("turns the old narrative fields into document sections so nothing is lost", () => {
    const sections = sectionsFromLegacyReport(legacy);
    expect(sections.map((s) => s.title)).toEqual(["Summary", "Key activities", "Issues / challenges"]);
    expect(sections[0].body).toContain("Steady month");
  });

  it("returns nothing for a report that had no narrative either", () => {
    expect(sectionsFromLegacyReport(report({}))).toEqual([]);
  });
});
