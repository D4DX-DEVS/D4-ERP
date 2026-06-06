"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getDocument, updateDocument, Timestamp } from "@/lib/firestore";
import { logAudit } from "@/lib/audit";
import { useAuthStore } from "@/store/auth-store";
import type { CalendarEvent } from "@/types";
import { categoryMeta, tsToDate, sameDay } from "@/lib/calendar-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, Archive, Clock, MapPin, Repeat, Tag, Layers, Bell } from "lucide-react";
import { formatDate } from "@/lib/utils";

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export default function CalendarEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const eventId = params.id as string;

  const [event, setEvent] = useState<(CalendarEvent & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const data = await getDocument<CalendarEvent>("calendar_events", eventId);
        setEvent(data);
      } finally {
        setLoading(false);
      }
    }
    void fetchData();
  }, [eventId]);

  if (loading) return <PageLoader />;
  if (!event) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/calendar"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Back to calendar</Button></Link>
        <p className="text-sm text-gray-500">Event not found.</p>
      </div>
    );
  }

  const start = tsToDate(event.startDate);
  const end = tsToDate(event.endDate) ?? start;
  const meta = categoryMeta(event.type);

  const handleArchive = async () => {
    setConfirmArchive(false);
    try {
      await updateDocument("calendar_events", eventId, { isArchived: true, updatedAt: Timestamp.now() });
      await logAudit(
        "delete", "calendar", "calendar_event", eventId,
        `Archived event "${event.title}"`,
        user ? { uid: user.uid, firstName: user.firstName, lastName: user.lastName } : null,
        { previousData: event as unknown as Record<string, unknown> }
      );
      toast("success", "Event archived");
      router.push("/dashboard/calendar");
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to archive event");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{event.title}</h1>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/calendar"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button></Link>
          {!event.isArchived && (
            <Button variant="outline" className="text-red-500" onClick={() => setConfirmArchive(true)}>
              <Archive className="h-4 w-4 mr-2" /> Archive
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={meta.badge}>{meta.label}</Badge>
            {event.priority && <Badge variant={PRIORITY_BADGE[event.priority]}>{event.priority}</Badge>}
            {event.scope && <Badge variant="bg-gray-100 text-gray-600">{event.scope}</Badge>}
            {event.isArchived && <Badge variant="bg-red-100 text-red-700">Archived</Badge>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <p className="flex items-center gap-2 text-gray-600">
              <Clock className="h-4 w-4" />
              {start ? formatDate(start) : "—"}{start && end && !sameDay(start, end) ? ` → ${formatDate(end)}` : ""}
              {!event.isAllDay && event.startTime ? ` · ${event.startTime}${event.endTime ? ` - ${event.endTime}` : ""}` : " · All day"}
            </p>
            {event.location && <p className="flex items-center gap-2 text-gray-600"><MapPin className="h-4 w-4" />{event.location}</p>}
            <p className="flex items-center gap-2 text-gray-600"><Tag className="h-4 w-4" />{meta.label}</p>
            {event.scope && <p className="flex items-center gap-2 text-gray-600"><Layers className="h-4 w-4" />{event.scope}</p>}
            {event.recurrence && event.recurrence.frequency !== "none" && (
              <p className="flex items-center gap-2 text-gray-600">
                <Repeat className="h-4 w-4" />Repeats {event.recurrence.frequency}
                {event.recurrence.until ? ` until ${formatDate(event.recurrence.until)}` : ""}
              </p>
            )}
            {!!event.reminderMinutes && (
              <p className="flex items-center gap-2 text-gray-600">
                <Bell className="h-4 w-4" />
                Reminder {event.reminderMinutes >= 1440 ? "1 day" : event.reminderMinutes >= 60 ? "1 hour" : `${event.reminderMinutes} min`} before
              </p>
            )}
          </div>

          {event.description && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmArchive}
        title="Archive Event"
        message="Archive this event? You can restore it later from the Archived list on the calendar."
        confirmLabel="Archive"
        variant="danger"
        onConfirm={handleArchive}
        onCancel={() => setConfirmArchive(false)}
      />
    </div>
  );
}
