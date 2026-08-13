"use client";

import { useEffect } from "react";

/** How long the app can sit in the background before a resume forces a refresh. */
const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * Registers the service worker so the browser offers "Install app", and
 * reloads the app when it is resumed after sitting hidden for a while —
 * installed PWAs keep pages alive for days, so data fetched on mount goes
 * stale until the user logs out/in. A reload re-fetches everything.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure just means no install prompt — not fatal.
      });
    }

    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // Resumed: pick up a newly deployed service worker, and hard-refresh stale UI
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
      }
      if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_MS) {
        window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return null;
}
