"use client";

import { useMemo, useState } from "react";
import { updateDocument, where, Timestamp } from "@/lib/firestore";
import { usePagination } from "@/hooks/use-pagination";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { ListingHeader } from "@/components/ui/listing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/loading";
import { ClipboardList } from "lucide-react";
import type { WorkLog } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  reviewed: "bg-green-100 text-green-700",
  "needs-revision": "bg-orange-100 text-orange-700",
};

export default function WorkLogsAdminPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("submitted");
  const [pageSize, setPageSize] = useState(20);
  const [reviewLog, setReviewLog] = useState<WorkLog | null>(null);
  const [remarks, setRemarks] = useState("");

  const constraints = useMemo(
    () => (statusFilter ? [where("status", "==", statusFilter)] : []),
    [statusFilter]
  );

  const {
    data: logs,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<WorkLog>("work_logs", {
    pageSize,
    orderByField: "date",
    orderDirection: "desc",
    constraints,
  });

  const handleMarkReviewed = async (log: WorkLog) => {
    try {
      await updateDocument("work_logs", log.id!, {
        status: "reviewed",
        reviewedBy: user?.staffId,
        reviewDate: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      toast("success", "Marked as reviewed");
      refresh();
    } catch {
      toast("error", "Failed to update");
    }
  };

  const handleRequestRevision = async () => {
    if (!reviewLog || !remarks.trim()) {
      toast("error", "Enter revision remarks");
      return;
    }
    try {
      await updateDocument("work_logs", reviewLog.id!, {
        status: "needs-revision",
        reviewRemarks: remarks.trim(),
        reviewedBy: user?.staffId,
        reviewDate: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      toast("success", "Revision requested");
      setReviewLog(null);
      setRemarks("");
      refresh();
    } catch {
      toast("error", "Failed to update");
    }
  };

  return (
    <div className="space-y-6">
      <ListingHeader title="Work Logs" description="Review and manage staff work logs." />

      <div className="flex items-center gap-2">
        {["submitted", "reviewed", "needs-revision", ""].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors capitalize ${
              statusFilter === s
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-transparent shadow-sm"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "" ? "All" : s.replace(/-/g, " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : logs.length === 0 ? (
        <Card><CardContent><EmptyState icon={<ClipboardList className="h-12 w-12" />} title="No work logs found" /></CardContent></Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium text-slate-900">{log.staffName}</TableCell>
                  <TableCell>{log.date}</TableCell>
                  <TableCell>{log.entries.length}</TableCell>
                  <TableCell>{log.totalHours}h</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[log.status]} className="capitalize">
                      {log.status.replace(/-/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {log.status === "submitted" && (
                      <>
                        <Button variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => handleMarkReviewed(log)}>
                          Approve
                        </Button>
                        <Button variant="outline" size="sm" className="border-orange-200 text-orange-700 hover:bg-orange-50" onClick={() => { setReviewLog(log); setRemarks(""); }}>
                          Revise
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onNext={nextPage}
            onPrev={prevPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}

      {/* Revision dialog */}
      <Dialog open={!!reviewLog} onClose={() => setReviewLog(null)} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Revision</DialogTitle>
        </DialogHeader>
        {reviewLog && (
          <p className="text-sm text-slate-500 -mt-2 mb-4">{reviewLog.staffName} — {reviewLog.date}</p>
        )}
        <div className="space-y-2">
          <Label>Remarks *</Label>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            className="resize-none"
            placeholder="What needs to be corrected?"
          />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={() => setReviewLog(null)}>Cancel</Button>
          <Button className="bg-gradient-to-r from-orange-500 to-amber-500" onClick={handleRequestRevision}>Send</Button>
        </div>
      </Dialog>
    </div>
  );
}
