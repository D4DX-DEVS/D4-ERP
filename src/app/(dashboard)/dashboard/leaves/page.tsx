"use client";

import { useEffect, useState } from "react";
import { LeaveRequest, Staff } from "@/types";
import { getDocuments, updateDocument, orderBy, where, Timestamp } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { getStatusColor, formatDate } from "@/lib/utils";
import { CalendarDays, Check, X, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";

export default function LeavesPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [requests, setRequests] = useState<(LeaveRequest & { id: string })[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, Staff>>({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [filterType, setFilterType] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const fetchData = async () => {
    try {
      const constraints = [orderBy("createdAt", "desc")];
      const [reqs, staffList] = await Promise.all([
        getDocuments<LeaveRequest>("leaveRequests", constraints),
        getDocuments<Staff>("staff"),
      ]);
      setRequests(reqs);

      const map: Record<string, Staff> = {};
      staffList.forEach((s) => { map[s.id] = s; });
      setStaffMap(map);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    try {
      await updateDocument("leaveRequests", id, {
        status,
        approvedBy: user?.staffId,
        approvalDate: Timestamp.now(),
      });
      toast("success", `Request ${status} successfully`);
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", `Failed to ${status} request`);
    }
  };

  const filtered = requests.filter((r) => {
    const matchStatus = !filterStatus || r.status === filterStatus;
    const matchType = !filterType || r.type === filterType;
    return matchStatus && matchType;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const getStaffName = (staffId: string) => {
    const s = staffMap[staffId];
    return s ? `${s.firstName} ${s.lastName}` : staffId;
  };

  const typeLabels: Record<string, string> = {
    leave: "Leave",
    wfh: "Work From Home",
    overtime: "Overtime",
    "on-duty": "On Duty",
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Manage leave, WFH, overtime & on-duty requests</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {(["pending", "approved", "rejected", "cancelled"] as const).map((status) => (
          <Card
            key={status}
            className={`cursor-pointer transition-all ${filterStatus === status ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setFilterStatus(filterStatus === status ? "" : status)}
          >
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{requests.filter((r) => r.status === status).length}</p>
              <p className="text-sm text-gray-500 capitalize">{status}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          options={[
            { value: "", label: "All Types" },
            { value: "leave", label: "Leave" },
            { value: "wfh", label: "Work From Home" },
            { value: "overtime", label: "Overtime" },
            { value: "on-duty", label: "On Duty" },
          ]}
          className="w-[200px]"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<CalendarDays className="h-12 w-12" />}
              title="No requests found"
              description="No leave requests match your filters"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.staffName || getStaffName(req.staffId)}</TableCell>
                    <TableCell>
                      <Badge>{typeLabels[req.type] || req.type}</Badge>
                    </TableCell>
                    <TableCell>{req.leaveType || "—"}</TableCell>
                    <TableCell>{req.startDate ? formatDate(new Date(req.startDate.seconds * 1000)) : "—"}</TableCell>
                    <TableCell>{req.endDate ? formatDate(new Date(req.endDate.seconds * 1000)) : "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(req.status)}>{req.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleAction(req.id, "approved")}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleAction(req.id, "rejected")}>
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={totalPages} totalCount={filtered.length} hasNext={page < totalPages - 1} hasPrev={page > 0} onNext={() => setPage(page + 1)} onPrev={() => setPage(page - 1)} pageSize={PAGE_SIZE} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
