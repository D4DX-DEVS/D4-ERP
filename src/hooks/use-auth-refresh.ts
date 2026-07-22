"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";

/**
 * Re-sync role + granted features from the server on workspace load so
 * permission changes take effect without logout/login. Server authorization
 * is already fresh per request; this keeps the UI (sidebar, guards) in step.
 */
export function useAuthRefresh() {
  const { user, setUser } = useAuthStore();
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
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
