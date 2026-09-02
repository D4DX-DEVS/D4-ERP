"use client";
import { useWorkspaceBase } from "@/hooks/use-workspace-base";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import {
  getDocument,
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  countDocuments,
  where,
  orderBy,
  search as searchConstraint,
  Timestamp,
} from "@/lib/firestore";
import { usePagination } from "@/hooks/use-pagination";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { ListingHeader } from "@/components/ui/listing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/loading";
import { formatCurrency } from "@/lib/utils";
import { PartyPopper, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { QuickAddClient } from "@/components/clients/quick-add-client";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { pushStatusChange } from "@/lib/status-history";
import { createBulkNotifications } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import type {
  ManagedEvent,
  EventManagementStatus,
  EventManagementType,
  EventStaffAssignment,
  Client,
  Staff,
} from "@/types";

const EVENT_TYPES: { value: EventManagementType; label: string }[] = [
  { value: "event", label: "Event" },
  { value: "podcast-shoot", label: "Podcast Shoot" },
  { value: "corporate", label: "Corporate Event" },
  { value: "exhibition", label: "Exhibition" },
  { value: "other", label: "Other" },
];

/** Labels for event types no longer offered in the dropdown but present on old records. */
const LEGACY_TYPE_LABELS: Record<string, string> = {
  shoot: "Shoot",
  wedding: "Wedding",
  concert: "Concert",
};

const EVENT_STATUSES: { value: EventManagementStatus; label: string }[] = [
  { value: "inquiry", label: "Inquiry" },
  { value: "quotation", label: "Quotation" },
  { value: "confirmed", label: "Confirmed" },
  { value: "planning", label: "Planning" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  inquiry: "bg-slate-100 text-slate-700",
  quotation: "bg-blue-100 text-blue-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  planning: "bg-indigo-100 text-indigo-700",
  "in-progress": "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

interface EventForm {
  title: string;
  description: string;
  eventType: EventManagementType;
  clientId: string;
  clientName: string;
  venue: string;
  location: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  budget: string;
  notes: string;
  tags: string;
  staffIds: string[];
}

const emptyForm: EventForm = {
  title: "",
  description: "",
  eventType: "event",
  clientId: "",
  clientName: "",
  venue: "",
  location: "",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  budget: "",
  notes: "",
  tags: "",
  staffIds: [],
};

export default function EventsListPage() {
  const router = useRouter();
  const base = useWorkspaceBase();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [customTypes, setCustomTypes] = useState<{ id: string; name: string }[]>([]);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [pageSize, setPageSize] = useState(20);

  const allEventTypes = [
    ...EVENT_TYPES,
    ...customTypes
      .filter((t) => !EVENT_TYPES.some((d) => d.value === t.name.toLowerCase()))
      .map((t) => ({ value: t.name, label: t.name })),
  ];

  const constraints = useMemo(() => {
    const c: ReturnType<typeof where>[] = [];
    if (statusFilter !== "all") c.push(where("status", "==", statusFilter));
    if (typeFilter !== "all") c.push(where("eventType", "==", typeFilter));
    if (searchQuery.trim()) {
      c.push(searchConstraint(["title", "clientName", "venue", "eventId"], searchQuery.trim()));
    }
    return c;
  }, [statusFilter, typeFilter, searchQuery]);

  const {
    data: filteredEvents,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<ManagedEvent>("events", {
    pageSize,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

  useEffect(() => {
    void getDocuments<Client>("clients", [where("isActive", "==", true)]).then(setClients);
    void getDocuments<Staff>("staff", [where("isActive", "==", true)]).then(setStaffList);
    void getDocuments<{ id: string; name: string }>("eventTypes", [orderBy("name", "asc")])
      .then(setCustomTypes)
      .catch(() => setCustomTypes([]));
  }, []);

  const handleAddType = async () => {
    const name = newTypeName.trim();
    if (!name || !user) return;
    if (allEventTypes.some((t) => t.value.toLowerCase() === name.toLowerCase())) {
      toast("error", "Type already exists");
      return;
    }
    setAddingType(true);
    try {
      const id = await createDocument("eventTypes", { name, companyId: user.companyId, createdAt: Timestamp.now() });
      setCustomTypes((prev) => [...prev, { id: id as string, name }]);
      setForm((p) => ({ ...p, eventType: name }));
      setNewTypeName("");
      setShowAddType(false);
      toast("success", "Event type added");
    } catch {
      toast("error", "Failed to add type");
    } finally {
      setAddingType(false);
    }
  };

  const handleOpenCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (event: ManagedEvent) => {
    setForm({
      title: event.title,
      description: event.description || "",
      eventType: event.eventType,
      clientId: event.clientId || "",
      clientName: event.clientName || "",
      venue: event.venue || "",
      location: event.location || "",
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime || "",
      endTime: event.endTime || "",
      budget: event.budget?.toString() || "",
      notes: event.notes || "",
      tags: event.tags?.join(", ") || "",
      staffIds: (event.assignedStaff || []).map((s) => s.staffId),
    });
    setEditingId(event.id!);
    setDialogOpen(true);
  };

  // Deep link from the event detail page: /events/list?edit=<id> opens that
  // event straight in the edit dialog. The doc is fetched by id so it works
  // even when the event is not on the current page of the list.
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("edit");
    if (!id) return;
    void (async () => {
      try {
        const doc = await getDocument<ManagedEvent>("events", id);
        if (doc) handleOpenEdit({ ...doc, id });
        else toast("error", "Event not found");
      } catch {
        toast("error", "Failed to open the event");
      } finally {
        router.replace(`${base}/events/list`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const toggleStaff = (id: string) => {
    setForm((p) => ({
      ...p,
      staffIds: p.staffIds.includes(id)
        ? p.staffIds.filter((x) => x !== id)
        : [...p.staffIds, id],
    }));
  };

  // Keeps existing role for staff already assigned; new picks default to Team Member.
  const buildAssignments = (prev: EventStaffAssignment[]): EventStaffAssignment[] =>
    form.staffIds.map((id) => {
      const existing = prev.find((a) => a.staffId === id);
      if (existing) return existing;
      const s = staffList.find((st) => st.id === id);
      return {
        staffId: id,
        staffName: s ? `${s.firstName} ${s.lastName}` : "Staff",
        role: "Team Member",
      };
    });

  const notifyAssignedStaff = async (staffIds: string[], eventDocId: string) => {
    if (staffIds.length === 0 || !user) return;
    await createBulkNotifications(staffIds, {
      type: "event",
      title: "You've been assigned to an event",
      message: `You were added to "${form.title.trim()}" (${form.startDate})`,
      link: `/staff-portal/events/${eventDocId}`,
      entityId: eventDocId,
      entityType: "event",
      senderName: `${user.firstName} ${user.lastName}`,
    });
  };

  const handleSave = async () => {
    if (!user || !form.title.trim() || !form.startDate || !form.endDate) {
      toast("error", "Please fill required fields");
      return;
    }
    const todayKey = new Date().toLocaleDateString("en-CA");
    if (!editingId && form.startDate < todayKey) {
      toast("error", "Cannot book a past date — pick today or an upcoming date");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const prevAssigned =
          filteredEvents.find((e) => e.id === editingId)?.assignedStaff ?? [];
        const assignedStaff = buildAssignments(prevAssigned);
        await updateDocument("events", editingId, {
          title: form.title.trim(),
          description: form.description.trim(),
          eventType: form.eventType,
          clientId: form.clientId,
          clientName: form.clientName,
          venue: form.venue.trim(),
          location: form.location.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          startTime: form.startTime,
          endTime: form.endTime,
          budget: form.budget ? Number(form.budget) : null,
          notes: form.notes.trim(),
          tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          assignedStaff,
          assignedStaffIds: form.staffIds,
          updatedAt: Timestamp.now(),
        });
        const newlyAdded = form.staffIds.filter(
          (id) => !prevAssigned.some((a) => a.staffId === id)
        );
        await notifyAssignedStaff(newlyAdded, editingId);
        await logAudit("update", "events", "event", editingId, `Updated event: ${form.title}`, user);
        toast("success", "Event updated");
      } else {
        // Generate event ID (simple sequential, from the full collection count —
        // the paginated page only holds one page of events)
        const count = (await countDocuments("events")) + 1;
        const eventId = `EVT-${String(count).padStart(3, "0")}`;

        const statusHistory = pushStatusChange([], "inquiry", user);

        const docId = await createDocument("events", {
          eventId,
          title: form.title.trim(),
          description: form.description.trim(),
          eventType: form.eventType,
          clientId: form.clientId,
          clientName: form.clientName,
          venue: form.venue.trim(),
          location: form.location.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          startTime: form.startTime,
          endTime: form.endTime,
          status: "inquiry",
          statusHistory,
          budget: form.budget ? Number(form.budget) : null,
          actualCost: null,
          assignedStaff: buildAssignments([]),
          assignedStaffIds: form.staffIds,
          linkedAssets: [],
          linkedStudioBookings: [],
          linkedQuotationId: null,
          notes: form.notes.trim(),
          attachments: [],
          tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          companyId: user.companyId,
          createdBy: user.uid,
          createdByName: `${user.firstName} ${user.lastName}`,
          source: base === "/staff-portal" ? "staff" : "admin",
          createdAt: Timestamp.now(),
        });
        await notifyAssignedStaff(form.staffIds, docId as string);
        await logAudit("create", "events", "event", docId as string, `Created event: ${form.title}`, user);
        toast("success", "Event created");
      }
      setDialogOpen(false);
      refresh();
    } catch (error) {
      console.error("Save failed:", error);
      toast("error", "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !user) return;
    try {
      await deleteDocument("events", deleteId);
      await logAudit("delete", "events", "event", deleteId, "Deleted event", user);
      toast("success", "Event deleted");
      setDeleteId(null);
      refresh();
    } catch (error) {
      console.error("Delete failed:", error);
      toast("error", "Failed to delete event");
    }
  };

  const handleClientSelect = (clientId: string) => {
    if (clientId === "__add_client__") {
      setQuickAddOpen(true);
      return;
    }
    const client = clients.find((c) => c.id === clientId);
    setForm((prev) => ({
      ...prev,
      clientId,
      clientName: client ? client.companyName : "",
    }));
  };

  return (
    <div className="space-y-6">
      <ListingHeader
        title="All Events"
        description="Manage events from inquiry to completion."
        action={
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Create Event
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
          <Input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-[180px]"
          options={[
            { value: "all", label: "All Statuses" },
            ...EVENT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
          ]}
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-[160px]"
          options={[
            { value: "all", label: "All Types" },
            ...allEventTypes.map((t) => ({ value: t.value, label: t.label })),
          ]}
        />
      </div>

      {/* Events Table */}
      {loading ? (
        <Card><CardContent className="py-12 text-center text-sm text-slate-500">Loading...</CardContent></Card>
      ) : filteredEvents.length === 0 ? (
        <Card><CardContent><EmptyState icon={<PartyPopper className="h-12 w-12" />} title="No events found" description="Create your first event to get started." /></CardContent></Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEvents.map((event) => (
              <TableRow key={event.id} className="cursor-pointer" onClick={() => router.push(`${base}/events/${event.id}`)}>
                <TableCell>
                  <p className="font-semibold text-slate-900">{event.title}</p>
                  <p className="text-xs text-slate-400">{event.eventId}</p>
                </TableCell>
                <TableCell className="capitalize">
                  {allEventTypes.find((t) => t.value === event.eventType)?.label ??
                    LEGACY_TYPE_LABELS[event.eventType] ??
                    event.eventType}
                </TableCell>
                <TableCell>{event.clientName || "—"}</TableCell>
                <TableCell>
                  <p className="text-xs">{event.startDate}</p>
                  {event.endDate !== event.startDate && (
                    <p className="text-xs text-slate-400">to {event.endDate}</p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_COLORS[event.status]} className="capitalize">
                    {event.status.replace(/-/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  {event.budget ? formatCurrency(event.budget) : "—"}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="View details" onClick={() => router.push(`${base}/events/${event.id}`)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => handleOpenEdit(event)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteId(event.id!)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!loading && totalCount > 0 && (
        <Card className="p-0">
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
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Event" : "Create Event"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-2">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Event title"
            />
          </div>

          <div className="space-y-2">
            <Label>Event Type</Label>
            <Select
              value={form.eventType}
              onChange={(e) => {
                if (e.target.value === "__add_type__") {
                  setShowAddType(true);
                  return;
                }
                setForm((p) => ({ ...p, eventType: e.target.value as EventManagementType }));
              }}
              options={[
                ...allEventTypes.map((t) => ({ value: t.value, label: t.label })),
                { value: "__add_type__", label: "+ Add new type" },
              ]}
            />
            {showAddType && (
              <div className="flex gap-2 mt-2">
                <Input
                  autoFocus
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddType())}
                  placeholder="New type name"
                />
                <Button type="button" size="sm" onClick={handleAddType} disabled={addingType || !newTypeName.trim()}>
                  {addingType ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setShowAddType(false); setNewTypeName(""); }}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Client</Label>
            <Select
              value={form.clientId}
              onChange={(e) => handleClientSelect(e.target.value)}
              placeholder="No client"
              options={[
                { value: "", label: "No client" },
                ...clients.map((c) => ({ value: c.id!, label: c.companyName })),
                { value: "__add_client__", label: "+ Add new client" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label>Start Date *</Label>
            <DatePicker
              value={form.startDate}
              min={editingId ? undefined : new Date().toLocaleDateString("en-CA")}
              onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>End Date *</Label>
            <DatePicker
              value={form.endDate}
              onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Start Time</Label>
            <TimePicker
              value={form.startTime}
              onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>End Time</Label>
            <TimePicker
              value={form.endTime}
              onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Venue</Label>
            <Input
              value={form.venue}
              onChange={(e) => setForm((p) => ({ ...p, venue: e.target.value }))}
              placeholder="Venue name"
            />
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="Address or area"
            />
          </div>

          <div className="space-y-2">
            <Label>Budget (₹)</Label>
            <Input
              type="number"
              value={form.budget}
              onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              placeholder="Comma-separated tags"
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Assign Staff ({form.staffIds.length} selected)</Label>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {staffList.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-slate-400">No active staff found.</p>
              ) : (
                staffList.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={form.staffIds.includes(s.id!)}
                      onChange={() => toggleStaff(s.id!)}
                    />
                    <span>{s.firstName} {s.lastName}</span>
                    <span className="text-xs text-gray-400">{s.employeeCode}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-slate-400">
              Assigned staff see the event on their calendar and get notified.
            </p>
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Description</Label>
            <RichTextEditor
              value={form.description}
              onChange={(html) => setForm((p) => ({ ...p, description: html }))}
              placeholder="Event description..."
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Notes</Label>
            <RichTextEditor
              value={form.notes}
              onChange={(html) => setForm((p) => ({ ...p, notes: html }))}
              placeholder="Internal notes..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving..." : editingId ? "Update" : "Create"}
          </Button>
        </div>
      </Dialog>

      {/* Quick add client (opens from Client dropdown "+ Add new client") */}
      <QuickAddClient
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={(client) => {
          setClients((prev) => [...prev, client]);
          setForm((prev) => ({ ...prev, clientId: client.id, clientName: client.companyName }));
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Event"
        message="Are you sure you want to delete this event? This action cannot be undone."
        variant="danger"
      />
    </div>
  );
}
