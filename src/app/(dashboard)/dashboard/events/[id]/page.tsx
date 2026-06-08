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
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading event...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Event not found.</p>
        <button onClick={() => router.back()} className="text-sm text-primary hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const nextStatuses = getNextStatuses(event.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="rounded-md p-2 hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize border ${STATUS_COLORS[event.status] || ""}`}>
              {event.status.replace(/-/g, " ")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {event.eventId} • {event.eventType} • Created by {event.createdByName || "Unknown"}
          </p>
        </div>
      </div>

      {/* Status Actions */}
      {nextStatuses.length > 0 && (
        <div className="flex gap-2">
          {nextStatuses.map((s) => (
            <button
              key={s}
              onClick={() => { setTargetStatus(s); setShowStatusDialog(true); }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                s === "cancelled"
                  ? "border border-red-300 text-red-700 hover:bg-red-50"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              Move to {s.replace(/-/g, " ")}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-semibold mb-4">Overview</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{event.startDate}{event.endDate !== event.startDate ? ` → ${event.endDate}` : ""}</span>
              </div>
              {(event.startTime || event.endTime) && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{event.startTime || "—"} – {event.endTime || "—"}</span>
                </div>
              )}
              {event.venue && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{event.venue}</span>
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.clientName && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>Client: {event.clientName}</span>
                </div>
              )}
              {event.budget && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>Budget: ₹{event.budget.toLocaleString("en-IN")}</span>
                  {event.actualCost != null && (
                    <span className="text-muted-foreground">
                      (Actual: ₹{event.actualCost.toLocaleString("en-IN")})
                    </span>
                  )}
                </div>
              )}
            </div>
            {event.description && (
              <p className="mt-4 text-sm text-muted-foreground">{event.description}</p>
            )}
            {event.tags && event.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {event.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs">
                    <Tag className="h-3 w-3" /> {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Staff Assignment */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Assigned Staff</h3>
              <button
                onClick={() => setShowStaffPicker(true)}
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>

            {event.assignedStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {event.assignedStaff.map((s) => (
                  <div key={s.staffId} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{s.staffName}</p>
                      <p className="text-xs text-muted-foreground">{s.role}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveStaff(s.staffId)}
                      className="rounded p-1 hover:bg-destructive/10 text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Staff Picker Inline */}
            {showStaffPicker && (
              <div className="mt-4 rounded-lg border p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Staff Member</label>
                    <select
                      value={selectedStaffId}
                      onChange={(e) => setSelectedStaffId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select staff</option>
                      {staffList
                        .filter((s) => !event.assignedStaff.some((a) => a.staffId === s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id!}>{s.firstName} {s.lastName}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Role</label>
                    <input
                      value={staffRole}
                      onChange={(e) => setStaffRole(e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="e.g. Photographer"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddStaff}
                    disabled={!selectedStaffId}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowStaffPicker(false)}
                    className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="rounded-xl border bg-card p-6">
            <CommentsSection entityType="event" entityId={eventId} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Timeline */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-sm font-semibold mb-3">Status History</h3>
            <StatusTimeline history={event.statusHistory || []} />
          </div>

          {/* Notes */}
          {event.notes && (
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-semibold mb-2">Internal Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}

          {/* Attachments */}
          {event.attachments && event.attachments.length > 0 && (
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-semibold mb-2">Attachments</h3>
              <div className="space-y-1">
                {event.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Paperclip className="h-3 w-3" /> {att.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Change Dialog */}
      {showStatusDialog && targetStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-2">
              Move to &quot;{targetStatus.replace(/-/g, " ")}&quot;
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Add optional remarks for this status change.
            </p>
            <textarea
              value={statusRemarks}
              onChange={(e) => setStatusRemarks(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Remarks (optional)..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowStatusDialog(false); setTargetStatus(null); }}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusChange}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  targetStatus === "cancelled"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
