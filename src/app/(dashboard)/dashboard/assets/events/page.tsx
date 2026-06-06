"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AssetEvent, AssetPerson } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, where, Timestamp, search as searchConstraint } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { CalendarDays, Plus, Pencil, Trash2, Loader2, Search, Eye, ArrowRight, ArrowDownLeft, Download, FileSpreadsheet, FileText, UserPlus, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { logAssetActivity } from "@/lib/asset-activity-logger";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/asset-export-utils";
import { useAuthStore } from "@/store/auth-store";
import { formatDate } from "@/lib/utils";

interface MovementCounts {
  outCount: number;
  inCount: number;
  total: number;
}

interface OutMovement {
  id: string;
  assetId: string;
  assetName: string;
  assetCategory?: string;
  allocatedPersonName?: string;
  outDate: string;
}

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

const statusColors: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-800",
};

export default function AssetEventsPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [personsList, setPersonsList] = useState<(AssetPerson & { id: string })[]>([]);
  const { toast } = useToast();

  // Movement counts per event
  const [movementCounts, setMovementCounts] = useState<Record<string, MovementCounts>>({});

  // Quick Add Person state
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [addingPerson, setAddingPerson] = useState(false);

  // Return flow state
  const [showReturnPicker, setShowReturnPicker] = useState(false);
  const [returnEventMovements, setReturnEventMovements] = useState<OutMovement[]>([]);
  const [returnEventName, setReturnEventName] = useState("");
  const [loadingReturnList, setLoadingReturnList] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [selectedMovementForReturn, setSelectedMovementForReturn] = useState<OutMovement | null>(null);
  const [returnForm, setReturnForm] = useState({ returnBy: "", verifiedBy: "", condition: "good" as string, damageReason: "", remarks: "" });
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const constraints = useMemo(() => {
    const c: Array<ReturnType<typeof where> | ReturnType<typeof searchConstraint>> = [];
    if (search.trim()) {
      c.push(searchConstraint(["name", "location"], search.trim()));
    }
    if (statusFilter) {
      c.push(where("status", "==", statusFilter));
    }
    return c;
  }, [search, statusFilter]);

  const { data: events, loading, totalCount, page, totalPages, hasNext, hasPrev, nextPage, prevPage, refresh } = usePagination<AssetEvent>("asset-events", {
    pageSize: 10,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

  const [form, setForm] = useState({
    name: "", location: "", fromDate: "", toDate: "",
    responsiblePersonId: "", status: "upcoming" as AssetEvent["status"],
    isActive: true,
  });

  useEffect(() => {
    getDocuments<AssetPerson>("asset-persons", [where("isActive", "==", true)])
      .then(setPersonsList)
      .catch(console.error);
  }, []);

  // Load movement counts when events change
  const fetchMovementCounts = useCallback(async (eventIds: string[]) => {
    if (eventIds.length === 0) return;
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "event-movement-counts", eventIds }),
      });
      const result = await res.json();
      if (result.success) {
        setMovementCounts(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch movement counts:", error);
    }
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      fetchMovementCounts(events.map(e => e.id));
    }
  }, [events, fetchMovementCounts]);

  // Quick Add Person
  const quickAddPerson = async () => {
    if (!quickName.trim()) return;
    setAddingPerson(true);
    try {
      const id = await createDocument("asset-persons", {
        name: quickName.trim(),
        phone: quickPhone.trim() || "",
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      const newPerson = { id, name: quickName.trim(), phone: quickPhone.trim(), isActive: true } as AssetPerson & { id: string };
      setPersonsList(prev => [...prev, newPerson]);
      setForm(prev => ({ ...prev, responsiblePersonId: id }));
      setShowAddPerson(false);
      setQuickName("");
      setQuickPhone("");
      toast("success", `"${newPerson.name}" added and selected`);
    } catch {
      toast("error", "Could not add person");
    }
    setAddingPerson(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.location || !form.fromDate || !form.toDate || !form.responsiblePersonId) {
      toast("error", "Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const personName = personsList.find(p => p.id === form.responsiblePersonId)?.name || "";
      const data = {
        name: form.name,
        location: form.location,
        fromDate: form.fromDate ? Timestamp.fromDate(new Date(form.fromDate)) : Timestamp.now(),
        toDate: form.toDate ? Timestamp.fromDate(new Date(form.toDate)) : Timestamp.now(),
        responsiblePersonId: form.responsiblePersonId,
        responsiblePersonName: personName,
        status: form.status,
        isActive: form.isActive,
      };
      if (editingId) {
        await updateDocument("asset-events", editingId, { ...data, updatedAt: Timestamp.now() });
        toast("success", "Event updated");
        logAssetActivity({ userName: user?.firstName || "System", action: "UPDATE", module: "Events", resourceId: editingId, details: `Updated event "${form.name}"` });
        setDialogOpen(false);
        refresh();
      } else {
        const id = await createDocument("asset-events", { ...data, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
        toast("success", "Event created — now manage assets");
        logAssetActivity({ userName: user?.firstName || "System", action: "CREATE", module: "Events", resourceId: id, details: `Created event "${form.name}"` });
        setDialogOpen(false);
        // Auto-redirect to event detail page (Step 2 of workflow)
        router.push(`/dashboard/assets/events/${id}`);
      }
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate-event-delete", eventId: id }),
      });
      const result = await res.json();
      if (!result.success) {
        toast("error", result.error || "Cannot delete this event");
        return;
      }
    } catch {
      toast("error", "Failed to validate deletion");
      return;
    }
    setDeleteConfirm({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDocument("asset-events", deleteConfirm.id);
      toast("success", "Event deleted");
      logAssetActivity({ userName: user?.firstName || "System", action: "DELETE", module: "Events", resourceId: deleteConfirm.id, details: `Deleted event "${deleteConfirm.name}"` });
      setDeleteConfirm(null);
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete event");
      setDeleteConfirm(null);
    }
  };

  // Return flow — Step 1: open picker with OUT movements
  const openReturnPicker = async (ev: AssetEvent & { id: string }) => {
    setReturnEventName(ev.name);
    setLoadingReturnList(true);
    setShowReturnPicker(true);
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-event-out-movements", eventId: ev.id }),
      });
      const data = await res.json();
      setReturnEventMovements(data.success ? data.data : []);
    } catch {
      setReturnEventMovements([]);
    }
    setLoadingReturnList(false);
  };

  // Return flow — Step 2: open return form for selected asset
  const pickMovementToReturn = (m: OutMovement) => {
    setSelectedMovementForReturn(m);
    setReturnForm({ returnBy: "", verifiedBy: "", condition: "good", damageReason: "", remarks: "" });
    setShowReturnPicker(false);
    setShowReturnForm(true);
  };

  // Return flow — Submit
  const submitReturn = async () => {
    if (!selectedMovementForReturn || !returnForm.returnBy || !returnForm.verifiedBy) {
      toast("error", "Return By and Verified By are required");
      return;
    }
    setSubmittingReturn(true);
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "return",
          movementId: selectedMovementForReturn.id,
          returnBy: returnForm.returnBy,
          verifiedBy: returnForm.verifiedBy,
          condition: returnForm.condition,
          damageReason: returnForm.damageReason || undefined,
          remarks: returnForm.remarks || undefined,
          userName: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "System",
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast("success", "Asset returned");
        setShowReturnForm(false);
        setSelectedMovementForReturn(null);
        refresh();
        if (events.length > 0) fetchMovementCounts(events.map(e => e.id));
      } else {
        toast("error", result.error || "Return failed");
      }
    } catch {
      toast("error", "Return failed");
    }
    setSubmittingReturn(false);
  };

  // Download event-specific report
  const downloadEventReport = async (ev: AssetEvent & { id: string }, type: "excel" | "pdf") => {
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-event-movements", eventId: ev.id, limit: 100 }),
      });
      const data = await res.json();
      if (!data.success || data.data.length === 0) {
        toast("error", "No movements to export for this event");
        return;
      }
      const rows = data.data.map((m: Record<string, unknown>) => ({
        "Event": ev.name,
        "Location": ev.location,
        "Asset": m.assetName || "",
        "Category": m.assetCategory || "",
        "Issued To": m.allocatedPersonName || "",
        "Status": m.status === "OUT" ? "Issued (Not Returned)" : "Returned",
        "Issued On": m.outDate ? formatDate(new Date(m.outDate as string)) : "",
        "Returned On": m.inDate ? formatDate(new Date(m.inDate as string)) : "—",
        "Condition": m.inDate ? (m.condition ?? "good") : "—",
        "Returned By": (m.returnBy as string) ?? "—",
        "Verified By": (m.verifiedBy as string) ?? "—",
        "Remarks": (m.remarks as string) ?? "—",
      }));
      const filename = `event-${ev.name.toLowerCase().replace(/\s+/g, "-")}`;
      if (type === "excel") await exportToExcel(rows, filename);
      else await exportToPDF(rows, `${ev.name} — Movement Report`, filename);
    } catch {
      toast("error", "Failed to generate report");
    }
  };

  // Export events list
  const exportEventsList = (type: "csv" | "excel" | "pdf") => {
    const rows = events.map(e => {
      const counts = movementCounts[e.id];
      return {
        Name: e.name,
        Location: e.location,
        From: tsToDateStr(e.fromDate),
        To: tsToDateStr(e.toDate),
        Status: e.status,
        "Assets Out": counts?.outCount ?? 0,
        "Assets Returned": counts?.inCount ?? 0,
        "Total Movements": counts?.total ?? 0,
        "Responsible Person": e.responsiblePersonName ?? "",
      };
    });
    if (type === "csv") exportToCSV(rows, "events");
    else if (type === "excel") exportToExcel(rows, "events");
    else exportToPDF(rows, "Events List", "events");
  };

  const tsToDateStr = (ts?: Timestamp) => {
    if (!ts?.seconds) return "—";
    return formatDate(new Date(ts.seconds * 1000));
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Header with export buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Asset Events</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} events</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <button onClick={() => exportEventsList("csv")} title="Export CSV" className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg border border-gray-200 transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={() => exportEventsList("excel")} title="Export Excel" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-gray-200 transition-colors text-xs font-bold">
              XLS
            </button>
            <button onClick={() => exportEventsList("pdf")} title="Export PDF" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors text-xs font-bold">
              PDF
            </button>
          </div>
          <Button onClick={() => { setEditingId(null); setForm({ name: "", location: "", fromDate: "", toDate: "", responsiblePersonId: "", status: "upcoming", isActive: true }); setShowAddPerson(false); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Event
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search events..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={statusOptions} className="w-[180px]" />
      </div>

      {totalCount === 0 ? (
        <Card><CardContent><EmptyState icon={<CalendarDays className="h-12 w-12" />} title="No events found" description={search || statusFilter ? "Try adjusting your search or filter" : "Create your first event"} /></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead>Responsible</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assets</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => {
                const counts = movementCounts[event.id];
                const outCount = counts?.outCount ?? 0;
                const inCount = counts?.inCount ?? 0;
                const totalAssets = counts?.total ?? 0;

                return (
                <TableRow key={event.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{event.name}</p>
                      <button
                        onClick={() => router.push(`/dashboard/assets/events/${event.id}`)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-0.5 font-medium"
                      >
                        Manage Assets <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>{event.location}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{tsToDateStr(event.fromDate)}</p>
                      <p className="text-gray-400">to {tsToDateStr(event.toDate)}</p>
                    </div>
                  </TableCell>
                  <TableCell>{event.responsiblePersonName || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusColors[event.status] || "bg-gray-100 text-gray-800"}>
                      {event.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {totalAssets > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            ↑ {outCount} Out
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                            ↓ {inCount} In
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">{totalAssets} total</span>
                        {event.status === "completed" && outCount === 0 && totalAssets > 0 && (
                          <span className="text-xs text-gray-500 font-medium">✓ All Returned</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 items-center">
                      {outCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => openReturnPicker(event)} className="text-green-600 hover:text-green-800 hover:bg-green-50 text-xs gap-1">
                          <ArrowDownLeft className="w-3.5 h-3.5" /> Return
                        </Button>
                      )}
                      <button onClick={() => downloadEventReport(event, "excel")} title="Download Excel" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>
                      <button onClick={() => downloadEventReport(event, "pdf")} title="Download PDF" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <FileText className="w-4 h-4" />
                      </button>
                      <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/assets/events/${event.id}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditingId(event.id);
                        setForm({
                          name: event.name,
                          location: event.location,
                          fromDate: event.fromDate?.seconds ? new Date(event.fromDate.seconds * 1000).toISOString().split("T")[0] : "",
                          toDate: event.toDate?.seconds ? new Date(event.toDate.seconds * 1000).toISOString().split("T")[0] : "",
                          responsiblePersonId: event.responsiblePersonId || "",
                          status: event.status,
                          isActive: event.isActive,
                        });
                        setShowAddPerson(false);
                        setDialogOpen(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(event.id, event.name)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
        </CardContent></Card>
      )}

      <Dialog open={dialogOpen} onClose={() => { setDialogOpen(false); setShowAddPerson(false); }} className="max-w-2xl">
        <DialogHeader><DialogTitle>{editingId ? "Edit Event" : "Create Event"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Event Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Annual Conference" required /></div>
            <div className="space-y-2"><Label>Location *</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Main Hall" required /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>From Date *</Label><DatePicker value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} required /></div>
            <div className="space-y-2"><Label>To Date *</Label><DatePicker value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Responsible Person *</Label>
                <button type="button" onClick={() => setShowAddPerson(prev => !prev)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                  <UserPlus className="w-3.5 h-3.5" />
                  {showAddPerson ? "Cancel" : "New Person"}
                </button>
              </div>
              <Select
                value={form.responsiblePersonId}
                onChange={(e) => setForm({ ...form, responsiblePersonId: e.target.value })}
                options={[{ value: "", label: "Select person..." }, ...personsList.map(p => ({ value: p.id, label: p.name }))]}
              />
              {showAddPerson && (
                <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <Input value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Full name *" />
                  <Input value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} placeholder="Phone (optional)" />
                  <Button type="button" onClick={quickAddPerson} disabled={addingPerson || !quickName.trim()} className="w-full">
                    {addingPerson ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {addingPerson ? "Adding..." : "Add & Select"}
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AssetEvent["status"] })}
                options={[{ value: "upcoming", label: "Upcoming" }, { value: "active", label: "Active" }, { value: "completed", label: "Completed" }]} />
            </div>
          </div>
          {!editingId && (
            <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              After creating this event, you will be redirected to manage assets — select which items to issue, track conditions, and more.
            </p>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setShowAddPerson(false); }}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingId ? "Update" : "Create Event & Manage Assets"}</Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirm Dialog */}
      {deleteConfirm && (
        <Dialog open={true} onClose={() => setDeleteConfirm(null)} className="max-w-md">
          <DialogHeader><DialogTitle>Delete Event</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mb-4">
            Are you sure you want to delete &quot;{deleteConfirm.name}&quot;? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</Button>
          </div>
        </Dialog>
      )}

      {/* Return Flow — Step 1: Pick which OUT asset to return */}
      <Dialog open={showReturnPicker} onClose={() => setShowReturnPicker(false)} className="max-w-lg">
        <DialogHeader><DialogTitle>Return Asset — {returnEventName}</DialogTitle></DialogHeader>
        {loadingReturnList ? (
          <div className="space-y-2 py-4">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : returnEventMovements.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No assets currently out for this event.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-3">Select an asset to return:</p>
            {returnEventMovements.map((m) => (
              <button
                key={m.id}
                onClick={() => pickMovementToReturn(m)}
                className="w-full text-left p-3 bg-gray-50 rounded-xl hover:bg-green-50 border border-gray-200 hover:border-green-300 transition-colors"
              >
                <p className="text-sm font-medium">{m.assetName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {m.assetCategory} · Issued to: {m.allocatedPersonName ?? "—"} · Out: {m.outDate ? formatDate(new Date(m.outDate)) : "—"}
                </p>
              </button>
            ))}
          </div>
        )}
      </Dialog>

      {/* Return Flow — Step 2: Return form */}
      <Dialog open={showReturnForm && !!selectedMovementForReturn} onClose={() => { setShowReturnForm(false); setSelectedMovementForReturn(null); }} className="max-w-lg">
        <DialogHeader><DialogTitle>Return Asset</DialogTitle></DialogHeader>
        {selectedMovementForReturn && (
          <>
            <div className="mb-4 p-3 bg-gray-50 rounded-xl text-sm">
              <p className="font-medium">{selectedMovementForReturn.assetName}</p>
              <p className="text-gray-500 text-xs">{returnEventName} · {selectedMovementForReturn.allocatedPersonName ?? "—"}</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Return By *</Label>
                <Input value={returnForm.returnBy} onChange={(e) => setReturnForm(prev => ({ ...prev, returnBy: e.target.value }))} placeholder="Name of person returning" />
              </div>
              <div className="space-y-2">
                <Label>Verified By *</Label>
                <Input value={returnForm.verifiedBy} onChange={(e) => setReturnForm(prev => ({ ...prev, verifiedBy: e.target.value }))} placeholder="Name of verifier" />
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={returnForm.condition} onChange={(e) => setReturnForm(prev => ({ ...prev, condition: e.target.value }))}
                  options={[{ value: "good", label: "Good" }, { value: "damaged", label: "Damaged" }, { value: "defective", label: "Defective" }, { value: "missing", label: "Missing" }]} />
              </div>
              {returnForm.condition !== "good" && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-xs font-medium text-red-700">This will create a damage/defect report</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Reason / Description</Label>
                    <Input value={returnForm.damageReason} onChange={(e) => setReturnForm(prev => ({ ...prev, damageReason: e.target.value }))} placeholder="Describe the issue..." />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Remarks (optional)</Label>
                <Input value={returnForm.remarks} onChange={(e) => setReturnForm(prev => ({ ...prev, remarks: e.target.value }))} placeholder="Optional notes..." />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => { setShowReturnForm(false); setShowReturnPicker(true); }} className="flex-1">Back</Button>
                <Button onClick={submitReturn} disabled={submittingReturn} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                  {submittingReturn ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowDownLeft className="h-4 w-4 mr-2" />}
                  {submittingReturn ? "Saving..." : "Confirm Return"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
