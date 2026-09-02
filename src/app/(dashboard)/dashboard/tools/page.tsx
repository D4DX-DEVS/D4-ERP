"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  ListingHeader,
  ListingStatCard,
  ListingStatGrid,
} from "@/components/ui/listing";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { usePagination } from "@/hooks/use-pagination";
import { useFeatureGuard } from "@/hooks/use-role-guard";
import {
  Timestamp,
  countDocuments,
  deleteDocument,
  getDocuments,
  search as searchConstraint,
  sumDocuments,
  where,
} from "@/lib/firestore";
import {
  EXPIRING_SOON_DAYS,
  renewalLabel,
  toolSecurityFlags,
  toolStatus,
  toolStatusBadge,
} from "@/lib/tool-status";
import { formatCurrency } from "@/lib/utils";
import type { CompanyTool, Staff } from "@/types";
import { ToolDetailDialog } from "./_components/tool-detail-dialog";
import { ToolFormDialog } from "./_components/tool-form-dialog";
import {
  CATEGORY_OPTIONS,
  STATUS_FILTER_OPTIONS,
  startOfTodayUtc,
} from "./_components/constants";

type ToolRecord = CompanyTool & { id: string };

interface ToolStats {
  total: number;
  expiring: number;
  expired: number;
  cancelled: number;
  annualSpend: number;
}

const EMPTY_STATS: ToolStats = { total: 0, expiring: 0, expired: 0, cancelled: 0, annualSpend: 0 };

/** Whole rupees — the paise in formatCurrency() overflow the stat card. */
function compactSpend(value: number): string {
  return `₹ ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
}

export default function ToolsPage() {
  const { authorized, isLoading: authLoading } = useFeatureGuard("tools-vault");
  const { toast } = useToast();

  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [stats, setStats] = useState<ToolStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsToken, setStatsToken] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [pageSize, setPageSize] = useState(10);

  const [formTool, setFormTool] = useState<ToolRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailTool, setDetailTool] = useState<ToolRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ToolRecord | null>(null);

  // Stable for the lifetime of the page so the query constraints don't churn.
  const [today] = useState(() => startOfTodayUtc());
  const soon = useMemo(
    () => new Date(today.getTime() + EXPIRING_SOON_DAYS * 86_400_000),
    [today]
  );

  const constraints = useMemo(() => {
    const list = [];
    if (searchTerm.trim()) {
      list.push(searchConstraint(["name", "vendor", "username", "plan", "category"], searchTerm.trim()));
    }
    if (category) list.push(where("category", "==", category));
    if (status === "cancelled") {
      list.push(where("cancelled", "==", true));
    } else if (status === "expired") {
      list.push(where("cancelled", "!=", true));
      list.push(where("renewalDate", "<", Timestamp.fromDate(today)));
    } else if (status === "expiring") {
      list.push(where("cancelled", "!=", true));
      list.push(where("renewalDate", ">=", Timestamp.fromDate(today)));
      list.push(where("renewalDate", "<=", Timestamp.fromDate(soon)));
    }
    return list;
  }, [searchTerm, category, status, today, soon]);

  const {
    data: tools,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<CompanyTool>("company_tools", {
    pageSize,
    orderByField: "renewalDate",
    orderDirection: "asc",
    constraints,
  });

  useEffect(() => {
    let alive = true;
    async function loadStaff() {
      try {
        const staff = await getDocuments<Staff>("staff", [where("isActive", "==", true)]);
        if (alive) setStaffList(staff);
      } catch (error) {
        console.error("Failed to load staff:", error);
      }
    }
    void loadStaff();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadStats() {
      try {
        const notCancelled = where("cancelled", "!=", true);
        const [total, expiring, expired, cancelled, annualSpend] = await Promise.all([
          countDocuments("company_tools"),
          countDocuments("company_tools", [
            notCancelled,
            where("renewalDate", ">=", Timestamp.fromDate(today)),
            where("renewalDate", "<=", Timestamp.fromDate(soon)),
          ]),
          countDocuments("company_tools", [
            notCancelled,
            where("renewalDate", "<", Timestamp.fromDate(today)),
          ]),
          countDocuments("company_tools", [where("cancelled", "==", true)]),
          sumDocuments("company_tools", [notCancelled], "annualCost"),
        ]);
        if (alive) setStats({ total, expiring, expired, cancelled, annualSpend });
      } catch (error) {
        console.error("Failed to load tool stats:", error);
      } finally {
        if (alive) setStatsLoading(false);
      }
    }
    void loadStats();
    return () => {
      alive = false;
    };
  }, [today, soon, statsToken]);

  const reload = useCallback(() => {
    refresh();
    setStatsToken((t) => t + 1);
  }, [refresh]);

  const staffName = useCallback(
    (id?: string) => {
      if (!id) return "Unassigned";
      const match = staffList.find((s) => s.id === id);
      return match ? `${match.firstName} ${match.lastName}` : "Unassigned";
    },
    [staffList]
  );

  const staffOptions = useMemo(
    () => staffList.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
    [staffList]
  );

  const openCreate = () => {
    setFormTool(null);
    setFormOpen(true);
  };

  const openEdit = (tool: ToolRecord) => {
    setDetailTool(null);
    setFormTool(tool);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteDocument("company_tools", target.id);
      toast("success", `${target.name} removed`);
      setDetailTool(null);
      reload();
    } catch (error) {
      console.error("Tool delete failed:", error);
      toast("error", error instanceof Error ? error.message : "Failed to delete tool");
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setCategory("");
    setStatus("");
  };

  const hasFilters = !!(searchTerm || category || status);
  const activeCount = Math.max(stats.total - stats.expired - stats.cancelled, 0);

  if (authLoading || !authorized) return <PageLoader />;

  return (
    <div className="space-y-6 lg:space-y-8">
      <ListingHeader
        title="Tools & Accounts"
        description="Every subscription the company pays for, with its logins, licences, seats and renewal dates in one place."
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add tool
          </Button>
        }
      />

      <ListingStatGrid>
        <ListingStatCard
          icon={<KeyRound className="h-4 w-4 sm:h-5 sm:w-5" />}
          label="Tools tracked"
          value={statsLoading ? "—" : stats.total}
          meta={stats.cancelled ? `${stats.cancelled} cancelled` : undefined}
        />
        <ListingStatCard
          icon={<CalendarClock className="h-4 w-4 sm:h-5 sm:w-5" />}
          label="Active"
          value={statsLoading ? "—" : activeCount}
          toneClassName="bg-green-100 text-green-700"
        />
        <ListingStatCard
          icon={<AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />}
          label={`Expiring in ${EXPIRING_SOON_DAYS}d`}
          value={statsLoading ? "—" : stats.expiring}
          toneClassName="bg-amber-100 text-amber-700"
          meta={stats.expired ? `${stats.expired} already expired` : undefined}
        />
        <ListingStatCard
          icon={<Wallet className="h-4 w-4 sm:h-5 sm:w-5" />}
          label="Yearly spend"
          value={statsLoading ? "—" : compactSpend(stats.annualSpend)}
          meta="Recurring plans only"
        />
      </ListingStatGrid>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by name, vendor or login…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="min-h-11 pl-10 sm:min-h-0"
            aria-label="Search tools"
          />
        </div>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[{ value: "", label: "All categories" }, ...CATEGORY_OPTIONS]}
          className="sm:w-[190px]"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_FILTER_OPTIONS}
          className="sm:w-[190px]"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : totalCount === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<KeyRound className="h-12 w-12" />}
              title={hasFilters ? "No tools match these filters" : "No tools yet"}
              description={
                hasFilters
                  ? "Try a different search or clear the filters."
                  : "Add the first subscription to start tracking logins, renewals and spend."
              }
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add tool
                  </Button>
                )
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead className="hidden lg:table-cell">Seats</TableHead>
                  <TableHead>Renewal</TableHead>
                  <TableHead className="hidden sm:table-cell">Cost / year</TableHead>
                  <TableHead>Status</TableHead>
                  {/* Phones open the detail dialog by tapping the name; edit and delete live there. */}
                  <TableHead className="hidden text-right sm:table-cell">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tools as ToolRecord[]).map((tool) => {
                  const badge = toolStatusBadge(toolStatus(tool));
                  const flags = toolSecurityFlags(tool);
                  return (
                    <TableRow key={tool.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setDetailTool(tool)}
                          className="text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 hover:underline">{tool.name}</span>
                            {flags.length > 0 && (
                              <ShieldAlert
                                className="h-4 w-4 shrink-0 text-amber-500"
                                aria-label={`${flags.length} issue${flags.length === 1 ? "" : "s"} need attention`}
                              />
                            )}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {tool.category}
                            {tool.plan ? ` · ${tool.plan}` : ""}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{staffName(tool.ownerStaffId)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {tool.seatsTotal ? `${tool.seatsUsed || 0} / ${tool.seatsTotal}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{renewalLabel(tool)}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {tool.annualCost ? formatCurrency(tool.annualCost) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.className}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-right sm:table-cell">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label={`Edit ${tool.name}`} onClick={() => openEdit(tool)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label={`Delete ${tool.name}`} onClick={() => setPendingDelete(tool)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
          </CardContent>
        </Card>
      )}

      {formOpen && (
        <ToolFormDialog
          key={formTool?.id ?? "new"}
          tool={formTool}
          staffOptions={staffOptions}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            reload();
          }}
        />
      )}

      {detailTool && (
        <ToolDetailDialog
          tool={detailTool}
          ownerName={staffName(detailTool.ownerStaffId)}
          onEdit={() => openEdit(detailTool)}
          onDelete={() => setPendingDelete(detailTool)}
          onClose={() => setDetailTool(null)}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete tool"
        message={`Delete ${pendingDelete?.name ?? "this tool"} and its stored credentials? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
