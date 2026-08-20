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
