"use client";

import Link from "next/link";
import Image from "next/image";
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
  ClipboardCheck,
  Hourglass,
  Wallet,
  Bell,
  Shield,
  MessageSquare,
  BarChart3,
  Settings,
  Menu,
  Sparkles,
  X,
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
      { label: "Corrections", href: "/dashboard/attendance/corrections", icon: ClipboardCheck, roles: ["admin", "department-head"] },
      { label: "Shifts", href: "/dashboard/attendance/shifts", icon: Hourglass, roles: ["admin"] },
      { label: "Attendance Reports", href: "/dashboard/attendance/reports", icon: BarChart3, roles: ["admin", "department-head", "accounts"] },
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
      { label: "Item Master", href: "/dashboard/items", icon: Package, roles: ["admin", "accounts"] },
      { label: "Sales Reports", href: "/dashboard/reports/sales", icon: BarChart3, roles: ["admin", "accounts"] },
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeSidebar = () => setMobileOpen(false);

  // Resolve the single most-specific matching link so a parent route isn't
  // highlighted at the same time as its child route.
  const activeHref = menuSections
    .flatMap((section) => section.items)
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="fixed left-4 top-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/70 bg-white/85 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:hidden"
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        className={cn(
          "fixed inset-0 z-30 bg-slate-950/18 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeSidebar}
      />

      <aside
        className={cn(
          "glass-panel fixed inset-y-3 left-3 z-40 flex w-[min(82vw,280px)] flex-col overflow-hidden rounded-[28px] transition-transform duration-300 lg:inset-y-4 lg:left-4 lg:w-[var(--sidebar-width)]",
          mobileOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0"
        )}
      >
        <div className="border-b border-slate-200/70 px-3.5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="flex items-center gap-2.5" onClick={closeSidebar}>
              <div className="relative h-10 w-10 shrink-0 bg-transparent">
                <Image
                  src="/favicon.png"
                  alt="D4 Media ERP"
                  fill
                  sizes="40px"
                  priority
                  className="object-contain"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Media ERP</p>
                <p className="text-sm font-semibold tracking-[-0.03em] text-slate-950">Admin Console</p>
              </div>
            </Link>

            <div className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 lg:inline-flex">
              Live
            </div>
          </div>

          <div className="mt-3 rounded-[18px] bg-slate-950 px-3 py-2.5 text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                <Sparkles className="h-4.5 w-4.5 text-emerald-300" />
              </div>
              <div>
                <p className="text-[13px] font-semibold">Operations overview</p>
                <p className="text-[11px] leading-4 text-white/70">Teams, finance, and controls.</p>
              </div>
            </div>
          </div>
        </div>

        <nav className="sidebar-scroll flex-1 space-y-3 overflow-y-auto px-2.5 py-3">
          {menuSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !user?.role || item.roles.includes(user.role)
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title}>
                <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {section.title}
                </p>
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive = item.href === activeHref;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={closeSidebar}
                          className={cn(
                            "group flex items-center gap-2 rounded-[14px] px-2.5 py-2 text-[13px] font-medium transition-all",
                            isActive
                              ? "bg-slate-950 text-white shadow-[0_10px_20px_rgba(15,23,42,0.12)]"
                              : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-[11px] transition-colors",
                              isActive ? "bg-white/10 text-white" : "bg-white/80 text-slate-500 group-hover:text-slate-950"
                            )}
                          >
                            <item.icon className="h-4 w-4" />
                          </span>
                          <span className="flex-1">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200/70 px-2.5 py-2.5">
          <div className="rounded-[16px] bg-white/75 px-3 py-2">
            <p className="text-[13px] font-semibold text-slate-950">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{user?.role?.replace("-", " ")}</p>
          </div>
        </div>
      </aside>
    </>
  );
}
