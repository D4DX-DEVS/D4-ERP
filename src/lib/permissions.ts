// ==================== Feature / permission framework ====================
// Pure, dependency-free access-control registry shared by client and server.
// Access model: a user gets a feature if their ROLE grants it by default OR the
// feature has been explicitly granted to them (additive per-employee override).
// Admins implicitly have every feature.

import type { StaffRole } from "@/types";

export type FeatureKey =
  | "studio-booking"
  | "asset-management"
  | "tasks"
  | "calendar"
  | "clients"
  | "attendance-manage"
  | "leaves-manage"
  | "accounting"
  | "invoices"
  | "quotations"
  | "items"
  | "payroll"
  | "reports";

export interface FeatureMeta {
  key: FeatureKey;
  label: string;
  description: string;
  /** Roles that receive this feature automatically (no explicit grant needed). */
  defaultRoles: StaffRole[];
}

/** Registry of grantable features. Listed in the order shown in the UI. */
export const FEATURES: FeatureMeta[] = [
  {
    key: "studio-booking",
    label: "Studio Booking",
    description: "Book studios and rooms with date/time slots.",
    defaultRoles: ["admin", "department-head"],
  },
  {
    key: "asset-management",
    label: "Asset Management",
    description: "Manage assets, movements and availability.",
    defaultRoles: ["admin", "department-head"],
  },
  {
    key: "tasks",
    label: "Tasks",
    description: "Create and manage tasks.",
    defaultRoles: ["admin", "department-head"],
  },
  {
    key: "calendar",
    label: "Calendar",
    description: "View and manage the shared calendar.",
    defaultRoles: ["admin", "department-head"],
  },
  {
    key: "clients",
    label: "Clients",
    description: "Manage client records.",
    defaultRoles: ["admin", "department-head", "accounts"],
  },
  {
    key: "attendance-manage",
    label: "Attendance Management",
    description: "Manage attendance and corrections.",
    defaultRoles: ["admin", "department-head"],
  },
  {
    key: "leaves-manage",
    label: "Leave Management",
    description: "Approve and manage leave requests.",
    defaultRoles: ["admin", "department-head"],
  },
  {
    key: "accounting",
    label: "Accounting",
    description: "Manage income and expense transactions.",
    defaultRoles: ["admin", "accounts"],
  },
  {
    key: "invoices",
    label: "Invoices",
    description: "Create and manage invoices.",
    defaultRoles: ["admin", "accounts"],
  },
  {
    key: "quotations",
    label: "Quotations",
    description: "Create and manage quotations.",
    defaultRoles: ["admin", "accounts"],
  },
  {
    key: "items",
    label: "Item Master",
    description: "Manage the item/service master.",
    defaultRoles: ["admin", "accounts"],
  },
  {
    key: "payroll",
    label: "Payroll",
    description: "Process and manage payroll.",
    defaultRoles: ["admin", "accounts"],
  },
  {
    key: "reports",
    label: "Reports",
    description: "Access reporting dashboards.",
    defaultRoles: ["admin", "accounts"],
  },
];

const FEATURE_MAP: Record<string, FeatureMeta> = Object.fromEntries(
  FEATURES.map((f) => [f.key, f])
);

export function featureMeta(key: string): FeatureMeta | undefined {
  return FEATURE_MAP[key];
}

/** Minimal shape needed to evaluate access — works with AuthUser or a token payload. */
export interface FeatureSubject {
  role?: string | null;
  grantedFeatures?: string[] | null;
}

/** Whether the given role receives the feature by default. */
export function roleHasFeature(role: string | null | undefined, key: FeatureKey): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  const meta = FEATURE_MAP[key];
  return !!meta && meta.defaultRoles.includes(role as StaffRole);
}

/** Whether the user can access a feature (role default OR explicit grant). */
export function hasFeature(subject: FeatureSubject | null | undefined, key: FeatureKey): boolean {
  if (!subject) return false;
  if (subject.role === "admin") return true;
  if (roleHasFeature(subject.role, key)) return true;
  return Array.isArray(subject.grantedFeatures) && subject.grantedFeatures.includes(key);
}
