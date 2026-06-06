import { describe, it, expect } from "vitest";
import { rateLimit, clientIp } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows requests under the limit", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 1000).allowed).toBe(true);
    }
  });

  it("blocks requests over the limit and reports retry time", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const key = `test-${Math.random()}`;
    rateLimit(key, 1, 1); // window of 1ms
    rateLimit(key, 1, 1); // exceed
    // Wait past the window without sleeping by using a fresh short window.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(rateLimit(key, 1, 1).allowed).toBe(true);
        resolve();
      }, 10);
    });
  });

  it("keeps separate buckets per key", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 60_000);
    rateLimit(a, 1, 60_000); // a is now over
    expect(rateLimit(b, 1, 60_000).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("reads the first IP from x-forwarded-for", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" },
    });
    expect(clientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("https://x.test", {
      headers: { "x-real-ip": "198.51.100.7" },
    });
    expect(clientIp(req)).toBe("198.51.100.7");
  });

  it("returns 'unknown' when no IP headers exist", () => {
    expect(clientIp(new Request("https://x.test"))).toBe("unknown");
  });
});
