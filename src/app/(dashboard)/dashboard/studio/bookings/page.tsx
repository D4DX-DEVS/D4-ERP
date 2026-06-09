"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
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
          <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> New Booking
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
          <Input
            type="text"
            placeholder="Search bookings..."
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
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "confirmed", label: "Confirmed" },
            { value: "in-progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
      </div>

      {/* Table */}
      {loading ? (
        <Card><CardContent className="py-12 text-center text-sm text-slate-500">Loading...</CardContent></Card>
      ) : filteredBookings.length === 0 ? (
        <Card><CardContent><EmptyState icon={<Plus className="h-12 w-12" />} title="No bookings found" description="Create your first studio booking." /></CardContent></Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Studio</TableHead>
              <TableHead>Date / Time</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBookings.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-semibold text-slate-900">{b.studioName || b.studioId}</TableCell>
                <TableCell>
                  <p className="text-xs">{b.date}</p>
                  <p className="text-xs text-slate-400">{b.startTime} – {b.endTime}</p>
                </TableCell>
                <TableCell>{b.purpose}</TableCell>
                <TableCell>{b.clientName || "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_COLORS[b.status]} className="capitalize">
                    {b.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {b.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 px-3 text-emerald-700 border-emerald-200" onClick={() => handleStatusChange(b.id!, "confirmed")}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-3 text-red-700 border-red-200" onClick={() => handleStatusChange(b.id!, "rejected")}>
                          Reject
                        </Button>
                      </>
                    )}
                    {b.status === "confirmed" && (
                      <Button size="sm" variant="outline" className="h-8 px-3 text-green-700 border-green-200" onClick={() => handleStatusChange(b.id!, "completed")}>
                        Complete
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => handleOpenEdit(b)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteId(b.id!)}>
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
          <DialogTitle>{editingId ? "Edit Booking" : "New Booking"}</DialogTitle>
        </DialogHeader>

        {conflictWarning && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ {conflictWarning}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Studio *</Label>
            <Select
              value={form.studioId}
              onChange={(e) => setForm((p) => ({ ...p, studioId: e.target.value }))}
              placeholder="Select studio"
              options={[
                { value: "", label: "Select studio" },
                ...studios.filter((s) => s.isActive).map((s) => ({ value: s.id!, label: s.name })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label>Booking Type</Label>
            <Select
              value={form.bookingType}
              onChange={(e) => setForm((p) => ({ ...p, bookingType: e.target.value as StudioBookingType }))}
              options={BOOKING_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Date *</Label>
            <DatePicker
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Start *</Label>
              <TimePicker
                value={form.startTime}
                onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>End *</Label>
              <TimePicker
                value={form.endTime}
                onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
              />
            </div>
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Purpose *</Label>
            <Input
              value={form.purpose}
              onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
              placeholder="Purpose of booking"
            />
          </div>

          <div className="space-y-2">
            <Label>Client</Label>
            <Select
              value={form.clientId}
              onChange={(e) => {
                const c = clients.find((cl) => cl.id === e.target.value);
                setForm((p) => ({ ...p, clientId: e.target.value, clientName: c?.companyName || "" }));
              }}
              placeholder="No client"
              options={[
                { value: "", label: "No client" },
                ...clients.map((c) => ({ value: c.id!, label: c.companyName })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label>Event Name</Label>
            <Input
              value={form.eventName}
              onChange={(e) => setForm((p) => ({ ...p, eventName: e.target.value }))}
              placeholder="Event name (optional)"
            />
          </div>

          <div className="space-y-2">
            <Label>Contact Number</Label>
            <Input
              value={form.contactNumber}
              onChange={(e) => setForm((p) => ({ ...p, contactNumber: e.target.value }))}
              placeholder="Phone number"
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="Email address"
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || (!!conflictWarning && !conflictWarning.includes("End time"))}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving..." : editingId ? "Update" : "Create"}
          </Button>
        </div>
      </Dialog>

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
