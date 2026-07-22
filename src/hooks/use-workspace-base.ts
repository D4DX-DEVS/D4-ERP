"use client";

import { usePathname } from "next/navigation";

/**
 * Finance pages render in two shells: the admin dashboard and the staff
 * portal (feature-granted staff). Internal links must stay inside the shell
 * the user is currently in.
 */
export function useWorkspaceBase(): "/staff-portal" | "/dashboard" {
  const pathname = usePathname();
  return pathname?.startsWith("/staff-portal") ? "/staff-portal" : "/dashboard";
}
