"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { hasFeature } from "@/lib/permissions";
import type { StaffRole } from "@/types";
import type { FeatureKey } from "@/lib/permissions";

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
  "/dashboard/assets/movements": ["admin", "department-head"],
  "/dashboard/assets/events": ["admin", "department-head"],
  "/dashboard/assets/availability": ["admin", "department-head"],
  "/dashboard/assets/categories": ["admin"],
  "/dashboard/assets/persons": ["admin", "department-head"],
  "/dashboard/assets/reports": ["admin", "department-head"],
  "/dashboard/events": ["admin", "department-head"],
  "/dashboard/studio": ["admin", "department-head"],
  "/dashboard/studio/resources": ["admin"],
  "/dashboard/accounting": ["admin", "accounts"],
  "/dashboard/invoices": ["admin", "accounts"],
  "/dashboard/quotations": ["admin", "accounts"],
  "/dashboard/reports": ["admin", "department-head", "accounts"],
  "/dashboard/reports/department": ["admin", "department-head", "accounts"],
  "/dashboard/reports/company": ["admin"],
  "/dashboard/notifications": ["admin", "department-head", "accounts"],
  "/dashboard/whatsapp": ["admin"],
  "/dashboard/audit-log": ["admin"],
  "/dashboard/settings": ["admin"],
};

/** Routes that can also be accessed if the user has a granted feature. */
const ROUTE_FEATURES: Record<string, FeatureKey> = {
  "/dashboard/studio": "studio-booking",
  "/dashboard/studio/bookings": "studio-booking",
  "/dashboard/studio/calendar": "studio-booking",
  "/dashboard/studio/timeline": "studio-booking",
  "/dashboard/studio/availability": "studio-booking",
  "/dashboard/studio/resources": "studio-manage",
  "/dashboard/events": "events",
  "/dashboard/assets": "asset-management",
  "/dashboard/calendar": "calendar",
  "/dashboard/clients": "clients",
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

/** Get the feature key that grants access to a route, if any. */
function getRouteFeature(pathname: string): FeatureKey | null {
  if (ROUTE_FEATURES[pathname]) return ROUTE_FEATURES[pathname];
  const parts = pathname.split("/");
  while (parts.length > 2) {
    parts.pop();
    const parent = parts.join("/");
    if (ROUTE_FEATURES[parent]) return ROUTE_FEATURES[parent];
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
        // Check if user has a feature that grants access to this route
        const feature = getRouteFeature(pathname);
        const featureSubject = { role: user.role, grantedFeatures: user.grantedFeatures };
        if (!feature || !hasFeature(featureSubject, feature)) {
          router.replace("/dashboard");
        }
      }
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="mesh-bg flex min-h-screen items-center justify-center px-6">
        <div className="glass-panel flex items-center gap-4 rounded-[28px] px-6 py-5 text-slate-700">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-teal-600/20 border-t-teal-600" />
          <div>
            <p className="text-sm font-semibold text-slate-950">Preparing workspace</p>
            <p className="text-sm text-slate-500">Loading your dashboard shell and access rules.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // Check role access before rendering
  const allowedRoles = getRouteRoles(pathname);
  const routeFeature = getRouteFeature(pathname);
  const featureSubject = { role: user.role, grantedFeatures: user.grantedFeatures };
  const hasRoleAccess = !allowedRoles || allowedRoles.includes(user.role as StaffRole);
  const hasFeatureAccess = routeFeature ? hasFeature(featureSubject, routeFeature) : false;
  if (!hasRoleAccess && !hasFeatureAccess) {
    return (
      <div className="mesh-bg flex min-h-screen items-center justify-center px-6">
        <div className="glass-panel max-w-lg rounded-[32px] px-8 py-10 text-center">
          <p className="eyebrow justify-center">Restricted</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Access denied</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">You don&apos;t have permission to access this section with your current role.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mesh-bg min-h-screen">
      <Sidebar />
      <div className="relative z-10 min-h-screen lg:pl-[calc(var(--sidebar-width)+1.75rem)]">
        <Header />
        <main className="page-frame px-4 pb-16 pt-4 sm:px-5 lg:px-6 lg:pt-5">
          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}
