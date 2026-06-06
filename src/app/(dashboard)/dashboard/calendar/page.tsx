"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  where,
  Timestamp,
} from "@/lib/firestore";
import { logAudit } from "@/lib/audit";
import { getAppSettings } from "@/lib/settings";
import { useAuthStore } from "@/store/auth-store";
import type { CalendarEvent, LeaveRequest, Task, EventType, EventPriority, EventScope, RecurrenceFrequency } from "@/types";
import type { Holiday } from "@/lib/settings";
import {
  EVENT_CATEGORIES,
  MANUAL_EVENT_TYPES,
  categoryMeta,
  eventToItems,
  leaveToItem,
  taskToItem,
  holidayToItem,
  itemsForDay,
  dayStart,
  addDays,
  sameDay,
  type CalendarItem,
} from "@/lib/calendar-utils";
import { exportToCSV, exportToExcel } from "@/lib/asset-export-utils";
import { exportToICS, exportMonthGridToPDF } from "@/lib/calendar-export-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import {
  Plus, ChevronLeft, ChevronRight, Trash2, Pencil, Copy, ExternalLink,
  Download, Archive, RotateCcw, MapPin, Clock, Repeat,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const REMINDER_OPTIONS = [
  { value: "0", label: "No reminder" },
  { value: "15", label: "15 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

type FormState = {
  title: string;
  description: string;
  type: EventType;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  priority: EventPriority;
  scope: EventScope;
  color: string;
  location: string;
  reminderMinutes: string;
  recurrenceFreq: RecurrenceFrequency;
  recurrenceInterval: string;
  recurrenceUntil: string;
};

const emptyForm: FormState = {
  title: "", description: "", type: "meeting", startDate: "", endDate: "",
  startTime: "", endTime: "", isAllDay: true, priority: "medium", scope: "company",
  color: "", location: "", reminderMinutes: "0", recurrenceFreq: "none",
  recurrenceInterval: "1", recurrenceUntil: "",
};

export default function CalendarPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [events, setEvents] = useState<(CalendarEvent & { id: string })[]>([]);
  const [leaves, setLeaves] = useState<(LeaveRequest & { id: string })[]>([]);
  const [tasks, setTasks] = useState<(Task & { id: string })[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string; mode: "archive" | "delete" } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [scopeFilter, setScopeFilter] = useState<Set<EventScope>>(new Set());
  const [showLeaves, setShowLeaves] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [showHolidays, setShowHolidays] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [eventData, leaveData, taskData, settings] = await Promise.all([
        getDocuments<CalendarEvent>("calendar_events"),
        getDocuments<LeaveRequest>("leave_requests", [where("status", "==", "approved")]),
        getDocuments<Task>("tasks"),
        getAppSettings(),
      ]);
      setEvents(eventData);
      setLeaves(leaveData);
      setTasks(taskData);
      setHolidays(settings.holidays);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Visible window (month, padded so multi-day/recurring events resolve fully).
  const rangeStart = dayStart(new Date(year, month, 1 - firstDay));
  const rangeEnd = dayStart(new Date(year, month, daysInMonth + (6 - new Date(year, month, daysInMonth).getDay())));

  // Build the unified, filtered item list for the visible window.
  // (React Compiler memoizes this automatically.)
  const buildItems = (): CalendarItem[] => {
    const list: CalendarItem[] = [];
    for (const e of events) {
      if (e.isArchived) continue;
      list.push(...eventToItems(e, rangeStart, rangeEnd));
    }
    if (showLeaves) for (const l of leaves) { const it = leaveToItem(l); if (it) list.push(it); }
    if (showTasks) for (const t of tasks) { const it = taskToItem(t); if (it) list.push(it); }
    if (showHolidays) for (const h of holidays) list.push(holidayToItem(h));

    return list.filter((it) => {
      const key = it.source === "task" ? "task" : it.type;
      if (categoryFilter.size > 0 && !categoryFilter.has(key)) return false;
      if (scopeFilter.size > 0 && it.scope && !scopeFilter.has(it.scope)) return false;
      return true;
    });
  };
  const items = buildItems();

  // Grid cells (Sunday-first, padded to full weeks).
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (day: number) => sameDay(today, new Date(year, month, day));
  const monthName = currentMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const auditUser = () =>
    user ? { uid: user.uid, firstName: user.firstName, lastName: user.lastName } : null;

  // ── Form helpers ────────────────────────────────────────────────────────────
  const openCreate = (day?: number) => {
    const base = day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
    setEditingId(null);
    setForm({ ...emptyForm, startDate: base, endDate: base });
    setSelected(null);
    setShowForm(true);
  };

  const openEdit = (e: CalendarEvent & { id: string }) => {
    const toKey = (ts?: { seconds?: number }) =>
      ts?.seconds ? new Date(ts.seconds * 1000).toISOString().slice(0, 10) : "";
    setEditingId(e.id);
    setForm({
      title: e.title,
      description: e.description ?? "",
      type: e.type,
      startDate: toKey(e.startDate),
      endDate: toKey(e.endDate),
      startTime: e.startTime ?? "",
      endTime: e.endTime ?? "",
      isAllDay: e.isAllDay ?? true,
      priority: e.priority ?? "medium",
      scope: e.scope ?? "company",
      color: e.color ?? "",
      location: e.location ?? "",
      reminderMinutes: String(e.reminderMinutes ?? 0),
      recurrenceFreq: e.recurrence?.frequency ?? "none",
      recurrenceInterval: String(e.recurrence?.interval ?? 1),
      recurrenceUntil: e.recurrence?.until ?? "",
    });
    setSelected(null);
    setShowForm(true);
  };

  const createReminder = async (title: string, start: Date, minutes: number) => {
    try {
      await createDocument("notifications", {
        recipientId: user?.uid ?? "",
        type: "system",
        title: "Event reminder set",
        message: `Reminder for "${title}" on ${formatDate(start)} (${minutes >= 1440 ? "1 day" : minutes >= 60 ? "1 hour" : `${minutes} min`} before).`,
        link: "/dashboard/calendar",
        isRead: false,
        metadata: { entityType: "calendar_event" },
      });
    } catch (error) {
      console.error("Reminder error:", error);
    }
  };

  const handleSave = async () => {
    if (!form.title || !form.startDate) {
      toast("error", "Title and start date are required");
      return;
    }
    const start = new Date(form.startDate);
    const end = form.endDate ? new Date(form.endDate) : start;
    const reminderMinutes = Number(form.reminderMinutes) || 0;

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim(),
      type: form.type,
      startDate: Timestamp.fromDate(start),
      endDate: Timestamp.fromDate(end),
      startTime: form.isAllDay ? "" : form.startTime,
      endTime: form.isAllDay ? "" : form.endTime,
      isAllDay: form.isAllDay,
      priority: form.priority,
      scope: form.scope,
      color: form.color,
      location: form.location.trim(),
      reminderMinutes,
      recurrence: {
        frequency: form.recurrenceFreq,
        interval: Number(form.recurrenceInterval) || 1,
        until: form.recurrenceUntil || null,
      },
      status: "scheduled",
      assignedStaff: [],
      requirements: [],
      isArchived: false,
      updatedAt: Timestamp.now(),
    };

    try {
      if (editingId) {
        const prev = events.find((e) => e.id === editingId);
        await updateDocument("calendar_events", editingId, payload);
        await logAudit("update", "calendar", "calendar_event", editingId, `Updated event "${form.title}"`, auditUser(), {
          previousData: prev as Record<string, unknown> | undefined,
          newData: payload,
        });
        toast("success", "Event updated");
      } else {
        payload.createdBy = user?.uid ?? "";
        payload.createdAt = Timestamp.now();
        const id = await createDocument("calendar_events", payload);
        await logAudit("create", "calendar", "calendar_event", id, `Created event "${form.title}"`, auditUser(), { newData: payload });
        if (reminderMinutes > 0) await createReminder(form.title, start, reminderMinutes);
        toast("success", "Event added");
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      fetchAll();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save event");
    }
  };

  const handleDuplicate = (e: CalendarEvent & { id: string }) => {
    openEdit(e);
    setEditingId(null);
    setForm((f) => ({ ...f, title: `${f.title} (Copy)` }));
  };

  const executeArchive = async (id: string) => {
    setConfirmDialog(null);
    try {
      const ev = events.find((e) => e.id === id);
      await updateDocument("calendar_events", id, { isArchived: true, updatedAt: Timestamp.now() });
      await logAudit("delete", "calendar", "calendar_event", id, `Archived event "${ev?.title ?? id}"`, auditUser(), { previousData: ev as Record<string, unknown> | undefined });
      toast("success", "Event archived");
      setSelected(null);
      fetchAll();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to archive event");
    }
  };

  const executeDelete = async (id: string) => {
    setConfirmDialog(null);
    try {
      const ev = events.find((e) => e.id === id);
      await deleteDocument("calendar_events", id);
      await logAudit("delete", "calendar", "calendar_event", id, `Permanently deleted event "${ev?.title ?? id}"`, auditUser());
      toast("success", "Event deleted");
      fetchAll();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete event");
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const ev = events.find((e) => e.id === id);
      await updateDocument("calendar_events", id, { isArchived: false, updatedAt: Timestamp.now() });
      await logAudit("update", "calendar", "calendar_event", id, `Restored event "${ev?.title ?? id}"`, auditUser());
      toast("success", "Event restored");
      fetchAll();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to restore event");
    }
  };

  // ── Exports (current month only) ──────────────────────────────────────────────
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month, daysInMonth);
  const monthItems = items.filter(
    (it) => it.start.getTime() <= monthEnd.getTime() && it.end.getTime() >= monthStart.getTime()
  );

  const exportRows = () =>
    monthItems
      .slice()
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((it) => ({
        Title: it.title,
        Category: categoryMeta(it.type).label,
        Source: it.source,
        Start: formatDate(it.start),
        End: formatDate(it.end),
        Time: it.isAllDay ? "All day" : `${it.startTime ?? ""}${it.endTime ? ` - ${it.endTime}` : ""}`,
        Priority: it.priority ?? "",
        Scope: it.scope ?? "",
        Location: it.location ?? "",
      }));

  const fileBase = `calendar-${monthName.toLowerCase().replace(/\s+/g, "-")}`;

  // ── Upcoming (grouped) ────────────────────────────────────────────────────────
  const buildUpcoming = () => {
    const now = dayStart(new Date());
    const tomorrow = addDays(now, 1);
    const weekEnd = addDays(now, 7);
    const monthEnd = addDays(now, 31);
    const future = items
      .filter((it) => it.end.getTime() >= now.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const groups: { label: string; items: CalendarItem[] }[] = [
      { label: "Today", items: [] },
      { label: "Tomorrow", items: [] },
      { label: "This Week", items: [] },
      { label: "This Month", items: [] },
    ];
    const seen = new Set<string>();
    for (const it of future) {
      if (seen.has(it.key)) continue;
      seen.add(it.key);
      const s = it.start.getTime() < now.getTime() ? now : it.start;
      if (sameDay(s, now)) groups[0].items.push(it);
      else if (sameDay(s, tomorrow)) groups[1].items.push(it);
      else if (s.getTime() <= weekEnd.getTime()) groups[2].items.push(it);
      else if (s.getTime() <= monthEnd.getTime()) groups[3].items.push(it);
    }
    return groups.filter((g) => g.items.length > 0);
  };
  const upcoming = buildUpcoming();

  const toggleSet = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const archivedEvents = events.filter((e) => e.isArchived);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowArchived((s) => !s)}>
            <Archive className="h-4 w-4 mr-2" /> {showArchived ? "Hide Archived" : "Archived"}
            {archivedEvents.length > 0 && <span className="ml-1 text-xs text-gray-400">({archivedEvents.length})</span>}
          </Button>
          <div className="relative">
            <Button variant="outline" onClick={() => setShowExport((s) => !s)}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
            {showExport && (
              <div className="absolute right-0 mt-1 w-44 rounded-md border bg-white shadow-lg z-20 py-1 text-sm">
                {[
                  { label: "PDF (calendar)", fn: () => exportMonthGridToPDF(year, month, monthItems, fileBase) },
                  { label: "Excel (list)", fn: () => exportToExcel(exportRows(), fileBase) },
                  { label: "CSV (list)", fn: () => exportToCSV(exportRows(), fileBase) },
                  { label: "ICS (calendar app)", fn: () => exportToICS(monthItems, fileBase) },
                ].map((o) => (
                  <button
                    key={o.label}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
                    onClick={() => { o.fn(); setShowExport(false); }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button onClick={() => openCreate()}><Plus className="h-4 w-4 mr-2" /> Add Event</Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setCategoryFilter(new Set())}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${categoryFilter.size === 0 ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600"}`}
            >
              All
            </button>
            {EVENT_CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => toggleSet(categoryFilter, c.value, setCategoryFilter)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${categoryFilter.has(c.value) ? c.badge + " border-transparent" : "bg-white text-gray-500"}`}
              >
                {c.label}
              </button>
            ))}
            <button
              onClick={() => toggleSet(categoryFilter, "task", setCategoryFilter)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${categoryFilter.has("task") ? "bg-red-100 text-red-700 border-transparent" : "bg-white text-gray-500"}`}
            >
              Tasks
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1">Scope:</span>
            {(["personal", "department", "company"] as EventScope[]).map((s) => (
              <button
                key={s}
                onClick={() => toggleSet(scopeFilter, s, setScopeFilter)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${scopeFilter.has(s) ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500"}`}
              >
                {s === "personal" ? "My Events" : s === "department" ? "Department" : "Company"}
              </button>
            ))}
            <span className="text-xs text-gray-400 ml-3 mr-1">Sources:</span>
            <button onClick={() => setShowLeaves((v) => !v)} className={`px-2.5 py-1 rounded-full text-xs border ${showLeaves ? "bg-amber-100 text-amber-700 border-transparent" : "bg-white text-gray-400"}`}>Leaves</button>
            <button onClick={() => setShowTasks((v) => !v)} className={`px-2.5 py-1 rounded-full text-xs border ${showTasks ? "bg-red-100 text-red-700 border-transparent" : "bg-white text-gray-400"}`}>Tasks</button>
            <button onClick={() => setShowHolidays((v) => !v)} className={`px-2.5 py-1 rounded-full text-xs border ${showHolidays ? "bg-green-100 text-green-700 border-transparent" : "bg-white text-gray-400"}`}>Holidays</button>
          </div>
        </CardContent>
      </Card>

      {/* Calendar grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex items-center gap-2">
              <CardTitle>{monthName}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())} className="text-xs">Today</Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded overflow-hidden">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-gray-50 p-2 text-center text-xs font-medium text-gray-600">{d}</div>
            ))}
            {cells.map((day, i) => {
              const dayItems = day ? itemsForDay(items, new Date(year, month, day)) : [];
              return (
                <div
                  key={i}
                  onClick={() => day && openCreate(day)}
                  className={`bg-white p-1 min-h-[92px] ${!day ? "bg-gray-50" : "cursor-pointer hover:bg-gray-50"} ${day && isToday(day) ? "ring-2 ring-blue-500 ring-inset" : ""}`}
                >
                  {day && (
                    <>
                      <span className={`text-xs ${isToday(day) ? "bg-blue-500 text-white rounded-full px-1.5 py-0.5" : "text-gray-700"}`}>{day}</span>
                      <div className="mt-1 space-y-0.5">
                        {dayItems.slice(0, 3).map((it) => {
                          const meta = categoryMeta(it.type);
                          const spanStart = sameDay(it.start, new Date(year, month, day)) || day === 1;
                          return (
                            <div
                              key={it.key}
                              className={`text-[10px] px-1 rounded truncate cursor-pointer ${meta.bar} ${!sameDay(it.start, it.end) ? "border-l-2 border-current" : ""}`}
                              style={it.color ? { backgroundColor: it.color + "22", color: it.color } : undefined}
                              title={it.title}
                              onClick={(ev) => { ev.stopPropagation(); setSelected(it); }}
                            >
                              {!it.isAllDay && it.startTime ? `${it.startTime} ` : ""}
                              {spanStart ? it.title : `↳ ${it.title}`}
                            </div>
                          );
                        })}
                        {dayItems.length > 3 && <span className="text-[10px] text-gray-400">+{dayItems.length - 3} more</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Archived */}
      {showArchived && (
        <Card>
          <CardHeader><CardTitle>Archived Events</CardTitle></CardHeader>
          <CardContent>
            {archivedEvents.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No archived events.</p>
            ) : (
              archivedEvents.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge variant={categoryMeta(e.type).badge}>{categoryMeta(e.type).label}</Badge>
                    <div>
                      <p className="font-medium text-sm">{e.title}</p>
                      <p className="text-xs text-gray-500">{e.startDate?.seconds ? formatDate(new Date(e.startDate.seconds * 1000)) : "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleRestore(e.id)}><RotateCcw className="h-4 w-4 text-green-500" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDialog({ id: e.id, mode: "delete" })}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Upcoming */}
      <Card>
        <CardHeader><CardTitle>Upcoming Events</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming events.</p>
          ) : (
            upcoming.map((g) => (
              <div key={g.label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{g.label}</p>
                {g.items.map((it) => (
                  <div key={it.key} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant={categoryMeta(it.type).badge}>{categoryMeta(it.type).label}</Badge>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{it.title}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(it.start)}{!sameDay(it.start, it.end) ? ` → ${formatDate(it.end)}` : ""}
                          {!it.isAllDay && it.startTime ? ` · ${it.startTime}` : ""}
                          {it.location ? ` · ${it.location}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(it)}><ExternalLink className="h-4 w-4 text-gray-400" /></Button>
                  </div>
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add / Edit form */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setEditingId(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Event" : "Add Event"}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <SelectRoot value={form.type} onValueChange={(v) => setForm({ ...form, type: v as EventType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MANUAL_EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{categoryMeta(t).label}</SelectItem>)}
                  </SelectContent>
                </SelectRoot>
              </div>
              <div>
                <Label>Priority</Label>
                <SelectRoot value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as EventPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["low", "medium", "high", "urgent"] as EventPriority[]).map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date *</Label><DatePicker value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
              <div><Label>End Date</Label><DatePicker value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isAllDay} onChange={(e) => setForm({ ...form, isAllDay: e.target.checked })} />
              All-day event
            </label>
            {!form.isAllDay && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Time</Label><TimePicker value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
                <div><Label>End Time</Label><TimePicker value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Scope</Label>
                <SelectRoot value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as EventScope })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">My Event</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
              <div>
                <Label>Reminder</Label>
                <SelectRoot value={form.reminderMinutes} onValueChange={(v) => setForm({ ...form, reminderMinutes: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Repeats</Label>
                <SelectRoot value={form.recurrenceFreq} onValueChange={(v) => setForm({ ...form, recurrenceFreq: v as RecurrenceFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
              {form.recurrenceFreq !== "none" && (
                <div><Label>Repeat until</Label><DatePicker value={form.recurrenceUntil} onChange={(e) => setForm({ ...form, recurrenceUntil: e.target.value })} /></div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Color</Label><Input type="color" value={form.color || "#3b82f6"} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 p-1" /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <Button onClick={handleSave} className="w-full">{editingId ? "Save Changes" : "Add Event"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader><DialogTitle>{selected.title}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={categoryMeta(selected.type).badge}>{categoryMeta(selected.type).label}</Badge>
                  {selected.priority && <Badge variant={PRIORITY_BADGE[selected.priority]}>{selected.priority}</Badge>}
                  {selected.scope && <Badge variant="bg-gray-100 text-gray-600">{selected.scope}</Badge>}
                  {selected.source !== "event" && <Badge variant="bg-gray-100 text-gray-500">{selected.source}</Badge>}
                </div>
                <p className="flex items-center gap-2 text-gray-600">
                  <Clock className="h-4 w-4" />
                  {formatDate(selected.start)}{!sameDay(selected.start, selected.end) ? ` → ${formatDate(selected.end)}` : ""}
                  {!selected.isAllDay && selected.startTime ? ` · ${selected.startTime}${selected.endTime ? ` - ${selected.endTime}` : ""}` : " · All day"}
                </p>
                {selected.location && <p className="flex items-center gap-2 text-gray-600"><MapPin className="h-4 w-4" />{selected.location}</p>}
                {selected.raw?.recurrence && selected.raw.recurrence.frequency !== "none" && (
                  <p className="flex items-center gap-2 text-gray-600"><Repeat className="h-4 w-4" />Repeats {selected.raw.recurrence.frequency}</p>
                )}
                {selected.description && <p className="text-gray-600 whitespace-pre-wrap">{selected.description}</p>}

                <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                  {selected.source === "event" && selected.raw ? (
                    <>
                      <Button size="sm" onClick={() => router.push(`/dashboard/calendar/event/${selected.id}`)}><ExternalLink className="h-4 w-4 mr-1" /> Open</Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(selected.raw!)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => handleDuplicate(selected.raw!)}><Copy className="h-4 w-4 mr-1" /> Duplicate</Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDialog({ id: selected.id, mode: "archive" })} className="text-red-500"><Archive className="h-4 w-4 mr-1" /> Archive</Button>
                    </>
                  ) : (
                    selected.href && <Link href={selected.href}><Button size="sm" variant="outline" onClick={() => setSelected(null)}><ExternalLink className="h-4 w-4 mr-1" /> Open source</Button></Link>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.mode === "delete" ? "Delete Permanently" : "Archive Event"}
        message={confirmDialog?.mode === "delete" ? "This permanently removes the event. This cannot be undone." : "Archive this event? You can restore it later from the Archived list."}
        confirmLabel={confirmDialog?.mode === "delete" ? "Delete" : "Archive"}
        variant="danger"
        onConfirm={() => {
          if (!confirmDialog) return;
          if (confirmDialog.mode === "delete") executeDelete(confirmDialog.id);
          else executeArchive(confirmDialog.id);
        }}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
