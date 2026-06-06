// ==================== Server-side authentication helpers ====================
// JWT signing/verification + httpOnly session cookie management.
// Used by auth routes (issue token) and the /api/db proxy (verify token).
// Server-only — never import into client components.

import "server-only";
import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE } from "./auth-cookie";

export { AUTH_COOKIE };
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_TTL_SECONDS });
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
export function sessionCookieOptions(maxAge: number = TOKEN_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
