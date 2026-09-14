// ==================== Server-side authentication helpers ====================
// JWT signing/verification + httpOnly session cookie management.
// Used by auth routes (issue token) and the /api/db proxy (verify token).
// Server-only — never import into client components.

import "server-only";
import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE } from "./auth-cookie";

export { AUTH_COOKIE };

const DAY_SECONDS = 60 * 60 * 24;
const DEFAULT_BROWSER_TTL_DAYS = 7;
const DEFAULT_PWA_TTL_DAYS = 90;
/**
 * Browsers clamp a cookie's lifetime to 400 days (RFC 6265bis), silently. Going
 * past it would sign a JWT that outlives the cookie carrying it — the session
 * would look valid on paper and already be gone on the device.
 */
const MAX_TTL_DAYS = 400;

/** Read a lifetime in whole days from the environment, falling back on garbage. */
function ttlDaysFromEnv(name: string, defaultDays: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultDays * DAY_SECONDS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) {
    console.warn(`[auth] ${name}="${raw}" is not a positive number of days — using ${defaultDays}.`);
    return defaultDays * DAY_SECONDS;
  }
  // Floor to whole seconds: a fractional Max-Age is invalid and browsers drop
  // the cookie outright rather than rounding it.
  return Math.floor(Math.min(days, MAX_TTL_DAYS) * DAY_SECONDS);
}

/** Session lifetime for a plain browser tab. Override with SESSION_TTL_DAYS. */
export function browserTtlSeconds(): number {
  return ttlDaysFromEnv("SESSION_TTL_DAYS", DEFAULT_BROWSER_TTL_DAYS);
}

/**
 * Session lifetime for an installed PWA — behaves like a native app's one-time
 * login. Override with PWA_SESSION_TTL_DAYS.
 */
export function pwaTtlSeconds(): number {
  return ttlDaysFromEnv("PWA_SESSION_TTL_DAYS", DEFAULT_PWA_TTL_DAYS);
}

/**
 * Employment statuses that deny a session — checked by both login routes when
 * handing one out and by /api/auth/me on every renewal, so an account that is
 * shut off cannot ride out the remaining cookie window. Deliberately excludes
 * on-leave / notice-period / relieved: those people still use the app.
 */
export const SESSION_DENIED_STATUSES: ReadonlySet<string> = new Set(["terminated", "suspended"]);

/** True when this staff document must not hold a live session. */
export function isSessionDeniedStatus(status: unknown): boolean {
  return typeof status === "string" && SESSION_DENIED_STATUSES.has(status);
}

/** Resolve the JWT secret, failing loudly if it is not configured. */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET environment variable is missing or too short (min 16 chars). Set a strong secret in .env."
    );
  }
  return secret;
}

export interface TokenPayload {
  uid: string;
  email: string;
  role: string;
  name: string;
  /** Extra feature keys granted to this employee beyond their role defaults. */
  features?: string[];
}

export function signToken(payload: TokenPayload, ttlSeconds: number = browserTtlSeconds()): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ttlSeconds });
}

/** Verify a raw JWT string. Returns the payload or null when invalid/expired. */
export function verifyTokenString(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (!decoded || typeof decoded.uid !== "string" || typeof decoded.role !== "string") {
      return null;
    }
    return {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : "",
      role: decoded.role,
      name: typeof decoded.name === "string" ? decoded.name : "",
      features: Array.isArray(decoded.features)
        ? decoded.features.filter((f): f is string => typeof f === "string")
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Lifetime the given token was originally issued with, or null if it is not a
 * valid session. Lets a renewal keep the issuing context's window (the browser
 * or PWA lifetime it was signed with) without stashing that choice anywhere.
 */
export function tokenTtlSeconds(token: string | undefined | null): number | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (typeof decoded?.iat !== "number" || typeof decoded?.exp !== "number") return null;
    const ttl = decoded.exp - decoded.iat;
    return ttl > 0 ? ttl : null;
  } catch {
    return null;
  }
}

/**
 * TTL to renew a session with. Normally the window it was issued with, but a
 * request from an installed PWA upgrades a shorter browser-issued session to
 * the PWA window — covers "logged in from a browser tab, installed the app
 * afterwards", which would otherwise stay on the 7-day clock forever.
 */
export function renewalTtlSeconds(issuedTtl: number | null, isPwa: boolean): number | null {
  if (issuedTtl === null) return null;
  const pwaTtl = pwaTtlSeconds();
  if (isPwa && issuedTtl < pwaTtl) return pwaTtl;
  return issuedTtl;
}

/** Extract and verify the session from a request (cookie first, then Bearer header). */
export function getAuthUser(req: NextRequest): TokenPayload | null {
  const cookieToken = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookieToken) {
    const fromCookie = verifyTokenString(cookieToken);
    if (fromCookie) return fromCookie;
  }
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return verifyTokenString(header.slice(7));
  }
  return null;
}

/** Options for the httpOnly session cookie. */
export function sessionCookieOptions(maxAge: number = browserTtlSeconds()) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
