"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, DollarSign, TrendingUp, XCircle } from "lucide-react";
import type { ManagedEvent } from "@/types";

export default function EventReportsPage() {
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const docs = await getDocuments<ManagedEvent>("events", [orderBy("createdAt", "desc")]);
        setEvents(docs);
      } catch (error) {
        console.error("Failed to fetch events:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, []);

  const completed = events.filter((e) => e.status === "completed");
  const cancelled = events.filter((e) => e.status === "cancelled");
  const totalBudget = events.reduce((s, e) => s + (e.budget || 0), 0);
  const totalActual = events.reduce((s, e) => s + (e.actualCost || 0), 0);
  const successRate = events.length > 0 ? Math.round((completed.length / events.length) * 100) : 0;
  const cancellationRate = events.length > 0 ? Math.round((cancelled.length / events.length) * 100) : 0;

  // Events by type
  const byType: Record<string, number> = {};
  events.forEach((e) => {
    byType[e.eventType] = (byType[e.eventType] || 0) + 1;
  });

  // Events by month (last 6 months)
  const monthlyData: { month: string; count: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
    const count = events.filter((e) => e.startDate.startsWith(key)).length;
    monthlyData.push({ month: label, count });
  }

  return (
    <div className="space-y-6">
      <ListingHeader title="Event Reports" description="Analytics and insights for events." />

      <ListingStatGrid>
        <ListingStatCard
          label="Total Events"
          value={events.length}
          icon={<BarChart3 className="h-5 w-5" />}
          toneClassName="bg-gradient-to-br from-teal-500 to-emerald-500 text-white"
        />
        <ListingStatCard
          label="Success Rate"
          value={`${successRate}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          meta={`${completed.length} completed`}
          toneClassName="bg-gradient-to-br from-sky-500 to-blue-500 text-white"
        />
        <ListingStatCard
          label="Total Budget"
          value={formatCurrency(totalBudget)}
          icon={<DollarSign className="h-5 w-5" />}
          meta={`Actual: ${formatCurrency(totalActual)}`}
          toneClassName="bg-gradient-to-br from-amber-500 to-orange-500 text-white"
        />
        <ListingStatCard
          label="Cancellation Rate"
          value={`${cancellationRate}%`}
          icon={<XCircle className="h-5 w-5" />}
          meta={`${cancelled.length} cancelled`}
          toneClassName="bg-gradient-to-br from-rose-500 to-red-500 text-white"
        />
      </ListingStatGrid>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Events by Type */}
        <Card>
          <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-slate-950 mb-4">Events by Type</h3>
          {loading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm capitalize text-slate-700">{type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-600 to-emerald-500 rounded-full"
                          style={{ width: `${(count / events.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold w-8 text-right text-slate-900">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-slate-950 mb-4">Monthly Trend</h3>
          {loading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {monthlyData.map((m) => {
                const maxCount = Math.max(...monthlyData.map((d) => d.count), 1);
                const height = (m.count / maxCount) * 100;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold text-slate-900">{m.count}</span>
                    <div className="w-full rounded-t-lg bg-gradient-to-t from-teal-600 to-emerald-400 shadow-[0_4px_12px_rgba(15,118,110,0.25)]" style={{ height: `${height}%`, minHeight: "4px" }} />
                    <span className="text-[10px] text-slate-400">{m.month}</span>
                  </div>
                );
              })}
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Type */}
      <Card>
        <CardContent className="p-6">
        <h3 className="text-sm font-semibold text-slate-950 mb-4">Revenue by Event Type</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200/70">
                <tr>
                  <th className="text-left py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Type</th>
                  <th className="text-right py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Events</th>
                  <th className="text-right py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Budget</th>
                  <th className="text-right py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Actual</th>
                  <th className="text-right py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Variance</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(byType).map((type) => {
                  const typeEvents = events.filter((e) => e.eventType === type);
                  const budget = typeEvents.reduce((s, e) => s + (e.budget || 0), 0);
                  const actual = typeEvents.reduce((s, e) => s + (e.actualCost || 0), 0);
                  const variance = budget - actual;
                  return (
                    <tr key={type} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 capitalize text-slate-700">{type}</td>
                      <td className="py-2.5 text-right text-slate-700">{typeEvents.length}</td>
                      <td className="py-2.5 text-right text-slate-700">{formatCurrency(budget)}</td>
                      <td className="py-2.5 text-right text-slate-700">{formatCurrency(actual)}</td>
                      <td className={`py-2.5 text-right font-semibold ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
