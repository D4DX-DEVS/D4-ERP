"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createDocument,
  getDocuments,
  updateDocument,
  Timestamp,
  where,
} from "@/lib/firestore";
import { AttendanceCorrection, AttendanceStatus, Staff } from "@/types";
import {
  AppSettings,
  getAppSettings,
  evaluateCheckIn,
  evaluateCheckOut,
  evaluateWorkSummary,
} from "@/lib/settings";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, ClipboardEdit, Clock3, Inbox, X } from "lucide-react";

type Correction = AttendanceCorrection & { id: string };

const STATUS_FILTERS = ["pending", "approved", "rejected"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function tsFromDateTime(base: Date, time?: string): Timestamp | undefined {
  if (!time) return undefined;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return Timestamp.fromDate(d);
}

export default function AttendanceCorrectionsPage() {
  const { user, authorized, isLoading } = useRoleGuard(["admin", "department-head"]);
  const { toast } = useToast();

  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, Staff & { id: string }>>({});
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [processing, setProcessing] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<Correction | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");

  const isDeptHead = user?.role === "department-head";

  async function loadData() {
    setLoading(true);
    try {
      const [list, staffList, appSettings] = await Promise.all([
        getDocuments<AttendanceCorrection>("attendance_corrections", [where("status", "==", filter)]),
        getDocuments<Staff>("staff", []),
        getAppSettings(),
      ]);

      const map: Record<string, Staff & { id: string }> = {};
      for (const s of staffList) map[s.id] = s as Staff & { id: string };

      let visible = list as Correction[];
      if (isDeptHead && user?.departmentId) {
        visible = visible.filter((c) => map[c.staffId]?.departmentId === user.departmentId);
      }
      visible.sort((a, b) => (b.date?.seconds ?? 0) - (a.date?.seconds ?? 0));

      setStaffMap(map);
      setCorrections(visible);
      setSettings(appSettings);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load correction requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authorized) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, filter]);

  const pendingCount = useMemo(
    () => (filter === "pending" ? corrections.length : 0),
    [filter, corrections.length]
  );

  function staffName(c: Correction) {
    const s = staffMap[c.staffId];
    return c.staffName || (s ? `${s.firstName} ${s.lastName}` : c.staffId);
  }

  async function notifyStaff(c: Correction, approved: boolean, remarks?: string) {
    try {
      const dateLabel = new Date((c.date?.seconds ?? 0) * 1000).toLocaleDateString("en-IN");
      await createDocument("notifications", {
        recipientId: c.staffId,
        type: "system",
        title: approved ? "Attendance correction approved" : "Attendance correction rejected",
        message: approved
          ? `Your correction request for ${dateLabel} has been approved.`
          : `Your correction request for ${dateLabel} was rejected.${remarks ? ` Note: ${remarks}` : ""}`,
        link: "/staff-portal/attendance",
        isRead: false,
        metadata: { entityId: c.id, entityType: "attendance_correction" },
      });
    } catch (error) {
      console.error("Notification error:", error);
    }
  }

  async function handleApprove(c: Correction) {
    if (!settings) return;
    setProcessing(c.id);
    try {
      const base = new Date((c.date?.seconds ?? 0) * 1000);
      base.setHours(0, 0, 0, 0);

      const existing = await getDocuments<{ id: string; status: AttendanceStatus }>("attendance", [
        where("staffId", "==", c.staffId),
        where("date", "==", Timestamp.fromDate(base)),
      ]);

      const checkInTs = tsFromDateTime(base, c.requestedCheckIn);
      const checkOutTs = tsFromDateTime(base, c.requestedCheckOut);

      const data: Record<string, unknown> = {
        staffId: c.staffId,
        date: Timestamp.fromDate(base),
        status: c.requestedStatus ?? existing[0]?.status ?? "present",
        notes: `Correction approved: ${c.reason}`,
        source: "correction",
        correctionId: c.id,
        isDeleted: false,
      };

      if (checkInTs) {
        data.checkIn = checkInTs;
        data.isLate = evaluateCheckIn(settings, checkInTs.toDate()).isLate;
      }
      if (checkOutTs) {
        data.checkOut = checkOutTs;
        data.isEarlyDeparture = evaluateCheckOut(settings, checkOutTs.toDate()).isEarlyDeparture;
      }
      if (checkInTs && checkOutTs) {
        const summary = evaluateWorkSummary(settings, checkInTs.toDate().getTime(), checkOutTs.toDate().getTime());
        data.workingHours = summary.workingHours;
        data.overtimeHours = summary.overtimeHours;
      }

      let attendanceId = existing[0]?.id;
      if (attendanceId) {
        await updateDocument("attendance", attendanceId, data);
      } else {
        attendanceId = await createDocument("attendance", data);
      }

      await updateDocument("attendance_corrections", c.id, {
        status: "approved",
        reviewedBy: user?.staffId,
        reviewedByName: user ? `${user.firstName} ${user.lastName}` : "",
        reviewDate: Timestamp.now(),
        attendanceId,
      });

      await notifyStaff(c, true);
      toast("success", "Correction approved and attendance updated");
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to approve correction");
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    const c = rejectTarget;
    setProcessing(c.id);
    try {
      await updateDocument("attendance_corrections", c.id, {
        status: "rejected",
        reviewedBy: user?.staffId,
        reviewedByName: user ? `${user.firstName} ${user.lastName}` : "",
        reviewDate: Timestamp.now(),
        reviewRemarks: rejectRemarks.trim(),
      });
      await notifyStaff(c, false, rejectRemarks.trim());
      toast("success", "Correction rejected");
      setRejectTarget(null);
      setRejectRemarks("");
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to reject correction");
    } finally {
      setProcessing(null);
    }
  }

  if (isLoading || !authorized) return <PageLoader />;
  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Attendance Corrections"
        description={isDeptHead ? "Review correction requests from your department." : "Review attendance correction requests."}
      />

      <ListingStatGrid>
        <ListingStatCard icon={<Inbox className="h-5 w-5" />} label="Pending" value={pendingCount} toneClassName="bg-amber-50 text-amber-700" meta="Awaiting review" />
        <ListingStatCard icon={<ClipboardEdit className="h-5 w-5" />} label="Showing" value={corrections.length} toneClassName="bg-sky-50 text-sky-700" meta={`${filter} requests`} />
        <ListingStatCard icon={<Clock3 className="h-5 w-5" />} label="Scope" value={isDeptHead ? "Department" : "All staff"} toneClassName="bg-indigo-50 text-indigo-700" meta="Visibility" />
      </ListingStatGrid>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className="capitalize">
            {f}
          </Button>
        ))}
      </div>

      <ListingPanel title="Requests" description="Approve to apply changes to the register; reject to dismiss." contentClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Check In</TableHead>
              <TableHead>Check Out</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {corrections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No {filter} correction requests.
                </TableCell>
              </TableRow>
            ) : (
              corrections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-slate-950">{staffName(c)}</TableCell>
                  <TableCell>{new Date((c.date?.seconds ?? 0) * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                  <TableCell>{c.requestedCheckIn || "—"}</TableCell>
                  <TableCell>{c.requestedCheckOut || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="bg-slate-100 text-slate-700">{c.requestedStatus ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate" title={c.reason}>{c.reason}</TableCell>
                  <TableCell className="text-right">
                    {c.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => handleApprove(c)} disabled={processing === c.id}>
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setRejectTarget(c); setRejectRemarks(""); }} disabled={processing === c.id}>
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Badge variant={c.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                        {c.status}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListingPanel>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) setRejectTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject correction request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Remarks (optional)</Label>
              <Textarea
                rows={3}
                value={rejectRemarks}
                onChange={(e) => setRejectRemarks(e.target.value)}
                placeholder="Reason for rejection (shared with the employee)"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReject} disabled={processing === rejectTarget?.id}>
                Reject Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
