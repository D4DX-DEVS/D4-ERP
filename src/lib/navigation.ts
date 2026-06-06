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
  // ─── Dashboard ───────────────────────────────────────────────────────
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "department-head", "accounts"],
    href: "/dashboard",
  },

  // ─── Organization ────────────────────────────────────────────────────
  {
    id: "organization",
    label: "Organization",
    icon: Building2,
    roles: ["admin"],
    items: [
      { label: "Companies", href: "/dashboard/companies", icon: Building2, roles: ["admin"] },
      { label: "Departments", href: "/dashboard/departments", icon: Layers, roles: ["admin"] },
    ],
  },

  // ─── People (HRMS) ──────────────────────────────────────────────────
  {
    id: "people",
    label: "People",
    icon: Users,
    roles: ["admin", "department-head", "accounts"],
    subGroups: [
      {
        label: "Employees",
        icon: Users,
        items: [
          { label: "Staff", href: "/dashboard/staff", roles: ["admin", "department-head"] },
          { label: "Clients", href: "/dashboard/clients", icon: UserCheck, roles: ["admin", "department-head", "accounts"] },
        ],
      },
      {
        label: "Attendance",
        icon: Clock,
        items: [
          { label: "Attendance", href: "/dashboard/attendance", roles: ["admin", "department-head"] },
          { label: "Corrections", href: "/dashboard/attendance/corrections", icon: ClipboardCheck, roles: ["admin", "department-head"] },
          { label: "Shifts", href: "/dashboard/attendance/shifts", icon: Hourglass, roles: ["admin"] },
          { label: "Attendance Reports", href: "/dashboard/attendance/reports", icon: BarChart3, roles: ["admin", "department-head", "accounts"] },
        ],
      },
      {
        label: "Leave Management",
        icon: CalendarDays,
        items: [
          { label: "Leave Requests", href: "/dashboard/leaves", roles: ["admin", "department-head"] },
        ],
      },
      {
        label: "Payroll",
        icon: Wallet,
        items: [
          { label: "Payroll", href: "/dashboard/payroll", roles: ["admin", "accounts"] },
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
    subGroups: [
      {
        label: "Tasks",
        icon: ClipboardList,
        items: [
          { label: "Task Board", href: "/dashboard/tasks", roles: ["admin", "department-head"] },
        ],
      },
      {
        label: "Calendar",
        icon: Calendar,
        items: [
          { label: "Team Calendar", href: "/dashboard/calendar", roles: ["admin", "department-head"] },
        ],
      },
      {
        label: "Studio Booking",
        icon: Clapperboard,
        items: [
          { label: "Bookings", href: "/dashboard/studio", roles: ["admin", "department-head"], feature: "studio-booking" },
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
    subGroups: [
      {
        label: "Accounting",
        icon: DollarSign,
        items: [
          { label: "Accounting", href: "/dashboard/accounting", roles: ["admin", "accounts"] },
        ],
      },
      {
        label: "Sales",
        icon: Receipt,
        items: [
          { label: "Quotations", href: "/dashboard/quotations", roles: ["admin", "accounts"] },
          { label: "Invoices", href: "/dashboard/invoices", roles: ["admin", "accounts"] },
        ],
      },
      {
        label: "Inventory",
        icon: Package,
        items: [
          { label: "Item Master", href: "/dashboard/items", roles: ["admin", "accounts"] },
        ],
      },
      {
        label: "Reports",
        icon: BarChart3,
        items: [
          { label: "Sales Reports", href: "/dashboard/reports/sales", roles: ["admin", "accounts"] },
          { label: "Financial Reports", href: "/dashboard/reports", roles: ["admin", "accounts"] },
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
      { label: "Notifications", href: "/dashboard/notifications", icon: Bell, roles: ["admin", "department-head", "accounts"] },
      { label: "Banners", href: "/dashboard/banners", icon: ImageIcon, roles: ["admin"] },
      { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageSquare, roles: ["admin"] },
      { label: "Audit Log", href: "/dashboard/audit-log", icon: Shield, roles: ["admin"] },
      { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["admin"] },
    ],
  },
];
