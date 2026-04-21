"use client";

import { useEffect, useState } from "react";
import { getDocuments, createDocument, deleteDocument, Timestamp } from "@/lib/firestore";
import { CalendarEvent } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { Plus, Calendar, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/toast";

const EVENT_TYPES = ["meeting", "deadline", "event", "holiday", "reminder", "shoot", "delivery"] as const;
const TYPE_COLORS: Record<string, string> = {
  meeting: "bg-blue-100 text-blue-700",
  deadline: "bg-red-100 text-red-700",
  event: "bg-purple-100 text-purple-700",
  holiday: "bg-green-100 text-green-700",
  reminder: "bg-yellow-100 text-yellow-700",
  shoot: "bg-pink-100 text-pink-700",
  delivery: "bg-orange-100 text-orange-700",
};

export default function CalendarPage() {
  const [events, setEvents] = useState<(CalendarEvent & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [form, setForm] = useState({
    title: "", description: "", type: "meeting" as string,
    startDate: "", endDate: "", location: "",
  });

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const data = await getDocuments<CalendarEvent>("calendar_events");
      setEvents(data);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load calendar events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvents(); }, []);

  const handleAdd = async () => {
    if (!form.title || !form.startDate) return;
    await createDocument("calendar_events", {
      title: form.title,
      description: form.description,
      type: form.type,
      startDate: Timestamp.fromDate(new Date(form.startDate)),
      endDate: form.endDate ? Timestamp.fromDate(new Date(form.endDate)) : null,
      location: form.location,
      isAllDay: true,
      createdAt: Timestamp.now(),
    });
    setForm({ title: "", description: "", type: "meeting", startDate: "", endDate: "", location: "" });
    setShowAdd(false);
    toast("success", "Event added");
    fetchEvents();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    try {
      await deleteDocument("calendar_events", id);
      toast("success", "Event deleted");
      fetchEvents();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete event");
    }
  };

  // Calendar grid logic
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null as null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  if (weeks.length > 0 && weeks[weeks.length - 1].length < 7) {
    weeks[weeks.length - 1] = [...weeks[weeks.length - 1], ...Array(7 - weeks[weeks.length - 1].length).fill(null)];
  }

  const getEventsForDay = (day: number) => {
    return events.filter((e) => {
      const eDate = e.startDate?.seconds ? new Date(e.startDate.seconds * 1000) : null;
      return eDate && eDate.getFullYear() === year && eDate.getMonth() === month && eDate.getDate() === day;
    });
  };

  const today = new Date();
  const isToday = (day: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const monthName = currentMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Event</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Event</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div>
                <Label>Type</Label>
                <SelectRoot value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                  </SelectContent>
                </SelectRoot>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
                <div><Label>End Date</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
              </div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <Button onClick={handleAdd} className="w-full">Add Event</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <CardTitle>{monthName}</CardTitle>
            <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded overflow-hidden">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-gray-50 p-2 text-center text-xs font-medium text-gray-600">{d}</div>
            ))}
            {weeks.flat().map((day, i) => {
              const dayEvents = day ? getEventsForDay(day) : [];
              return (
                <div
                  key={i}
                  className={`bg-white p-1 min-h-[80px] ${!day ? "bg-gray-50" : ""} ${day && isToday(day) ? "ring-2 ring-blue-500 ring-inset" : ""}`}
                >
                  {day && (
                    <>
                      <span className={`text-xs ${isToday(day) ? "bg-blue-500 text-white rounded-full px-1.5 py-0.5" : "text-gray-700"}`}>
                        {day}
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, 2).map((e) => (
                          <div
                            key={e.id}
                            className={`text-[10px] px-1 rounded truncate cursor-pointer ${TYPE_COLORS[e.type] || "bg-gray-100"}`}
                            title={e.title}
                            onClick={() => handleDelete(e.id)}
                          >
                            {e.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && <span className="text-[10px] text-gray-400">+{dayEvents.length - 2} more</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events */}
      <Card>
        <CardHeader><CardTitle>Upcoming Events</CardTitle></CardHeader>
        <CardContent>
          {events
            .filter((e) => e.startDate?.seconds && e.startDate.seconds * 1000 >= Date.now())
            .sort((a, b) => (a.startDate?.seconds || 0) - (b.startDate?.seconds || 0))
            .slice(0, 10)
            .map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <Badge variant={TYPE_COLORS[e.type] || "bg-gray-100 text-gray-700"}>{e.type}</Badge>
                  <div>
                    <p className="font-medium text-sm">{e.title}</p>
                    <p className="text-xs text-gray-500">
                      {e.startDate?.seconds ? formatDate(new Date(e.startDate.seconds * 1000)) : "—"}
                      {e.location && ` · ${e.location}`}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(e.id)}>
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
