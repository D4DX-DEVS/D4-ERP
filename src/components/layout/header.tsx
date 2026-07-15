"use client";

import { useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { Bell, ChevronRight, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTION_TITLES: Record<string, { title: string; description: string }> = {
  "/dashboard": { title: "Executive overview", description: "Track operations, people, and finance from one place." },
  "/dashboard/companies": { title: "Companies", description: "Manage business entities and legal structure." },
  "/dashboard/departments": { title: "Departments", description: "Review internal teams and reporting lines." },
  "/dashboard/staff": { title: "Staff directory", description: "Monitor team members, access, and assignments." },
  "/dashboard/clients": { title: "Clients", description: "Keep account relationships and follow-ups organized." },
  "/dashboard/leaves": { title: "Leave requests", description: "Handle approvals and staffing visibility." },
  "/dashboard/attendance": { title: "Attendance", description: "Watch punctuality and working-hour trends." },
  "/dashboard/payroll": { title: "Payroll", description: "Review payouts, schedules, and salary records." },
  "/dashboard/tasks": { title: "Task board", description: "Coordinate deliverables across departments." },
  "/dashboard/calendar": { title: "Calendar", description: "Stay aligned on upcoming events and deadlines." },
  "/dashboard/assets": { title: "Assets", description: "Track equipment usage, assignment, and lifecycle." },
  "/dashboard/assets/movements": { title: "Asset Movements", description: "Track asset check-outs, returns, and transfers." },
  "/dashboard/assets/events": { title: "Asset Events", description: "Schedule and manage asset-related events." },
  "/dashboard/assets/availability": { title: "Asset Availability", description: "Check real-time availability and scheduling." },
  "/dashboard/assets/categories": { title: "Asset Categories", description: "Organize assets into logical groups." },
  "/dashboard/assets/persons": { title: "Asset Persons", description: "Manage personnel associated with assets." },
  "/dashboard/assets/reports": { title: "Asset Reports", description: "Analyse utilisation, depreciation, and status metrics." },
  "/dashboard/accounting": { title: "Accounting", description: "Keep ledgers, expense flows, and cash movement aligned." },
  "/dashboard/invoices": { title: "Invoices", description: "Manage billing, payment state, and client dues." },
  "/dashboard/quotations": { title: "Quotations", description: "Prepare proposals and convert approved deals faster." },
  "/dashboard/reports": { title: "Reports", description: "Measure performance across operations and finance." },
  "/dashboard/notifications": { title: "Notifications", description: "Stay ahead of pending actions and internal updates." },
  "/dashboard/whatsapp": { title: "WhatsApp", description: "Coordinate outreach and messaging workflows." },
  "/dashboard/audit-log": { title: "Audit log", description: "Review sensitive actions and operational changes." },
  "/dashboard/settings": { title: "Settings", description: "Tune system preferences and platform behavior." },
};

export function Header() {
  const { user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date()),
    []
  );

  const currentSection = useMemo(() => {
    const matchedEntry = Object.entries(SECTION_TITLES)
      .filter(([route]) => pathname === route || pathname.startsWith(route + "/"))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return matchedEntry?.[1] ?? SECTION_TITLES["/dashboard"];
  }, [pathname]);

  const breadcrumb = useMemo(() => {
    if (!pathname) return ["Dashboard"];
    return pathname
      .split("/")
      .filter(Boolean)
      .slice(1)
      .map((segment) => segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()));
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 px-4 pt-3 sm:px-6 lg:px-8 lg:pt-4">
      <div className="page-frame glass-panel flex min-h-0 flex-row items-center justify-between gap-2 rounded-2xl px-3 py-2 sm:px-5 lg:min-h-[var(--header-height)] lg:rounded-[26px] lg:px-6 lg:py-3">
        <div className="min-w-0 pl-12 lg:pl-0">
          <div className="mb-2 hidden flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 lg:flex">
            <span>Admin Workspace</span>
            {breadcrumb.map((item, index) => (
              <span key={`${item}-${index}`} className="inline-flex items-center gap-2">
                <ChevronRight className="h-3 w-3" />
                <span>{item}</span>
              </span>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-lg font-semibold tracking-[-0.04em] text-slate-950 sm:text-[1.9rem]">
                {currentSection.title}
              </h1>
              <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 sm:inline-block">
                {todayLabel}
              </span>
            </div>
            <p className="hidden max-w-2xl text-[13px] leading-5 text-slate-500 lg:block">
              {currentSection.description} Welcome back, {user?.firstName}.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            className="hidden h-10 items-center gap-2 rounded-2xl border-slate-200/80 bg-white/70 px-3 text-sm text-slate-400 hover:text-slate-600 sm:inline-flex"
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
          >
            <Search className="h-4 w-4" />
            <span>Search...</span>
            <kbd className="ml-2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold">Ctrl K</kbd>
          </Button>
          <Button variant="outline" size="icon" className="relative" onClick={() => router.push("/dashboard/notifications")}>
            <Bell className="h-4.5 w-4.5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-orange-500" />
          </Button>

          <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-2 py-1.5 shadow-[0_10px_20px_rgba(15,23,42,0.06)] backdrop-blur-md">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center bg-transparent text-xs font-semibold text-white">
              <Image
                src="/favicon.svg"
                alt="D4 Admin"
                fill
                sizes="36px"
                className="object-contain"
              />
            </div>
            <div className="hidden pr-1 sm:block">
              <p className="text-[13px] font-semibold text-slate-900">{user?.firstName} {user?.lastName}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{user?.role?.replace("-", " ")}</p>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/logout")} title="Logout">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
