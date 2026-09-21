"use client";

import { ArrowDown, ArrowUp, CheckCircle2, MinusCircle, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { ReportingStatus, SectionSelection } from "@/lib/organization-report";
import type { DepartmentReport } from "@/types";

const STATE_BADGE: Record<string, { label: string; className: string }> = {
  submitted: { label: "Submitted", className: "bg-emerald-100 text-emerald-700" },
  missing: { label: "Not submitted", className: "bg-red-100 text-red-700" },
};

/** Enough to tell two filings of the same department apart. */
function optionLabel(doc: DepartmentReport): string {
  const name = doc.documentTitle?.trim();
  return `${name ? `${name} · ` : ""}${doc.period} · ${doc.startDate} to ${doc.endDate}`;
}

interface FilingChoiceProps {
  options: DepartmentReport[];
  chosenId: string | null;
  onChoose: (id: string | null) => void;
  emptyLabel: string;
  leaveOutLabel: string;
}

/**
 * What this department contributes to the document.
 *
 * One filing is the normal case, and a dropdown there reads like a file picker
 * for a file the admin never chose — so it is shown by name with a tick that
 * includes or drops it. A dropdown only appears when a department really did
 * file more than once in the period and the admin has to pick.
 */
function FilingChoice({ options, chosenId, onChoose, emptyLabel, leaveOutLabel }: FilingChoiceProps) {
  if (options.length === 0) {
    return <span className="text-xs text-slate-500">{emptyLabel}</span>;
  }

  if (options.length === 1) {
    const only = options[0];
    const included = chosenId === only.id;
    return (
      <label className="flex max-w-[340px] cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
          checked={included}
          onChange={(e) => onChoose(e.target.checked ? only.id! : null)}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-slate-900">
            {only.documentTitle?.trim() || "Untitled document"}
          </span>
          <span className="block text-xs capitalize text-slate-500">
            {only.period} · {only.startDate} to {only.endDate}
          </span>
          {!included ? <span className="block text-xs text-amber-600">Left out of the document</span> : null}
        </span>
      </label>
    );
  }

  return (
    <Select
      className="w-[300px]"
      value={chosenId ?? ""}
      onChange={(e) => onChoose(e.target.value || null)}
      options={[{ value: "", label: leaveOutLabel }, ...options.map((o) => ({ value: o.id!, label: optionLabel(o) }))]}
    />
  );
}

interface ReportingStatusPanelProps {
  status: ReportingStatus;
  selections: SectionSelection[];
  onChange: (next: SectionSelection[]) => void;
  /** Departments not to name as silent — they were never expected to file. */
  exemptDepartments: string[];
  onExemptChange: (next: string[]) => void;
}

/**
 * Who filed what for the period, and what the admin chose to do with it.
 *
 * Reports and plans are separate documents, so each department gets a column
 * for each. The departments that filed come first, in the order they will be
 * printed; the silent ones are listed underneath rather than padding the table,
 * because naming them is what stops a master report quietly speaking for a
 * department that never wrote anything.
 */
export function ReportingStatusPanel({
  status,
  selections,
  onChange,
  exemptDepartments,
  onExemptChange,
}: ReportingStatusPanelProps) {
  const byDepartment = new Map(selections.map((s) => [s.departmentId, s]));
  const ordered = [...selections].sort((a, b) => a.order - b.order);

  const patch = (departmentId: string, change: Partial<SectionSelection>) =>
    onChange(selections.map((s) => (s.departmentId === departmentId ? { ...s, ...change } : s)));

  const rowOf = (departmentId: string) => status.rows.find((r) => r.departmentId === departmentId);
  const hasFiling = (departmentId: string) => {
    const row = rowOf(departmentId);
    return Boolean(row && (row.reportOptions.length || row.planOptions.length));
  };

  // Only departments that filed are printed, so only they are worth ordering.
  const filed = ordered.filter((s) => hasFiling(s.departmentId));
  const silent = status.rows.filter((r) => !hasFiling(r.departmentId));

  /**
   * Swaps a department with the next one that is actually in the document, so
   * the arrows never appear to do nothing because a silent department happened
   * to sit between them.
   */
  const move = (departmentId: string, direction: -1 | 1) => {
    const here = filed.findIndex((s) => s.departmentId === departmentId);
    const there = here + direction;
    if (here === -1 || there < 0 || there >= filed.length) return;
    const swap = new Map([
      [filed[here].departmentId, filed[there].order],
      [filed[there].departmentId, filed[here].order],
    ]);
    onChange(selections.map((s) => (swap.has(s.departmentId) ? { ...s, order: swap.get(s.departmentId)! } : s)));
  };

  const stats = [
    { label: "Reports ready", value: `${status.counts.ready}/${status.counts.departments}`, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Plans ready", value: `${status.counts.plansReady}/${status.counts.departments}`, icon: Target, tone: "text-indigo-600" },
    { label: "Not submitted", value: status.counts.missing, icon: MinusCircle, tone: "text-red-600" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-2xl border border-white/70 bg-white/60 p-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${stat.tone}`} />
                <p className="truncate text-xs text-slate-500">{stat.label}</p>
              </div>
              <p className="mt-1 text-lg font-semibold text-slate-900">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Report going in</TableHead>
              <TableHead>Plan going in</TableHead>
              <TableHead className="text-right">Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filed.map((selection, index) => {
              const row = rowOf(selection.departmentId);
              if (!row) return null;
              const current = byDepartment.get(row.departmentId);
              const badge = STATE_BADGE[row.state];
              const planBadge = STATE_BADGE[row.planState];
              return (
                <TableRow key={row.departmentId}>
                  <TableCell className="text-slate-400">{index + 1}</TableCell>
                  <TableCell className="font-medium text-slate-950">
                    <div>{row.departmentName}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant={badge.className}>Report: {badge.label}</Badge>
                      <Badge variant={planBadge.className}>Plan: {planBadge.label}</Badge>
                      {row.rejected > 0 ? <span className="text-xs text-red-600">{row.rejected} sent back</span> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <FilingChoice
                      options={row.reportOptions}
                      chosenId={current?.reportId ?? null}
                      onChoose={(reportId) => patch(row.departmentId, { reportId })}
                      emptyLabel="No report filed"
                      leaveOutLabel="Leave the report out"
                    />
                  </TableCell>
                  <TableCell>
                    <FilingChoice
                      options={row.planOptions}
                      chosenId={current?.planId ?? null}
                      onChoose={(planId) => patch(row.departmentId, { planId })}
                      emptyLabel="No plan filed"
                      leaveOutLabel="Leave the plan out"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${row.departmentName} up`}
                        disabled={index === 0}
                        onClick={() => move(row.departmentId, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${row.departmentName} down`}
                        disabled={index === filed.length - 1}
                        onClick={() => move(row.departmentId, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-500">
                  No department has submitted anything for this period.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/*
        Named, not hidden — but naming is a choice. A department that never
        files anything is not silent, it is simply not a reporting department,
        so each one can be unticked out of the list the document prints.
      */}
      {silent.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Nothing submitted ({silent.length})
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Ticked departments are printed at the end of the document as not submitted. Untick one that was never
            expected to file.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {silent.map((row) => {
              const named = !exemptDepartments.includes(row.departmentId);
              return (
                <label key={row.departmentId} className="flex cursor-pointer items-center gap-2 text-sm text-amber-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-amber-300"
                    checked={named}
                    onChange={(e) =>
                      onExemptChange(
                        e.target.checked
                          ? exemptDepartments.filter((id) => id !== row.departmentId)
                          : [...exemptDepartments, row.departmentId]
                      )
                    }
                  />
                  <span className={named ? "" : "text-amber-700/60 line-through"}>{row.departmentName}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
