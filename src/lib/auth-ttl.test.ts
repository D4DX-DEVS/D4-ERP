import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-that-is-long-enough";
});

const payload = { uid: "u1", email: "a@b.c", role: "staff", name: "A B" };

describe("tokenTtlSeconds", () => {
  it("reports the lifetime a token was issued with", async () => {
    const { signToken, tokenTtlSeconds } = await import("./auth");
    expect(tokenTtlSeconds(signToken(payload, 3600))).toBe(3600);
    expect(tokenTtlSeconds(signToken(payload, 60 * 60 * 24 * 90))).toBe(60 * 60 * 24 * 90);
  });

  it("returns null for junk, so renewal never resurrects a dead session", async () => {
    const { tokenTtlSeconds } = await import("./auth");
    expect(tokenTtlSeconds(undefined)).toBeNull();
    expect(tokenTtlSeconds("not-a-jwt")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const { signToken, tokenTtlSeconds } = await import("./auth");
    expect(tokenTtlSeconds(signToken(payload, -10))).toBeNull();
  });
});

describe("renewalTtlSeconds", () => {
  it("keeps the issued window for a plain browser session", async () => {
    const { renewalTtlSeconds } = await import("./auth");
    expect(renewalTtlSeconds(3600, false)).toBe(3600);
  });

  it("upgrades a browser-issued session to the PWA window when the app is installed", async () => {
    const { renewalTtlSeconds, PWA_TOKEN_TTL_SECONDS } = await import("./auth");
    expect(renewalTtlSeconds(60 * 60 * 24 * 7, true)).toBe(PWA_TOKEN_TTL_SECONDS);
  });

  it("never shortens an already-long PWA session", async () => {
    const { renewalTtlSeconds, PWA_TOKEN_TTL_SECONDS } = await import("./auth");
    expect(renewalTtlSeconds(PWA_TOKEN_TTL_SECONDS, true)).toBe(PWA_TOKEN_TTL_SECONDS);
    expect(renewalTtlSeconds(PWA_TOKEN_TTL_SECONDS, false)).toBe(PWA_TOKEN_TTL_SECONDS);
  });

  it("passes null through — a dead session is never renewed", async () => {
    const { renewalTtlSeconds } = await import("./auth");
    expect(renewalTtlSeconds(null, true)).toBeNull();
    expect(renewalTtlSeconds(null, false)).toBeNull();
  });
});
