import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import {
  signToken,
  verifyTokenString,
  getAuthUser,
  sessionCookieOptions,
  AUTH_COOKIE,
  type TokenPayload,
} from "@/lib/auth";

const SECRET = process.env.JWT_SECRET as string;

const samplePayload: TokenPayload = {
  uid: "user-123",
  email: "admin@d4media.in",
  role: "admin",
  name: "Ada Admin",
};

function makeRequest(init?: { cookie?: string; authorization?: string }): NextRequest {
  const headers = new Headers();
  if (init?.cookie) headers.set("cookie", init.cookie);
  if (init?.authorization) headers.set("authorization", init.authorization);
  return new NextRequest("https://example.com/api/db", { headers });
}

describe("JWT authentication", () => {
  it("signs a token that round-trips back to the same payload", () => {
    const token = signToken(samplePayload);
    const decoded = verifyTokenString(token);
    expect(decoded).toMatchObject(samplePayload);
  });

  it("produces a token verifiable with the configured secret", () => {
    const token = signToken(samplePayload);
    const raw = jwt.verify(token, SECRET) as jwt.JwtPayload;
    expect(raw.uid).toBe("user-123");
    expect(raw.role).toBe("admin");
    expect(raw.exp).toBeTypeOf("number");
  });

  it("returns null for an empty or missing token", () => {
    expect(verifyTokenString(undefined)).toBeNull();
    expect(verifyTokenString(null)).toBeNull();
    expect(verifyTokenString("")).toBeNull();
  });

  it("returns null for a malformed token", () => {
    expect(verifyTokenString("not-a-jwt")).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign(samplePayload, "some-other-secret-which-is-long", {
      expiresIn: "7d",
    });
    expect(verifyTokenString(forged)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign(samplePayload, SECRET, { expiresIn: -10 });
    expect(verifyTokenString(expired)).toBeNull();
  });

  it("rejects a token missing required claims", () => {
    const incomplete = jwt.sign({ email: "x@y.z" }, SECRET, { expiresIn: "7d" });
    expect(verifyTokenString(incomplete)).toBeNull();
  });

  describe("secret enforcement", () => {
    it("throws when JWT_SECRET is missing", () => {
      const original = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        expect(() => signToken(samplePayload)).toThrow(/JWT_SECRET/);
      } finally {
        process.env.JWT_SECRET = original;
      }
    });

    it("throws when JWT_SECRET is too short", () => {
      const original = process.env.JWT_SECRET;
      process.env.JWT_SECRET = "short";
      try {
        expect(() => signToken(samplePayload)).toThrow(/JWT_SECRET/);
      } finally {
        process.env.JWT_SECRET = original;
      }
    });
  });

  describe("getAuthUser", () => {
    it("reads a valid session from the cookie", () => {
      const token = signToken(samplePayload);
      const req = makeRequest({ cookie: `${AUTH_COOKIE}=${token}` });
      expect(getAuthUser(req)).toMatchObject({ uid: "user-123", role: "admin" });
    });

    it("reads a valid session from a Bearer header", () => {
      const token = signToken(samplePayload);
      const req = makeRequest({ authorization: `Bearer ${token}` });
      expect(getAuthUser(req)).toMatchObject({ uid: "user-123" });
    });

    it("returns null when no credentials are present", () => {
      expect(getAuthUser(makeRequest())).toBeNull();
    });

    it("returns null for an invalid cookie token", () => {
      const req = makeRequest({ cookie: `${AUTH_COOKIE}=garbage` });
      expect(getAuthUser(req)).toBeNull();
    });

    it("ignores a non-Bearer authorization header", () => {
      const req = makeRequest({ authorization: "Basic abc123" });
      expect(getAuthUser(req)).toBeNull();
    });
  });

  describe("sessionCookieOptions", () => {
    it("marks the cookie httpOnly and lax", () => {
      const opts = sessionCookieOptions();
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe("lax");
      expect(opts.path).toBe("/");
      expect(opts.maxAge).toBeGreaterThan(0);
    });

    it("supports an immediate-expiry cookie for logout", () => {
      expect(sessionCookieOptions(0).maxAge).toBe(0);
    });
  });
});
