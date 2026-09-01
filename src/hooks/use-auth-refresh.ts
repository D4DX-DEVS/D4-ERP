"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { isInstalledApp } from "@/lib/pwa";

// Don't hammer /me on every tab flick — a resumed PWA re-syncs at most once a minute.
const RESYNC_MIN_INTERVAL_MS = 60_000;

/**
 * Re-sync role + granted features from the server so permission changes take
 * effect without logout/login. Server authorization is already fresh per
 * request; this keeps the UI (sidebar, guards) in step. Runs on workspace load
 * AND whenever the app returns to the foreground — installed PWAs stay mounted
 * for days, so a mount-only sync would never see grants made after login.
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
    let lastSyncAt = 0;

    const sync = () => {
      lastSyncAt = Date.now();
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
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastSyncAt < RESYNC_MIN_INTERVAL_MS) return;
      sync();
    };

    sync();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [uid, setUser]);
}
