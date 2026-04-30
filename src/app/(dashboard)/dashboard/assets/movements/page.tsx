"use client";

import { useMemo, useState } from "react";
import { AssetMovement } from "@/types";
import { where, search as searchConstraint } from "@/lib/firestore";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { ArrowLeftRight, Search } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { formatDate } from "@/lib/utils";
import { Timestamp } from "@/lib/firestore";

const statusColors: Record<string, string> = {
  OUT: "bg-orange-100 text-orange-800",
  IN: "bg-green-100 text-green-800",
};

const conditionColors: Record<string, string> = {
  good: "bg-green-100 text-green-800",
  damaged: "bg-amber-100 text-amber-800",
  defective: "bg-orange-100 text-orange-800",
  missing: "bg-red-100 text-red-800",
};

export default function AssetMovementsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const constraints = useMemo(() => {
    const c: Array<ReturnType<typeof where> | ReturnType<typeof searchConstraint>> = [];
    if (search.trim()) {
      c.push(searchConstraint(["assetName", "eventName", "allocatedPersonName"], search.trim()));
    }
    if (statusFilter) {
      c.push(where("status", "==", statusFilter));
    }
    return c;
  }, [search, statusFilter]);

  const { data: movements, loading, totalCount, page, totalPages, hasNext, hasPrev, nextPage, prevPage } = usePagination<AssetMovement>("asset-movements", {
    pageSize: 20,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

  const tsToDateStr = (ts?: Timestamp) => {
    if (!ts?.seconds) return "—";
    return formatDate(new Date(ts.seconds * 1000));
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Asset Movements</h1>
        <p className="text-sm text-gray-500 mt-1">{totalCount} movements tracked</p>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search by asset, event, person..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: "", label: "All Statuses" }, { value: "OUT", label: "OUT" }, { value: "IN", label: "IN" }]} className="w-[150px]" />
      </div>

      {totalCount === 0 ? (
        <Card><CardContent><EmptyState icon={<ArrowLeftRight className="h-12 w-12" />} title="No movements found" /></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Out Date</TableHead>
                <TableHead>In Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Issued By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{m.assetName || "—"}</p>
                      {m.assetCategory && <p className="text-xs text-gray-400">{m.assetCategory}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{m.eventName || "—"}</p>
                      {m.eventLocation && <p className="text-xs text-gray-400">{m.eventLocation}</p>}
                    </div>
                  </TableCell>
                  <TableCell>{m.allocatedPersonName || "—"}</TableCell>
                  <TableCell>{tsToDateStr(m.outDate)}</TableCell>
                  <TableCell>{tsToDateStr(m.inDate)}</TableCell>
                  <TableCell>
                    <Badge variant={statusColors[m.status] || "bg-gray-100 text-gray-800"}>{m.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={conditionColors[m.condition] || "bg-gray-100 text-gray-800"}>{m.condition}</Badge>
                  </TableCell>
                  <TableCell>{m.outByName || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={20} />
        </CardContent></Card>
      )}
    </div>
  );
}
