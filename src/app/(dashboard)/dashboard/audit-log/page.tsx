"use client";

import { useMemo, useState } from "react";
import { search as searchConstraint, where } from "@/lib/firestore";
import { AuditLog } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Search, Activity } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";

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

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const constraints = useMemo(() => {
    const nextConstraints: Array<ReturnType<typeof where> | ReturnType<typeof searchConstraint>> = [];
    if (moduleFilter !== "all") {
      nextConstraints.push(where("module", "==", moduleFilter));
    }
    if (search.trim()) {
      nextConstraints.push(searchConstraint(["userName", "userId", "action", "module", "details"], search.trim()));
    }
    return nextConstraints;
  }, [moduleFilter, search]);
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
  } = usePagination<AuditLog>("audit_logs", {
    pageSize: 10,
    orderByField: "timestamp",
    orderDirection: "desc",
    constraints,
  });

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
        <Badge variant="bg-gray-100 text-gray-700">{totalCount} entries</Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search logs..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <SelectRoot value={moduleFilter} onValueChange={setModuleFilter}>
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
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatTimestamp(log.timestamp as { seconds: number })}
                      </td>
                      <td className="p-3">{log.userName || log.userId}</td>
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
                  {logs.length === 0 && (
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
            <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
