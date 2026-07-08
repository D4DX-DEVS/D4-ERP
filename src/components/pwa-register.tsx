"use client";

import { useEffect } from "react";

/** Registers the service worker so the browser offers "Install app". */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failure just means no install prompt — not fatal.
    });
  }, []);

  return null;
}
