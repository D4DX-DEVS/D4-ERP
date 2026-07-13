"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { countDocuments, getDocument, where } from "@/lib/firestore";
import { Staff } from "@/types";
import Link from "next/link";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  ClipboardList,
  Clock,
  FileText,
  Home,
  LayoutGrid,
  LogOut,
  Pencil,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/staff-portal", label: "Home", icon: Home },
  { href: "/staff-portal/leave", label: "Apply Leave", icon: CalendarDays },
  { href: "/staff-portal/my-leaves", label: "My Leaves", icon: FileText },
  { href: "/staff-portal/my-tasks", label: "My Tasks", icon: ClipboardList },
  { href: "/staff-portal/work-log", label: "Work Log", icon: Pencil },
  { href: "/staff-portal/attendance", label: "Attendance", icon: Clock },
  { href: "/staff-portal/holidays", label: "Holidays", icon: CalendarOff },
  { href: "/staff-portal/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/staff-portal/notifications", label: "Alerts", icon: Bell },
  { href: "/staff-portal/profile", label: "Profile", icon: User },
];

// Standard 5-slot app bottom bar: 4 primary tabs + "More" sheet for the rest.
const mobileTabs = [
  { href: "/staff-portal", label: "Home", icon: Home },
  { href: "/staff-portal/leave", label: "Leave", icon: CalendarDays },
  { href: "/staff-portal/my-tasks", label: "Tasks", icon: ClipboardList },
  { href: "/staff-portal/attendance", label: "Attendance", icon: Clock },
];

const moreItems = navItems.filter((item) => !mobileTabs.some((tab) => tab.href === item.href));

export default function StaffPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const currentItem = navItems.find((item) => pathname === item.href) ?? navItems[0];

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/staff-login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    countDocuments("notifications", [where("recipientId", "==", user.staffId), where("isRead", "==", false)])
      .then(setUnread)
      .catch((error) => console.error("Error:", error));
  }, [user, pathname]);

  useEffect(() => {
    if (!user?.staffId) return;
    getDocument<Staff>("staff", user.staffId)
      .then((s) => { if (s?.profileImage) setProfileImage(s.profileImage); })
      .catch(() => {});
  }, [user?.staffId]);

  if (isLoading || !user) {
    return (
      <div className="mesh-bg flex min-h-screen items-center justify-center px-6">
        <div className="glass-panel flex items-center gap-4 rounded-[28px] px-6 py-5 text-slate-700">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-600/20 border-t-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-slate-950">Loading staff portal</p>
            <p className="text-sm text-slate-500">Syncing your schedule, leave data, and quick actions.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mesh-bg min-h-screen">
      <aside className="glass-panel fixed inset-y-5 left-5 z-20 hidden w-[280px] flex-col overflow-hidden rounded-[32px] lg:flex">
        <div className="border-b border-slate-200/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-500 text-sm font-black tracking-[0.2em] text-white shadow-[0_16px_34px_rgba(16,185,129,0.28)]">
              D4
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Staff portal</p>
              <p className="text-base font-semibold tracking-[-0.03em] text-slate-950">Your workspace</p>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] bg-slate-950 px-4 py-3 text-white shadow-[0_18px_38px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-semibold">{user.firstName} {user.lastName}</p>
            <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-white/65">{user.role.replace("-", " ")}</p>
            <p className="mt-2 text-[13px] leading-5 text-white/70">Quick access to attendance, leave, profile, and tasks.</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide px-4 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-[20px] px-3.5 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-slate-950 text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)]"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-2xl transition-colors",
                  isActive ? "bg-white/10 text-white" : "bg-white/80 text-slate-500 group-hover:text-slate-950"
                )}>
                  <item.icon className="h-4.5 w-4.5" />
                </span>
                <span className="flex-1">{item.label}</span>
                {item.href === "/staff-portal/notifications" && unread > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>
                )}
                {isActive && <ArrowUpRight className="h-4 w-4 text-white/70" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200/70 p-4">
          <Button variant="outline" className="w-full justify-between" onClick={() => router.push("/staff-portal/logout")}>
            Exit portal
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      <div className="relative z-10 min-h-screen lg:pl-[304px]">
        <header className="px-4 pt-4 sm:px-6 lg:px-8 lg:pt-5">
          <div className="page-frame glass-panel flex min-h-[var(--header-height)] flex-col justify-between gap-4 rounded-[32px] px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
            <div>
              <p className="eyebrow">{currentItem.label}</p>
              <div className="mt-2 space-y-1">
                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2rem]">
                  {currentItem.label}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-500">
                  Welcome back, {user.firstName}. Everything you need for your day is organized here.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 self-end lg:self-auto">
              <div className="flex items-center gap-3 rounded-full border border-white/70 bg-white/70 px-2 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 text-sm font-semibold text-white">
                  {profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileImage} alt={`${user.firstName} ${user.lastName}`} className="h-full w-full object-cover" />
                  ) : (
                    <>{user.firstName.charAt(0)}{user.lastName.charAt(0)}</>
                  )}
                </div>
                <div className="hidden pr-1 sm:block">
                  <p className="text-sm font-semibold text-slate-900">{user.firstName} {user.lastName}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{user.role.replace("-", " ")}</p>
                </div>
              </div>

              <Button variant="ghost" size="icon" onClick={() => router.push("/staff-portal/logout")}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        <main className="page-frame px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pt-6">
          <div className="animate-slide-up">{children}</div>
        </main>
      </div>

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-slate-950/40" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-16px_40px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-medium",
                      isActive ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600"
                    )}
                  >
                    <span className="relative">
                      <item.icon className="h-5 w-5" />
                      {item.href === "/staff-portal/notifications" && unread > 0 && (
                        <span className="absolute -right-2 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{unread}</span>
                      )}
                    </span>
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => router.push("/staff-portal/logout")}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-rose-50 px-2 py-3 text-xs font-medium text-rose-600"
              >
                <LogOut className="h-5 w-5" />
                <span className="whitespace-nowrap">Exit Portal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standard app bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {mobileTabs.map((item) => {
            const isActive = pathname === item.href && !moreOpen;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex flex-col items-center gap-1 pb-1.5 pt-2 text-[10px] font-medium transition-colors",
                  isActive ? "text-emerald-600" : "text-slate-400"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className={cn(
              "flex flex-col items-center gap-1 pb-1.5 pt-2 text-[10px] font-medium transition-colors",
              moreOpen || moreItems.some((item) => pathname === item.href) ? "text-emerald-600" : "text-slate-400"
            )}
          >
            <span className="relative">
              <LayoutGrid className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">{unread}</span>
              )}
            </span>
            <span className="whitespace-nowrap">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
