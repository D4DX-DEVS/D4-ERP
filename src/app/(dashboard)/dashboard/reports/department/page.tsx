"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Layers, Plus, Target } from "lucide-react";
import {
  getDocument,
  getDocuments,
  createDocument,
  updateDocument,
  where,
  orderBy,
  Timestamp,
} from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { ListingHeader } from "@/components/ui/listing";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/loading";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { getPeriodRange } from "@/lib/report-aggregator";
import { approverRecipientIds, createBulkNotifications } from "@/lib/notifications";
import { rangeLabel, reportInRange, type PeriodRange } from "@/lib/report-period";
import { ReportCard, type ReportEdits } from "@/components/reports/report-card";
import type { DocumentBranding } from "@/components/reports/report-document-editor";
import { getAppSettings } from "@/lib/settings";
import type { Department, DepartmentReport, ReportKind, ReportPeriod, ReportStatus } from "@/types";

const TABS = [
  { key: "report", label: "Reports", icon: FileText },
  { key: "plan", label: "Plans", icon: Target },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Which statuses a filter admits. A submitted filing is final — there is no
 * approval after it — so "filed" also admits `published`, which only rows from
 * before that step was dropped still carry.
 */
const STATUS_FILTERS: Record<string, ReportStatus[]> = {
  filed: ["submitted", "published"],
  draft: ["draft"],
  rejected: ["rejected"],
  all: ["draft", "submitted", "published", "rejected"],
};

const STATUS_FILTER_OPTIONS = [
  { value: "filed", label: "Submitted" },
  { value: "draft", label: "Drafts only" },
  { value: "rejected", label: "Sent back" },
  { value: "all", label: "Every status" },
];

/**
 * A draft is the head's own desk: half-written, not yet meant for anyone else.
 * Reviewers only ever see what was actually sent to them, so neither the list
 * nor the status filter can reach an unsubmitted document.
 */
const REVIEWER_HIDDEN: ReportStatus[] = ["draft"];
const REVIEWER_FILTER_OPTIONS = STATUS_FILTER_OPTIONS.filter((option) => option.value !== "draft");

const PERIOD_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

/** Rows written before plans became their own document are reports. */
const kindOf = (report: DepartmentReport): ReportKind => report.kind ?? "report";

export default function DepartmentReportsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [branding, setBranding] = useState<DocumentBranding>({ companyName: "" });
  const [newDoc, setNewDoc] = useState<{ open: boolean; period: ReportPeriod; title: string }>({
    open: false,
    period: "weekly",
    title: "",
  });
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [rejecting, setRejecting] = useState<DepartmentReport | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // ---------- URL as state: the tab, the range and the page survive a refresh,
  // a back button and a pasted link. ----------
  const tab: TabKey = searchParams.get("tab") === "plan" ? "plan" : "report";
  const statusParam = searchParams.get("status") ?? "";
  const statusFilter = STATUS_FILTERS[statusParam] ? statusParam : "filed";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const sizeParam = Number(searchParams.get("size"));
  const pageSize = PAGE_SIZE_OPTIONS.includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

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

  const loadReports = useCallback(async () => {
    const constraints =
      user?.role === "department-head"
        ? [where("departmentId", "==", user.departmentId), orderBy("createdAt", "desc")]
        : [orderBy("createdAt", "desc")];
    const data = await getDocuments<DepartmentReport>("department_reports", constraints);
    setReports(data);
  }, [user]);

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

  useEffect(() => {
    async function load() {
      try {
        await loadReports();
      } catch (error) {
        console.error("Failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [loadReports]);

  // ---------- Filing actions ----------
  /**
   * Starts a new document for the period — an empty page on the department's
   * letterhead. Nothing is pre-filled from attendance or tasks: the filing is
   * the head's own write-up, and the admin reprints it as it arrives.
   */
  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const range = getPeriodRange(newDoc.period);
      // The name is what the admin's master document prints; storing the id
      // here once put a raw ObjectId in the department column.
      const department = await getDocument<Department>("departments", user.departmentId!).catch(() => null);
      await createDocument("department_reports", {
        kind: tab,
        documentTitle: newDoc.title.trim(),
        description: "",
        body: "",
        departmentId: user.departmentId,
        departmentName: department?.name || user.departmentId,
        companyId: user.companyId || "",
        period: newDoc.period,
        startDate: range.start,
        endDate: range.end,
        customKPIs: [],
        generatedBy: user.staffId,
        generatedByName: `${user.firstName} ${user.lastName}`,
        generatedAt: Timestamp.now(),
        status: "draft",
        createdAt: Timestamp.now(),
      });
      await loadReports();
      setNewDoc((prev) => ({ ...prev, open: false, title: "" }));
      // A fresh document is a draft, and the default filter hides those.
      setParams({ status: "all", page: null });
      toast("success", `${tab === "plan" ? "Plan" : "Report"} started as a draft — write it, then submit.`);
    } catch {
      toast("error", "Failed to start the document");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveDraft = async (report: DepartmentReport, edits: ReportEdits) => {
    try {
      await updateDocument("department_reports", report.id!, { ...edits, updatedAt: Timestamp.now() });
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, ...edits } : r)));
      toast("success", "Draft saved");
    } catch {
      toast("error", "Failed to save draft");
    }
  };

  const handleSubmitToAdmin = async (report: DepartmentReport, edits: ReportEdits) => {
    if (!user) return;
    setSubmitting((prev) => ({ ...prev, [report.id!]: true }));
    try {
      await updateDocument("department_reports", report.id!, {
        ...edits,
        status: "submitted" as const,
        // A resubmission answers the note it was sent back with.
        reviewNote: "",
        submittedAt: Timestamp.now(),
        submittedBy: user.staffId,
        updatedAt: Timestamp.now(),
      });
      await createBulkNotifications(await approverRecipientIds(), {
        type: "system",
        title: `${kindOf(report) === "plan" ? "Plan" : "Report"} submitted`,
        message: `${report.departmentName} ${kindOf(report)} for ${report.startDate} to ${report.endDate} submitted for approval.`,
        link: "/dashboard/reports/department?status=submitted",
      });
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id
            ? {
                ...r,
                ...edits,
                status: "submitted" as const,
                reviewNote: "",
                submittedAt: Timestamp.now(),
                submittedBy: user.staffId,
              }
            : r
        )
      );
      toast("success", "Submitted to admins");
    } catch {
      toast("error", "Failed to submit");
    } finally {
      setSubmitting((prev) => ({ ...prev, [report.id!]: false }));
    }
  };

  /** Sends a submission back to the head with the reason attached. */
  const handleReject = async () => {
    const report = rejecting;
    if (!user || !report) return;
    const note = rejectNote.trim();
    if (!note) {
      toast("error", "Say what needs fixing — a document sent back without a reason cannot be acted on");
      return;
    }
    try {
      await updateDocument("department_reports", report.id!, {
        status: "rejected" as const,
        reviewNote: note,
        reviewedAt: Timestamp.now(),
        reviewedBy: user.staffId,
        updatedAt: Timestamp.now(),
      });
      if (report.generatedBy) {
        await createBulkNotifications([report.generatedBy], {
          type: "system",
          title: "Document sent back",
          message: `${report.departmentName} ${kindOf(report)} for ${report.startDate} to ${report.endDate}: ${note}`,
          link: "/dashboard/reports/department?status=rejected",
        });
      }
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: "rejected" as const, reviewNote: note } : r))
      );
      setRejecting(null);
      setRejectNote("");
      toast("success", "Sent back to the department head");
    } catch {
      toast("error", "Failed to send it back");
    }
  };

  // ---------- Filtering and paging ----------
  const range: PeriodRange = useMemo(() => ({ from, to }), [from, to]);
  const isHead = user?.role === "department-head";
  const allowedStatuses = useMemo(() => {
    const statuses = STATUS_FILTERS[statusFilter] ?? STATUS_FILTERS.filed;
    return isHead ? statuses : statuses.filter((status) => !REVIEWER_HIDDEN.includes(status));
  }, [statusFilter, isHead]);

  const visible = useMemo(
    () => reports.filter((r) => allowedStatuses.includes(r.status) && reportInRange(r, range)),
    [reports, allowedStatuses, range]
  );

  const counts = useMemo(
    () => ({
      report: visible.filter((r) => kindOf(r) === "report").length,
      plan: visible.filter((r) => kindOf(r) === "plan").length,
    }),
    [visible]
  );

  const rows = useMemo(() => visible.filter((r) => kindOf(r) === tab), [visible, tab]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const canBuild = user?.role === "admin" || user?.role === "accounts";

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Department Filings"
        description="Reports and plans written by department heads, reviewed here, then assembled into the organization report."
        action={
          isHead ? (
            <Button onClick={() => setNewDoc((prev) => ({ ...prev, open: true }))}>
              <Plus className="h-4 w-4" /> New {tab === "plan" ? "plan" : "report"}
            </Button>
          ) : undefined
        }
      />

      {/* Report / Plan — two kinds of document, one review flow. */}
      <div className="flex gap-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setParams({ tab: item.key === "report" ? null : item.key, page: null })}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20" : "bg-gray-100"}`}>
                {counts[item.key]}
              </span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <DatePicker
                value={from}
                onChange={(e) => setParams({ from: e.target.value, page: null })}
                className="w-[150px]"
                placeholder="Start"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <DatePicker
                value={to}
                onChange={(e) => setParams({ to: e.target.value, page: null })}
                className="w-[150px]"
                placeholder="End"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={statusFilter}
                onChange={(e) => setParams({ status: e.target.value === "filed" ? null : e.target.value, page: null })}
                className="w-[230px]"
                options={isHead ? STATUS_FILTER_OPTIONS : REVIEWER_FILTER_OPTIONS}
              />
            </div>
            {from || to || statusFilter !== "filed" ? (
              <Button variant="ghost" onClick={() => setParams({ from: null, to: null, status: null, page: null })}>
                Clear
              </Button>
            ) : null}
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <p className="hidden text-xs text-slate-500 sm:block">{rangeLabel(range)}</p>
              {canBuild ? (
                <Link href={`/dashboard/reports/organization?from=${from}&to=${to}${from || to ? "&period=custom" : ""}`}>
                  <Button>
                    <Layers className="h-4 w-4" /> Build organization report
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={tab === "plan" ? <Target className="h-12 w-12" /> : <FileText className="h-12 w-12" />}
              title={tab === "plan" ? "No plans here" : "No reports here"}
              description={
                reports.length === 0
                  ? "A department head writes the document and submits it; the admin builds the organization report from what arrives."
                  : "Widen the dates or change the status filter."
              }
              action={
                from || to || statusFilter !== "filed" ? (
                  <Button variant="outline" onClick={() => setParams({ from: null, to: null, status: null, page: null })}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pagedRows.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              role={user?.role}
              branding={branding}
              expanded={expandedReportId === report.id}
              submitting={submitting[report.id!]}
              onToggle={() => setExpandedReportId(expandedReportId === report.id ? null : report.id || null)}
              onSaveDraft={handleSaveDraft}
              onSubmit={handleSubmitToAdmin}
              onReject={
                user?.role === "admin"
                  ? (r) => {
                      setRejecting(r);
                      setRejectNote("");
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Pagination
              page={safePage - 1}
              totalPages={totalPages}
              totalCount={rows.length}
              hasNext={safePage < totalPages}
              hasPrev={safePage > 1}
              onNext={() => setParams({ page: String(safePage + 1) })}
              onPrev={() => setParams({ page: String(safePage - 1) })}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => setParams({ size: String(size), page: null })}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Start a new document */}
      <Dialog open={newDoc.open} onClose={() => setNewDoc((prev) => ({ ...prev, open: false }))}>
        <h3 className="text-lg font-semibold text-slate-900">New {tab === "plan" ? "plan" : "report"}</h3>
        <p className="mt-1 text-sm text-slate-500">
          The period sets the dates this document covers. You write the content next.
        </p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="new-period">
              Period
            </Label>
            <Select
              id="new-period"
              value={newDoc.period}
              onChange={(e) => setNewDoc((prev) => ({ ...prev, period: e.target.value as ReportPeriod }))}
              options={PERIOD_OPTIONS}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="new-title">
              Title
            </Label>
            <Input
              id="new-title"
              value={newDoc.title}
              onChange={(e) => setNewDoc((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={tab === "plan" ? "e.g. D4MEDIA 2025-26 Annual Plan" : "e.g. D4MEDIA Oct–Dec Quarterly Report"}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setNewDoc((prev) => ({ ...prev, open: false }))}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creating…" : "Start writing"}
          </Button>
        </div>
      </Dialog>

      {/* Send a submission back */}
      <Dialog open={Boolean(rejecting)} onClose={() => setRejecting(null)}>
        <h3 className="text-lg font-semibold text-slate-900">Send this back</h3>
        <p className="mt-1 text-sm text-slate-500">
          {rejecting?.departmentName} · {rejecting?.startDate} to {rejecting?.endDate}
        </p>
        <textarea
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          rows={4}
          placeholder="What needs fixing before this can go into the organization report"
          className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejecting(null)}>
            Cancel
          </Button>
          <Button onClick={handleReject}>Send back</Button>
        </div>
      </Dialog>
    </div>
  );
}
