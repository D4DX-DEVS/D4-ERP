"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { Pagination } from "@/components/ui/pagination";
import { BarChart3, Download, ArrowLeftRight, AlertTriangle, History, Search, X, Pencil, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/asset-export-utils";

type ReportType = "movement" | "damage" | "activity";

interface MovementRow {
  id: string;
  assetName: string;
  assetCategory: string;
  eventName: string;
  eventLocation: string;
  allocatedPersonName: string;
  outByName: string;
  status: string;
  outDate: string;
  inDate?: string;
  condition: string;
  returnBy?: string;
  verifiedBy?: string;
}

interface DamageRow {
  id: string;
  assetName: string;
  eventName: string;
  type: string;
  reason: string;
  reportedByName: string;
  isResolved: boolean;
  resolvedByName?: string;
  notes?: string;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  userName: string;
  action: string;
  module: string;
  details?: string;
  createdAt: string;
}

const tabs: { key: ReportType; label: string; icon: typeof ArrowLeftRight }[] = [
  { key: "movement", label: "Movements", icon: ArrowLeftRight },
  { key: "damage", label: "Damage Reports", icon: AlertTriangle },
  { key: "activity", label: "Activity Log", icon: History },
];

export default function AssetReportsPage() {
  const { toast } = useToast();
  const [reportType, setReportType] = useState<ReportType>("movement");
  const [data, setData] = useState<MovementRow[] | DamageRow[] | ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [assetName, setAssetName] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 10 });
  const [exporting, setExporting] = useState(false);

  // Damage report edit state
  const [editingReport, setEditingReport] = useState<DamageRow | null>(null);
  const [editForm, setEditForm] = useState({ type: "damage", reason: "", notes: "", isResolved: false });
  const [editSaving, setEditSaving] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get-reports",
          reportType,
          from: fromDate || undefined,
          to: toDate || undefined,
          assetName: assetName.trim() || undefined,
          status: statusFilter || undefined,
          searchTerm: searchTerm.trim() || undefined,
          page,
          limit: 10,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        setPagination(result.pagination);
      }
    } catch (error) {
      console.error("Error fetching report:", error);
    }
    setLoading(false);
  }, [reportType, fromDate, toDate, assetName, statusFilter, searchTerm, page]);

  useEffect(() => { fetchReport(); }, [fetchReport]);
  useEffect(() => { setPage(1); }, [reportType, fromDate, toDate, assetName, statusFilter, searchTerm]);

  function clearFilters() {
    setFromDate(""); setToDate(""); setAssetName(""); setStatusFilter(""); setSearchTerm(""); setPage(1);
  }

  const hasFilters = fromDate || toDate || assetName || statusFilter || searchTerm;

  // ── Export helpers ─────────────────────────────────────────────────────
  function getExportRows() {
    if (reportType === "movement") {
      return (data as MovementRow[]).map(m => ({
        Asset: m.assetName, Category: m.assetCategory, Event: m.eventName, Location: m.eventLocation,
        Person: m.allocatedPersonName, "Out By": m.outByName, "Out Date": m.outDate ? formatDate(new Date(m.outDate)) : "",
        "In Date": m.inDate ? formatDate(new Date(m.inDate)) : "", Status: m.status, Condition: m.condition,
      }));
    }
    if (reportType === "damage") {
      return (data as DamageRow[]).map(d => ({
        Asset: d.assetName, Event: d.eventName, Type: d.type, Reason: d.reason,
        "Reported By": d.reportedByName, Status: d.isResolved ? "Resolved" : "Open",
        Date: d.createdAt ? formatDate(new Date(d.createdAt)) : "",
      }));
    }
    return (data as ActivityRow[]).map(a => ({
      User: a.userName, Action: a.action, Module: a.module, Details: a.details ?? "",
      Date: a.createdAt ? formatDate(new Date(a.createdAt)) : "",
    }));
  }

  async function handleExport(format: "csv" | "excel" | "pdf") {
    setExporting(true);
    const rows = getExportRows();
    const name = `asset-${reportType}-report`;
    const title = `Asset ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`;
    try {
      if (format === "csv") exportToCSV(rows, name);
      else if (format === "excel") await exportToExcel(rows, name);
      else await exportToPDF(rows, title, name);
      toast("success", `Exported as ${format.toUpperCase()}`);
    } catch {
      toast("error", "Export failed");
    }
    setExporting(false);
  }

  // ── Damage report edit/resolve ────────────────────────────────────────
  function openEditDamage(report: DamageRow) {
    setEditForm({ type: report.type, reason: report.reason, notes: report.notes || "", isResolved: report.isResolved });
    setEditingReport(report);
  }

  async function saveDamageEdit() {
    if (!editingReport) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-damage-report",
          reportId: editingReport.id,
          ...editForm,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast("success", "Report updated");
        setEditingReport(null);
        fetchReport();
      } else {
        toast("error", result.error || "Failed");
      }
    } catch {
      toast("error", "Failed to update");
    }
    setEditSaving(false);
  }

  async function quickResolve(report: DamageRow) {
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-damage-report",
          reportId: report.id,
          isResolved: !report.isResolved,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast("success", report.isResolved ? "Marked as open" : "Marked as resolved");
        fetchReport();
      }
    } catch {
      toast("error", "Failed");
    }
  }

  const totalPages = pagination.totalPages;
  const totalCount = pagination.total;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Asset Reports</h1>
          <p className="text-sm text-gray-500 mt-1">View and export movement, damage, and activity reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={exporting || data.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("excel")} disabled={exporting || data.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} disabled={exporting || data.length === 0}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Report type tabs */}
      <div className="flex gap-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = reportType === tab.key;
          return (
            <button key={tab.key} onClick={() => setReportType(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${active ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"}`}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card><CardContent className="py-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[150px]" />
          </div>
          {reportType !== "activity" && (
            <div className="space-y-1">
              <Label className="text-xs">Asset Name</Label>
              <Input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="Filter by asset..." className="w-[180px]" />
            </div>
          )}
          {reportType === "movement" && (
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                options={[{ value: "", label: "All" }, { value: "OUT", label: "OUT" }, { value: "IN", label: "IN" }]} className="w-[120px]" />
            </div>
          )}
          {reportType === "damage" && (
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                options={[{ value: "", label: "All" }, { value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }]} className="w-[120px]" />
            </div>
          )}
          {reportType === "activity" && (
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search logs..." className="pl-9 w-[180px]" />
              </div>
            </div>
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      </CardContent></Card>

      {/* Data */}
      {loading ? <PageLoader /> : data.length === 0 ? (
        <Card><CardContent><EmptyState icon={<BarChart3 className="h-12 w-12" />} title="No data found" /></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          {/* Movement table */}
          {reportType === "movement" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Out Date</TableHead>
                  <TableHead>In Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data as MovementRow[]).map(m => (
                  <TableRow key={m.id}>
                    <TableCell><p className="font-medium">{m.assetName}</p><p className="text-xs text-gray-400">{m.assetCategory}</p></TableCell>
                    <TableCell><p>{m.eventName}</p><p className="text-xs text-gray-400">{m.eventLocation}</p></TableCell>
                    <TableCell>{m.allocatedPersonName}</TableCell>
                    <TableCell>{m.outDate ? formatDate(new Date(m.outDate)) : "—"}</TableCell>
                    <TableCell>{m.inDate ? formatDate(new Date(m.inDate)) : "—"}</TableCell>
                    <TableCell><Badge variant={m.status === "OUT" ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"}>{m.status}</Badge></TableCell>
                    <TableCell><Badge>{m.condition}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Damage table */}
          {reportType === "damage" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Reported By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data as DamageRow[]).map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.assetName}</TableCell>
                    <TableCell>{d.eventName}</TableCell>
                    <TableCell><Badge>{d.type}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate">{d.reason}</TableCell>
                    <TableCell>{d.reportedByName}</TableCell>
                    <TableCell>
                      <Badge variant={d.isResolved ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                        {d.isResolved ? "Resolved" : "Open"}
                      </Badge>
                    </TableCell>
                    <TableCell>{d.createdAt ? formatDate(new Date(d.createdAt)) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDamage(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => quickResolve(d)}>
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Activity table */}
          {reportType === "activity" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data as ActivityRow[]).map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.userName}</TableCell>
                    <TableCell><Badge>{a.action}</Badge></TableCell>
                    <TableCell>{a.module}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-gray-500">{a.details}</TableCell>
                    <TableCell>{a.createdAt ? formatDate(new Date(a.createdAt)) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Pagination
            page={page - 1}
            totalPages={totalPages}
            totalCount={totalCount}
            hasNext={page < totalPages}
            hasPrev={page > 1}
            onNext={() => setPage(p => p + 1)}
            onPrev={() => setPage(p => p - 1)}
            pageSize={10}
          />
        </CardContent></Card>
      )}

      {/* Damage edit dialog */}
      <Dialog open={!!editingReport} onClose={() => setEditingReport(null)} className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Damage Report</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
              options={[{ value: "damage", label: "Damage" }, { value: "defect", label: "Defect" }, { value: "missing", label: "Missing" }]} />
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Input value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="damageResolved" checked={editForm.isResolved} onChange={(e) => setEditForm({ ...editForm, isResolved: e.target.checked })} className="h-4 w-4" />
            <Label htmlFor="damageResolved">Mark as Resolved</Label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditingReport(null)}>Cancel</Button>
            <Button onClick={saveDamageEdit} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
