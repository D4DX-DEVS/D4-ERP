"use client";

import { useMemo, useState } from "react";
import { search as searchConstraint, where } from "@/lib/firestore";
import { AuditLog } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Search, Activity, ChevronDown, Plus, Pencil, Trash2,
  LogIn, LogOut, CheckCircle2, XCircle, User, Globe, Hash, Box, ArrowRight,
} from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";

const ACTION_META: Record<string, { badge: string; icon: typeof Plus; dot: string }> = {
  create: { badge: "bg-emerald-50 text-emerald-700", icon: Plus, dot: "bg-emerald-500" },
  update: { badge: "bg-blue-50 text-blue-700", icon: Pencil, dot: "bg-blue-500" },
  delete: { badge: "bg-red-50 text-red-700", icon: Trash2, dot: "bg-red-500" },
  login: { badge: "bg-violet-50 text-violet-700", icon: LogIn, dot: "bg-violet-500" },
  logout: { badge: "bg-slate-100 text-slate-600", icon: LogOut, dot: "bg-slate-400" },
  approve: { badge: "bg-teal-50 text-teal-700", icon: CheckCircle2, dot: "bg-teal-500" },
  reject: { badge: "bg-orange-50 text-orange-700", icon: XCircle, dot: "bg-orange-500" },
};

const FALLBACK_META = { badge: "bg-gray-100 text-gray-700", icon: Activity, dot: "bg-gray-400" };

const MODULES = [
  "all", "staff", "company", "department", "client", "invoice",
  "transaction", "leave", "task", "asset", "attendance", "payroll",
];

type FieldChange = { field: string; before: unknown; after: unknown };

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "\u2014";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function computeChanges(prev?: Record<string, unknown> | null, next?: Record<string, unknown> | null): FieldChange[] {
  const before = prev ?? {};
  const after = next ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes: FieldChange[] = [];
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ field: key, before: a, after: b });
    }
  }
  return changes;
}

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const toggleExpand = (id: string) => setExpandedId((current) => (current === id ? null : id));

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
            {logs.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <Activity className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                No audit logs found
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const meta = ACTION_META[log.action] || FALLBACK_META;
                  const ActionIcon = meta.icon;
                  const isExpanded = expandedId === log.id;
                  const changes = computeChanges(log.previousData, log.newData);

                  return (
                    <li key={log.id}>
                      {/* Row */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(log.id)}
                        aria-expanded={isExpanded}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80"
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.badge}`}>
                          <ActionIcon className="h-4 w-4" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">
                              {log.userName || log.userId}
                            </span>
                            <Badge variant={meta.badge}>{log.action}</Badge>
                            <span className="hidden text-xs font-medium capitalize text-slate-400 sm:inline">
                              {log.module}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {log.description || log.details || `${log.action} ${log.module} record`}
                          </p>
                        </div>

                        <time className="hidden shrink-0 whitespace-nowrap text-xs text-slate-400 sm:block">
                          {formatTimestamp(log.timestamp as { seconds: number })}
                        </time>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="animate-in border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-16">
                          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                            <DetailItem icon={User} label="User" value={log.userName || log.userId} />
                            <DetailItem icon={Box} label="Entity" value={log.entityType || log.module} capitalize />
                            <DetailItem icon={Hash} label="Entity ID" value={log.entityId || "—"} mono />
                            <DetailItem icon={Globe} label="IP Address" value={log.ipAddress || "—"} mono />
                          </dl>

                          {(log.description || log.details) && (
                            <div className="mt-4">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Description</p>
                              <p className="mt-1 text-sm text-slate-700">{log.description || log.details}</p>
                            </div>
                          )}

                          {/* Field changes diff */}
                          {changes.length > 0 && (
                            <div className="mt-4">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                Changes ({changes.length})
                              </p>
                              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 text-left text-slate-500">
                                      <th className="px-3 py-2 font-medium">Field</th>
                                      <th className="px-3 py-2 font-medium">Before</th>
                                      <th className="px-3 py-2 font-medium" />
                                      <th className="px-3 py-2 font-medium">After</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {changes.map((c) => (
                                      <tr key={c.field} className="align-top">
                                        <td className="px-3 py-2 font-medium capitalize text-slate-700">{c.field}</td>
                                        <td className="px-3 py-2">
                                          <span className="inline-block rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-600 line-through">
                                            {formatValue(c.before)}
                                          </span>
                                        </td>
                                        <td className="px-1 py-2 text-slate-300">
                                          <ArrowRight className="h-3.5 w-3.5" />
                                        </td>
                                        <td className="px-3 py-2">
                                          <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-700">
                                            {formatValue(c.after)}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {changes.length === 0 && !log.description && !log.details && (
                            <p className="mt-3 text-xs text-slate-400">No additional detail recorded for this event.</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Pagination */}
            <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
  mono,
  capitalize,
}: {
  icon: typeof User;
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
        <dd className={`truncate text-sm text-slate-700 ${mono ? "font-mono text-xs" : ""} ${capitalize ? "capitalize" : ""}`}>
          {value}
        </dd>
      </div>
    </div>
  );
}
