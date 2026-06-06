"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { StaffRole } from "@/types";
import { hasFeature, type FeatureKey } from "@/lib/permissions";

/**
 * Hook that guards a page to specific roles.
 * Redirects unauthorized users to /dashboard.
 * Returns { user, authorized } — render nothing until authorized is true.
 */
export function useRoleGuard(allowedRoles: StaffRole[]) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && !allowedRoles.includes(user.role as StaffRole)) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, allowedRoles, router]);

  const authorized = !isLoading && !!user && allowedRoles.includes(user.role as StaffRole);

  return { user, authorized, isLoading };
}

/**
 * Hook that guards a page to users who have a specific feature (role default or
 * explicitly granted). Redirects unauthorized users to /dashboard.
 */
export function useFeatureGuard(feature: FeatureKey) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  const authorized = !isLoading && !!user && hasFeature(user, feature);

  useEffect(() => {
    if (!isLoading && user && !hasFeature(user, feature)) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, feature, router]);

  return { user, authorized, isLoading };
}
