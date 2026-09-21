"use client";

// ==================== The master document, on screen and in the PDF ====================
// This node is captured for the PDF, so it is styled inline and in plain
// colours: html2canvas cannot read Tailwind's oklch()/color-mix() values. Each
// department's document is reprinted exactly as its head wrote it, one after
// another with a rule between them — the admin is collating, not rewriting.
// The bodies are rendered as HTML the browser shapes itself, which is what
// keeps Malayalam text correct in the exported file.

import { sanitizeHtml } from "@/components/ui/rich-text-editor";
import { documentBody } from "@/lib/report-document";
import type { MasterReport } from "@/lib/organization-report";
import type { DepartmentReport } from "@/types";

export interface MasterBranding {
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface MasterDocumentProps {
  master: MasterReport;
  branding: MasterBranding;
  preparedBy?: string;
  generatedOn: string;
  ref?: React.Ref<HTMLDivElement>;
}

// html2canvas rasterises whatever the browser has already shaped, so the PDF
// picks up these families as long as they are loaded on the page. Poppins leads
// and the Malayalam face follows, which lets each character land in the right
// typeface without tagging the text by language.
//
// The real family names are named here rather than the next/font CSS variables:
// those variables also carry next/font's metric-adjusted "… Fallback" faces,
// and html2canvas measures with one face while drawing with another, which ate
// the spaces between words ("OrganizatiorReport", "DesignSquad(GraphicDesigning)").
const BODY_STACK = "'Poppins', 'Noto Sans Malayalam', Arial, sans-serif";
const HEADING_STACK = "'Poppins', 'Anek Malayalam', 'Noto Sans Malayalam', Arial, sans-serif";

const PAGE: React.CSSProperties = {
  width: "794px",
  margin: "0 auto",
  background: "#ffffff",
  padding: "44px 52px",
  color: "#1f2937",
  fontFamily: BODY_STACK,
  fontSize: "13px",
  lineHeight: 1.55,
};

const RULE: React.CSSProperties = { border: 0, borderTop: "1px solid #e5e7eb", margin: "18px 0" };

/** The filing exactly as it was written: its own title, byline, then its text. */
function FiledDocument({ report, label }: { report: DepartmentReport; label?: string }) {
  const html = sanitizeHtml(documentBody(report));
  return (
    <div style={{ marginTop: "10px" }}>
      {label ? (
        <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.05em", color: "#4338ca" }}>{label}</div>
      ) : null}
      <div style={{ fontFamily: HEADING_STACK, fontSize: "13.5px", fontWeight: 700, color: "#111827" }}>
        {report.documentTitle?.trim() || `${report.departmentName} ${(report.kind ?? "report") === "plan" ? "plan" : "report"}`}
      </div>
      <div style={{ fontSize: "10.5px", color: "#6b7280", textTransform: "capitalize" }}>
        {report.period} · {report.startDate} to {report.endDate}
        {report.generatedByName ? ` · filed by ${report.generatedByName}` : ""} · {report.status}
      </div>
      {report.description?.trim() ? (
        <p style={{ margin: "6px 0 0", whiteSpace: "pre-line", color: "#4b5563" }}>{report.description}</p>
      ) : null}
      {html ? (
        <div className="rich-text-content" style={{ marginTop: "6px" }} dangerouslySetInnerHTML={{ __html: html }} />
      ) : null}
    </div>
  );
}

/** The whole organization report: cover, each department's document, gaps. */
export function MasterDocument({ master, branding, preparedBy, generatedOn, ref }: MasterDocumentProps) {
  return (
    <div ref={ref} style={PAGE}>
      {/* ---------- Cover ---------- */}
      <div style={{ borderBottom: "3px solid #111827", paddingBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: HEADING_STACK, fontSize: "22px", fontWeight: 700, color: "#111827" }}>
              {branding.companyName || "Organization"}
            </div>
            {branding.address ? (
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px", maxWidth: "360px" }}>{branding.address}</div>
            ) : null}
            {branding.phone || branding.email ? (
              <div style={{ fontSize: "11px", color: "#6b7280" }}>
                {[branding.phone, branding.email].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>
          <div style={{ textAlign: "right", fontSize: "11px", color: "#6b7280" }}>
            <div>Prepared by {preparedBy || "Administration"}</div>
            <div>Generated {generatedOn}</div>
          </div>
        </div>

        <div style={{ fontFamily: HEADING_STACK, marginTop: "26px", fontSize: "26px", fontWeight: 700, color: "#111827" }}>
          {master.title}
        </div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#4338ca", marginTop: "4px" }}>{master.periodLabel}</div>
        <div data-pdf-hide style={{ fontSize: "11px", color: "#6b7280", marginTop: "6px" }}>
          {master.sections.length} department{master.sections.length === 1 ? "" : "s"} included
          {master.missing.length > 0 ? ` · ${master.missing.length} not submitted` : ""}
        </div>
      </div>

      {master.missing.length > 0 ? (
        <div
          data-pdf-hide
          style={{ marginTop: "12px", border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", borderRadius: "8px", padding: "8px 10px", fontSize: "11.5px" }}
        >
          Not included ({master.missing.length}): {master.missing.map((m) => m.name).join(", ")} — shown here only; left out of the PDF.
        </div>
      ) : null}

      {master.executiveSummary ? (
        <>
          <hr style={RULE} />
          <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.05em", color: "#4338ca" }}>EXECUTIVE SUMMARY</div>
          <p style={{ whiteSpace: "pre-line", margin: "6px 0 0" }}>{master.executiveSummary}</p>
        </>
      ) : null}

      {/* ---------- One department after another, as filed ---------- */}
      {master.sections.map((section, index) => (
        <div key={section.departmentId}>
          {/* The cover already rules off above the first department. */}
          {index > 0 || master.executiveSummary ? (
            <hr style={{ ...RULE, borderTop: "2px solid #111827", margin: "22px 0 14px" }} />
          ) : (
            <div style={{ height: "14px" }} />
          )}
          <div style={{ fontFamily: HEADING_STACK, fontSize: "16px", fontWeight: 700, color: "#111827", background: "#fef08a", display: "inline-block", padding: "2px 8px" }}>
            {section.index}. {section.departmentName}
          </div>

          {section.report ? <FiledDocument report={section.report} /> : null}
          {section.plan ? <FiledDocument report={section.plan} label="PLAN" /> : null}
          {index === master.sections.length - 1 ? <hr style={{ ...RULE, marginBottom: 0 }} /> : null}
        </div>
      ))}

      {/* ---------- What is not in this document ---------- */}
      {master.missing.length > 0 ? (
        <>
          <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.05em", color: "#c2410c", marginTop: "18px" }}>
            DEPARTMENTS NOT INCLUDED
          </div>
          <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
            {master.missing.map((dept) => (
              <li key={dept.id}>{dept.name} — nothing submitted for this period.</li>
            ))}
          </ul>
        </>
      ) : null}

      {master.closingNote ? (
        <>
          <hr style={RULE} />
          <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.05em", color: "#4338ca" }}>CLOSING NOTE</div>
          <p style={{ whiteSpace: "pre-line", margin: "6px 0 0" }}>{master.closingNote}</p>
        </>
      ) : null}
    </div>
  );
}
