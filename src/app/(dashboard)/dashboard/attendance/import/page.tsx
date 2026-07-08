"use client";

import { useEffect, useState } from "react";
import { useFeatureGuard } from "@/hooks/use-role-guard";
import { getDocuments, orderBy, limit } from "@/lib/firestore";
import { Staff, AttendanceImportBatch } from "@/types";
import type { ParsedEmployee } from "@/lib/attendance-import/parsers";
import { ListingHeader, ListingPanel } from "@/components/ui/listing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { Upload, FileText, Loader2, RotateCcw, CheckCircle, AlertTriangle } from "lucide-react";

type StaffRec = Staff & { id: string };
type BatchRec = AttendanceImportBatch & { id: string };

interface StaffMatch {
  staffId: string;
  matchedBy: "biometricId" | "employeeCode";
}

interface ParseResult {
  fileUrl: string;
  fileName: string;
  format: string;
  dateRange: { start: string; end: string };
  employees: ParsedEmployee[];
  matches: Record<string, StaffMatch | null>;
}

const STATUS_BADGE: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700",
  absent: "bg-rose-100 text-rose-700",
  "half-day": "bg-amber-100 text-amber-700",
  late: "bg-orange-100 text-orange-700",
  leave: "bg-blue-100 text-blue-700",
  wfh: "bg-purple-100 text-purple-700",
  "on-duty": "bg-teal-100 text-teal-700",
  "public-holiday": "bg-slate-200 text-slate-600",
};

function enumerateDates(startIso: string, endIso: string): string[] {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const end = new Date(ey, em - 1, ed);
  const dates: string[] = [];
  for (const d = new Date(sy, sm - 1, sd); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

export default function AttendanceImportPage() {
  const { authorized, isLoading } = useFeatureGuard("attendance-import");
  const { toast } = useToast();

  const [staffList, setStaffList] = useState<StaffRec[]>([]);
  const [batches, setBatches] = useState<BatchRec[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState<Record<string, number> | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<BatchRec | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const [staff, batchList] = await Promise.all([
        getDocuments<Staff>("staff"),
        getDocuments<AttendanceImportBatch>("attendance_imports", [orderBy("createdAt", "desc"), limit(20)]),
      ]);
      setStaffList(staff as StaffRec[]);
      setBatches(batchList as BatchRec[]);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load import history");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authorized) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  const staffMap = Object.fromEntries(staffList.map((s) => [s.id, s]));
  const staffOptions = staffList
    .slice()
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
    .map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName} (${s.employeeCode})` }));

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    setConfirmSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/attendance/import/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to parse PDF");
      setParsed(data);
      setMappings({});
      setOverwriteExisting(false);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to parse PDF");
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!parsed) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/attendance/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: parsed.fileUrl,
          fileName: parsed.fileName,
          format: parsed.format,
          dateRange: parsed.dateRange,
          employees: parsed.employees,
          mappings,
          overwriteExisting,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to import attendance");
      setConfirmSummary(data.summary);
      toast("success", `Imported ${data.summary.createdCount + data.summary.updatedCount} attendance records`);
      setParsed(null);
      setFile(null);
      await loadHistory();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to import attendance");
    } finally {
      setConfirming(false);
    }
  }

  async function executeRollback() {
    if (!rollbackTarget) return;
    setRollingBack(true);
    try {
      const res = await fetch("/api/attendance/import/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: rollbackTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to roll back import");
      toast("success", `Rolled back ${data.deletedCount} attendance records`);
      setRollbackTarget(null);
      await loadHistory();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to roll back import");
    } finally {
      setRollingBack(false);
    }
  }

  if (isLoading || !authorized) return <PageLoader />;

  const days = parsed ? enumerateDates(parsed.dateRange.start, parsed.dateRange.end) : [];
  const unmatchedEmployees = parsed ? parsed.employees.filter((e) => !parsed.matches[e.empCode]) : [];
  const unmatchedRemaining = unmatchedEmployees.filter((e) => !mappings[e.empCode]).length;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Import Attendance"
        description="Upload a biometric report (ESSL Basic Work Duration PDF) to import staff attendance."
      />

      <ListingPanel title="Upload report">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <label className="flex h-12 flex-1 cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 text-sm text-slate-600 hover:border-teal-400">
            <Upload className="h-4 w-4 text-slate-400" />
            {file ? file.name : "Choose a PDF report..."}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button onClick={handleParse} disabled={!file || parsing}>
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Parse PDF
          </Button>
        </div>
      </ListingPanel>

      {parsed && (
        <>
          {unmatchedEmployees.length > 0 && (
            <ListingPanel
              title={`Resolve unmatched employees (${unmatchedEmployees.length})`}
              description="Map each unrecognized employee code to a staff member. The mapping is saved for future imports."
            >
              <div className="space-y-3">
                {unmatchedEmployees.map((e) => (
                  <div key={e.empCode} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="w-56 shrink-0 text-sm">
                      <span className="font-medium text-slate-900">{e.empName}</span>
                      <span className="ml-2 text-slate-400">#{e.empCode}</span>
                    </div>
                    <div className="flex-1">
                      <Select
                        options={staffOptions}
                        value={mappings[e.empCode] || ""}
                        placeholder="Select staff member..."
                        onChange={(ev) => setMappings((m) => ({ ...m, [e.empCode]: ev.target.value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ListingPanel>
          )}

          <ListingPanel
            title={`Preview (${parsed.employees.length} employees, ${days.length} days)`}
            description={`${parsed.dateRange.start} to ${parsed.dateRange.end}`}
            contentClassName="p-0"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-slate-50/95">Employee</TableHead>
                  {days.map((d) => (
                    <TableHead key={d} className="text-center">
                      {Number(d.split("-")[2])}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.employees.map((e) => {
                  const match = parsed.matches[e.empCode];
                  const mappedStaffId = match?.staffId || mappings[e.empCode];
                  const staff = mappedStaffId ? staffMap[mappedStaffId] : undefined;
                  return (
                    <TableRow key={e.empCode}>
                      <TableCell className="sticky left-0 bg-white/95 font-medium text-slate-950">
                        {staff ? `${staff.firstName} ${staff.lastName}` : e.empName}
                        {!mappedStaffId && (
                          <Badge variant="bg-rose-100 text-rose-700" className="ml-2">
                            Unmapped
                          </Badge>
                        )}
                      </TableCell>
                      {e.records.map((rec) => (
                        <TableCell key={rec.date} className="text-center">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${STATUS_BADGE[rec.status] || "bg-slate-100 text-slate-600"}`}
                            title={[rec.checkIn && `In ${rec.checkIn}`, rec.checkOut && `Out ${rec.checkOut}`, ...rec.warnings]
                              .filter(Boolean)
                              .join(" · ")}
                          >
                            {rec.rawStatus || "-"}
                          </span>
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ListingPanel>

          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/70 bg-white/78 p-4 backdrop-blur-md sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="rounded"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
              />
              Overwrite existing attendance for these dates
            </label>
            <div className="flex items-center gap-3">
              {unmatchedRemaining > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {unmatchedRemaining} unmapped employee{unmatchedRemaining === 1 ? "" : "s"} will be skipped
                </span>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setParsed(null);
                  setFile(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={confirming}>
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Confirm Import
              </Button>
            </div>
          </div>
        </>
      )}

      {confirmSummary && (
        <Card>
          <CardContent className="flex flex-wrap gap-6 p-5 text-sm">
            <span>
              Created: <b>{confirmSummary.createdCount}</b>
            </span>
            <span>
              Updated: <b>{confirmSummary.updatedCount}</b>
            </span>
            <span>
              Skipped (existing): <b>{confirmSummary.skippedCount}</b>
            </span>
            <span>
              Unmapped: <b>{confirmSummary.unmappedCount}</b>
            </span>
            <span>
              Errors: <b>{confirmSummary.errorCount}</b>
            </span>
          </CardContent>
        </Card>
      )}

      <ListingPanel title="Import history" contentClassName="p-0">
        {historyLoading ? (
          <div className="p-8">
            <PageLoader />
          </div>
        ) : batches.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No imports yet" description="Uploaded attendance reports will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uploaded</TableHead>
                <TableHead>File</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Skipped</TableHead>
                <TableHead>Unmapped</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.createdAt ? new Date(b.createdAt.seconds * 1000).toLocaleString("en-IN") : "-"}</TableCell>
                  <TableCell className="max-w-[180px] truncate" title={b.fileName}>
                    {b.fileName}
                  </TableCell>
                  <TableCell>{b.uploadedByName || "-"}</TableCell>
                  <TableCell>{b.summary?.createdCount ?? 0}</TableCell>
                  <TableCell>{b.summary?.updatedCount ?? 0}</TableCell>
                  <TableCell>{b.summary?.skippedCount ?? 0}</TableCell>
                  <TableCell>{b.summary?.unmappedCount ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === "rolled-back" ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"}>
                      {b.status === "rolled-back" ? "Rolled back" : "Completed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {b.status !== "rolled-back" && (
                      <Button variant="ghost" size="sm" onClick={() => setRollbackTarget(b)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListingPanel>

      <ConfirmDialog
        open={!!rollbackTarget}
        title="Roll back import"
        message={`This removes ${rollbackTarget?.summary?.createdCount ?? 0} created and ${rollbackTarget?.summary?.updatedCount ?? 0} updated attendance records from this import. Continue?`}
        confirmLabel={rollingBack ? "Rolling back..." : "Roll back"}
        variant="danger"
        onConfirm={executeRollback}
        onCancel={() => setRollbackTarget(null)}
      />
    </div>
  );
}
