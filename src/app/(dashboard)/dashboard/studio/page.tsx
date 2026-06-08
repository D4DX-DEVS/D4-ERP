"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, CalendarDays, Clock, Users, ArrowRight } from "lucide-react";
import { getDocuments, where, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import type { StudioBooking, Studio } from "@/types";

export default function StudioDashboardPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<StudioBooking[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [b, s] = await Promise.all([
          getDocuments<StudioBooking>("studio_bookings", [orderBy("createdAt", "desc")]),
          getDocuments<Studio>("studios", []),
        ]);
        setBookings(b);
        setStudios(s);
      } catch (error) {
        console.error("Failed to fetch studio data:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetchData();
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const todayBookings = bookings.filter((b) => b.date === today);
  const upcomingBookings = bookings.filter(
    (b) => b.date >= today && b.status !== "cancelled" && b.status !== "rejected"
  );
  const confirmed = bookings.filter(
    (b) => b.status === "confirmed" || b.status === "approved"
  );
  const cancelled = bookings.filter((b) => b.status === "cancelled");
  const cancellationRate = bookings.length > 0
    ? Math.round((cancelled.length / bookings.length) * 100)
    : 0;

  // Utilization: booked hours / (studios * 12h * 30 days) simple approximation
  const totalBookedMinutes = bookings
    .filter((b) => b.status !== "cancelled" && b.status !== "rejected")
    .reduce((sum, b) => sum + (b.duration || 60), 0);
  const totalAvailableMinutes = studios.length * 12 * 60 * 30; // 12h/day, 30 days
  const utilization = totalAvailableMinutes > 0
    ? Math.round((totalBookedMinutes / totalAvailableMinutes) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Studio Management"
        description="Dashboard overview of studio bookings and utilization."
        action={
          <button
            onClick={() => router.push("/dashboard/studio/bookings")}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            New Booking
          </button>
        }
      />

      <ListingStatGrid>
        <ListingStatCard
          label="Today's Bookings"
          value={todayBookings.length}
          icon={<Clapperboard className="h-5 w-5" />}
          meta={`${upcomingBookings.length} upcoming`}
        />
        <ListingStatCard
          label="Studios"
          value={studios.length}
          icon={<Users className="h-5 w-5" />}
          meta={`${studios.filter((s) => s.isActive).length} active`}
        />
        <ListingStatCard
          label="Utilization"
          value={`${utilization}%`}
          icon={<Clock className="h-5 w-5" />}
          meta={`${confirmed.length} confirmed bookings`}
        />
        <ListingStatCard
          label="Cancellation Rate"
          value={`${cancellationRate}%`}
          icon={<CalendarDays className="h-5 w-5" />}
          meta={`${cancelled.length} cancelled`}
        />
      </ListingStatGrid>

      {/* Today's Bookings */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Today&apos;s Bookings</h3>
          <button
            onClick={() => router.push("/dashboard/studio/calendar")}
            className="text-sm text-primary flex items-center gap-1 hover:underline"
          >
            Calendar <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : todayBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings for today.</p>
        ) : (
          <div className="space-y-2">
            {todayBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{b.purpose || b.studioName}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.startTime} – {b.endTime} • {b.studioName}
                    {b.clientName && ` • ${b.clientName}`}
                  </p>
                </div>
                <span className={`text-xs font-medium capitalize rounded-full px-2 py-0.5 ${getStatusColor(b.status)}`}>
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "All Bookings", href: "/dashboard/studio/bookings" },
          { label: "Calendar View", href: "/dashboard/studio/calendar" },
          { label: "Timeline View", href: "/dashboard/studio/timeline" },
          { label: "Availability", href: "/dashboard/studio/availability" },
        ].map((link) => (
          <button
            key={link.href}
            onClick={() => router.push(link.href)}
            className="rounded-xl border p-4 text-left hover:bg-accent/50 transition-colors"
          >
            <p className="text-sm font-medium">{link.label}</p>
            <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />
          </button>
        ))}
      </div>
    </div>
  );
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-emerald-100 text-emerald-700",
    confirmed: "bg-blue-100 text-blue-700",
    "in-progress": "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-slate-100 text-slate-700",
  };
  return map[status] || "bg-gray-100 text-gray-700";
}
