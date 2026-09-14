"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { AuthUser } from "@/types";
import { setAuditUser } from "@/lib/firestore";
import { isInstalledApp } from "@/lib/pwa";

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

/**
 * localStorage that cannot throw, falling back to memory.
 *
 * Safari refuses storage access outright when site data is blocked, and a full
 * quota makes writes fail. zustand's persist wrapper writes through to storage
 * on EVERY set(), so an unguarded failure turns ordinary state updates —
 * including the one that dismisses the loading screen — into exceptions. A
 * session that lives only in memory for one launch beats an app that cannot
 * render at all.
 */
function createSafeStorage(): StateStorage {
  const memory = new Map<string, string>();

  const backing = ((): Storage | null => {
    if (typeof window === "undefined") return null;
    try {
      const store = window.localStorage;
      // Some browsers only throw on first use, so probe before trusting it.
      const probe = "__d4_storage_probe__";
      store.setItem(probe, probe);
      store.removeItem(probe);
      return store;
    } catch {
      return null;
    }
  })();

  return {
    getItem: (name) => {
      try {
        return backing ? backing.getItem(name) : memory.get(name) ?? null;
      } catch {
        return memory.get(name) ?? null;
      }
    },
    setItem: (name, value) => {
      try {
        if (backing) backing.setItem(name, value);
        else memory.set(name, value);
      } catch {
        memory.set(name, value);
      }
    },
    removeItem: (name) => {
      try {
        if (backing) backing.removeItem(name);
        else memory.delete(name);
      } catch {
        memory.delete(name);
      }
    },
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      setUser: (user) => {
        setAuditUser(user ? { uid: user.uid, firstName: user.firstName, lastName: user.lastName } : null);
        set({ user, isLoading: false });
      },
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => {
        setAuditUser(null);
        // Clear the httpOnly session cookie on the server (best-effort).
        if (typeof window !== "undefined") {
          fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
        }
        set({ user: null, isLoading: false });
      },
    }),
    {
      name: "d4media-auth",
      storage: createJSONStorage(createSafeStorage),
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          // Corrupt or unreadable persisted blob — start signed out rather than
          // leaving the shell wedged. settleAuthLoading below is what actually
          // releases it, because `state` is undefined on this path.
          console.warn("[auth] could not restore the saved session:", error);
        }
        // Re-set audit user when store rehydrates from localStorage
        if (state?.user) {
          setAuditUser({ uid: state.user.uid, firstName: state.user.firstName, lastName: state.user.lastName });
        }
        state?.setLoading(false);
      },
    }
  )
);

/**
 * Release the loading gate that the dashboard shell blocks on.
 *
 * `onRehydrateStorage` cannot be trusted to do this on its own. zustand's
 * persist middleware has two paths where it never reports a usable state:
 *
 *  - localStorage access throws (iOS with site data blocked, a locked-down
 *    WKWebView, storage disabled) — `createJSONStorage` returns undefined and
 *    persist skips hydration entirely, so the callback never fires at all.
 *  - hydration throws (a half-written persisted blob after iOS kills the app
 *    mid-write) — the callback runs with `state` undefined, so the
 *    `state?.setLoading(false)` above silently no-ops.
 *
 * Either way `isLoading` stays true and the app hangs on "Preparing workspace"
 * forever. This is the backstop; it only ever clears the flag, never the user.
 */
export function settleAuthLoading() {
  if (useAuthStore.getState().isLoading) {
    useAuthStore.setState({ isLoading: false });
  }
}

/**
 * When the server last confirmed this session. Shared with useAuthRefresh so a
 * cold start that restores from the cookie does not immediately ask /api/auth/me
 * the same question a second time.
 */
let lastSessionSyncAt = 0;

export function markSessionSynced(at: number = Date.now()) {
  lastSessionSyncAt = at;
}

export function sessionSyncedWithin(ms: number): boolean {
  return lastSessionSyncAt > 0 && Date.now() - lastSessionSyncAt < ms;
}

/** Abort signal that gives up after `ms`, on browsers old enough to lack the helper. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController === "undefined") return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Rebuild the session from the httpOnly cookie when the persisted copy is gone.
 *
 * iOS evicts site storage (localStorage) long before it drops a cookie, so an
 * installed PWA routinely comes back with a live session and no memory of who
 * owns it. Without this the shell sees no user and bounces a perfectly
 * authenticated employee to the login screen — one of the ways "I have to log in
 * again every time" happens without anything having actually expired.
 *
 * Never throws and never blocks for long: the caller releases the loading gate
 * in a finally, so a slow or offline network costs a spinner, not a lockout.
 */
async function restoreSessionFromCookie(): Promise<void> {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "same-origin",
      cache: "no-store",
      // Lets the server upgrade a browser-issued window to the PWA one.
      headers: isInstalledApp() ? { "x-pwa": "1" } : undefined,
      signal: timeoutSignal(8000),
    });
    // The server answered, so the session question is settled for now — even a
    // 401. Only a network failure leaves it unanswered.
    markSessionSynced();
    if (!res.ok) return; // 401 = genuinely signed out; 503 = retry later, stay put.
    const me = (await res.json()) as { user?: AuthUser };
    if (me?.user?.uid) useAuthStore.getState().setUser(me.user);
  } catch {
    // Offline or timed out. The cookie is still on the device, so the next
    // launch gets another chance — better than forcing a login now.
  }
}

// Hydration is synchronous for localStorage, so by the time this runs zustand
// has already restored the session on the happy path.
// Client-only: on the server there is nothing to restore, and releasing the gate
// there would change what the shell renders during SSR.
if (typeof window !== "undefined") {
  if (useAuthStore.getState().user) {
    settleAuthLoading();
  } else {
    void restoreSessionFromCookie().finally(settleAuthLoading);
  }
}
