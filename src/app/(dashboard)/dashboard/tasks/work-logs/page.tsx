"use client";

import { useEffect, useState } from "react";
import { getDocuments, updateDocument, where, orderBy, Timestamp } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { ListingHeader } from "@/components/ui/listing";
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
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("submitted");
  const [reviewLog, setReviewLog] = useState<WorkLog | null>(null);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    async function fetch() {
      try {
        const constraints = statusFilter
          ? [where("status", "==", statusFilter), orderBy("date", "desc")]
          : [orderBy("date", "desc")];
        const data = await getDocuments<WorkLog>("work_logs", constraints);
        setLogs(data);
      } catch (error) {
        console.error("Failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, [statusFilter]);

  const handleMarkReviewed = async (log: WorkLog) => {
    try {
      await updateDocument("work_logs", log.id!, {
        status: "reviewed",
        reviewedBy: user?.staffId,
        reviewDate: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      toast("success", "Marked as reviewed");
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
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
      setLogs((prev) => prev.filter((l) => l.id !== reviewLog.id));
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
            onClick={() => { setStatusFilter(s); setLoading(true); }}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"
            }`}
          >
            {s === "" ? "All" : s.replace(/-/g, " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No work logs found.</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Staff</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Entries</th>
                <th className="text-left px-4 py-3 font-medium">Hours</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3 font-medium">{log.staffName}</td>
                  <td className="px-4 py-3">{log.date}</td>
                  <td className="px-4 py-3">{log.entries.length}</td>
                  <td className="px-4 py-3">{log.totalHours}h</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${STATUS_COLORS[log.status] || ""}`}>
                      {log.status.replace(/-/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {log.status === "submitted" && (
                      <>
                        <button
                          onClick={() => handleMarkReviewed(log)}
                          className="rounded px-2 py-1 text-xs bg-green-50 text-green-700 hover:bg-green-100"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => { setReviewLog(log); setRemarks(""); }}
                          className="rounded px-2 py-1 text-xs bg-orange-50 text-orange-700 hover:bg-orange-100"
                        >
                          Revise
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revision dialog */}
      {reviewLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-2">Request Revision</h2>
            <p className="text-sm text-muted-foreground mb-4">{reviewLog.staffName} — {reviewLog.date}</p>
            <div>
              <label className="text-sm font-medium">Remarks *</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                placeholder="What needs to be corrected?"
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setReviewLog(null)} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button onClick={handleRequestRevision} className="rounded-md bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
