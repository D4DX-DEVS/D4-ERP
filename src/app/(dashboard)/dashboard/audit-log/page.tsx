"use client";

import { useEffect, useState } from "react";
import { getDocuments, where } from "@/lib/firestore";
import { AuditLog, Staff } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Search, Filter, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/toast";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  login: "bg-purple-100 text-purple-700",
  logout: "bg-gray-100 text-gray-700",
  approve: "bg-teal-100 text-teal-700",
  reject: "bg-orange-100 text-orange-700",
};

const MODULES = [
  "all", "staff", "company", "department", "client", "invoice",
  "transaction", "leave", "task", "asset", "attendance", "payroll",
];

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [logs, setLogs] = useState<(AuditLog & { id: string })[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [page, setPage] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [logsData, staffData] = await Promise.all([
          getDocuments<AuditLog>("audit_logs"),
          getDocuments<Staff>("staff"),
        ]);
        setLogs(logsData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
        setStaffList(staffData);
      } catch (error) {
        console.error("Error:", error);
        toast("error", "Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const staffMap = Object.fromEntries(staffList.map((s) => [s.id, s]));

  const filtered = logs.filter((l) => {
    if (moduleFilter !== "all" && l.module !== moduleFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      const userName = staffMap[l.userId] ? `${staffMap[l.userId].firstName} ${staffMap[l.userId].lastName}` : l.userId;
      return (
        userName.toLowerCase().includes(searchLower) ||
        l.action?.toLowerCase().includes(searchLower) ||
        l.module?.toLowerCase().includes(searchLower) ||
        l.details?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const formatTimestamp = (ts: { seconds: number } | undefined) => {
    if (!ts) return "—";
    return new Date(ts.seconds * 1000).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <Badge variant="bg-gray-100 text-gray-700">{filtered.length} entries</Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search logs..." className="pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <SelectRoot value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPage(0); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by module" /></SelectTrigger>
          <SelectContent>
            {MODULES.map((m) => (
              <SelectItem key={m} value={m}>{m === "all" ? "All Modules" : m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left bg-gray-50">
                    <th className="p-3 font-medium">Timestamp</th>
                    <th className="p-3 font-medium">User</th>
                    <th className="p-3 font-medium">Action</th>
                    <th className="p-3 font-medium">Module</th>
                    <th className="p-3 font-medium">Details</th>
                    <th className="p-3 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatTimestamp(log.timestamp as { seconds: number })}
                      </td>
                      <td className="p-3">{staffMap[log.userId] ? `${staffMap[log.userId].firstName} ${staffMap[log.userId].lastName}` : log.userId}</td>
                      <td className="p-3">
                        <Badge variant={ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="p-3 capitalize">{log.module}</td>
                      <td className="p-3 text-xs text-gray-600 max-w-xs truncate">{log.details || "—"}</td>
                      <td className="p-3 text-xs text-gray-400 font-mono">{log.ipAddress || "—"}</td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-500">
                        <Activity className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                        No audit logs found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-3 border-t">
                <p className="text-xs text-gray-500">
                  Page {page + 1} of {totalPages}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
