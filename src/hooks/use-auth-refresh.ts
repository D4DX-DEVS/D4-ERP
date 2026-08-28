"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { isInstalledApp } from "@/lib/pwa";

/**
 * Re-sync role + granted features from the server on workspace load so
 * permission changes take effect without logout/login. Server authorization
 * is already fresh per request; this keeps the UI (sidebar, guards) in step.
 *
 * A 401 means the session cookie is gone/expired while the persisted user
 * still lives in localStorage — every API call would fail with "Unauthorized"
 * until re-login. Clear the store so the layout redirects to the login page.
 * Network failures (offline PWA) deliberately do NOT log out.
 */
export function useAuthRefresh() {
  const { user, setUser } = useAuthStore();
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    // x-pwa lets the server upgrade a browser-issued session to the PWA
    // lifetime when the app was installed after login.
    fetch("/api/auth/me", { headers: isInstalledApp() ? { "x-pwa": "1" } : undefined })
      .then((r) => {
        if (r.status === 401) {
          useAuthStore.getState().logout();
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((me: { role?: string; grantedFeatures?: string[] } | null) => {
        const current = useAuthStore.getState().user;
        if (!me?.role || !current || current.uid !== uid) return;
        const sameGrants =
          JSON.stringify([...(me.grantedFeatures ?? [])].sort()) ===
          JSON.stringify([...(current.grantedFeatures ?? [])].sort());
        if (me.role !== current.role || !sameGrants) {
          setUser({ ...current, role: me.role as typeof current.role, grantedFeatures: me.grantedFeatures ?? [] });
        }
      })
      .catch(() => {});
  }, [uid, setUser]);
}
