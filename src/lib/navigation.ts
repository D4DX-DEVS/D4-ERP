import {
  LayoutDashboard,
  Building2,
  Layers,
  Users,
  CalendarDays,
  Receipt,
  UserCheck,
  DollarSign,
  ClipboardList,
  Package,
  Clock,
  Clapperboard,
  ClipboardCheck,
  Hourglass,
  Wallet,
  Bell,
  Shield,
  MessageSquare,
  BarChart3,
  Image as ImageIcon,
  Settings,
  Calendar,
  PartyPopper,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { FeatureKey } from "@/lib/permissions";

export type NavItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  roles: string[];
  feature?: FeatureKey;
  badge?: string;
};

export type NavSubGroup = {
  label: string;
  icon?: LucideIcon;
  items: NavItem[];
};

export type NavModule = {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  feature?: FeatureKey;
  /** Direct link – if set, clicking the module label navigates here */
  href?: string;
  /** Sub-groups within this module (expandable children) */
  subGroups?: NavSubGroup[];
  /** Flat child items (no sub-group header) */
  items?: NavItem[];
};

export const navigationModules: NavModule[] = [
  // ─── My Portal (staff-only: shown when staff accesses dashboard via feature) ─
  {
    id: "my-portal",
    label: "My Portal",
    icon: Users,
    roles: ["staff"],
    items: [
      { label: "Home", href: "/staff-portal", roles: ["staff"] },
      { label: "Apply Leave", href: "/staff-portal/leave", roles: ["staff"] },
      { label: "My Leaves", href: "/staff-portal/my-leaves", roles: ["staff"] },
      { label: "Attendance", href: "/staff-portal/attendance", roles: ["staff"] },
      { label: "My Tasks", href: "/staff-portal/my-tasks", roles: ["staff"] },
      { label: "Work Log", href: "/staff-portal/work-log", roles: ["staff"] },
      { label: "Calendar", href: "/staff-portal/calendar", icon: Calendar, roles: ["staff"] },
      { label: "Holidays", href: "/staff-portal/holidays", roles: ["staff"] },
      { label: "Profile", href: "/staff-portal/profile", roles: ["staff"] },
    ],
  },

  // ─── Dashboard ───────────────────────────────────────────────────────
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "department-head", "accounts"],
    href: "/dashboard",
  },

  // ─── People (HRMS: staff, leaves, payroll, attendance) ──────────────
  {
    id: "people",
    label: "People",
    icon: Users,
    roles: ["admin", "department-head", "accounts"],
    items: [
      { label: "Staff", href: "/dashboard/staff", roles: ["admin", "department-head"] },
      { label: "Leave Requests", href: "/dashboard/leaves", roles: ["admin", "department-head"] },
      { label: "Payroll", href: "/dashboard/payroll", roles: ["admin", "accounts"] },
    ],
    subGroups: [
      {
        label: "Attendance",
        icon: Clock,
        items: [
          { label: "Attendance", href: "/dashboard/attendance", roles: ["admin", "department-head"] },
          { label: "Import Attendance", href: "/dashboard/attendance/import", icon: FileText, roles: ["admin", "department-head"], feature: "attendance-import" },
          { label: "Corrections", href: "/dashboard/attendance/corrections", icon: ClipboardCheck, roles: ["admin", "department-head"] },
          { label: "Shifts", href: "/dashboard/attendance/shifts", icon: Hourglass, roles: ["admin"] },
          { label: "Attendance Reports", href: "/dashboard/attendance/reports", icon: BarChart3, roles: ["admin", "department-head", "accounts"] },
        ],
      },
    ],
  },

  // ─── Work Management ─────────────────────────────────────────────────
  {
    id: "work",
    label: "Work",
    icon: ClipboardList,
    roles: ["admin", "department-head"],
    items: [
      { label: "Task Board", href: "/dashboard/tasks", roles: ["admin", "department-head"] },
      { label: "Daily Updates", href: "/dashboard/tasks/daily-updates", roles: ["admin", "department-head"], feature: "work-logs" },
      { label: "Work Logs", href: "/dashboard/tasks/work-logs", roles: ["admin", "department-head"], feature: "work-logs" },
      { label: "Performance", href: "/dashboard/tasks/performance", roles: ["admin", "department-head"], feature: "work-logs" },
      { label: "Team Calendar", href: "/dashboard/calendar", icon: Calendar, roles: ["admin", "department-head"] },
    ],
  },

  // ─── Bookings (Events + Studio, one module — pairs with unified calendar) ─
  {
    id: "bookings",
    label: "Bookings",
    icon: PartyPopper,
    roles: ["admin", "department-head"],
    subGroups: [
      {
        label: "Events",
        icon: PartyPopper,
        items: [
          { label: "Dashboard", href: "/dashboard/events", roles: ["admin", "department-head"], feature: "events" },
          { label: "All Events", href: "/dashboard/events/list", roles: ["admin", "department-head"], feature: "events" },
          { label: "Event Calendar", href: "/dashboard/events/calendar", icon: Calendar, roles: ["admin", "department-head"], feature: "events" },
          { label: "Reports", href: "/dashboard/events/reports", icon: BarChart3, roles: ["admin", "department-head"], feature: "events" },
        ],
      },
      {
        label: "Studio",
        icon: Clapperboard,
        items: [
          { label: "Dashboard", href: "/dashboard/studio", roles: ["admin", "department-head"], feature: "studio-booking" },
          { label: "Bookings", href: "/dashboard/studio/bookings", roles: ["admin", "department-head"], feature: "studio-booking" },
          { label: "Calendar", href: "/dashboard/studio/calendar", icon: Calendar, roles: ["admin", "department-head"], feature: "studio-booking" },
          { label: "Timeline", href: "/dashboard/studio/timeline", roles: ["admin", "department-head"], feature: "studio-booking" },
          { label: "Availability", href: "/dashboard/studio/availability", roles: ["admin", "department-head"], feature: "studio-booking" },
          { label: "Resources", href: "/dashboard/studio/resources", roles: ["admin"], feature: "studio-manage" },
          { label: "Reports", href: "/dashboard/studio/reports", icon: BarChart3, roles: ["admin", "department-head"], feature: "studio-booking" },
        ],
      },
    ],
  },

  // ─── Asset Management ────────────────────────────────────────────────
  {
    id: "assets",
    label: "Assets",
    icon: Package,
    roles: ["admin", "department-head"],
    feature: "asset-management",
    items: [
      { label: "Asset List", href: "/dashboard/assets", roles: ["admin", "department-head"] },
      { label: "Movements", href: "/dashboard/assets/movements", roles: ["admin", "department-head"] },
      { label: "Availability", href: "/dashboard/assets/availability", roles: ["admin", "department-head"] },
      { label: "Events", href: "/dashboard/assets/events", roles: ["admin", "department-head"] },
      { label: "Categories", href: "/dashboard/assets/categories", roles: ["admin"] },
      { label: "Persons", href: "/dashboard/assets/persons", roles: ["admin", "department-head"] },
      { label: "Reports", href: "/dashboard/assets/reports", icon: BarChart3, roles: ["admin", "department-head"] },
    ],
  },

  // ─── Finance ─────────────────────────────────────────────────────────
  {
    id: "finance",
    label: "Finance",
    icon: DollarSign,
    roles: ["admin", "accounts"],
    items: [
      { label: "Accounting", href: "/dashboard/accounting", roles: ["admin", "accounts"] },
      { label: "Item Master", href: "/dashboard/items", roles: ["admin", "accounts"] },
    ],
    subGroups: [
      {
        label: "Sales",
        icon: Receipt,
        items: [
          { label: "Clients", href: "/dashboard/clients", icon: UserCheck, roles: ["admin", "department-head", "accounts"] },
          { label: "Quotations", href: "/dashboard/quotations", roles: ["admin", "accounts"] },
          { label: "Invoices", href: "/dashboard/invoices", roles: ["admin", "accounts"] },
        ],
      },
      {
        label: "Reports",
        icon: BarChart3,
        items: [
          { label: "Overview", href: "/dashboard/reports", roles: ["admin", "accounts"] },
          { label: "Department Reports", href: "/dashboard/reports/department", icon: FileText, roles: ["admin", "department-head", "accounts"] },
          { label: "Company Report", href: "/dashboard/reports/company", icon: BarChart3, roles: ["admin"] },
          { label: "KPI Management", href: "/dashboard/reports/kpis", roles: ["admin", "department-head"] },
          { label: "Productivity", href: "/dashboard/reports/productivity", roles: ["admin", "department-head"] },
        ],
      },
    ],
  },

  // ─── System / Settings ───────────────────────────────────────────────
  {
    id: "system",
    label: "System",
    icon: Settings,
    roles: ["admin"],
    items: [
      { label: "Companies", href: "/dashboard/companies", icon: Building2, roles: ["admin"] },
      { label: "Departments", href: "/dashboard/departments", icon: Layers, roles: ["admin"] },
      { label: "Notifications", href: "/dashboard/notifications", icon: Bell, roles: ["admin", "department-head", "accounts"] },
      { label: "Banners", href: "/dashboard/banners", icon: ImageIcon, roles: ["admin"] },
      { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageSquare, roles: ["admin"] },
      { label: "Audit Log", href: "/dashboard/audit-log", icon: Shield, roles: ["admin"] },
      { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["admin"] },
    ],
  },
];
