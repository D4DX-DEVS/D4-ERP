"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  Home,
  LogOut,
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
  { href: "/staff-portal/attendance", label: "Attendance", icon: Clock },
  { href: "/staff-portal/profile", label: "Profile", icon: User },
];

export default function StaffPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/staff-login");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white text-sm font-bold">
              D4
            </div>
            <div>
              <p className="text-sm font-semibold">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-gray-500 capitalize">{user.role}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => { logout(); router.push("/staff-login"); }}>
            <LogOut className="h-5 w-5 text-gray-500" />
          </Button>
        </div>
      </header>

      <main className="p-4 pb-24 max-w-2xl mx-auto">{children}</main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 px-2 py-2">
        <div className="flex justify-around max-w-2xl mx-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors",
                  isActive ? "text-emerald-600 font-medium" : "text-gray-500"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive ? "text-emerald-600" : "text-gray-400")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
