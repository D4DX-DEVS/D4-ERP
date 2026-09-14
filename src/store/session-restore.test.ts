import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Exercises the module-level wiring in auth-store.ts, not just the helper it
 * calls. The Node test environment has no window, so each case installs the
 * minimum browser surface the store touches and then imports it fresh.
 */

const USER = {
  uid: "u1",
  email: "a@d4.in",
  role: "admin",
  staffId: "u1",
  firstName: "Ada",
  lastName: "Admin",
  companyId: "c1",
  departmentId: "d1",
  grantedFeatures: [],
};

function installBrowser({ standalone = false } = {}) {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: standalone }),
    localStorage: undefined,
  });
  vi.stubGlobal("navigator", { standalone });
  vi.stubGlobal("document", { referrer: "" });
}

/** Lets a test await the store's fire-and-forget bootstrap. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restoring a session from the cookie", () => {
  it("rebuilds the user when storage was evicted but the cookie survived", async () => {
    // Exactly what an installed iOS PWA looks like after the OS clears site
    // storage: no persisted user, but /api/auth/me still authenticates.
    installBrowser();
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ user: USER }) })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useAuthStore } = await import("./auth-store");
    await flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().user?.uid).toBe("u1");
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("asks for the PWA window when running as an installed app", async () => {
    installBrowser({ standalone: true });
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ user: USER }) })
    );
    vi.stubGlobal("fetch", fetchMock);

    await import("./auth-store");
    await flush();

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: { "x-pwa": "1" } });
  });

  it("stays signed out on 401 without hanging the shell", async () => {
    installBrowser();
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }) })
    ));

    const { useAuthStore } = await import("./auth-store");
    await flush();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("does not sign the user out when the server is merely unavailable", async () => {
    installBrowser();
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ error: "unavailable" }) })
    ));

    const { useAuthStore } = await import("./auth-store");
    await flush();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  // The bug behind the screenshot: the shell must always leave "Preparing
  // workspace", whatever the network did.
  it("releases the loading gate even when the request rejects", async () => {
    installBrowser();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    const { useAuthStore } = await import("./auth-store");
    await flush();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

describe("sync clock shared with useAuthRefresh", () => {
  it("marks the session synced after the server answers, so the hook does not re-ask", async () => {
    // Without this a storage-evicted cold start hits /api/auth/me twice: once to
    // restore the user, then again because restoring set a uid.
    installBrowser();
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ user: USER }) })
    ));

    const { sessionSyncedWithin } = await import("./auth-store");
    await flush();

    expect(sessionSyncedWithin(60_000)).toBe(true);
  });

  it("counts a 401 as an answer — the session question is settled", async () => {
    installBrowser();
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }) })
    ));

    const { sessionSyncedWithin } = await import("./auth-store");
    await flush();

    expect(sessionSyncedWithin(60_000)).toBe(true);
  });

  it("leaves the session unsynced when the network never answered", async () => {
    // Offline: the hook must still be free to try again.
    installBrowser();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    const { sessionSyncedWithin } = await import("./auth-store");
    await flush();

    expect(sessionSyncedWithin(60_000)).toBe(false);
  });

  it("reports a stale sync as expired", async () => {
    installBrowser();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const { markSessionSynced, sessionSyncedWithin } = await import("./auth-store");

    markSessionSynced(Date.now() - 120_000);
    expect(sessionSyncedWithin(60_000)).toBe(false);
    markSessionSynced();
    expect(sessionSyncedWithin(60_000)).toBe(true);
  });
});
