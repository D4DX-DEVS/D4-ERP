// ==================== Feature / permission framework ====================
// Pure, dependency-free access-control registry shared by client and server.
// Access model: a user gets a feature if their ROLE grants it by default OR the
// feature has been explicitly granted to them (additive per-employee override).
// Admins implicitly have every feature.

import type { StaffRole } from "@/types";

export type FeatureKey =
  | "studio-booking"
  | "studio-manage"
  | "asset-management"
  | "tasks"
  | "work-logs"
  | "calendar"
  | "clients"
  | "attendance-manage"
  | "attendance-import"
  | "leaves-manage"
  | "accounting"
  | "invoices"
  | "quotations"
  | "items"
  | "payroll"
  | "reports"
  | "events"
  | "tools-vault";

export type PortalSection = "Operations" | "Work" | "Finance" | "Insights";

/** Admin sidebar modules, in sidebar order. The grant editor groups features by these. */
export type FeatureBundle = "People" | "Work" | "Bookings" | "Assets" | "Finance" | "System";
export const BUNDLE_ORDER: FeatureBundle[] = ["People", "Work", "Bookings", "Assets", "Finance", "System"];

export interface FeatureMeta {
  key: FeatureKey;
  label: string;
  description: string;
  /** Roles that receive this feature automatically (no explicit grant needed). */
  defaultRoles: StaffRole[];
  /** Sidebar module this feature sits under (admins say "give Finance", not six keys). */
  bundle: FeatureBundle;
  /** Shown as a warning on the card and confirmed before enabling. */
  sensitive?: string;
  /** What a grant still does not include for non-default roles, shown on the card. */
  grantNote?: string;
  /**
   * Staff-portal embedding: where a grant surfaces in the portal nav.
   * Absent = department-management feature with no defined extra-grant
   * semantics for plain staff (dashboard-only; the grant dialog disables it
   * for roles outside defaultRoles).
   *
   * `links` are the feature's sub-pages, mirroring the dashboard sidebar items
   * gated by the same feature key, so a granted user reaches everything the
   * role-default user does. Each href must have a wrapper route under
   * src/app/(staff-portal)/staff-portal (enforced by portal-nav.test.ts).
   */
  portal?: {
    section: PortalSection;
    href: string;
    label?: string;
    links?: { href: string; label: string }[];
  };
}

/** Registry of grantable features. Listed in the order shown in the UI. */
export const FEATURES: FeatureMeta[] = [
  {
    key: "studio-booking",
    label: "Studio Booking",
    description: "Book studios and rooms with date/time slots.",
    defaultRoles: ["admin", "department-head"],
    bundle: "Bookings",
    grantNote: "Studio resources and settings need Studio Management.",
    portal: {
      section: "Operations",
      href: "/staff-portal/studio",
      links: [
        { href: "/staff-portal/studio/bookings", label: "Bookings" },
        { href: "/staff-portal/studio/timeline", label: "Timeline" },
        { href: "/staff-portal/studio/availability", label: "Availability" },
      ],
    },
  },
  {
    key: "studio-manage",
    label: "Studio Management",
    description: "Manage studio resources, equipment, and settings.",
    defaultRoles: ["admin"],
    bundle: "Bookings",
    grantNote: "Opens the studio Resources page; saving studio changes stays with admin.",
  },
  {
    key: "events",
    label: "Event Management",
    description: "Create and manage events with lifecycle tracking.",
    defaultRoles: ["admin", "department-head"],
    bundle: "Bookings",
    grantNote: "Adding a new role to the shared role list stays with admin.",
    portal: {
      section: "Operations",
      href: "/staff-portal/events",
      label: "Events",
      links: [
        { href: "/staff-portal/events/list", label: "All Events" },
        { href: "/staff-portal/events/calendar", label: "Booking Calendar" },
        { href: "/staff-portal/events/reports", label: "Reports" },
      ],
    },
  },
  {
    key: "asset-management",
    label: "Asset Management",
    description: "Manage assets, movements and availability.",
    defaultRoles: ["admin", "department-head"],
    bundle: "Assets",
    portal: {
      section: "Operations",
      href: "/staff-portal/assets",
      label: "Assets",
      // Categories is an admin-only sidebar item, so it is deliberately absent.
      links: [
        { href: "/staff-portal/assets/movements", label: "Movements" },
        { href: "/staff-portal/assets/availability", label: "Availability" },
        { href: "/staff-portal/assets/events", label: "Events" },
        { href: "/staff-portal/assets/persons", label: "Persons" },
        { href: "/staff-portal/assets/reports", label: "Reports" },
      ],
    },
  },
  {
    key: "tasks",
    label: "Tasks",
    description: "Create and manage tasks.",
    defaultRoles: ["admin", "department-head"],
    bundle: "Work",
    grantNote: "Staff can create tasks and update their own; review and approval stay with department heads.",
    // Distinct from the self-service "My Tasks" page every staff member has.
    portal: { section: "Work", href: "/staff-portal/tasks", label: "Task Management" },
  },
  {
    key: "work-logs",
    label: "Work Logs",
    description: "View and manage staff daily work logs.",
    defaultRoles: ["admin", "department-head"],
    bundle: "Work",
    // Distinct from the self-service "Work Log" page every staff member has.
    portal: {
      section: "Work",
      href: "/staff-portal/tasks/work-logs",
      label: "Work Log Management",
      links: [
        { href: "/staff-portal/tasks/daily-updates", label: "Daily Updates" },
        { href: "/staff-portal/tasks/performance", label: "Performance" },
      ],
    },
  },
  {
    key: "calendar",
    label: "Calendar",
    description: "View and manage the shared calendar.",
    defaultRoles: ["admin", "department-head"],
    bundle: "Work",
  },
  {
    key: "clients",
    label: "Clients",
    description: "Manage client records.",
    defaultRoles: ["admin", "department-head", "accounts"],
    bundle: "Finance",
    portal: { section: "Operations", href: "/staff-portal/clients" },
  },
  {
    key: "attendance-manage",
    label: "Attendance Management",
    description: "Manage attendance and corrections.",
    defaultRoles: ["admin", "department-head"],
    bundle: "People",
  },
  {
    key: "attendance-import",
    label: "Attendance Import",
    description: "Upload biometric attendance reports (ESSL etc.) and import records.",
    defaultRoles: ["admin", "department-head"],
    bundle: "People",
  },
  {
    key: "leaves-manage",
    label: "Leave Management",
    description: "Approve and manage leave requests.",
    defaultRoles: ["admin", "department-head"],
    bundle: "People",
  },
  {
    key: "accounting",
    label: "Accounting",
    description: "Manage income and expense transactions.",
    defaultRoles: ["admin", "accounts"],
    bundle: "Finance",
    grantNote: "Cannot delete transactions or manage categories; those stay with admin and accounts.",
    portal: { section: "Finance", href: "/staff-portal/accounting" },
  },
  {
    key: "invoices",
    label: "Invoices",
    description: "Create and manage invoices.",
    defaultRoles: ["admin", "accounts"],
    bundle: "Finance",
    portal: { section: "Finance", href: "/staff-portal/invoices" },
  },
  {
    key: "quotations",
    label: "Quotations",
    description: "Create and manage quotations.",
    defaultRoles: ["admin", "accounts"],
    bundle: "Finance",
    portal: { section: "Finance", href: "/staff-portal/quotations" },
  },
  {
    // Dependent-read rule: invoices/quotations grants imply read access to the
    // item master (picker inside their builders) — NOT this module or writes.
    key: "items",
    label: "Item Master",
    description: "Manage the item/service master.",
    defaultRoles: ["admin", "accounts"],
    bundle: "Finance",
    portal: { section: "Finance", href: "/staff-portal/items" },
  },
  {
    key: "payroll",
    label: "Payroll",
    description: "Process and manage payroll.",
    defaultRoles: ["admin", "accounts"],
    bundle: "People",
    sensitive: "Reveals every employee's salary rows and payroll inputs.",
    portal: { section: "Finance", href: "/staff-portal/payroll" },
  },
  {
    key: "reports",
    label: "Reports",
    description: "Access reporting dashboards.",
    defaultRoles: ["admin", "accounts"],
    bundle: "Finance",
    grantNote: "Staff, Leave and Attendance report tiles open admin-only pages.",
    portal: { section: "Insights", href: "/staff-portal/reports" },
  },
  {
    // Grants the stored logins too — the credentials are shown in the page
    // rather than behind a second check, so grant this sparingly.
    key: "tools-vault",
    label: "Tools & Accounts",
    description: "Manage company software subscriptions, licences and their stored logins.",
    defaultRoles: ["admin"],
    bundle: "System",
    sensitive: "Reveals the stored logins for company tools.",
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
