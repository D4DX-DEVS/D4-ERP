"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { BarChart3, Clock, XCircle, TrendingUp } from "lucide-react";
import type { StudioBooking } from "@/types";

export default function StudioReportsPage() {
  const [bookings, setBookings] = useState<StudioBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const b = await getDocuments<StudioBooking>("studio_bookings", [orderBy("createdAt", "desc")]);
        setBookings(b);
      } catch (error) {
        console.error("Failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, []);

  const completed = bookings.filter((b) => b.status === "completed");
  const cancelled = bookings.filter((b) => b.status === "cancelled");
  const totalDuration = bookings
    .filter((b) => b.status !== "cancelled" && b.status !== "rejected")
    .reduce((s, b) => s + (b.duration || 60), 0);
  const avgDuration = bookings.length > 0 ? Math.round(totalDuration / bookings.length) : 0;
  const cancellationRate = bookings.length > 0 ? Math.round((cancelled.length / bookings.length) * 100) : 0;

  // Bookings per studio
  const perStudio: Record<string, number> = {};
  bookings.forEach((b) => {
    const name = b.studioName || b.studioId;
    perStudio[name] = (perStudio[name] || 0) + 1;
  });

  // Bookings per type
  const perType: Record<string, number> = {};
  bookings.forEach((b) => {
    const type = b.bookingType || "other";
    perType[type] = (perType[type] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      <ListingHeader title="Studio Reports" description="Booking analytics and utilization." />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (<>

      <ListingStatGrid>
        <ListingStatCard label="Total Bookings" value={bookings.length} icon={<BarChart3 className="h-5 w-5" />} />
        <ListingStatCard label="Completed" value={completed.length} icon={<TrendingUp className="h-5 w-5" />} />
        <ListingStatCard label="Avg Duration" value={`${avgDuration} min`} icon={<Clock className="h-5 w-5" />} />
        <ListingStatCard label="Cancellation Rate" value={`${cancellationRate}%`} icon={<XCircle className="h-5 w-5" />} />
      </ListingStatGrid>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Per Studio */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Bookings per Studio</h3>
          <div className="space-y-3">
            {Object.entries(perStudio)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm">{name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(count / bookings.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Per Type */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Bookings by Type</h3>
          <div className="space-y-3">
            {Object.entries(perType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{type}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${(count / bookings.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
}
