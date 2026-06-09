"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader } from "@/components/ui/listing";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/loading";
import { CalendarClock } from "lucide-react";
import type { StudioBooking, Studio } from "@/types";

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
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-[170px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Studio</Label>
          <Select
            value={selectedStudio}
            onChange={(e) => setSelectedStudio(e.target.value)}
            className="w-[180px]"
            options={[
              { value: "all", label: "All Studios" },
              ...studios.map((s) => ({ value: s.id!, label: s.name })),
            ]}
          />
        </div>
        <div className="ml-auto rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm">
          <span className="text-teal-600">Occupancy: </span>
          <span className="font-semibold text-teal-700">{occupancy}%</span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : displayStudios.length === 0 ? (
        <Card><CardContent><EmptyState icon={<CalendarClock className="h-12 w-12" />} title="No studios found" /></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {displayStudios.map((studio) => {
            const slots = getAvailability(studio.id!);
            const studioBooked = activeBookings.filter((b) => b.studioId === studio.id).length;
            return (
              <Card key={studio.id}>
                <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-slate-900">{studio.name}</h4>
                  <span className="text-xs text-slate-500">{studioBooked} bookings</span>
                </div>

                {/* Visual blocks */}
                <div className="flex gap-0.5 h-10 rounded-lg overflow-hidden border border-slate-100">
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
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        {formatMinutes(slot.start)} – {formatMinutes(slot.end)}
                      </span>
                    ))}
                </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
