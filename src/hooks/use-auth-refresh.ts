"use client";

import { useEffect } from "react";
import { useAuthStore, markSessionSynced, sessionSyncedWithin } from "@/store/auth-store";
import { setUnauthorizedHandler, clearUnauthorizedHandler } from "@/lib/firestore";
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
 * Network failures (offline PWA) and 5xx deliberately do NOT log out.
 *
 * Also routes the data layer's 401s to the same place: without that, a session
 * that dies mid-use leaves the user staring at "Unauthorized" errors on a
 * dashboard that still thinks it is signed in.
 */
export function useAuthRefresh() {
  const { user, setUser } = useAuthStore();
  const uid = user?.uid;

  useEffect(() => {
    const onUnauthorized = () => useAuthStore.getState().logout();
    setUnauthorizedHandler(onUnauthorized);
    return () => clearUnauthorizedHandler(onUnauthorized);
  }, []);

  useEffect(() => {
    if (!uid) return;

    const sync = () => {
      markSessionSynced();
      // x-pwa lets the server upgrade a browser-issued session to the PWA
      // lifetime when the app was installed after login.
      fetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
        headers: isInstalledApp() ? { "x-pwa": "1" } : undefined,
      })
        .then((r) => {
          if (r.status === 401) {
            useAuthStore.getState().logout();
            return null;
          }
          // 5xx/503 is the server having a bad moment, not a dead session —
          // leave the user signed in and try again on the next foreground.
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
      if (sessionSyncedWithin(RESYNC_MIN_INTERVAL_MS)) return;
      sync();
    };

    // The store may have just restored this session from the cookie; no need to
    // ask the server the same thing twice on one cold start.
    if (!sessionSyncedWithin(RESYNC_MIN_INTERVAL_MS)) sync();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [uid, setUser]);
}
