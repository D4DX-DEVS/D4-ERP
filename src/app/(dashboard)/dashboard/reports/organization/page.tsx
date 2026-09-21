"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Layers, Loader2, Printer, Share2 } from "lucide-react";
import {
  createDocument,
  deleteDocument,
  getDocuments,
  orderBy,
  Timestamp,
} from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { ListingHeader, ListingPanel } from "@/components/ui/listing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getAppSettings } from "@/lib/settings";
import {
  buildMasterReport,
  defaultSelections,
  periodPresets,
  reportingStatus,
  titleFor,
  weekRangeOf,
  type DepartmentRef,
  type PeriodRange,
  type SectionSelection,
} from "@/lib/organization-report";
import { downloadPdfBlob, generatePaginatedPdfBlob, printPdfBlob } from "@/lib/document-pdf";
import { ReportingStatusPanel } from "@/components/reports/reporting-status-panel";
import { MasterDocument, type MasterBranding } from "@/components/reports/master-document";
import { SavedMasterReports } from "@/components/reports/saved-master-reports";
import type { Department, DepartmentReport, OrganizationReport, ReportPeriod } from "@/types";

const CADENCE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "custom", label: "Custom range" },
];

type Cadence = ReportPeriod | "custom";

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function OrganizationReportPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [departments, setDepartments] = useState<DepartmentRef[]>([]);
  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [saved, setSaved] = useState<OrganizationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState<MasterBranding>({ companyName: "" });
  const [selections, setSelections] = useState<SectionSelection[]>([]);
  const [exemptDepartments, setExemptDepartments] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "download" | "share" | "print" | "save">("");
  const [generatedOn, setGeneratedOn] = useState("");
  // Selections follow the period; this remembers which period they were built
  // for so an admin's ticks survive typing in the summary box.
  const builtFor = useRef("");
  const documentRef = useRef<HTMLDivElement>(null);

  // ---------- Period lives in the URL, so a half-built report can be shared ----------
  const cadence = (CADENCE_OPTIONS.some((o) => o.value === searchParams.get("period"))
    ? searchParams.get("period")
    : "weekly") as Cadence;
  const fallback = weekRangeOf(todayISO());
  const from = searchParams.get("from") || fallback.from;
  const to = searchParams.get("to") || fallback.to;
  const range: PeriodRange = useMemo(() => ({ from, to }), [from, to]);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const loadAll = useCallback(async () => {
    const [deptDocs, reportDocs, savedDocs] = await Promise.all([
      getDocuments<Department>("departments"),
      getDocuments<DepartmentReport>("department_reports", [orderBy("createdAt", "desc")]),
      getDocuments<OrganizationReport>("organization_reports", [orderBy("createdAt", "desc")]),
    ]);
    setDepartments(
      deptDocs
        .filter((d) => d.isActive !== false)
        .map((d) => ({ id: d.id!, name: d.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setReports(reportDocs);
    setSaved(savedDocs);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        await loadAll();
      } catch (error) {
        console.error("Failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [loadAll]);

  useEffect(() => {
    void getAppSettings()
      .then((settings) =>
        setBranding({
          companyName: settings.companyName,
          address: settings.companyProfile?.address,
          phone: settings.companyProfile?.phone,
          email: settings.companyProfile?.email,
        })
      )
      .catch(() => setBranding({ companyName: "" }));
  }, []);

  const status = useMemo(
    () => reportingStatus(departments, reports, range),
    [departments, reports, range]
  );

  // A new period means a new set of filings — start from "everything that was
  // filed is in", which is what an admin expects to tick down from.
  useEffect(() => {
    const key = `${from}|${to}|${departments.length}|${reports.length}`;
    if (builtFor.current === key) return;
    builtFor.current = key;
    setSelections(defaultSelections(status));
    setExemptDepartments([]);
  }, [from, to, departments.length, reports.length, status]);

  const master = useMemo(
    () =>
      buildMasterReport({
        title,
        period: cadence,
        range,
        departments,
        reports,
        selections,
        executiveSummary,
        closingNote,
        exemptDepartments,
      }),
    [title, cadence, range, departments, reports, selections, executiveSummary, closingNote, exemptDepartments]
  );

  const applyPreset = (preset: { key: Cadence; range: PeriodRange }) =>
    setParams({ period: preset.key, from: preset.range.from, to: preset.range.to });

  const stamp = () => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const openPreview = () => {
    setGeneratedOn(stamp());
    setPreviewOpen(true);
  };

  const fileName = (name: string) => `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${from}-to-${to}.pdf`;

  /** The PDF is a capture of the very node the preview shows. */
  const buildPdf = async (): Promise<Blob | null> => {
    if (!documentRef.current) return null;
    return generatePaginatedPdfBlob(documentRef.current, {
      title: master.title,
      runningHeader: `${master.title} · ${master.periodLabel}`,
      footerLeft: `Confidential · ${branding.companyName || "Organization"}`,
    });
  };

  const run = async (mode: "download" | "share" | "print") => {
    setBusy(mode);
    try {
      const blob = await buildPdf();
      if (!blob) return;
      if (mode === "print") {
        printPdfBlob(blob);
        return;
      }
      if (mode === "download") {
        downloadPdfBlob(blob, fileName(master.title));
        return;
      }
      const file = new File([blob], fileName(master.title), { type: "application/pdf" });
      const label = `${master.title} · ${master.periodLabel}`;
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: label, text: label, files: [file] });
        return;
      }
      downloadPdfBlob(blob, fileName(master.title));
      toast("info", "Sharing is not supported here, so the PDF was downloaded");
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      console.error("Error:", error);
      toast("error", "Failed to generate the PDF");
    } finally {
      setBusy("");
    }
  };

  /**
   * Downloads the master PDF and records what went into it. Saving and
   * downloading are the same action on purpose: an earlier split meant a PDF
   * could leave the building with no record that it had ever been produced.
   */
  const handleGenerate = async () => {
    if (!user) return;
    setBusy("save");
    try {
      const on = stamp();
      setGeneratedOn(on);
      await createDocument("organization_reports", {
        title: master.title,
        period: cadence,
        startDate: from,
        endDate: to,
        executiveSummary: master.executiveSummary,
        closingNote: master.closingNote,
        sections: master.sections.map((section, index) => ({
          reportId: section.report?.id ?? null,
          planId: section.plan?.id ?? null,
          departmentId: section.departmentId,
          departmentName: section.departmentName,
          order: index,
        })),
        missingDepartments: master.missing.map((d) => ({ departmentId: d.id, departmentName: d.name })),
        exemptDepartments,
        generatedBy: user.staffId,
        generatedByName: `${user.firstName} ${user.lastName}`,
        generatedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      });
      const blob = await buildPdf();
      if (blob) downloadPdfBlob(blob, fileName(master.title));
      await loadAll();
      toast("success", "Organization report downloaded and saved");
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to generate the organization report");
    } finally {
      setBusy("");
    }
  };

  /**
   * Reopens a stored report exactly as it was assembled — same period, same
   * chosen filings, same order — so its PDF can be produced again.
   */
  const reopenSaved = (report: OrganizationReport) => {
    setTitle(report.title);
    setExecutiveSummary(report.executiveSummary ?? "");
    setClosingNote(report.closingNote ?? "");
    const restored = (report.sections ?? []).map((s) => ({
      departmentId: s.departmentId,
      reportId: s.reportId ?? null,
      planId: s.planId ?? null,
      order: s.order,
    }));
    const untouched = departments
      .filter((d) => !restored.some((s) => s.departmentId === d.id))
      .map((d, i) => ({ departmentId: d.id, reportId: null, planId: null, order: restored.length + i }));
    // The period drives the selections effect, so pin it before restoring them.
    builtFor.current = `${report.startDate}|${report.endDate}|${departments.length}|${reports.length}`;
    setSelections([...restored, ...untouched]);
    setExemptDepartments(report.exemptDepartments ?? []);
    setParams({ period: String(report.period), from: report.startDate, to: report.endDate });
    setGeneratedOn(stamp());
    setPreviewOpen(true);
    toast("info", "Reopened — preview and download it again from here");
  };

  const deleteSaved = async (report: OrganizationReport) => {
    try {
      await deleteDocument("organization_reports", report.id!);
      setSaved((prev) => prev.filter((r) => r.id !== report.id));
      toast("success", "Organization report deleted");
    } catch {
      toast("error", "Failed to delete that report");
    }
  };

  const presets = periodPresets(todayISO());
  const nothingSelected = master.sections.length === 0;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Organization Report"
        description="Each department's report is reprinted as they wrote it, one after another, in one PDF."
        action={
          <Button onClick={openPreview} disabled={nothingSelected}>
            <Layers className="h-4 w-4" /> Build organization report
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Step 1 · Period</p>
            <p className="text-sm text-slate-500">Which dates the organization report covers.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => {
              const active = preset.range.from === from && preset.range.to === to;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset({ key: preset.key as Cadence, range: preset.range })}
                  className={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    active ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <DatePicker value={from} onChange={(e) => setParams({ from: e.target.value })} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <DatePicker value={to} onChange={(e) => setParams({ to: e.target.value })} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cadence</Label>
              <Select
                value={cadence}
                onChange={(e) => setParams({ period: e.target.value })}
                className="w-[160px]"
                options={CADENCE_OPTIONS}
              />
            </div>
            <div className="min-w-[240px] flex-1 space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={titleFor(cadence)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <ListingPanel
        title="Step 2 · What goes in"
        description="Every department that filed for this period. Untick a document to leave it out, and use the arrows to set the order it is printed in."
      >
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : departments.length === 0 ? (
          <p className="text-sm text-slate-500">No departments are set up yet.</p>
        ) : (
          <ReportingStatusPanel
            status={status}
            selections={selections}
            onChange={setSelections}
            exemptDepartments={exemptDepartments}
            onExemptChange={setExemptDepartments}
          />
        )}
      </ListingPanel>

      <ListingPanel
        title="Step 3 · Your own words (optional)"
        description="Printed before and after the department documents. Leave blank to print only what the departments wrote."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="exec">Executive summary</Label>
            <textarea
              id="exec"
              value={executiveSummary}
              onChange={(e) => setExecutiveSummary(e.target.value)}
              rows={4}
              placeholder="How the organization did this period"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="closing">Closing note</Label>
            <textarea
              id="closing"
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              rows={4}
              placeholder="What happens next, or what is expected of the departments"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
            />
          </div>
        </div>
      </ListingPanel>

      <ListingPanel title="Generated reports" description="Every master report produced from this page." contentClassName="p-0">
        <SavedMasterReports reports={saved} onReopen={reopenSaved} onDelete={deleteSaved} />
      </ListingPanel>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} className="max-w-5xl">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-4 pr-10">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{master.title}</h3>
            <p className="text-sm text-slate-500">
              {master.periodLabel} · {master.sections.length} department{master.sections.length === 1 ? "" : "s"} ·{" "}
              {master.missing.length} left out
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => run("print")} disabled={busy !== ""}>
              {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("share")} disabled={busy !== ""}>
              {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share
            </Button>
            <Button size="sm" onClick={handleGenerate} disabled={busy !== ""}>
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
            </Button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto rounded-xl bg-slate-100 p-3">
          <MasterDocument
            ref={documentRef}
            master={master}
            branding={branding}
            preparedBy={user ? `${user.firstName} ${user.lastName}` : undefined}
            generatedOn={generatedOn}
          />
        </div>
      </Dialog>
    </div>
  );
}
