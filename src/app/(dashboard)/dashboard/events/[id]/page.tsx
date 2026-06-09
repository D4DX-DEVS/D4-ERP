"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  DollarSign,
  Calendar,
  MapPin,
  Tag,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import {
  getDocument,
  updateDocument,
  getDocuments,
  where,
  Timestamp,
} from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { StatusTimeline } from "@/components/ui/status-timeline";
import { CommentsSection } from "@/components/ui/comments-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading";
import { formatCurrency } from "@/lib/utils";
import { pushStatusChange } from "@/lib/status-history";
import { createBulkNotifications } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import type {
  ManagedEvent,
  EventManagementStatus,
  EventStaffAssignment,
  Staff,
} from "@/types";

const STATUS_ORDER: EventManagementStatus[] = [
  "inquiry",
  "quotation",
  "confirmed",
  "planning",
  "in-progress",
  "completed",
];

const STATUS_COLORS: Record<string, string> = {
  inquiry: "bg-slate-100 text-slate-700 border-slate-300",
  quotation: "bg-blue-100 text-blue-700 border-blue-300",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-300",
  planning: "bg-indigo-100 text-indigo-700 border-indigo-300",
  "in-progress": "bg-amber-100 text-amber-700 border-amber-300",
  completed: "bg-green-100 text-green-700 border-green-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

function getNextStatuses(current: EventManagementStatus): EventManagementStatus[] {
  const idx = STATUS_ORDER.indexOf(current);
  const next: EventManagementStatus[] = [];
  if (idx >= 0 && idx < STATUS_ORDER.length - 1) {
    next.push(STATUS_ORDER[idx + 1]);
  }
  if (current !== "completed" && current !== "cancelled") {
    next.push("cancelled");
  }
  return next;
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const eventId = params.id as string;
  const [event, setEvent] = useState<ManagedEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [staffRole, setStaffRole] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [targetStatus, setTargetStatus] = useState<EventManagementStatus | null>(null);

  const fetchEvent = useCallback(async () => {
    try {
      const doc = await getDocument<ManagedEvent>("events", eventId);
      setEvent(doc);
    } catch (error) {
      console.error("Failed to fetch event:", error);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void fetchEvent();
    void getDocuments<Staff>("staff", [where("isActive", "==", true)]).then(setStaffList);
  }, [fetchEvent]);

  const handleStatusChange = async () => {
    if (!event || !targetStatus || !user) return;
    try {
      const newHistory = pushStatusChange(
        event.statusHistory,
        targetStatus,
        user,
        statusRemarks || undefined
      );
      await updateDocument("events", eventId, {
        status: targetStatus,
        statusHistory: newHistory,
        updatedAt: Timestamp.now(),
      });

      // Notify assigned staff
      if (event.assignedStaff.length > 0) {
        const recipientIds = event.assignedStaff.map((s) => s.staffId);
        await createBulkNotifications(recipientIds, {
          type: "event",
          title: `Event status updated`,
          message: `"${event.title}" moved to ${targetStatus.replace(/-/g, " ")}`,
          link: `/dashboard/events/${eventId}`,
          entityId: eventId,
          entityType: "event",
          senderName: `${user.firstName} ${user.lastName}`,
        });
      }

      await logAudit(
        "update",
        "events",
        "event",
        eventId,
        `Status changed to ${targetStatus}`,
        user
      );

      toast("success", `Status updated to ${targetStatus.replace(/-/g, " ")}`);
      setShowStatusDialog(false);
      setStatusRemarks("");
      setTargetStatus(null);
      await fetchEvent();
    } catch (error) {
      console.error("Status change failed:", error);
      toast("error", "Failed to update status");
    }
  };

  const handleAddStaff = async () => {
    if (!event || !selectedStaffId || !user) return;
    const staff = staffList.find((s) => s.id === selectedStaffId);
    if (!staff) return;

    const newAssignment: EventStaffAssignment = {
      staffId: staff.id!,
      staffName: `${staff.firstName} ${staff.lastName}`,
      role: staffRole || "Team Member",
    };

    const updatedStaff = [...event.assignedStaff, newAssignment];
    try {
      await updateDocument("events", eventId, {
        assignedStaff: updatedStaff,
        updatedAt: Timestamp.now(),
      });

      await createBulkNotifications([staff.id!], {
        type: "event",
        title: "You've been assigned to an event",
        message: `You were added to "${event.title}" as ${newAssignment.role}`,
        link: `/dashboard/events/${eventId}`,
        entityId: eventId,
        entityType: "event",
        senderName: `${user.firstName} ${user.lastName}`,
      });

      toast("success", "Staff member added");
      setShowStaffPicker(false);
      setSelectedStaffId("");
      setStaffRole("");
      await fetchEvent();
    } catch (error) {
      console.error("Failed to add staff:", error);
      toast("error", "Failed to add staff");
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    if (!event || !user) return;
    const updatedStaff = event.assignedStaff.filter((s) => s.staffId !== staffId);
    try {
      await updateDocument("events", eventId, {
        assignedStaff: updatedStaff,
        updatedAt: Timestamp.now(),
      });
      toast("success", "Staff member removed");
      await fetchEvent();
    } catch (error) {
      console.error("Failed to remove staff:", error);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-500">Event not found.</p>
        <Button variant="outline" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  const nextStatuses = getNextStatuses(event.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950">{event.title}</h1>
            <Badge variant={STATUS_COLORS[event.status]} className="capitalize">
              {event.status.replace(/-/g, " ")}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            {event.eventId} • {event.eventType} • Created by {event.createdByName || "Unknown"}
          </p>
        </div>
      </div>

      {/* Status Actions */}
      {nextStatuses.length > 0 && (
        <div className="flex gap-2">
          {nextStatuses.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "cancelled" ? "outline" : "default"}
              className="capitalize"
              onClick={() => { setTargetStatus(s); setShowStatusDialog(true); }}
            >
              Move to {s.replace(/-/g, " ")}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview */}
          <Card>
            <CardContent className="p-6">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-slate-950 mb-4">Overview</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-teal-600" />
                <span>{event.startDate}{event.endDate !== event.startDate ? ` → ${event.endDate}` : ""}</span>
              </div>
              {(event.startTime || event.endTime) && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-teal-600" />
                  <span>{event.startTime || "—"} – {event.endTime || "—"}</span>
                </div>
              )}
              {event.venue && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-sky-600" />
                  <span>{event.venue}</span>
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-sky-600" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.clientName && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-violet-600" />
                  <span>Client: {event.clientName}</span>
                </div>
              )}
              {event.budget && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                  <span>Budget: {formatCurrency(event.budget)}</span>
                  {event.actualCost != null && (
                    <span className="text-slate-500">
                      (Actual: {formatCurrency(event.actualCost)})
                    </span>
                  )}
                </div>
              )}
            </div>
            {event.description && (
              <p className="mt-4 text-sm text-slate-500">{event.description}</p>
            )}
            {event.tags && event.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {event.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-700 px-2.5 py-0.5 text-xs font-medium">
                    <Tag className="h-3 w-3" /> {tag}
                  </span>
                ))}
              </div>
            )}
            </CardContent>
          </Card>

          {/* Staff Assignment */}
          <Card>
            <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Assigned Staff</h3>
              <Button size="sm" onClick={() => setShowStaffPicker(true)}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>

            {event.assignedStaff.length === 0 ? (
              <p className="text-sm text-slate-500">No staff assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {event.assignedStaff.map((s) => (
                  <div key={s.staffId} className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/60 p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{s.staffName}</p>
                      <p className="text-xs text-slate-500">{s.role}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveStaff(s.staffId)}>
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Staff Picker Inline */}
            {showStaffPicker && (
              <div className="mt-4 rounded-2xl border border-white/70 bg-white/60 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Staff Member</Label>
                    <Select
                      value={selectedStaffId}
                      onChange={(e) => setSelectedStaffId(e.target.value)}
                      placeholder="Select staff"
                      options={[
                        { value: "", label: "Select staff" },
                        ...staffList
                          .filter((s) => !event.assignedStaff.some((a) => a.staffId === s.id))
                          .map((s) => ({ value: s.id!, label: `${s.firstName} ${s.lastName}` })),
                      ]}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Role</Label>
                    <Input
                      value={staffRole}
                      onChange={(e) => setStaffRole(e.target.value)}
                      placeholder="e.g. Photographer"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddStaff} disabled={!selectedStaffId}>
                    Add
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowStaffPicker(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardContent className="p-6">
            <CommentsSection entityType="event" entityId={eventId} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Timeline */}
          <Card>
            <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-slate-950 mb-3">Status History</h3>
            <StatusTimeline history={event.statusHistory || []} />
            </CardContent>
          </Card>

          {/* Notes */}
          {event.notes && (
            <Card>
              <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-slate-950 mb-2">Internal Notes</h3>
              <p className="text-sm text-slate-500 whitespace-pre-wrap">{event.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Attachments */}
          {event.attachments && event.attachments.length > 0 && (
            <Card>
              <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-slate-950 mb-2">Attachments</h3>
              <div className="space-y-1">
                {event.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-teal-700 hover:text-teal-800 hover:underline"
                  >
                    <Paperclip className="h-3 w-3" /> {att.name}
                  </a>
                ))}
              </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog && !!targetStatus} onClose={() => { setShowStatusDialog(false); setTargetStatus(null); }} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="capitalize">
            Move to &quot;{targetStatus?.replace(/-/g, " ")}&quot;
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500 mb-4">
          Add optional remarks for this status change.
        </p>
        <Textarea
          value={statusRemarks}
          onChange={(e) => setStatusRemarks(e.target.value)}
          rows={3}
          placeholder="Remarks (optional)..."
        />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => { setShowStatusDialog(false); setTargetStatus(null); }}>
            Cancel
          </Button>
          <Button
            variant={targetStatus === "cancelled" ? "destructive" : "default"}
            onClick={handleStatusChange}
          >
            Confirm
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
