"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { StaffRole } from "@/types";

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
