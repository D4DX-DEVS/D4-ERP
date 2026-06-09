"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader } from "@/components/ui/listing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import type { StudioBooking, Studio } from "@/types";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8AM to 10PM

const STATUS_BAR_COLORS: Record<string, string> = {
  pending: "bg-yellow-300/70",
  approved: "bg-emerald-300/70",
  confirmed: "bg-blue-300/70",
  "in-progress": "bg-amber-300/70",
  completed: "bg-green-300/70",
  rejected: "bg-red-200/50",
  cancelled: "bg-slate-200/50",
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export default function StudioTimelinePage() {
  const [bookings, setBookings] = useState<StudioBooking[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  useEffect(() => {
    async function fetch() {
      try {
        const [b, s] = await Promise.all([
          getDocuments<StudioBooking>("studio_bookings", [orderBy("date", "asc")]),
          getDocuments<Studio>("studios", []),
        ]);
        setBookings(b);
        setStudios(s.filter((st) => st.isActive));
      } catch (error) {
        console.error("Failed to fetch:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, []);

  const dayBookings = bookings.filter((b) => b.date === selectedDate);

  const prevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };
  const nextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };
  const goToday = () => setSelectedDate(new Date().toISOString().split("T")[0]);

  const dateLabel = new Date(selectedDate + "T00:00").toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Timeline start/end in minutes
  const timelineStart = 8 * 60; // 8:00 AM
  const timelineEnd = 22 * 60; // 10:00 PM
  const totalMinutes = timelineEnd - timelineStart;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Studio Timeline"
        description="Horizontal timeline showing all studios and their bookings."
      />

      {/* Date Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold min-w-[250px] text-center text-slate-900">{dateLabel}</h2>
          <Button variant="ghost" size="icon" onClick={nextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={goToday}>
          Today
        </Button>
      </div>

      {loading ? (
        <PageLoader />
      ) : studios.length === 0 ? (
        <Card><CardContent><EmptyState title="No studios configured" /></CardContent></Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Hour Headers */}
          <div className="flex border-b border-slate-100">
            <div className="w-32 shrink-0 border-r border-slate-100 p-2 bg-slate-50/60">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Studio</span>
            </div>
            <div className="flex-1 flex">
              {HOURS.map((h) => (
                <div key={h} className="flex-1 border-r border-slate-100 p-1 text-center bg-slate-50/60">
                  <span className="text-[10px] text-slate-400">
                    {h > 12 ? `${h - 12}PM` : h === 12 ? "12PM" : `${h}AM`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Studio Rows */}
          {studios.map((studio) => {
            const studioBookings = dayBookings.filter((b) => b.studioId === studio.id);
            return (
              <div key={studio.id} className="flex border-b border-slate-100 last:border-0 min-h-[48px]">
                <div className="w-32 shrink-0 border-r border-slate-100 p-2 flex items-center">
                  <span className="text-xs font-medium text-slate-700 truncate">{studio.name}</span>
                </div>
                <div className="flex-1 relative">
                  {/* Hour grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {HOURS.map((h) => (
                      <div key={h} className="flex-1 border-r border-dashed border-slate-100" />
                    ))}
                  </div>
                  {/* Booking bars */}
                  {studioBookings.map((b) => {
                    const startMin = timeToMinutes(b.startTime) - timelineStart;
                    const endMin = timeToMinutes(b.endTime) - timelineStart;
                    const left = Math.max(0, (startMin / totalMinutes) * 100);
                    const width = Math.min(100 - left, ((endMin - startMin) / totalMinutes) * 100);
                    return (
                      <div
                        key={b.id}
                        className={`absolute top-1 bottom-1 rounded-md flex items-center px-1.5 overflow-hidden cursor-pointer hover:opacity-90 ${STATUS_BAR_COLORS[b.status] || "bg-gray-200"}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${b.startTime}–${b.endTime}: ${b.purpose} (${b.status})`}
                      >
                        <span className="text-[10px] font-medium truncate">
                          {b.purpose || b.clientName || b.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(STATUS_BAR_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-6 rounded ${color}`} />
            <span className="capitalize text-slate-600">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
