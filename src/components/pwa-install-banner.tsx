"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";

/** Custom install banner — Chrome only fires beforeinstallprompt after its own engagement heuristics, so we capture and show it ourselves instead of waiting on the native mini-infobar. */
export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (!deferredPrompt) return null;

  async function install() {
    await deferredPrompt!.prompt();
    await deferredPrompt!.userChoice;
    setDeferredPrompt(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDeferredPrompt(null);
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-xl border border-white/70 bg-white/90 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.12)] backdrop-blur">
      <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">Install D4 ERP</p>
        <p className="truncate text-xs text-slate-500">Quick access, app-like experience.</p>
      </div>
      <button
        onClick={install}
        className="shrink-0 cursor-pointer rounded-lg bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_24px_rgba(15,118,110,0.25)] transition-opacity hover:opacity-90"
      >
        Install
      </button>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-slate-400 transition-colors hover:text-slate-700">
        ✕
      </button>
    </div>
  );
}
