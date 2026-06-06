"use client";

import { useEffect, useState } from "react";
import { Studio, StudioBooking, Client } from "@/types";
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  orderBy,
  Timestamp,
} from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import {
  bookingStatusMeta,
  findConflict,
  isValidTimeRange,
} from "@/lib/studio-utils";
import { useFeatureGuard } from "@/hooks/use-role-guard";
import {
  Clapperboard,
  Plus,
  Loader2,
  Check,
  X,
  Pencil,
  Trash2,
  CalendarClock,
} from "lucide-react";

type Tab = "bookings" | "studios";

const emptyBookingForm = {
  studioId: "",
  date: "",
  startTime: "",
  endTime: "",
  purpose: "",
  clientId: "",
  notes: "",
};

const emptyStudioForm = {
  name: "",
  location: "",
  capacity: "",
  description: "",
};

export default function StudioBookingPage() {
  const { user, authorized, isLoading } = useFeatureGuard("studio-booking");
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState<Tab>("bookings");
  const [studios, setStudios] = useState<(Studio & { id: string })[]>([]);
  const [bookings, setBookings] = useState<(StudioBooking & { id: string })[]>([]);
  const [clients, setClients] = useState<(Client & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  // Booking dialog
  const [bookingDialog, setBookingDialog] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [bookingForm, setBookingForm] = useState(emptyBookingForm);
  const [savingBooking, setSavingBooking] = useState(false);

  // Studio dialog
  const [studioDialog, setStudioDialog] = useState(false);
  const [editingStudioId, setEditingStudioId] = useState<string | null>(null);
  const [studioForm, setStudioForm] = useState(emptyStudioForm);
  const [savingStudio, setSavingStudio] = useState(false);

  // Confirmations
  const [confirm, setConfirm] = useState<
    | { kind: "reject"; booking: StudioBooking & { id: string } }
    | { kind: "cancel"; booking: StudioBooking & { id: string } }
    | { kind: "deleteStudio"; studio: Studio & { id: string } }
    | null
  >(null);

  const fetchData = async () => {
    try {
      const [studioList, bookingList, clientList] = await Promise.all([
        getDocuments<Studio>("studios", [orderBy("name", "asc")]),
        getDocuments<StudioBooking>("studio_bookings", [orderBy("date", "desc")]),
        getDocuments<Client>("clients", [orderBy("companyName", "asc")]),
      ]);
      setStudios(studioList);
      setBookings(bookingList);
      setClients(clientList);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load studio data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  if (isLoading || (authorized && loading)) return <PageLoader />;
  if (!authorized) return null;

  const activeStudios = studios.filter((s) => s.isActive);
  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : "";

  // ── Booking actions ─────────────────────────────────────────────────────────
  const openBookingDialog = (booking?: StudioBooking & { id: string }) => {
    if (booking) {
      setEditingBookingId(booking.id);
      setBookingForm({
        studioId: booking.studioId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        purpose: booking.purpose,
        clientId: booking.clientId || "",
        notes: booking.notes || "",
      });
    } else {
      setEditingBookingId(null);
      setBookingForm(emptyBookingForm);
    }
    setBookingDialog(true);
  };

  const handleSaveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingForm.studioId) return toast("error", "Select a studio");
    if (!bookingForm.date) return toast("error", "Select a date");
    if (!isValidTimeRange(bookingForm.startTime, bookingForm.endTime)) {
      return toast("error", "End time must be after start time");
    }

    const conflict = findConflict(
      {
        studioId: bookingForm.studioId,
        date: bookingForm.date,
        startTime: bookingForm.startTime,
        endTime: bookingForm.endTime,
      },
      bookings,
      editingBookingId ?? undefined
    );
    if (conflict) {
      return toast(
        "error",
        `Slot clashes with an existing ${conflict.status} booking (${conflict.startTime}–${conflict.endTime})`
      );
    }

    setSavingBooking(true);
    try {
      const studio = studios.find((s) => s.id === bookingForm.studioId);
      const client = clients.find((c) => c.id === bookingForm.clientId);
      const payload = {
        studioId: bookingForm.studioId,
        studioName: studio?.name ?? "",
        date: bookingForm.date,
        startTime: bookingForm.startTime,
        endTime: bookingForm.endTime,
        purpose: bookingForm.purpose,
        notes: bookingForm.notes,
        clientId: bookingForm.clientId || "",
        clientName: client?.companyName ?? "",
      };

      if (editingBookingId) {
        await updateDocument("studio_bookings", editingBookingId, payload);
        toast("success", "Booking updated");
      } else {
        await createDocument("studio_bookings", {
          ...payload,
          // Admins book directly; everyone else requests approval.
          status: isAdmin ? "approved" : "pending",
          requestedBy: user?.staffId || "",
          requestedByName: userName,
          ...(isAdmin
            ? { approvedBy: user?.staffId || "", approvedByName: userName, approvalDate: Timestamp.now() }
            : {}),
        });
        toast("success", isAdmin ? "Studio booked" : "Booking request submitted");
      }
      setBookingDialog(false);
      setBookingForm(emptyBookingForm);
      setEditingBookingId(null);
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save booking");
    } finally {
      setSavingBooking(false);
    }
  };

  const approveBooking = async (booking: StudioBooking & { id: string }) => {
    try {
      await updateDocument("studio_bookings", booking.id, {
        status: "approved",
        approvedBy: user?.staffId || "",
        approvedByName: userName,
        approvalDate: Timestamp.now(),
        rejectionReason: "",
      });
      toast("success", "Booking approved");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to approve booking");
    }
  };

  const setBookingStatus = async (
    booking: StudioBooking & { id: string },
    status: StudioBooking["status"]
  ) => {
    try {
      await updateDocument("studio_bookings", booking.id, {
        status,
        ...(status === "approved"
          ? { approvedBy: user?.staffId || "", approvedByName: userName, approvalDate: Timestamp.now() }
          : {}),
      });
      toast("success", status === "rejected" ? "Booking rejected" : "Booking cancelled");
      setConfirm(null);
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update booking");
    }
  };

  // ── Studio master actions ───────────────────────────────────────────────────
  const openStudioDialog = (studio?: Studio & { id: string }) => {
    if (studio) {
      setEditingStudioId(studio.id);
      setStudioForm({
        name: studio.name,
        location: studio.location || "",
        capacity: studio.capacity != null ? String(studio.capacity) : "",
        description: studio.description || "",
      });
    } else {
      setEditingStudioId(null);
      setStudioForm(emptyStudioForm);
    }
    setStudioDialog(true);
  };

  const handleSaveStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studioForm.name.trim()) return toast("error", "Studio name is required");
    setSavingStudio(true);
    try {
      const payload = {
        name: studioForm.name.trim(),
        location: studioForm.location.trim(),
        capacity: studioForm.capacity ? Number(studioForm.capacity) : undefined,
        description: studioForm.description.trim(),
      };
      if (editingStudioId) {
        await updateDocument("studios", editingStudioId, payload);
        toast("success", "Studio updated");
      } else {
        await createDocument("studios", { ...payload, isActive: true });
        toast("success", "Studio added");
      }
      setStudioDialog(false);
      setStudioForm(emptyStudioForm);
      setEditingStudioId(null);
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save studio");
    } finally {
      setSavingStudio(false);
    }
  };

  const toggleStudioActive = async (studio: Studio & { id: string }) => {
    try {
      await updateDocument("studios", studio.id, { isActive: !studio.isActive });
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update studio");
    }
  };

  const deleteStudio = async (studio: Studio & { id: string }) => {
    try {
      await deleteDocument("studios", studio.id);
      toast("success", "Studio removed");
      setConfirm(null);
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to remove studio");
    }
  };

  const canManageBooking = (booking: StudioBooking & { id: string }) =>
    isAdmin || booking.requestedBy === user?.staffId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Studio Booking</h1>
          <p className="text-sm text-gray-500 mt-1">
            {bookings.length} bookings · {activeStudios.length} active studios
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "bookings" ? (
            <Button onClick={() => openBookingDialog()} disabled={activeStudios.length === 0}>
              <Plus className="h-4 w-4 mr-2" /> New Booking
            </Button>
          ) : (
            <Button onClick={() => openStudioDialog()}>
              <Plus className="h-4 w-4 mr-2" /> New Studio
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("bookings")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
            tab === "bookings"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Bookings
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setTab("studios")}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
              tab === "studios"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Studios
          </button>
        )}
      </div>

      {tab === "bookings" ? (
        <Card>
          <CardContent className="p-0">
            {bookings.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-10 w-10" />}
                title="No bookings yet"
                description={
                  activeStudios.length === 0
                    ? "Add a studio first to start booking."
                    : "Create your first studio booking."
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Studio</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((b) => {
                    const meta = bookingStatusMeta(b.status);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.studioName || "—"}</TableCell>
                        <TableCell>{b.date ? formatDate(new Date(b.date)) : "—"}</TableCell>
                        <TableCell>
                          {b.startTime}–{b.endTime}
                        </TableCell>
                        <TableCell>
                          <div>{b.purpose || "—"}</div>
                          {b.clientName && (
                            <div className="text-xs text-slate-400">{b.clientName}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {b.requestedByName || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.badge}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isAdmin && b.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => approveBooking(b)}
                                  title="Approve"
                                >
                                  <Check className="h-4 w-4 text-emerald-600" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setConfirm({ kind: "reject", booking: b })}
                                  title="Reject"
                                >
                                  <X className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            )}
                            {canManageBooking(b) &&
                              (b.status === "pending" || b.status === "approved") && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openBookingDialog(b)}
                                    title="Edit"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirm({ kind: "cancel", booking: b })}
                                    title="Cancel booking"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {studios.length === 0 ? (
              <EmptyState
                icon={<Clapperboard className="h-10 w-10" />}
                title="No studios"
                description="Add a studio to make it bookable."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studios.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.location || "—"}</TableCell>
                      <TableCell>{s.capacity ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }
                        >
                          {s.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleStudioActive(s)}
                            title={s.isActive ? "Deactivate" : "Activate"}
                          >
                            {s.isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openStudioDialog(s)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirm({ kind: "deleteStudio", studio: s })}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Booking dialog */}
      {bookingDialog && (
        <Dialog open={bookingDialog} onClose={() => setBookingDialog(false)}>
          <DialogHeader>
            <DialogTitle>{editingBookingId ? "Edit Booking" : "New Booking"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveBooking} className="space-y-4">
            <div>
              <Label>Studio *</Label>
              <Select
                value={bookingForm.studioId}
                placeholder="Select a studio"
                options={activeStudios.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(e) => setBookingForm({ ...bookingForm, studioId: e.target.value })}
              />
            </div>
            <div>
              <Label>Date *</Label>
              <DatePicker
                value={bookingForm.date}
                onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time *</Label>
                <TimePicker
                  value={bookingForm.startTime}
                  onChange={(e) => setBookingForm({ ...bookingForm, startTime: e.target.value })}
                />
              </div>
              <div>
                <Label>End Time *</Label>
                <TimePicker
                  value={bookingForm.endTime}
                  onChange={(e) => setBookingForm({ ...bookingForm, endTime: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Purpose</Label>
              <Input
                value={bookingForm.purpose}
                onChange={(e) => setBookingForm({ ...bookingForm, purpose: e.target.value })}
                placeholder="e.g. Product shoot"
              />
            </div>
            <div>
              <Label>Client / Project</Label>
              <Select
                value={bookingForm.clientId}
                placeholder="None"
                options={[
                  { value: "", label: "None" },
                  ...clients.map((c) => ({ value: c.id, label: c.companyName })),
                ]}
                onChange={(e) => setBookingForm({ ...bookingForm, clientId: e.target.value })}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={bookingForm.notes}
                onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                rows={2}
              />
            </div>
            {!isAdmin && !editingBookingId && (
              <p className="text-xs text-amber-600">
                This request will be sent to an admin for approval.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setBookingDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingBooking}>
                {savingBooking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingBookingId ? "Save" : "Submit"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Studio dialog */}
      {studioDialog && (
        <Dialog open={studioDialog} onClose={() => setStudioDialog(false)}>
          <DialogHeader>
            <DialogTitle>{editingStudioId ? "Edit Studio" : "New Studio"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveStudio} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={studioForm.name}
                onChange={(e) => setStudioForm({ ...studioForm, name: e.target.value })}
                placeholder="e.g. Studio A"
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={studioForm.location}
                onChange={(e) => setStudioForm({ ...studioForm, location: e.target.value })}
              />
            </div>
            <div>
              <Label>Capacity</Label>
              <Input
                type="number"
                min={0}
                value={studioForm.capacity}
                onChange={(e) => setStudioForm({ ...studioForm, capacity: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={studioForm.description}
                onChange={(e) => setStudioForm({ ...studioForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStudioDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingStudio}>
                {savingStudio && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      <ConfirmDialog
        open={confirm?.kind === "reject"}
        title="Reject booking"
        message="Reject this booking request? The slot will be freed."
        confirmLabel="Reject"
        variant="warning"
        onConfirm={() => confirm?.kind === "reject" && setBookingStatus(confirm.booking, "rejected")}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "cancel"}
        title="Cancel booking"
        message="Cancel this booking? The slot will be freed."
        confirmLabel="Cancel Booking"
        variant="warning"
        onConfirm={() => confirm?.kind === "cancel" && setBookingStatus(confirm.booking, "cancelled")}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "deleteStudio"}
        title="Delete studio"
        message="Remove this studio? Existing bookings keep their saved studio name."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirm?.kind === "deleteStudio" && deleteStudio(confirm.studio)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
