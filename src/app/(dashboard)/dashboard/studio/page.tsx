"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, CalendarDays, Clock, Users, ArrowRight } from "lucide-react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
          <Button onClick={() => router.push("/dashboard/studio/bookings")}>
            New Booking
          </Button>
        }
      />

      <ListingStatGrid>
        <ListingStatCard
          label="Today's Bookings"
          value={todayBookings.length}
          icon={<Clapperboard className="h-5 w-5" />}
          meta={`${upcomingBookings.length} upcoming`}
          toneClassName="bg-gradient-to-br from-teal-500 to-emerald-500 text-white"
        />
        <ListingStatCard
          label="Studios"
          value={studios.length}
          icon={<Users className="h-5 w-5" />}
          meta={`${studios.filter((s) => s.isActive).length} active`}
          toneClassName="bg-gradient-to-br from-sky-500 to-blue-500 text-white"
        />
        <ListingStatCard
          label="Utilization"
          value={`${utilization}%`}
          icon={<Clock className="h-5 w-5" />}
          meta={`${confirmed.length} confirmed bookings`}
          toneClassName="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"
        />
        <ListingStatCard
          label="Cancellation Rate"
          value={`${cancellationRate}%`}
          icon={<CalendarDays className="h-5 w-5" />}
          meta={`${cancelled.length} cancelled`}
          toneClassName="bg-gradient-to-br from-rose-500 to-red-500 text-white"
        />
      </ListingStatGrid>

      {/* Today's Bookings */}
      <Card>
        <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Today&apos;s Bookings</h3>
          <button
            onClick={() => router.push("/dashboard/studio/calendar")}
            className="text-sm font-medium text-teal-700 flex items-center gap-1 hover:text-teal-800 hover:underline"
          >
            Calendar <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : todayBookings.length === 0 ? (
          <p className="text-sm text-slate-500">No bookings for today.</p>
        ) : (
          <div className="space-y-2">
            {todayBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/60 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{b.purpose || b.studioName}</p>
                  <p className="text-xs text-slate-500">
                    {b.startTime} – {b.endTime} • {b.studioName}
                    {b.clientName && ` • ${b.clientName}`}
                  </p>
                </div>
                <Badge variant={getStatusColor(b.status)} className="capitalize">
                  {b.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
        </CardContent>
      </Card>

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
            className="rounded-2xl border border-white/70 bg-white/70 p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_34px_rgba(15,23,42,0.1)] transition-all"
          >
            <p className="text-sm font-semibold text-slate-900">{link.label}</p>
            <ArrowRight className="h-4 w-4 text-teal-600 mt-1" />
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
