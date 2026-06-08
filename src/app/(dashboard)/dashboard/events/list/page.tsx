"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Filter, Eye } from "lucide-react";
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
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
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
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Event
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Statuses</option>
          {EVENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Events Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Event</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Dates</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Budget</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : filteredEvents.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No events found.</td></tr>
              ) : (
                filteredEvents.map((event) => (
                  <tr key={event.id} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{event.eventId}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">{event.eventType}</td>
                    <td className="px-4 py-3">{event.clientName || "—"}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs">{event.startDate}</p>
                      {event.endDate !== event.startDate && (
                        <p className="text-xs text-muted-foreground">to {event.endDate}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[event.status] || ""}`}>
                        {event.status.replace(/-/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {event.budget ? `₹${event.budget.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => router.push(`/dashboard/events/${event.id}`)}
                          className="rounded p-1.5 hover:bg-accent"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(event)}
                          className="rounded p-1.5 hover:bg-accent text-xs font-medium text-primary"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteId(event.id!)}
                          className="rounded p-1.5 hover:bg-destructive/10 text-xs font-medium text-destructive"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingId ? "Edit Event" : "Create Event"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Event title"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Event Type</label>
                <select
                  value={form.eventType}
                  onChange={(e) => setForm((p) => ({ ...p, eventType: e.target.value as EventManagementType }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Client</label>
                <select
                  value={form.clientId}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id!}>{c.companyName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Start Date *</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium">End Date *</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Start Time</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium">End Time</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Venue</label>
                <input
                  value={form.venue}
                  onChange={(e) => setForm((p) => ({ ...p, venue: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Venue name"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Location</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Address or area"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Budget (₹)</label>
                <input
                  type="number"
                  value={form.budget}
                  onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Tags</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Comma-separated tags"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Event description..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Internal notes..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDialogOpen(false)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

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
