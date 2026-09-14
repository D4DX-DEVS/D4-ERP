import { describe, it, expect, beforeEach, vi } from "vitest";

// logout() posts to /api/auth/logout; nothing here needs a real network.
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));

beforeEach(() => {
  vi.resetModules();
});

describe("auth loading gate", () => {
  // The dashboard shell renders its "Preparing workspace" spinner while
  // isLoading is true, so anything that can leave that flag pinned hangs the
  // whole app. zustand's persist middleware has two such paths: it skips
  // hydration outright when localStorage is unavailable, and it invokes
  // onRehydrateStorage with an undefined state when hydration throws.

  it("resolves even when persisted storage is unavailable", async () => {
    // The Node test environment has no window.localStorage, so zustand's
    // createJSONStorage returns undefined and persist never hydrates — the same
    // state an iOS PWA reaches with site data blocked.
    const { useAuthStore, settleAuthLoading } = await import("./auth-store");
    settleAuthLoading();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("resolves when hydration fails and hands back no state", async () => {
    const { settleAuthLoading, useAuthStore } = await import("./auth-store");
    useAuthStore.setState({ isLoading: true });
    // Mirrors zustand/middleware.js calling postRehydrationCallback(undefined, err).
    settleAuthLoading();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("never clears a user that hydration already restored", async () => {
    const { useAuthStore, settleAuthLoading } = await import("./auth-store");
    useAuthStore.setState({ user: { uid: "u1" } as never, isLoading: true });
    settleAuthLoading();
    expect(useAuthStore.getState().user?.uid).toBe("u1");
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("is idempotent", async () => {
    const { useAuthStore, settleAuthLoading } = await import("./auth-store");
    settleAuthLoading();
    settleAuthLoading();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
