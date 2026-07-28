"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, ClipboardList, CalendarDays, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNavStore } from "@/store/mobile-nav-store";

// Mirrors PRIMARY_MOBILE_HREFS in lib/navigation.ts — the admin pages used daily.
const primaryTabs = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/attendance", label: "Attendance", icon: Clock },
  { href: "/dashboard/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/dashboard/leaves", label: "Leaves", icon: CalendarDays },
];

/** Admin mobile bottom bar: 4 daily-use pages + a "More" tab that opens the same
 * drawer as the sidebar's hamburger (which hides these 4 to avoid listing them twice). */
export function BottomNav() {
  const pathname = usePathname();
  const { open: drawerOpen, setOpen: setDrawerOpen } = useMobileNavStore();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-5">
        {primaryTabs.map((tab) => {
          const isActive = tab.href === "/dashboard" ? pathname === tab.href : pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setDrawerOpen(false)}
              className={cn(
                "flex flex-col items-center gap-1 pb-1.5 pt-2 text-[10px] font-medium transition-colors",
                isActive ? "text-indigo-600" : "text-slate-400"
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(!drawerOpen)}
          className={cn(
            "flex flex-col items-center gap-1 pb-1.5 pt-2 text-[10px] font-medium transition-colors",
            drawerOpen ? "text-indigo-600" : "text-slate-400"
          )}
        >
          <LayoutGrid className="h-5 w-5" />
          <span className="whitespace-nowrap">More</span>
        </button>
      </div>
    </nav>
  );
}
