"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader } from "@/components/ui/listing";
import type { StudioBooking, Studio } from "@/types";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8-22

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export default function StudioAvailabilityPage() {
  const [bookings, setBookings] = useState<StudioBooking[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudio, setSelectedStudio] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);

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

  const activeBookings = bookings.filter(
    (b) =>
      b.date === selectedDate &&
      b.status !== "cancelled" &&
      b.status !== "rejected" &&
      (selectedStudio === "all" || b.studioId === selectedStudio)
  );

  // Calculate availability slots
  const getAvailability = (studioId: string) => {
    const studioBookings = activeBookings
      .filter((b) => b.studioId === studioId)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const slots: { start: number; end: number; type: "free" | "booked"; booking?: StudioBooking }[] = [];
    let cursor = 8 * 60; // start at 8AM

    for (const b of studioBookings) {
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      if (bStart > cursor) {
        slots.push({ start: cursor, end: bStart, type: "free" });
      }
      slots.push({ start: Math.max(bStart, cursor), end: bEnd, type: "booked", booking: b });
      cursor = Math.max(cursor, bEnd);
    }
    if (cursor < 22 * 60) {
      slots.push({ start: cursor, end: 22 * 60, type: "free" });
    }
    return slots;
  };

  const displayStudios = selectedStudio === "all" ? studios : studios.filter((s) => s.id === selectedStudio);

  // Occupancy calculation
  const totalBookedMinutes = activeBookings.reduce((sum, b) => {
    return sum + (timeToMinutes(b.endTime) - timeToMinutes(b.startTime));
  }, 0);
  const totalAvailableMinutes = displayStudios.length * 14 * 60; // 14h per studio
  const occupancy = totalAvailableMinutes > 0
    ? Math.round((totalBookedMinutes / totalAvailableMinutes) * 100)
    : 0;

  function formatMinutes(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Studio Availability"
        description="Check available time slots for studios."
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-medium block mb-1">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Studio</label>
          <select
            value={selectedStudio}
            onChange={(e) => setSelectedStudio(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Studios</option>
            {studios.map((s) => (
              <option key={s.id} value={s.id!}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Occupancy: </span>
          <span className="font-semibold">{occupancy}%</span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : displayStudios.length === 0 ? (
        <p className="text-sm text-muted-foreground">No studios found.</p>
      ) : (
        <div className="space-y-4">
          {displayStudios.map((studio) => {
            const slots = getAvailability(studio.id!);
            const studioBooked = activeBookings.filter((b) => b.studioId === studio.id).length;
            return (
              <div key={studio.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">{studio.name}</h4>
                  <span className="text-xs text-muted-foreground">{studioBooked} bookings</span>
                </div>

                {/* Visual blocks */}
                <div className="flex gap-0.5 h-10 rounded-lg overflow-hidden border">
                  {slots.map((slot, i) => {
                    const width = ((slot.end - slot.start) / (14 * 60)) * 100;
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-center text-[9px] font-medium transition-colors ${
                          slot.type === "free"
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-700 hover:bg-red-200"
                        }`}
                        style={{ width: `${width}%` }}
                        title={
                          slot.type === "free"
                            ? `Free: ${formatMinutes(slot.start)} – ${formatMinutes(slot.end)}`
                            : `Booked: ${slot.booking?.purpose || ""} (${formatMinutes(slot.start)} – ${formatMinutes(slot.end)})`
                        }
                      >
                        {width > 8 && (
                          <span className="truncate px-1">
                            {slot.type === "free" ? "Free" : slot.booking?.purpose || "Booked"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Slot list */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {slots
                    .filter((s) => s.type === "free" && (s.end - s.start) >= 30)
                    .map((slot, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs text-green-700">
                        {formatMinutes(slot.start)} – {formatMinutes(slot.end)}
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
