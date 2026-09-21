"use client";

import { useState } from "react";
import { AlertTriangle, Check, Edit2, Eye, FileText, Target, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REPORT_STATUS_COLORS } from "@/components/reports/plan-status";
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
}

/**
 * One filing — a written report or a plan, on D4 Media letterhead. The head
 * writes the document while it is a draft (or after it was sent back); once
 * submitted it is final, and the admin reads it, sends it back, or carries it
 * into the organization report. There is no approval step in between.
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
          <div className="flex min-w-0 flex-1 items-start gap-3">
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
              {report.status.replace(/-/g, " ")}
            </Badge>
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
                  <p className="font-semibold">Sent back by the admin</p>
                  <p className="whitespace-pre-line">{report.reviewNote}</p>
                </div>
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
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
