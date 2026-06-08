"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader } from "@/components/ui/listing";
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
          <button onClick={prevDay} className="rounded-md p-2 hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold min-w-[250px] text-center">{dateLabel}</h2>
          <button onClick={nextDay} className="rounded-md p-2 hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button onClick={goToday} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
          Today
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : studios.length === 0 ? (
        <p className="text-sm text-muted-foreground">No studios configured.</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Hour Headers */}
          <div className="flex border-b">
            <div className="w-32 shrink-0 border-r p-2 bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">Studio</span>
            </div>
            <div className="flex-1 flex">
              {HOURS.map((h) => (
                <div key={h} className="flex-1 border-r p-1 text-center bg-muted/30">
                  <span className="text-[10px] text-muted-foreground">
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
              <div key={studio.id} className="flex border-b last:border-0 min-h-[48px]">
                <div className="w-32 shrink-0 border-r p-2 flex items-center">
                  <span className="text-xs font-medium truncate">{studio.name}</span>
                </div>
                <div className="flex-1 relative">
                  {/* Hour grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {HOURS.map((h) => (
                      <div key={h} className="flex-1 border-r border-dashed border-muted" />
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
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(STATUS_BAR_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-6 rounded ${color}`} />
            <span className="capitalize">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
