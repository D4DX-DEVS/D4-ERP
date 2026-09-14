import { describe, it, expect, beforeEach, vi } from "vitest";

const DAY = 60 * 60 * 24;

beforeEach(() => {
  // TTLs are read from the environment, so each case needs a fresh module.
  vi.resetModules();
  delete process.env.SESSION_TTL_DAYS;
  delete process.env.PWA_SESSION_TTL_DAYS;
});

describe("session lifetime configuration", () => {
  it("keeps the shipped defaults when nothing is configured", async () => {
    const { browserTtlSeconds, pwaTtlSeconds } = await import("./auth");
    expect(browserTtlSeconds()).toBe(7 * DAY);
    expect(pwaTtlSeconds()).toBe(90 * DAY);
  });

  it("reads whole days from the environment", async () => {
    process.env.SESSION_TTL_DAYS = "30";
    process.env.PWA_SESSION_TTL_DAYS = "365";
    const { browserTtlSeconds, pwaTtlSeconds } = await import("./auth");
    expect(browserTtlSeconds()).toBe(30 * DAY);
    expect(pwaTtlSeconds()).toBe(365 * DAY);
  });

  it("clamps to the 400-day ceiling browsers enforce on cookies", async () => {
    // A longer JWT would outlive the cookie carrying it — the session would look
    // valid on paper and be gone in the browser.
    process.env.PWA_SESSION_TTL_DAYS = "9999";
    const { pwaTtlSeconds } = await import("./auth");
    expect(pwaTtlSeconds()).toBe(400 * DAY);
  });

  it("falls back to the default on unparseable input", async () => {
    process.env.SESSION_TTL_DAYS = "forever";
    const { browserTtlSeconds } = await import("./auth");
    expect(browserTtlSeconds()).toBe(7 * DAY);
  });

  it("rejects zero and negative windows instead of issuing a dead cookie", async () => {
    process.env.SESSION_TTL_DAYS = "0";
    process.env.PWA_SESSION_TTL_DAYS = "-5";
    const { browserTtlSeconds, pwaTtlSeconds } = await import("./auth");
    expect(browserTtlSeconds()).toBe(7 * DAY);
    expect(pwaTtlSeconds()).toBe(90 * DAY);
  });

  it("signs and stamps the cookie with the configured window", async () => {
    process.env.PWA_SESSION_TTL_DAYS = "365";
    const { signToken, tokenTtlSeconds, pwaTtlSeconds, sessionCookieOptions } = await import("./auth");
    const ttl = pwaTtlSeconds();
    const token = signToken({ uid: "u1", email: "a@b.c", role: "staff", name: "A B" }, ttl);
    expect(tokenTtlSeconds(token)).toBe(365 * DAY);
    expect(sessionCookieOptions(ttl).maxAge).toBe(365 * DAY);
  });

  it("defaults the cookie window to the configured browser TTL", async () => {
    process.env.SESSION_TTL_DAYS = "30";
    const { sessionCookieOptions } = await import("./auth");
    expect(sessionCookieOptions().maxAge).toBe(30 * DAY);
  });
});
