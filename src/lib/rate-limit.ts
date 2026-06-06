// ==================== Simple in-memory rate limiter ====================
// Best-effort brute-force protection for auth endpoints.
// NOTE: per-instance only. For multi-instance deployments, back this with
// Redis/Upstash. Sufficient to slow credential-stuffing on a single node.

import "server-only";

interface Attempt {
  count: number;
  resetAt: number;
}

const store = new Map<string, Attempt>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Records an attempt for `key`. Returns whether it is allowed under the limit.
 * @param key      Unique bucket (e.g. `login:<ip>`).
 * @param max      Max attempts per window.
 * @param windowMs Window length in ms.
 */
export function rateLimit(key: string, max = 10, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort client IP from forwarding headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}
