"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock, Edit2, Eye, FileText, Target, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  APPROVED_REPORT_STATUSES,
  REPORT_STATUS_COLORS,
  reportStatusLabel,
} from "@/components/reports/plan-status";
import {
  DocumentLetterhead,
  ReportDocumentEditor,
  ReportDocumentView,
  type DocumentBranding,
} from "@/components/reports/report-document-editor";
import { documentBody } from "@/lib/report-document";
import type { DepartmentReport, StaffRole } from "@/types";

/** What a save or a submit carries back up: the parts the card can edit. */
export interface ReportEdits {
  documentTitle: string;
  description: string;
  body: string;
}

interface ReportCardProps {
  report: DepartmentReport;
  role?: StaffRole | string;
  branding: DocumentBranding;
  expanded: boolean;
  submitting?: boolean;
  onToggle: () => void;
  onSaveDraft: (report: DepartmentReport, edits: ReportEdits) => void;
  onSubmit: (report: DepartmentReport, edits: ReportEdits) => void;
  /** Admin sends it back to the head with a reason. */
  onReject?: (report: DepartmentReport) => void;
  /** Admin signs it off, optionally with feedback for the head. */
  onApprove?: (report: DepartmentReport) => void;
  /** Head removes a document still on their desk (draft or sent back). */
  onDelete?: (report: DepartmentReport) => void;
}

/** "22 Sep 2026" from a stored timestamp, or "" when there is none. */
function shortDate(value?: { seconds: number } | null): string {
  if (!value?.seconds) return "";
  return new Date(value.seconds * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * One filing — a written report or a plan, on D4 Media letterhead. The head
 * writes the document while it is a draft (or after it was sent back); once
 * submitted it is locked, and the admin approves it (optionally with feedback)
 * or sends it back with a reason. Either way the head sees the outcome here.
 */
export function ReportCard({
  report,
  role,
  branding,
  expanded,
  submitting,
  onToggle,
  onSaveDraft,
  onSubmit,
  onReject,
  onApprove,
  onDelete,
}: ReportCardProps) {
  const isPlan = (report.kind ?? "report") === "plan";
  // A rejected filing goes back to being editable: the head fixes the same
  // document and resubmits it, rather than filing a second one for the period.
  const editable = (report.status === "draft" || report.status === "rejected") && role === "department-head";

  const [title, setTitle] = useState(report.documentTitle ?? "");
  const [description, setDescription] = useState(report.description ?? "");
  const [body, setBody] = useState(documentBody(report));

  const edits = (): ReportEdits => ({
    documentTitle: title.trim(),
    description: description.trim(),
    body,
  });

  const heading = report.documentTitle?.trim() || `${report.departmentName} ${isPlan ? "plan" : "report"}`;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* min-w-48: the title keeps a readable width; the badges and buttons wrap below it on a phone. */}
          <div className="flex min-w-48 flex-1 items-start gap-3">
            {isPlan ? (
              <Target className="mt-0.5 h-5 w-5 text-indigo-600" />
            ) : (
              <FileText className="mt-0.5 h-5 w-5 text-indigo-600" />
            )}
            <div className="min-w-0 flex-1">
              <h4 className="break-words font-semibold text-slate-900">{heading}</h4>
              <p className="text-xs capitalize text-slate-500">
                {report.departmentName} • {report.period} • {report.startDate} to {report.endDate}
                {report.generatedByName ? ` • ${report.generatedByName}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant={isPlan ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"}>
              {isPlan ? "Plan" : "Report"}
            </Badge>
            <Badge variant={REPORT_STATUS_COLORS[report.status]} className="capitalize">
              {reportStatusLabel(report.status)}
            </Badge>
            {editable && onDelete ? (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                aria-label={`Delete ${isPlan ? "plan" : "report"}`}
                title={`Delete ${isPlan ? "plan" : "report"}`}
                onClick={() => onDelete(report)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={editable ? "default" : "outline"}
              aria-label={expanded ? "Collapse document" : "Open document"}
              onClick={onToggle}
            >
              {editable ? <Edit2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {!expanded && report.description?.trim() ? (
          <p className="mt-3 line-clamp-2 text-sm text-slate-500">{report.description}</p>
        ) : null}

        {expanded ? (
          <div className="mt-6 space-y-6">
            {report.status === "rejected" && report.reviewNote ? (
              <div className="flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">
                    Sent back by {report.reviewedByName || "the admin"}
                    {shortDate(report.reviewedAt) ? ` · ${shortDate(report.reviewedAt)}` : ""}
                  </p>
                  <p className="whitespace-pre-line">{report.reviewNote}</p>
                </div>
              </div>
            ) : null}
            {APPROVED_REPORT_STATUSES.has(report.status) ? (
              <div className="flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">
                    Approved by {report.reviewedByName || "the admin"}
                    {shortDate(report.reviewedAt) ? ` · ${shortDate(report.reviewedAt)}` : ""}
                  </p>
                  {report.reviewNote ? <p className="whitespace-pre-line">{report.reviewNote}</p> : null}
                </div>
              </div>
            ) : null}
            {report.status === "submitted" && role === "department-head" ? (
              <div className="flex gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Submitted{shortDate(report.submittedAt) ? ` on ${shortDate(report.submittedAt)}` : ""} — waiting for
                  the admin&apos;s review. You&apos;ll be notified when it is approved or sent back.
                </p>
              </div>
            ) : null}

            <DocumentLetterhead branding={branding} report={report} title={title} />

            {editable ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor={`${report.id}-title`}>
                    Document title
                  </Label>
                  <Input
                    id={`${report.id}-title`}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      isPlan ? "e.g. D4MEDIA 2025-26 വാർഷിക പ്ലാൻ" : "e.g. D4MEDIA 2025 ഒക്ടോബർ - ഡിസംബർ ത്രൈമാസ റിപ്പോർട്ട്"
                    }
                  />
                </div>
                <ReportDocumentEditor
                  description={description}
                  body={body}
                  onDescriptionChange={setDescription}
                  onBodyChange={setBody}
                  isPlan={isPlan}
                />
              </>
            ) : (
              <ReportDocumentView description={report.description} body={body} />
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={onToggle}>
                <X className="mr-1 h-4 w-4" /> Close
              </Button>
              {editable ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => onSaveDraft(report, edits())}>
                    <Check className="mr-1 h-4 w-4" /> Save Draft
                  </Button>
                  <Button size="sm" onClick={() => onSubmit(report, edits())} disabled={submitting}>
                    {submitting ? "Submitting…" : report.status === "rejected" ? "Resubmit to Admin" : "Submit to Admin"}
                  </Button>
                </>
              ) : null}
              {report.status === "submitted" && role === "admin" && onReject ? (
                <Button size="sm" variant="outline" onClick={() => onReject(report)}>
                  Send back
                </Button>
              ) : null}
              {report.status === "submitted" && role === "admin" && onApprove ? (
                <Button size="sm" onClick={() => onApprove(report)}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
