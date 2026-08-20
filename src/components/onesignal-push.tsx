"use client";

import Script from "next/script";
import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";

// OneSignal web push. The app id is public by design (the REST key stays on the
// server, in /api/push). Without the env var the component renders nothing, so
// local dev works untouched.
const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

type OneSignalApi = {
  init: (opts: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  Notifications: { permission: boolean; requestPermission: () => Promise<void> };
  Slidedown: { promptPush: () => Promise<void> };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalApi) => void | Promise<void>>;
  }
}

function whenReady(fn: (os: OneSignalApi) => void | Promise<void>) {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

// login()/logout() throw if init() has not finished (or failed), so everything
// downstream waits on this one promise instead of racing the SDK.
let initDone: Promise<void> | null = null;

// Push needs a secure origin, and OneSignal rejects init outright when the
// origin is not the Site URL configured on the app ("Can only be used on:
// https://..."). On http://localhost that is expected, not a fault — skip the
// SDK entirely so dev consoles stay clean. To actually test push locally,
// enable Local Testing in the app's Web config instead.
function pushSupportedHere() {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

export function OneSignalPush() {
  const user = useAuthStore((s) => s.user);

  // init once — the deferred queue runs it whenever the SDK finishes loading.
  useEffect(() => {
    if (!APP_ID || !pushSupportedHere()) return;
    if (initDone) return;
    initDone = new Promise((resolve, reject) => {
      whenReady((OneSignal) =>
        OneSignal.init({
          appId: APP_ID,
          // The PWA already owns a worker at "/" (public/sw.js). Giving OneSignal
          // its own scope keeps the two registrations from evicting each other.
          serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/onesignal/" },
        }).then(resolve, reject)
      );
    });
    initDone.catch((error) => console.error("OneSignal init failed:", error));
  }, []);

  // Tie the browser subscription to the staff record so the server can push by
  // staff id, and drop it on logout so a shared device stops receiving.
  useEffect(() => {
    if (!APP_ID || !pushSupportedHere()) return;
    const uid = user?.uid;
    whenReady(async (OneSignal) => {
      try {
        await initDone;
        if (!uid) {
          await OneSignal.logout();
          return;
        }
        await OneSignal.login(uid);
        if (!OneSignal.Notifications.permission) {
          await OneSignal.Slidedown.promptPush();
        }
      } catch (error) {
        console.error("OneSignal subscribe failed:", error);
      }
    });
  }, [user?.uid]);

  // Render-time origin checks would differ between server and client, so the
  // tag always ships and only init() is gated above — an uninitialised SDK is inert.
  if (!APP_ID) return null;
  return (
    <Script
      id="onesignal-sdk"
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
    />
  );
}
