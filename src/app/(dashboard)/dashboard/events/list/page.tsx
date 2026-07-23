"use client";
import { useWorkspaceBase } from "@/hooks/use-workspace-base";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  where,
  orderBy,
  Timestamp,
} from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { ListingHeader } from "@/components/ui/listing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/loading";
import { formatCurrency } from "@/lib/utils";
import { PartyPopper, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { pushStatusChange } from "@/lib/status-history";
import { createNotification } from "@/lib/notifications";
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
  { value: "shoot", label: "Shoot" },
  { value: "wedding", label: "Wedding" },
  { value: "corporate", label: "Corporate" },
  { value: "concert", label: "Concert" },
  { value: "exhibition", label: "Exhibition" },
  { value: "other", label: "Other" },
];

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
}

const emptyForm: EventForm = {
  title: "",
  description: "",
  eventType: "shoot",
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
};

export default function EventsListPage() {
  const router = useRouter();
  const base = useWorkspaceBase();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const fetchEvents = useCallback(async () => {
    try {
      const docs = await getDocuments<ManagedEvent>("events", [orderBy("createdAt", "desc")]);
      setEvents(docs);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
    void getDocuments<Client>("clients", [where("isActive", "==", true)]).then(setClients);
  }, [fetchEvents]);

  const filteredEvents = events.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (typeFilter !== "all" && e.eventType !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        e.clientName?.toLowerCase().includes(q) ||
        e.venue?.toLowerCase().includes(q) ||
        e.eventId?.toLowerCase().includes(q)
      );
    }
    return true;
  });

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
    });
    setEditingId(event.id!);
    setDialogOpen(true);
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
          updatedAt: Timestamp.now(),
        });
        await logAudit("update", "events", "event", editingId, `Updated event: ${form.title}`, user);
        toast("success", "Event updated");
      } else {
        // Generate event ID (simple sequential)
        const count = events.length + 1;
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
          assignedStaff: [],
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
        await logAudit("create", "events", "event", docId as string, `Created event: ${form.title}`, user);
        toast("success", "Event created");
      }
      setDialogOpen(false);
      await fetchEvents();
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
      await fetchEvents();
    } catch (error) {
      console.error("Delete failed:", error);
      toast("error", "Failed to delete event");
    }
  };

  const handleClientSelect = (clientId: string) => {
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
            ...EVENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
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
                <TableCell className="capitalize">{event.eventType}</TableCell>
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
              onChange={(e) => setForm((p) => ({ ...p, eventType: e.target.value as EventManagementType }))}
              options={EVENT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            />
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
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="Event description..."
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
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
