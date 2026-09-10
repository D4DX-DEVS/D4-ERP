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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { exportToCSV } from "@/lib/asset-export-utils";
import { LEAVE_BUCKETS, MONTH_LABELS, ledgerBucket } from "@/lib/leave-ledger";
import { detectSundayDuties, loadOrgLedgers, type OrgLedgerRow } from "@/lib/leave-adjustments";
import { LeaveBalancePanel } from "@/components/leaves/leave-balance-panel";
import { days } from "@/components/leaves/leave-balance-cards";
import {
  LeaveBalanceTable,
  LeaveBalanceTableSkeleton,
  groupLedgerRows,
} from "@/components/leaves/leave-balance-table";
import {
  ArrowLeft,
  CalendarDays,
  CalendarSearch,
  Download,
  FilterX,
  Loader2,
  Search,
  Sun,
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
  const [pageSize, setPageSize] = useState(20);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [ledgers, setLedgers] = useState<Record<string, OrgLedgerRow>>({});
  const [ledgersLoading, setLedgersLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);

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

  // Ledgers follow the current page: four scoped reads per page, not per person.
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

  const totals = useMemo(
    () => ({
      daysTaken: rows.reduce((sum, r) => sum + r.ledger.totalDays, 0),
      sundaysWorked: rows.reduce((sum, r) => sum + r.ledger.sundays.worked, 0),
      sundaysPending: rows.reduce((sum, r) => sum + r.ledger.sundays.pending, 0),
    }),
    [rows]
  );

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

  /** Exports every row matching the current filters, not just the page on screen. */
  const handleExport = async () => {
    setExporting(true);
    try {
      const matching = await getDocuments<Staff>("staff", constraints);
      const allLedgers = await loadOrgLedgers(matching, year);
      const exportRows = groupLedgerRows(
        matching.map((s) => allLedgers[s.id]).filter((r): r is OrgLedgerRow => Boolean(r))
      ).flatMap((section) =>
        section.rows.map((row) => {
          const base: Record<string, string | number> = {
            Group: section.title,
            Code: row.staff.employeeCode ?? "",
            Name: `${row.staff.firstName} ${row.staff.lastName}`,
            Designation: row.staff.designation ?? "",
            Department: departments.find((d) => d.id === row.staff.departmentId)?.name ?? "",
          };
          for (const code of LEAVE_BUCKETS) {
            const b = ledgerBucket(row.ledger, code);
            base[`${code} Total`] = b.entitled;
            base[`${code} Used`] = b.used;
            base[`${code} Balance`] = b.balance;
          }
          base["Overtime Hours"] = row.ledger.overtime.hours;
          base["Sundays Worked"] = row.ledger.sundays.worked;
          base["Sundays Converted"] = row.ledger.sundays.converted;
          MONTH_LABELS.forEach((m, i) => {
            base[m] = row.ledger.monthly[i];
          });
          base.Total = row.ledger.totalDays;
          return base;
        })
      );
      if (exportRows.length === 0) {
        toast("error", "Nothing to export");
        return;
      }
      exportToCSV(exportRows, `leave-balances-${year}`);
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
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Leave Balances</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quota, days used and remaining balance for every staff member in {year}.
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

      <StatGrid cols={4}>
        <StatCard title="Staff" value={totalCount} icon={Users} color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard
          title="Leave days (this page)"
          value={days(totals.daysTaken)}
          icon={CalendarDays}
          color="text-cyan-600"
          bg="bg-cyan-50"
        />
        <StatCard
          title="Week-offs worked"
          value={totals.sundaysWorked}
          icon={Sun}
          color="text-orange-600"
          bg="bg-orange-50"
        />
        <StatCard
          title="Awaiting conversion"
          value={totals.sundaysPending}
          icon={CalendarSearch}
          color="text-amber-600"
          bg="bg-amber-50"
        />
      </StatGrid>

      {/* Search + filters */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search by name, code or designation…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="filter-department">Department</Label>
              <Select
                id="filter-department"
                options={departmentOptions}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-type">Employment type</Label>
              <Select
                id="filter-type"
                options={TYPE_OPTIONS}
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
              />
            </div>
            {hasFilters && (
              <div className="flex items-end">
                <Button variant="outline" className="min-h-11 w-full" onClick={clearFilters}>
                  <FilterX className="mr-2 h-4 w-4" />
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {busy && rows.length === 0 ? (
            <LeaveBalanceTableSkeleton rows={Math.min(pageSize, 10)} />
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
                <LeaveBalanceTable sections={sections} onOpenStaff={setOpenStaffId} />
              </div>
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
