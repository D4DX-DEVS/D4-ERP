"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  createDocument,
  getDocument,
  getDocuments,
  updateDocument,
  Timestamp,
  where,
} from "@/lib/firestore";
import { Attendance, AttendanceStatus, Staff } from "@/types";
import {
  AppSettings,
  getAppSettings,
  evaluateCheckIn,
  evaluateCheckOut,
  evaluateWorkSummary,
} from "@/lib/settings";
import { useAuthStore } from "@/store/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { ArrowLeft, Clock3, MapPin, Pencil, Plus, RotateCcw, Save, ShieldAlert, TimerReset, Trash2, UserRound, X } from "lucide-react";

type Rec = Attendance & { id: string };

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "half-day", label: "Half Day" },
  { value: "late", label: "Late" },
  { value: "leave", label: "Leave" },
  { value: "wfh", label: "Work From Home" },
  { value: "on-duty", label: "On Duty" },
  { value: "public-holiday", label: "Public Holiday" },
];

const timeStr = (ts: { seconds: number } | undefined) =>
  ts ? new Date(ts.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

const timeInputValue = (ts: { seconds: number } | undefined) => {
  if (!ts) return "";
  const d = new Date(ts.seconds * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function tsFromDateTime(dateStr: string, time: string): Timestamp | undefined {
  if (!time) return undefined;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  const d = new Date(dateStr);
  d.setHours(h, m, 0, 0);
  return Timestamp.fromDate(d);
}

interface FormState {
  checkIn: string;
  checkOut: string;
  status: AttendanceStatus;
  notes: string;
}

export default function AttendanceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const staffId = params.id as string;
  const selectedDate = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [staff, setStaff] = useState<(Staff & { id: string }) | null>(null);
  const [record, setRecord] = useState<Rec | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<FormState>({ checkIn: "", checkOut: "", status: "present", notes: "" });

  const canEdit =
    !!user &&
    (user.role === "admin" ||
      (user.role === "department-head" && staff?.departmentId === user.departmentId));
  const canDelete = !!user && user.role === "admin";

  async function fetchDetail() {
    setLoading(true);
    try {
      const date = new Date(selectedDate);
      date.setHours(0, 0, 0, 0);

      const [staffData, records, appSettings] = await Promise.all([
        getDocument<Staff>("staff", staffId),
        getDocuments<Attendance>("attendance", [
          where("staffId", "==", staffId),
          where("date", "==", Timestamp.fromDate(date)),
        ]),
        getAppSettings(),
      ]);

      setStaff(staffData);
      setRecord((records[0] as Rec) || null);
      setSettings(appSettings);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load attendance detail");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, staffId]);

  function startEdit() {
    setForm({
      checkIn: timeInputValue(record?.checkIn as { seconds: number } | undefined),
      checkOut: timeInputValue(record?.checkOut as { seconds: number } | undefined),
      status: record?.status ?? "present",
      notes: record?.notes ?? record?.remarks ?? "",
    });
    setEditing(true);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const baseDate = new Date(selectedDate);
      baseDate.setHours(0, 0, 0, 0);

      const checkInTs = tsFromDateTime(selectedDate, form.checkIn);
      const checkOutTs = tsFromDateTime(selectedDate, form.checkOut);

      const data: Record<string, unknown> = {
        staffId,
        date: Timestamp.fromDate(baseDate),
        status: form.status,
        notes: form.notes.trim(),
        source: record?.source ?? "manual",
      };

      if (checkInTs) {
        data.checkIn = checkInTs;
        data.isLate = evaluateCheckIn(settings, checkInTs.toDate()).isLate;
      } else {
        data.isLate = false;
      }

      if (checkOutTs) {
        data.checkOut = checkOutTs;
        data.isEarlyDeparture = evaluateCheckOut(settings, checkOutTs.toDate()).isEarlyDeparture;
      } else {
        data.isEarlyDeparture = false;
      }

      if (checkInTs && checkOutTs) {
        const summary = evaluateWorkSummary(settings, checkInTs.toDate().getTime(), checkOutTs.toDate().getTime());
        data.workingHours = summary.workingHours;
        data.overtimeHours = summary.overtimeHours;
      } else {
        data.workingHours = 0;
        data.overtimeHours = 0;
      }

      if (record) {
        await updateDocument("attendance", record.id, data);
        toast("success", "Attendance updated");
      } else {
        await createDocument("attendance", data);
        toast("success", "Attendance added");
      }
      setEditing(false);
      await fetchDetail();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  async function handleSoftDelete() {
    if (!record) return;
    setConfirmDelete(false);
    try {
      await updateDocument("attendance", record.id, {
        isDeleted: true,
        deletedAt: Timestamp.now(),
        deletedBy: user ? `${user.firstName} ${user.lastName}` : "",
      });
      toast("success", "Attendance record removed");
      await fetchDetail();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to remove record");
    }
  }

  async function handleRestore() {
    if (!record) return;
    try {
      await updateDocument("attendance", record.id, { isDeleted: false });
      toast("success", "Attendance record restored");
      await fetchDetail();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to restore record");
    }
  }

  if (loading) return <PageLoader />;
  if (!staff) return null;

  const flagCount = (record?.isLate ? 1 : 0) + (record?.isEarlyDeparture ? 1 : 0);

  return (
    <div className="space-y-6">
      <ListingHeader
        title={`${staff.firstName} ${staff.lastName}`}
        description={`Attendance detail for ${selectedDate}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/attendance?date=${selectedDate}`}>
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            {canEdit && !editing && !record?.isDeleted ? (
              record ? (
                <Button variant="outline" onClick={startEdit}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              ) : (
                <Button onClick={startEdit}>
                  <Plus className="h-4 w-4" />
                  Add Attendance
                </Button>
              )
            ) : null}
            {canDelete && record && !record.isDeleted && !editing ? (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            ) : null}
            {canEdit && record?.isDeleted ? (
              <Button variant="outline" onClick={handleRestore}>
                <RotateCcw className="h-4 w-4" />
                Restore
              </Button>
            ) : null}
          </div>
        }
      />

      {record?.isDeleted ? (
        <div className="rounded-[20px] border border-rose-100 bg-rose-50/70 px-4 py-3 text-sm text-rose-700">
          This record was removed{record.deletedBy ? ` by ${record.deletedBy}` : ""}. It is hidden from the register
          until restored.
        </div>
      ) : null}

      <ListingStatGrid>
        <ListingStatCard icon={<UserRound className="h-5 w-5" />} label="Role" value={staff.role.replace("-", " ")} toneClassName="bg-sky-50 text-sky-700" meta={staff.designation || "Staff member"} />
        <ListingStatCard icon={<Clock3 className="h-5 w-5" />} label="Check In" value={timeStr(record?.checkIn as { seconds: number } | undefined)} toneClassName="bg-emerald-50 text-emerald-700" meta="First recorded punch" />
        <ListingStatCard icon={<TimerReset className="h-5 w-5" />} label="Check Out" value={timeStr(record?.checkOut as { seconds: number } | undefined)} toneClassName="bg-indigo-50 text-indigo-700" meta="Last recorded punch" />
        <ListingStatCard icon={<ShieldAlert className="h-5 w-5" />} label="Flags" value={flagCount}
          toneClassName="bg-amber-50 text-amber-700" meta={record ? `${record.isLate ? "Late" : "On time"}${record.isEarlyDeparture ? " · Early departure" : ""}` : "No record"} />
      </ListingStatGrid>

      {editing ? (
        <ListingPanel title={record ? "Edit Attendance" : "Add Attendance"} description="Times use the office schedule to recompute hours, overtime and flags.">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <Label>Check In</Label>
              <Input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
            </div>
            <div>
              <Label>Check Out</Label>
              <Input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                options={STATUS_OPTIONS}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as AttendanceStatus })}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Reason / remarks" />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </ListingPanel>
      ) : (
        <ListingPanel title="Day Summary" description="Detailed attendance snapshot for the selected date.">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4 rounded-[24px] border border-white/70 bg-white/70 p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Status</p>
                <div className="mt-2">
                  <Badge variant={record ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                    {record?.status || "absent"}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Working Hours</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{record?.workingHours ? `${record.workingHours.toFixed(1)} hours` : "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Overtime</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{record?.overtimeHours ? `${record.overtimeHours.toFixed(1)} hours` : "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Flags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {record?.isLate ? <Badge variant="bg-amber-100 text-amber-700">Late arrival</Badge> : null}
                  {record?.isEarlyDeparture ? <Badge variant="bg-yellow-100 text-yellow-700">Early departure</Badge> : null}
                  {!record?.isLate && !record?.isEarlyDeparture ? <span className="text-sm text-slate-500">No flags for this day.</span> : null}
                </div>
              </div>
              {record?.notes || record?.remarks ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Notes</p>
                  <p className="mt-2 text-sm text-slate-600">{record.notes || record.remarks}</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-[24px] border border-white/70 bg-white/70 p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Check In Location</p>
                <p className="mt-2 text-sm text-slate-600">
                  {record?.checkInLocation ? `${record.checkInLocation.lat}, ${record.checkInLocation.lng}` : "Location not captured"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Check Out Location</p>
                <p className="mt-2 text-sm text-slate-600">
                  {record?.checkOutLocation ? `${record.checkOutLocation.lat}, ${record.checkOutLocation.lng}` : "Location not captured"}
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-[20px] bg-slate-50/90 p-4 text-sm text-slate-600">
                <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                <span>Geo tags are shown when location access was granted during check-in or check-out.</span>
              </div>
            </div>
          </div>
        </ListingPanel>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Remove attendance record"
        message="This will hide the record from the register. You can restore it later. Continue?"
        confirmLabel="Remove"
        onConfirm={handleSoftDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}