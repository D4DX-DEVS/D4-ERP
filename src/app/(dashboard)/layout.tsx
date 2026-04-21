"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { StaffRole } from "@/types";

// Route-level role access map — mirrors sidebar.tsx roles
const ROUTE_ROLES: Record<string, StaffRole[]> = {
  "/dashboard": ["admin", "department-head", "accounts"],
  "/dashboard/companies": ["admin"],
  "/dashboard/departments": ["admin"],
  "/dashboard/staff": ["admin", "department-head"],
  "/dashboard/clients": ["admin", "department-head", "accounts"],
  "/dashboard/leaves": ["admin", "department-head"],
  "/dashboard/attendance": ["admin", "department-head"],
  "/dashboard/payroll": ["admin", "accounts"],
  "/dashboard/tasks": ["admin", "department-head"],
  "/dashboard/calendar": ["admin", "department-head"],
  "/dashboard/assets": ["admin", "department-head"],
  "/dashboard/accounting": ["admin", "accounts"],
  "/dashboard/invoices": ["admin", "accounts"],
  "/dashboard/quotations": ["admin", "accounts"],
  "/dashboard/reports": ["admin", "accounts"],
  "/dashboard/notifications": ["admin", "department-head", "accounts"],
  "/dashboard/whatsapp": ["admin"],
  "/dashboard/audit-log": ["admin"],
  "/dashboard/settings": ["admin"],
};

function getRouteRoles(pathname: string): StaffRole[] | null {
  // Check exact match first, then prefix (for /dashboard/staff/[id] etc.)
  if (ROUTE_ROLES[pathname]) return ROUTE_ROLES[pathname];
  // Check parent paths (e.g. /dashboard/invoices/abc → /dashboard/invoices)
  const parts = pathname.split("/");
  while (parts.length > 2) {
    parts.pop();
    const parent = parts.join("/");
    if (ROUTE_ROLES[parent]) return ROUTE_ROLES[parent];
  }
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  // Role-based route protection
  useEffect(() => {
    if (!isLoading && user && pathname) {
      const allowedRoles = getRouteRoles(pathname);
      if (allowedRoles && !allowedRoles.includes(user.role as StaffRole)) {
        router.replace("/dashboard");
      }
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  // Check role access before rendering
  const allowedRoles = getRouteRoles(pathname);
  if (allowedRoles && !allowedRoles.includes(user.role as StaffRole)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
          <p className="text-gray-500">You don&apos;t have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="pl-[260px]">
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
