"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, where, orderBy } from "@/lib/firestore";
import { cancelRequest, REQUEST_TYPE_LABELS, isLegacyRequest } from "@/lib/requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, getStatusColor } from "@/lib/utils";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { CommentsSection } from "@/components/ui/comments-section";
import { CalendarRange, CircleDashed, Eye, ShieldCheck, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { StaffRequest } from "@/types";

export default function MyRequestsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [requests, setRequests] = useState<(StaffRequest & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    async function fetch() {
      try {
        const data = await getDocuments<StaffRequest>("leaveRequests", [
          where("staffId", "==", user!.staffId),
          orderBy("createdAt", "desc"),
        ]);
        setRequests(data);
      } catch (error) {
        toast("error", "Failed to load requests");
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [user, toast]);

  const handleCancel = async (req: StaffRequest & { id: string }) => {
    if (req.status !== "pending") {
      toast("error", "Only pending requests can be cancelled");
      return;
    }
    setCancellingId(req.id);
    try {
      await cancelRequest(req);
      setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: "cancelled" } : r)));
      toast("success", "Request cancelled");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to cancel request");
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) return <PageLoader />;

  const approvedRequests = requests.filter((r) => r.status === "approved").length;
  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const rejectedRequests = requests.filter((r) => r.status === "rejected").length;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="My Requests"
        description="Track all your leave, WFH, overtime, salary increment, and other requests."
      />

      <ListingStatGrid>
        <ListingStatCard icon={<CalendarRange className="h-5 w-5" />} label="Total Requests" value={requests.length} toneClassName="bg-slate-100 text-slate-700" meta="All submitted requests" />
        <ListingStatCard icon={<CircleDashed className="h-5 w-5" />} label="Pending" value={pendingRequests} toneClassName="bg-amber-50 text-amber-700" meta="Awaiting approval" />
        <ListingStatCard icon={<ShieldCheck className="h-5 w-5" />} label="Approved" value={approvedRequests} toneClassName="bg-emerald-50 text-emerald-700" meta="Confirmed requests" />
        <ListingStatCard icon={<XCircle className="h-5 w-5" />} label="Rejected" value={rejectedRequests} toneClassName="bg-rose-50 text-rose-700" meta="Requests not approved" />
      </ListingStatGrid>

      <ListingPanel title="Requests" description="Click to expand any request for details, timeline, and comments.">
        {requests.length === 0 ? (
          <EmptyState title="No requests found" description="Your leave, WFH, overtime, and other requests will appear here." />
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const isExpanded = expandedId === req.id;
              const isLegacy = isLegacyRequest(req);
              const start = req.startDate ? formatDate(new Date(req.startDate.seconds * 1000)) : "—";
              const end = req.endDate && req.endDate.seconds !== req.startDate?.seconds
                ? formatDate(new Date(req.endDate.seconds * 1000))
                : null;

              return (
                <Card key={req.id} className="overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="w-full text-left"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <Badge>{REQUEST_TYPE_LABELS[req.type]}</Badge>
                            {req.leaveType && <Badge variant="bg-slate-100 text-slate-700">{req.leaveType}</Badge>}
                            {req.isHalfDay && (
                              <Badge variant="bg-amber-100 text-amber-700">
                                Half Day {req.session === "first-half" ? "(AM)" : "(PM)"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600">
                            {end ? `${start} – ${end}` : start}
                          </p>
                          <p className="text-xs text-slate-500 line-clamp-1">{req.reason}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={getStatusColor(req.status)}>{req.status}</Badge>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">
                      {/* Approval Timeline */}
                      {!isLegacy && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-medium text-slate-700 uppercase">Approval Timeline</h4>
                          <div className="space-y-2">
                            {/* Dept Head Step */}
                            <div className="flex items-center gap-3 text-xs">
                              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white border-2" style={{
                                borderColor: req.deptHead?.status === "approved" ? "#10b981" : req.deptHead?.status === "rejected" ? "#ef4444" : "#d1d5db"
                              }}>
                                {req.deptHead?.status === "approved" && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                                {req.deptHead?.status === "rejected" && <span className="w-2 h-2 bg-red-500 rounded-full" />}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-slate-700">Department Head</p>
                                {req.deptHead?.status === "pending" && <p className="text-slate-500">Pending</p>}
                                {req.deptHead?.status === "approved" && (
                                  <p className="text-emerald-600">Approved by {req.deptHead.byName} on {req.deptHead.at ? formatDate(new Date(req.deptHead.at.seconds * 1000)) : "—"}</p>
                                )}
                                {req.deptHead?.status === "rejected" && (
                                  <p className="text-red-600">Rejected by {req.deptHead.byName} on {req.deptHead.at ? formatDate(new Date(req.deptHead.at.seconds * 1000)) : "—"}
                                    {req.deptHead.remarks && `: ${req.deptHead.remarks}`}</p>
                                )}
                              </div>
                            </div>

                            {/* Admin Step */}
                            <div className="flex items-center gap-3 text-xs">
                              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white border-2" style={{
                                borderColor: req.admin?.status === "approved" ? "#10b981" : req.admin?.status === "rejected" ? "#ef4444" : "#d1d5db"
                              }}>
                                {req.admin?.status === "approved" && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                                {req.admin?.status === "rejected" && <span className="w-2 h-2 bg-red-500 rounded-full" />}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-slate-700">Admin {req.adminOverride && <span className="text-xs text-amber-600">(override)</span>}</p>
                                {req.admin?.status === "pending" && <p className="text-slate-500">Pending</p>}
                                {req.admin?.status === "approved" && (
                                  <p className="text-emerald-600">Approved by {req.admin.byName} on {req.admin.at ? formatDate(new Date(req.admin.at.seconds * 1000)) : "—"}</p>
                                )}
                                {req.admin?.status === "rejected" && (
                                  <p className="text-red-600">Rejected by {req.admin.byName} on {req.admin.at ? formatDate(new Date(req.admin.at.seconds * 1000)) : "—"}
                                    {req.admin.remarks && `: ${req.admin.remarks}`}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Legacy Request Status */}
                      {isLegacy && (
                        <div className="text-xs text-slate-600">
                          <p className="font-medium">Status: <span className="text-slate-900">{req.status}</span></p>
                        </div>
                      )}

                      {/* Request Details */}
                      <div className="space-y-2 text-xs">
                        <p className="text-slate-600">
                          <span className="font-medium text-slate-700">Submitted:</span> {req.createdAt ? formatDate(new Date(req.createdAt.seconds * 1000)) : "—"}
                        </p>
                        {req.reason && (
                          <p className="text-slate-600">
                            <span className="font-medium text-slate-700">Reason:</span> {req.reason}
                          </p>
                        )}
                        {req.attachments && req.attachments.length > 0 && (
                          <div className="text-slate-600">
                            <p className="font-medium text-slate-700 mb-1">Attachments:</p>
                            <div className="flex flex-wrap gap-2">
                              {req.attachments.map((att, i) => (
                                <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-xs hover:text-blue-800">
                                  {att.name}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Cancel Button */}
                      {req.status === "pending" && (
                        <div className="flex gap-2 pt-2 border-t border-slate-200">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleCancel(req)}
                            disabled={cancellingId === req.id}
                          >
                            {cancellingId === req.id ? "Cancelling..." : "Cancel Request"}
                          </Button>
                        </div>
                      )}

                      {/* Comments Section */}
                      <div className="border-t border-slate-200 pt-4">
                        <CommentsSection entityType="staff_request" entityId={req.id} />
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </ListingPanel>
    </div>
  );
}
