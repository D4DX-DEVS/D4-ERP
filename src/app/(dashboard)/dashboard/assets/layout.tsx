"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Package, ArrowLeftRight, CalendarDays, Search, BarChart3, Tag, Users } from "lucide-react";

const tabs = [
  { label: "Assets", href: "/dashboard/assets", icon: Package, exact: true },
  { label: "Movements", href: "/dashboard/assets/movements", icon: ArrowLeftRight },
  { label: "Events", href: "/dashboard/assets/events", icon: CalendarDays },
  { label: "Availability", href: "/dashboard/assets/availability", icon: Search },
  { label: "Categories", href: "/dashboard/assets/categories", icon: Tag },
  { label: "Persons", href: "/dashboard/assets/persons", icon: Users },
  { label: "Reports", href: "/dashboard/assets/reports", icon: BarChart3 },
];

export default function AssetsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(tab: typeof tabs[number]) {
    if (tab.exact) return pathname === tab.href;
    return pathname.startsWith(tab.href);
  }

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="glass-panel rounded-[20px] p-1.5 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 rounded-[14px] px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap",
                  active
                    ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
