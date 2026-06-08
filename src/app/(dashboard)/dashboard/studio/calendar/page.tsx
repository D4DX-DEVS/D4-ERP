"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader } from "@/components/ui/listing";
import type { StudioBooking } from "@/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_DOT_COLORS: Record<string, string> = {
  pending: "bg-yellow-400",
  approved: "bg-emerald-500",
  confirmed: "bg-blue-500",
  "in-progress": "bg-amber-500",
  completed: "bg-green-600",
  rejected: "bg-red-400",
  cancelled: "bg-slate-400",
};

export default function StudioCalendarPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<StudioBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week">("month");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    async function fetch() {
      try {
        const docs = await getDocuments<StudioBooking>("studio_bookings", [orderBy("date", "asc")]);
        setBookings(docs);
      } catch (error) {
        console.error("Failed to fetch bookings:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, []);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthLabel = currentDate.toLocaleString("en-IN", { month: "long", year: "numeric" });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const getBookingsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return bookings.filter((b) => b.date === dateStr);
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Studio Calendar"
        description="Calendar view of all studio bookings."
      />

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-md p-2 hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">{monthLabel}</h2>
          <button onClick={nextMonth} className="rounded-md p-2 hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Today
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {DAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={idx} className="border-b border-r p-2 min-h-[100px] bg-muted/10" />;
              }
              const dayBookings = getBookingsForDate(day);
              return (
                <div
                  key={idx}
                  className={`border-b border-r p-2 min-h-[100px] hover:bg-accent/20 transition-colors ${
                    isToday(day) ? "bg-primary/5" : ""
                  }`}
                >
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday(day) ? "bg-primary text-primary-foreground" : ""
                  }`}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayBookings.slice(0, 3).map((b) => (
                      <div
                        key={b.id}
                        className="w-full text-left rounded px-1 py-0.5 text-[10px] truncate hover:bg-accent flex items-center gap-1 cursor-pointer"
                        onClick={() => router.push("/dashboard/studio/bookings")}
                        title={`${b.startTime}–${b.endTime} ${b.purpose}`}
                      >
                        <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT_COLORS[b.status] || "bg-gray-400"}`} />
                        <span className="truncate">{b.startTime} {b.studioName}</span>
                      </div>
                    ))}
                    {dayBookings.length > 3 && (
                      <p className="text-[10px] text-muted-foreground px-1">+{dayBookings.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(STATUS_DOT_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
            <span className="capitalize">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
