"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PartyPopper,
  CalendarDays,
  DollarSign,
  Users,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { getDocuments, where, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import type { ManagedEvent } from "@/types";

export default function EventsDashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const docs = await getDocuments<ManagedEvent>("events", [
          orderBy("createdAt", "desc"),
        ]);
        setEvents(docs);
      } catch (error) {
        console.error("Failed to fetch events:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetchEvents();
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const upcoming = events.filter(
    (e) => e.startDate >= today && e.status !== "completed" && e.status !== "cancelled"
  );
  const activeEvents = events.filter(
    (e) => e.status === "in-progress" || e.status === "planning" || e.status === "confirmed"
  );
  const completedEvents = events.filter((e) => e.status === "completed");
  const totalBudget = events.reduce((sum, e) => sum + (e.budget || 0), 0);
  const totalActual = events.reduce((sum, e) => sum + (e.actualCost || 0), 0);
  const successRate = events.length > 0
    ? Math.round((completedEvents.length / events.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Event Management"
        description="Overview of all events, revenue, and team allocation."
        action={
          <button
            onClick={() => router.push("/dashboard/events/list")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Event
          </button>
        }
      />

      <ListingStatGrid>
        <ListingStatCard
          label="Total Events"
          value={events.length}
          icon={<PartyPopper className="h-5 w-5" />}
        />
        <ListingStatCard
          label="Upcoming"
          value={upcoming.length}
          icon={<CalendarDays className="h-5 w-5" />}
          meta={`${activeEvents.length} active`}
        />
        <ListingStatCard
          label="Budget"
          value={`₹${(totalBudget / 1000).toFixed(0)}k`}
          icon={<DollarSign className="h-5 w-5" />}
          meta={`Actual: ₹${(totalActual / 1000).toFixed(0)}k`}
        />
        <ListingStatCard
          label="Success Rate"
          value={`${successRate}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          meta={`${completedEvents.length} completed`}
        />
      </ListingStatGrid>

      {/* Upcoming Events */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Upcoming Events</h3>
          <button
            onClick={() => router.push("/dashboard/events/list")}
            className="text-sm text-primary flex items-center gap-1 hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming events.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.slice(0, 5).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => router.push(`/dashboard/events/${event.id}`)}
              >
                <div className="flex-1">
                  <h4 className="text-sm font-medium">{event.title}</h4>
                  <p className="text-xs text-muted-foreground">
                    {event.eventType} • {event.startDate}
                    {event.venue && ` • ${event.venue}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {event.assignedStaff.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {event.assignedStaff.length}
                    </span>
                  )}
                  <EventStatusBadge status={event.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events created yet.</p>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 8).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-accent/30 px-2 rounded"
                onClick={() => router.push(`/dashboard/events/${event.id}`)}
              >
                <div>
                  <span className="text-sm font-medium">{event.title}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {event.clientName || "No client"}
                  </span>
                </div>
                <EventStatusBadge status={event.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    inquiry: "bg-slate-100 text-slate-700",
    quotation: "bg-blue-100 text-blue-700",
    confirmed: "bg-emerald-100 text-emerald-700",
    planning: "bg-indigo-100 text-indigo-700",
    "in-progress": "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || "bg-gray-100 text-gray-700"}`}
    >
      {status.replace(/-/g, " ")}
    </span>
  );
}
