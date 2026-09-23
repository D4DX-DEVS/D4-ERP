// Shared badge vocabulary for department reports and the plans filed with them.

export const REPORT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  published: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

/** Signed off by the admin — `published` is the older name for the same state. */
export const APPROVED_REPORT_STATUSES = new Set(["approved", "published"]);

/** Badge text for a filing's status. */
export function reportStatusLabel(status: string): string {
  if (APPROVED_REPORT_STATUSES.has(status)) return "Approved";
  if (status === "submitted") return "Awaiting review";
  if (status === "rejected") return "Sent back";
  return status.replace(/-/g, " ");
}

export const PLAN_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "in-progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "dropped", label: "Dropped" },
];

export const PLAN_STATUS_COLORS: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  "in-progress": "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  dropped: "bg-orange-100 text-orange-700",
};
