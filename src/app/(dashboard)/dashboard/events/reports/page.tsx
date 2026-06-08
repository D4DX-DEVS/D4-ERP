"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { BarChart3, DollarSign, TrendingUp, XCircle } from "lucide-react";
import type { ManagedEvent, EventManagementType } from "@/types";

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
        />
        <ListingStatCard
          label="Success Rate"
          value={`${successRate}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          meta={`${completed.length} completed`}
        />
        <ListingStatCard
          label="Total Budget"
          value={`₹${(totalBudget / 1000).toFixed(0)}k`}
          icon={<DollarSign className="h-5 w-5" />}
          meta={`Actual: ₹${(totalActual / 1000).toFixed(0)}k`}
        />
        <ListingStatCard
          label="Cancellation Rate"
          value={`${cancellationRate}%`}
          icon={<XCircle className="h-5 w-5" />}
          meta={`${cancelled.length} cancelled`}
        />
      </ListingStatGrid>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Events by Type */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Events by Type</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${(count / events.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Monthly Trend */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Monthly Trend</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {monthlyData.map((m) => {
                const maxCount = Math.max(...monthlyData.map((d) => d.count), 1);
                const height = (m.count / maxCount) * 100;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-medium">{m.count}</span>
                    <div className="w-full rounded-t bg-primary/20 relative" style={{ height: `${height}%`, minHeight: "4px" }}>
                      <div className="absolute inset-0 rounded-t bg-primary opacity-70" />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.month}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Revenue by Type */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="text-sm font-semibold mb-4">Revenue by Event Type</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2 font-medium">Type</th>
                  <th className="text-right py-2 font-medium">Events</th>
                  <th className="text-right py-2 font-medium">Budget</th>
                  <th className="text-right py-2 font-medium">Actual</th>
                  <th className="text-right py-2 font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(byType).map((type) => {
                  const typeEvents = events.filter((e) => e.eventType === type);
                  const budget = typeEvents.reduce((s, e) => s + (e.budget || 0), 0);
                  const actual = typeEvents.reduce((s, e) => s + (e.actualCost || 0), 0);
                  const variance = budget - actual;
                  return (
                    <tr key={type} className="border-b last:border-0">
                      <td className="py-2 capitalize">{type}</td>
                      <td className="py-2 text-right">{typeEvents.length}</td>
                      <td className="py-2 text-right">₹{budget.toLocaleString("en-IN")}</td>
                      <td className="py-2 text-right">₹{actual.toLocaleString("en-IN")}</td>
                      <td className={`py-2 text-right font-medium ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {variance >= 0 ? "+" : ""}₹{variance.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
