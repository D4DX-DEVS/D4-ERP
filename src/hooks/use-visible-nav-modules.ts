"use client";

import { useCallback, useMemo } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useNavConfigStore } from "@/store/nav-config-store";
import { hasFeature } from "@/lib/permissions";
import { navigationModules } from "@/lib/navigation";

/** Role/feature/config-aware nav visibility — shared by the sidebar drawer and the mobile bottom bar. */
export function useVisibleNavModules() {
  const { user } = useAuthStore();
  const { config } = useNavConfigStore();

  const isVisible = useCallback(
    (roles: string[], feature?: string, href?: string) => {
      if (!user?.role) return false;

      // Admin always has full access — except the staff self-service portal
      // (admins have no attendance/leave self-service; they manage those pages).
      if (user.role === "admin") {
        if (href) return !href.startsWith("/staff-portal");
        return !roles.every((r) => r === "staff");
      }

      // Baseline role/feature check
      const baselineVisible = roles.includes(user.role) || (feature && hasFeature(user, feature as Parameters<typeof hasFeature>[1]));
      if (!baselineVisible) return false;

      // Apply config-based filters if config is loaded
      if (config && href) {
        // Check staff override first (allow/deny)
        if (config.staffOverrides?.[user.staffId]) {
          const override = config.staffOverrides[user.staffId];
          if (override.deny?.includes(href)) return false;
          if (override.allow?.includes(href)) return true;
        }

        // Check role menu list
        const roleMenuItems = config.roleMenus?.[user.role];
        if (roleMenuItems) {
          return roleMenuItems.includes(href);
        }
      }

      return baselineVisible;
    },
    [user, config]
  );

  const visibleModules = useMemo(() => {
    return navigationModules.filter((mod) => {
      if (mod.href && isVisible(mod.roles, mod.feature, mod.href)) return true;
      if (!mod.href && isVisible(mod.roles, mod.feature)) return true;
      // Module with no matching role/feature still shows if any child item is visible
      // (e.g. staff granted "studio-booking" under the merged Bookings module).
      const children = [
        ...(mod.items ?? []),
        ...(mod.subGroups?.flatMap((sg) => sg.items) ?? []),
      ];
      return children.some((item) => isVisible(item.roles, item.feature, item.href));
    });
  }, [isVisible]);

  return { isVisible, visibleModules };
}
