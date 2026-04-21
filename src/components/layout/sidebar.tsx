"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import {
  LayoutDashboard,
  Building2,
  Layers,
  Users,
  CalendarDays,
  FileText,
  Receipt,
  UserCheck,
  DollarSign,
  ClipboardList,
  Package,
  Clock,
  Wallet,
  Bell,
  Shield,
  MessageSquare,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const menuSections = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "department-head", "accounts"] },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Companies", href: "/dashboard/companies", icon: Building2, roles: ["admin"] },
      { label: "Departments", href: "/dashboard/departments", icon: Layers, roles: ["admin"] },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Staff", href: "/dashboard/staff", icon: Users, roles: ["admin", "department-head"] },
      { label: "Clients", href: "/dashboard/clients", icon: UserCheck, roles: ["admin", "department-head", "accounts"] },
    ],
  },
  {
    title: "HR",
    items: [
      { label: "Leave Requests", href: "/dashboard/leaves", icon: CalendarDays, roles: ["admin", "department-head"] },
      { label: "Attendance", href: "/dashboard/attendance", icon: Clock, roles: ["admin", "department-head"] },
      { label: "Payroll", href: "/dashboard/payroll", icon: Wallet, roles: ["admin", "accounts"] },
    ],
  },
  {
    title: "Work",
    items: [
      { label: "Tasks", href: "/dashboard/tasks", icon: ClipboardList, roles: ["admin", "department-head"] },
      { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays, roles: ["admin", "department-head"] },
      { label: "Assets", href: "/dashboard/assets", icon: Package, roles: ["admin", "department-head"] },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Accounting", href: "/dashboard/accounting", icon: DollarSign, roles: ["admin", "accounts"] },
      { label: "Invoices", href: "/dashboard/invoices", icon: FileText, roles: ["admin", "accounts"] },
      { label: "Quotations", href: "/dashboard/quotations", icon: Receipt, roles: ["admin", "accounts"] },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Reports", href: "/dashboard/reports", icon: BarChart3, roles: ["admin", "accounts"] },
      { label: "Notifications", href: "/dashboard/notifications", icon: Bell, roles: ["admin", "department-head", "accounts"] },
      { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageSquare, roles: ["admin"] },
      { label: "Audit Log", href: "/dashboard/audit-log", icon: Shield, roles: ["admin"] },
      { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["admin"] },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r border-gray-200 bg-white transition-all duration-300 flex flex-col",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-bold">
              D4
            </div>
            <span className="font-semibold text-gray-900">D4 Media</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 hover:bg-gray-100 text-gray-500 cursor-pointer"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {menuSections.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !user?.role || item.roles.includes(user.role)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {section.title}
                </p>
              )}
              <ul className="space-y-1">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-blue-600" : "text-gray-400")} />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
