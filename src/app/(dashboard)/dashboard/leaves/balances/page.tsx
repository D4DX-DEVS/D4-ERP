"use client";

// The printed attendance sheet, on screen and live. Staff are paged, searched
// and filtered on the server; only the current page's ledgers are computed, so
// the view costs the same whether the roster is 20 people or 2000. Clicking a
// row opens that person's ledger, where an admin edits the numbers.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDocuments, search, where } from "@/lib/firestore";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuthStore } from "@/store/auth-store";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { exportToCSV } from "@/lib/asset-export-utils";
import { MONTH_LABELS, days } from "@/lib/leave-ledger";
import { clampMonth, monthViewRow } from "@/lib/leave-month-view";
import { leaveBalanceExportRows } from "@/lib/leave-balance-export";
import {
  detectSundayDuties,
  loadOrgLedgers,
  reconcileAttendanceLeave,
  type OrgLedgerRow,
} from "@/lib/leave-adjustments";
import { LeaveBalancePanel } from "@/components/leaves/leave-balance-panel";
import {
  LeaveBalanceCardList,
  LeaveBalanceCardListSkeleton,
} from "@/components/leaves/leave-balance-cardlist";
import {
  LeaveBalanceTable,
  LeaveBalanceTableSkeleton,
  LeaveCodeLegend,
  groupLedgerRows,
} from "@/components/leaves/leave-balance-table";
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  CalendarSearch,
  Download,
  FilterX,
  Loader2,
  RefreshCw,
  Search,
  Sun,
  Timer,
  Users,
} from "lucide-react";
import type { Department, Staff } from "@/types";

const SEARCH_FIELDS = ["firstName", "lastName", "employeeCode", "designation"];

/**
 * Employment-type filter. Staff saved before the field existed have no value,
 * and the app reads a missing value as permanent — `null` in the `in` list
 * makes the query agree, because Mongo's $in matches absent fields on null.
 */
const TYPE_FILTERS: Record<string, unknown[]> = {
  permanent: ["permanent", null],
  staff: ["staff"],
  intern: ["intern"],
};

const TYPE_OPTIONS = [
  { value: "", label: "All employment types" },
  { value: "permanent", label: "Permanent" },
  { value: "staff", label: "Contract staff" },
  { value: "intern", label: "Intern" },
];

export default function LeaveBalancesPage() {
  const { user } = useAuthStore();
  const { authorized, isLoading: authLoading } = useRoleGuard(["admin", "department-head"]);
  const { toast } = useToast();

  const [year, setYear] = useState(new Date().getFullYear());
  // null is the whole year, which is how this page has always read. A month
  // index re-scopes every number on it — table, cards, stats and export — to
  // that one month.
  const [month, setMonth] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [ledgers, setLedgers] = useState<Record<string, OrgLedgerRow>>({});
  const [ledgersLoading, setLedgersLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const toggleExpand = useCallback((staffId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(staffId)) next.add(staffId);
      return next;
    });
  }, []);

  const canEdit = user?.role === "admin";

  // Server-side filters. Search and paging happen in the query, never in the
  // browser, so page 3 of a filtered list is a real database page.
  const constraints = useMemo(() => {
    const c = [where("isActive", "==", true)];
    if (department) c.push(where("departmentId", "==", department));
    const values = TYPE_FILTERS[employmentType];
    if (values) c.push(where("employmentType", "in", values));
    if (debouncedQuery.trim()) c.push(search(SEARCH_FIELDS, debouncedQuery.trim()));
    return c;
  }, [department, employmentType, debouncedQuery]);

  const {
    data: staffPage,
    loading,
    refreshing,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<Staff>("staff", {
    pageSize,
    orderByField: "employeeCode",
    orderDirection: "asc",
    constraints,
  });

  useEffect(() => {
    getDocuments<Department>("departments").then(setDepartments).catch(() => {});
  }, []);

  // Ledgers follow the current page: five scoped reads per page, not per person.
  const pageKey = staffPage.map((s) => s.id).join(",");
  const loadLedgers = useCallback(async () => {
    if (staffPage.length === 0) {
      setLedgers({});
      return;
    }
    setLedgersLoading(true);
    try {
      setLedgers(await loadOrgLedgers(staffPage, year));
    } catch {
      toast("error", "Failed to load leave balances");
    } finally {
      setLedgersLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLedgers();
  }, [loadLedgers]);

  const rows = useMemo(
    () =>
      staffPage
        .map((s) => ledgers[s.id])
        .filter((row): row is OrgLedgerRow => Boolean(row)),
    [staffPage, ledgers]
  );
  const sections = useMemo(() => groupLedgerRows(rows), [rows]);

  const totals = useMemo(() => {
    // Days awaiting conversion is a standing count, not something that happened
    // in a month, so it stays year-wide in both modes and the card says so.
    const sundaysPending = rows.reduce((sum, r) => sum + r.ledger.sundays.pending, 0);
    // Overtime is summarised per year, not per month — the ledger keeps no
    // month-wise split of it — so this figure stays year-wide and the card says so.
    const overtimeHours = rows.reduce((sum, r) => sum + r.ledger.overtime.hours, 0);
    if (month === null) {
      return {
        daysTaken: rows.reduce((sum, r) => sum + r.ledger.totalDays, 0),
        onDuty: rows.reduce((sum, r) => sum + r.ledger.onDuty.total, 0),
        sundaysWorked: rows.reduce((sum, r) => sum + r.ledger.sundays.worked, 0),
        sundaysPending,
        overtimeHours,
      };
    }
    const views = rows.map((r) => monthViewRow(r.ledger, month));
    return {
      daysTaken: views.reduce((sum, v) => sum + v.total, 0),
      onDuty: views.reduce((sum, v) => sum + v.onDuty, 0),
      sundaysWorked: views.reduce((sum, v) => sum + v.weekOffWorked, 0),
      sundaysPending,
      overtimeHours,
    };
  }, [rows, month]);

  const monthLabel = month === null ? null : MONTH_LABELS[clampMonth(month)];
  /** What the stat cards are counting, so their titles never lie about scope. */
  const scopeLabel = monthLabel ?? "this page";

  const hasFilters = Boolean(query || department || employmentType);
  const clearFilters = () => {
    setQuery("");
    setDepartment("");
    setEmploymentType("");
  };

  const handleScanAll = async () => {
    setScanning(true);
    try {
      const all = await getDocuments<Staff>("staff", [where("isActive", "==", true)]);
      const result = await detectSundayDuties({ staffList: all, year }, user);
      toast(
        "success",
        result.created > 0
          ? `Found ${result.created} new week-off duty day(s) across the team`
          : "No new week-off duty days found"
      );
      await loadLedgers();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  /**
   * Posts a ledger debit for every leave day marked straight onto the attendance
   * register that no approved request accounts for. Days a request already
   * claimed are skipped, so running this twice changes nothing the second time.
   */
  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const all = await getDocuments<Staff>("staff", [where("isActive", "==", true)]);
      const result = await reconcileAttendanceLeave({ staffList: all, year }, user);
      const moved = result.created + result.updated + result.removed;
      toast(
        "success",
        moved === 0
          ? "Balances already match the attendance register"
          : `${result.created} posted, ${result.updated} corrected, ${result.removed} withdrawn` +
            (result.mismatched > 0
              ? ` · ${result.mismatched} day(s) marked differently to an approved request`
              : "")
      );
      await loadLedgers();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Reconcile failed");
    } finally {
      setReconciling(false);
    }
  };

  /** Exports every row matching the current filters, not just the page on screen. */
  const handleExport = async () => {
    setExporting(true);
    try {
      const matching = await getDocuments<Staff>("staff", constraints);
      const allLedgers = await loadOrgLedgers(matching, year);
      // The columns follow whichever view is on screen: the printed sheet's
      // full shape for a year, the two scoped blocks for a month.
      const exportRows = leaveBalanceExportRows({
        sections: groupLedgerRows(
          matching.map((s) => allLedgers[s.id]).filter((r): r is OrgLedgerRow => Boolean(r))
        ),
        departments,
        month,
      });
      if (exportRows.length === 0) {
        toast("error", "Nothing to export");
        return;
      }
      exportToCSV(
        exportRows,
        monthLabel ? `leave-balances-${year}-${monthLabel}` : `leave-balances-${year}`
      );
      toast("success", `Exported ${exportRows.length} row(s)`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const openStaff = openStaffId ? staffPage.find((s) => s.id === openStaffId) ?? null : null;
  const thisYear = new Date().getFullYear();
  const yearOptions = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2];

  const departmentOptions = useMemo(
    () => [
      { value: "", label: "All departments" },
      ...departments
        .filter((d) => d.isActive)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => ({ value: d.id, label: d.name })),
    ],
    [departments]
  );

  if (authLoading || !authorized) return <PageLoader />;

  const busy = loading || refreshing || ledgersLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/dashboard/leaves"
            className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Leave requests
          </Link>
          <p className="mt-1 text-sm text-gray-500">
            {monthLabel
              ? `Showing ${monthLabel} ${year} — days taken in the month, and the balance each staff member was left with when it closed.`
              : `Showing the full year ${year}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-slate-200 p-0.5">
            {yearOptions.map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`min-h-9 rounded-full px-3 text-xs font-semibold transition-colors ${
                  y === year ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => void handleScanAll()} disabled={scanning}>
              {scanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarSearch className="mr-2 h-4 w-4" />
              )}
              Scan week-off duty
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              title="Post a balance debit for leave marked on the attendance register that no request covers"
              onClick={() => void handleReconcile()}
              disabled={reconciling}
            >
              {reconciling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync attendance leave
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export
          </Button>
        </div>
      </div>

      {/* Month scope. Thirteen pills need a line of their own — folded into the
          header's button cluster they push Export off a laptop screen. */}
      <div
        role="group"
        aria-label="Scope the balances to a month"
        className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <div className="flex w-max rounded-full border border-slate-200 p-0.5">
          <button
            type="button"
            onClick={() => setMonth(null)}
            aria-pressed={month === null}
            className={`min-h-11 rounded-full px-3 text-xs font-semibold transition-colors sm:min-h-9 ${
              month === null ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Full year
          </button>
          {MONTH_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setMonth(i)}
              aria-pressed={month === i}
              className={`min-h-11 rounded-full px-3 text-xs font-semibold transition-colors sm:min-h-9 ${
                month === i ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <StatGrid autoFit>
        <StatCard title="Staff" value={totalCount} icon={Users} color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard
          title={`Leave days (${scopeLabel})`}
          value={days(totals.daysTaken)}
          icon={CalendarDays}
          color="text-cyan-600"
          bg="bg-cyan-50"
        />
        <StatCard
          title={`On duty (${scopeLabel})`}
          value={days(totals.onDuty)}
          icon={Briefcase}
          color="text-violet-600"
          bg="bg-violet-50"
        />
        <StatCard
          title={monthLabel ? `Week-offs worked (${monthLabel})` : "Week-offs worked"}
          value={totals.sundaysWorked}
          icon={Sun}
          color="text-orange-600"
          bg="bg-orange-50"
        />
        <StatCard
          title={monthLabel ? "Awaiting conversion (year)" : "Awaiting conversion"}
          value={totals.sundaysPending}
          icon={CalendarSearch}
          color="text-amber-600"
          bg="bg-amber-50"
        />
        <StatCard
          title={monthLabel ? "Overtime (year)" : "Overtime"}
          value={`${days(totals.overtimeHours)}h`}
          icon={Timer}
          color="text-rose-600"
          bg="bg-rose-50"
        />
      </StatGrid>

      {/* Filters — server-side, same inline toolbar as the Task board. Each
          select states what it filters, so a label line above it would only
          say the word twice. */}
      <div className="space-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0">
        <div className="relative min-w-0 sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="w-full min-w-0 pl-9"
            placeholder="Search by name, code or designation…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select
          options={departmentOptions}
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="w-full min-w-0 sm:w-auto sm:min-w-[190px]"
        />
        <Select
          options={TYPE_OPTIONS}
          value={employmentType}
          onChange={(e) => setEmploymentType(e.target.value)}
          className="w-full min-w-0 sm:w-auto sm:min-w-[190px]"
        />
        {hasFilters && (
          <Button variant="outline" className="min-h-11 w-full sm:min-h-0 sm:w-auto" onClick={clearFilters}>
            <FilterX className="mr-2 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {busy && rows.length === 0 ? (
            <>
              <LeaveBalanceTableSkeleton rows={Math.min(pageSize, 10)} month={month} />
              <div className="md:hidden">
                <LeaveBalanceCardListSkeleton rows={Math.min(pageSize, 6)} />
              </div>
            </>
          ) : rows.length === 0 ? (
            <EmptyState
              title={hasFilters ? "No staff match these filters" : "No active staff"}
              description={
                hasFilters
                  ? "Nothing matches the current search and filters."
                  : "Add staff to see their leave balances here."
              }
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className={busy ? "opacity-60 transition-opacity" : undefined}>
                <LeaveBalanceTable
                  sections={sections}
                  onOpenStaff={setOpenStaffId}
                  expanded={expanded}
                  onToggleExpand={toggleExpand}
                  month={month}
                />
                <div className="md:hidden">
                  <LeaveBalanceCardList
                    sections={sections}
                    onOpenStaff={setOpenStaffId}
                    expanded={expanded}
                    onToggleExpand={toggleExpand}
                    month={month}
                  />
                </div>
              </div>
              <LeaveCodeLegend month={month} />
              <Pagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                hasNext={hasNext}
                hasPrev={hasPrev}
                onNext={nextPage}
                onPrev={prevPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>

      {openStaff && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (open) return;
            setOpenStaffId(null);
            // An edit inside the drawer changes this person's row and can change
            // their quota, so refetch the page as well as its ledgers.
            refresh();
            void loadLedgers();
          }}
          className="max-w-4xl"
        >
          <DialogHeader>
            <DialogTitle>
              {openStaff.firstName} {openStaff.lastName}
            </DialogTitle>
          </DialogHeader>
          <LeaveBalancePanel
            staff={openStaff}
            year={year}
            canEdit={canEdit}
            user={user}
            onYearChange={setYear}
          />
        </Dialog>
      )}
    </div>
  );
}
