"use client";

import { RichTextEditor, sanitizeHtml } from "@/components/ui/rich-text-editor";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DepartmentReport } from "@/types";

export interface DocumentBranding {
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface LetterheadProps {
  branding: DocumentBranding;
  report: DepartmentReport;
  title: string;
}

/**
 * The D4 Media letterhead the document is written on: who the organization is,
 * then which department filed it, for what period, and by whom. The head sees
 * the same header the admin and the PDF will print, so what they write is what
 * goes out.
 */
export function DocumentLetterhead({ branding, report, title }: LetterheadProps) {
  const isPlan = (report.kind ?? "report") === "plan";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-900 pb-3">
        <div>
          <p className="text-lg font-bold tracking-tight text-slate-900">
            {branding.companyName || "D4 Media"}
          </p>
          {branding.address ? <p className="max-w-xs text-xs text-slate-500">{branding.address}</p> : null}
          {branding.phone || branding.email ? (
            <p className="text-xs text-slate-500">{[branding.phone, branding.email].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          Department {isPlan ? "Plan" : "Report"}
        </p>
      </div>

      <h4 className="mt-3 text-base font-bold text-slate-900">
        {title.trim() || `${report.departmentName} ${isPlan ? "plan" : "report"}`}
      </h4>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="font-semibold text-slate-500">Department</dt>
          <dd>{report.departmentName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold text-slate-500">Prepared by</dt>
          <dd>{report.generatedByName || "—"}</dd>
        </div>
        <div className="flex gap-2 capitalize">
          <dt className="font-semibold text-slate-500">Period</dt>
          <dd>
            {report.period} · {report.startDate} to {report.endDate}
          </dd>
        </div>
        <div className="flex gap-2 capitalize">
          <dt className="font-semibold text-slate-500">Status</dt>
          <dd>{report.status.replace(/-/g, " ")}</dd>
        </div>
      </dl>
    </div>
  );
}

interface EditorProps {
  description: string;
  body: string;
  onDescriptionChange: (next: string) => void;
  onBodyChange: (next: string) => void;
  isPlan: boolean;
}

/**
 * The document as the head actually writes it: a short description, then one
 * free editor for everything else. No section scaffolding and no KPI fields —
 * the real reports are typed straight out, and the admin reprints them as they
 * arrive.
 */
export function ReportDocumentEditor({
  description,
  body,
  onDescriptionChange,
  onBodyChange,
  isPlan,
}: EditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="filing-description">
          Description
        </Label>
        <Textarea
          id="filing-description"
          rows={2}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={
            isPlan
              ? "One or two lines introducing this plan."
              : "One or two lines introducing this report."
          }
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{isPlan ? "Plan" : "Report"}</Label>
        <RichTextEditor
          value={body}
          onChange={onBodyChange}
          placeholder="Write the whole document here — headings, bullets, figures, amounts…"
        />
      </div>
    </div>
  );
}

/** The same document, read-only — what an admin and the PDF see. */
export function ReportDocumentView({ description, body }: { description?: string; body: string }) {
  const html = sanitizeHtml(body);
  return (
    <div className="space-y-3">
      {description?.trim() ? (
        <p className="whitespace-pre-line text-sm text-slate-600">{description}</p>
      ) : null}
      {html ? (
        <div className="rich-text-content text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-sm text-slate-500">This document is empty.</p>
      )}
    </div>
  );
}
