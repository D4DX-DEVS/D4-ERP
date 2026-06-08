"use client";

import type { StatusHistoryEntry } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  inquiry: "bg-slate-400",
  quotation: "bg-blue-400",
  confirmed: "bg-emerald-500",
  planning: "bg-indigo-400",
  "in-progress": "bg-amber-500",
  completed: "bg-green-600",
  cancelled: "bg-red-500",
  pending: "bg-yellow-400",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  draft: "bg-slate-300",
  submitted: "bg-blue-400",
  reviewed: "bg-green-500",
  "needs-revision": "bg-orange-400",
};

function formatTimestamp(ts: { seconds: number }): string {
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface StatusTimelineProps {
  history: StatusHistoryEntry[];
  className?: string;
}

export function StatusTimeline({ history, className }: StatusTimelineProps) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-muted-foreground">No status history available.</p>;
  }

  return (
    <div className={className}>
      <ol className="relative border-l border-border ml-3">
        {history.map((entry, idx) => {
          const dotColor = STATUS_COLORS[entry.status] || "bg-gray-400";
          return (
            <li key={idx} className="mb-6 ml-6">
              <span
                className={`absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-background ${dotColor}`}
              />
              <div className="flex flex-col gap-0.5">
                <h4 className="text-sm font-medium capitalize">
                  {entry.status.replace(/-/g, " ")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  by {entry.changedByName} • {formatTimestamp(entry.changedAt)}
                </p>
                {entry.remarks && (
                  <p className="text-xs text-muted-foreground italic mt-0.5">
                    &quot;{entry.remarks}&quot;
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
