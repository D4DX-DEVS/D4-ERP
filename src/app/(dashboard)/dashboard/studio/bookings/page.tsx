"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  orderBy,
  Timestamp,
} from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { ListingHeader } from "@/components/ui/listing";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { findConflict, isValidTimeRange } from "@/lib/studio-utils";
import { pushStatusChange } from "@/lib/status-history";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import type { StudioBooking, Studio, Client, StudioBookingStatus, StudioBookingType } from "@/types";

const BOOKING_TYPES: { value: StudioBookingType; label: string }[] = [
  { value: "photography", label: "Photography" },
  { value: "videography", label: "Videography" },
  { value: "podcast", label: "Podcast" },
  { value: "rehearsal", label: "Rehearsal" },
  { value: "meeting", label: "Meeting" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-emerald-100 text-emerald-700",
  confirmed: "bg-blue-100 text-blue-700",
  "in-progress": "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-700",
};

interface BookingForm {
  studioId: string;
  date: string;
  startTime: string;
  endTime: string;
  bookingType: StudioBookingType;
  purpose: string;
  clientId: string;
  clientName: string;
  contactNumber: string;
  email: string;
  eventName: string;
  notes: string;
}

const emptyForm: BookingForm = {
  studioId: "",
  date: "",
  startTime: "",
  endTime: "",
  bookingType: "photography",
  purpose: "",
  clientId: "",
  clientName: "",
  contactNumber: "",
  email: "",
  eventName: "",
  notes: "",
};

export default function StudioBookingsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [bookings, setBookings] = useState<StudioBooking[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BookingForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchData = async () => {
    try {
      const [b, s, c] = await Promise.all([
        getDocuments<StudioBooking>("studio_bookings", [orderBy("createdAt", "desc")]),
        getDocuments<Studio>("studios", []),
        getDocuments<Client>("clients", []),
      ]);
      setBookings(b);
      setStudios(s);
      setClients(c);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const [b, s, c] = await Promise.all([
          getDocuments<StudioBooking>("studio_bookings", [orderBy("createdAt", "desc")]),
          getDocuments<Studio>("studios", []),
          getDocuments<Client>("clients", []),
        ]);
        setBookings(b);
        setStudios(s);
        setClients(c);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Compute conflict warning as derived state
  const conflictWarning = useMemo(() => {
    if (!form.studioId || !form.date || !form.startTime || !form.endTime) {
      return "";
    }
    if (!isValidTimeRange(form.startTime, form.endTime)) {
      return "End time must be after start time.";
    }
    const conflict = findConflict(
      { studioId: form.studioId, date: form.date, startTime: form.startTime, endTime: form.endTime },
      bookings.filter((b): b is StudioBooking & { id: string } => !!b.id),
      editingId || undefined
    );
    if (conflict) {
      return `Conflicts with booking: ${conflict.purpose || conflict.studioName} (${conflict.startTime}–${conflict.endTime})`;
    }
    return "";
  }, [form.studioId, form.date, form.startTime, form.endTime, bookings, editingId]);

  const filteredBookings = bookings.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        b.purpose?.toLowerCase().includes(q) ||
        b.clientName?.toLowerCase().includes(q) ||
        b.studioName?.toLowerCase().includes(q) ||
        b.requestedByName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSave = async () => {
    if (!user || !form.studioId || !form.date || !form.startTime || !form.endTime) {
      toast("error", "Please fill required fields");
      return;
    }
    if (!isValidTimeRange(form.startTime, form.endTime)) {
      toast("error", "End time must be after start time");
      return;
    }
    if (conflictWarning && !conflictWarning.includes("End time")) {
      toast("error", "Cannot save — time conflict exists");
      return;
    }

    setSaving(true);
    try {
      const studio = studios.find((s) => s.id === form.studioId);
      const startMinutes = parseInt(form.startTime.split(":")[0]) * 60 + parseInt(form.startTime.split(":")[1]);
      const endMinutes = parseInt(form.endTime.split(":")[0]) * 60 + parseInt(form.endTime.split(":")[1]);
      const duration = endMinutes - startMinutes;

      if (editingId) {
        await updateDocument("studio_bookings", editingId, {
          studioId: form.studioId,
          studioName: studio?.name || "",
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          duration,
          bookingType: form.bookingType,
          purpose: form.purpose.trim(),
          clientId: form.clientId,
          clientName: form.clientName,
          contactNumber: form.contactNumber,
          email: form.email,
          eventName: form.eventName,
          notes: form.notes.trim(),
          updatedAt: Timestamp.now(),
        });
        await logAudit("update", "studio", "studio_booking", editingId, `Updated booking`, user);
        toast("success", "Booking updated");
      } else {
        const statusHistory = pushStatusChange([], "pending", user);
        await createDocument("studio_bookings", {
          studioId: form.studioId,
          studioName: studio?.name || "",
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          duration,
          bookingType: form.bookingType,
          purpose: form.purpose.trim(),
          clientId: form.clientId,
          clientName: form.clientName,
          companyName: clients.find((c) => c.id === form.clientId)?.companyName || "",
          contactNumber: form.contactNumber,
          email: form.email,
          eventName: form.eventName,
          notes: form.notes.trim(),
          status: "pending",
          statusHistory,
          attachments: [],
          requiredEquipment: [],
          assignedStaff: [],
          linkedEventId: null,
          requestedBy: user.uid,
          requestedByName: `${user.firstName} ${user.lastName}`,
          createdAt: Timestamp.now(),
        });
        toast("success", "Booking created");
      }
      setDialogOpen(false);
      await fetchData();
    } catch (error) {
      console.error("Save failed:", error);
      toast("error", "Failed to save booking");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !user) return;
    try {
      await deleteDocument("studio_bookings", deleteId);
      await logAudit("delete", "studio", "studio_booking", deleteId, "Deleted booking", user);
      toast("success", "Booking deleted");
      setDeleteId(null);
      await fetchData();
    } catch (error) {
      console.error("Delete failed:", error);
      toast("error", "Failed to delete");
    }
  };

  const handleStatusChange = async (bookingId: string, newStatus: StudioBookingStatus) => {
    if (!user) return;
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    try {
      const newHistory = pushStatusChange(booking.statusHistory, newStatus, user);
      await updateDocument("studio_bookings", bookingId, {
        status: newStatus,
        statusHistory: newHistory,
        ...(newStatus === "approved" || newStatus === "confirmed"
          ? { approvedBy: user.uid, approvedByName: `${user.firstName} ${user.lastName}`, approvalDate: Timestamp.now() }
          : {}),
        updatedAt: Timestamp.now(),
      });
      // Notify the booking requestor
      if (booking.requestedBy && booking.requestedBy !== user.staffId) {
        await createNotification({
          recipientId: booking.requestedBy,
          type: "studio",
          title: `Booking ${newStatus}`,
          message: `Your studio booking for ${booking.studioName} on ${booking.date} has been ${newStatus}.`,
          link: "/dashboard/studio/bookings",
        });
      }
      toast("success", `Booking ${newStatus}`);
      await fetchData();
    } catch (error) {
      console.error("Status change failed:", error);
      toast("error", "Failed to update status");
    }
  };

  const handleOpenEdit = (b: StudioBooking) => {
    setForm({
      studioId: b.studioId,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      bookingType: b.bookingType || "photography",
      purpose: b.purpose,
      clientId: b.clientId || "",
      clientName: b.clientName || "",
      contactNumber: b.contactNumber || "",
      email: b.email || "",
      eventName: b.eventName || "",
      notes: b.notes || "",
    });
    setEditingId(b.id!);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Studio Bookings"
        description="Manage all studio booking requests."
        action={
          <button
            onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Booking
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search bookings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="confirmed">Confirmed</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Studio</th>
                <th className="text-left px-4 py-3 font-medium">Date / Time</th>
                <th className="text-left px-4 py-3 font-medium">Purpose</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : filteredBookings.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No bookings found.</td></tr>
              ) : (
                filteredBookings.map((b) => (
                  <tr key={b.id} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium">{b.studioName || b.studioId}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs">{b.date}</p>
                      <p className="text-xs text-muted-foreground">{b.startTime} – {b.endTime}</p>
                    </td>
                    <td className="px-4 py-3">{b.purpose}</td>
                    <td className="px-4 py-3">{b.clientName || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[b.status] || ""}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {b.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleStatusChange(b.id!, "confirmed")}
                              className="rounded px-2 py-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleStatusChange(b.id!, "rejected")}
                              className="rounded px-2 py-1 text-xs bg-red-50 text-red-700 hover:bg-red-100"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {b.status === "confirmed" && (
                          <button
                            onClick={() => handleStatusChange(b.id!, "completed")}
                            className="rounded px-2 py-1 text-xs bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            Complete
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(b)}
                          className="rounded px-2 py-1 text-xs text-primary hover:bg-accent"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteId(b.id!)}
                          className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
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
              {editingId ? "Edit Booking" : "New Booking"}
            </h2>

            {conflictWarning && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                ⚠️ {conflictWarning}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Studio *</label>
                <select
                  value={form.studioId}
                  onChange={(e) => setForm((p) => ({ ...p, studioId: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select studio</option>
                  {studios.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id!}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Booking Type</label>
                <select
                  value={form.bookingType}
                  onChange={(e) => setForm((p) => ({ ...p, bookingType: e.target.value as StudioBookingType }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {BOOKING_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium">Start *</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End *</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium">Purpose *</label>
                <input
                  value={form.purpose}
                  onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Purpose of booking"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Client</label>
                <select
                  value={form.clientId}
                  onChange={(e) => {
                    const c = clients.find((cl) => cl.id === e.target.value);
                    setForm((p) => ({ ...p, clientId: e.target.value, clientName: c?.companyName || "" }));
                  }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id!}>{c.companyName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Event Name</label>
                <input
                  value={form.eventName}
                  onChange={(e) => setForm((p) => ({ ...p, eventName: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Event name (optional)"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Contact Number</label>
                <input
                  value={form.contactNumber}
                  onChange={(e) => setForm((p) => ({ ...p, contactNumber: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Phone number"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Email address"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  placeholder="Additional notes..."
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
                disabled={saving || (!!conflictWarning && !conflictWarning.includes("End time"))}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Booking"
        message="Are you sure you want to delete this booking?"
        variant="danger"
      />
    </div>
  );
}
