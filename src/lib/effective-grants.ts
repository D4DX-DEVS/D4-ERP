import "server-only";

// Server-only: resolve a caller's CURRENT role + feature grants from the staff
// document. JWT claims are a login-time snapshot and go stale the moment an
// admin edits permissions — every authorization decision must use this instead
// of `user.role` / `user.features` from the token (same rule /api/db follows).
import { getModel } from "@/models";
import type { TokenPayload } from "@/lib/auth";
import type { FeatureSubject } from "@/lib/permissions";

export async function effectiveSubject(user: TokenPayload): Promise<FeatureSubject> {
  try {
    const staff = (await getModel("staff")
      .findById(user.uid)
      .select("role grantedFeatures")
      .lean()) as { role?: string; grantedFeatures?: unknown } | null;
    return {
      role: staff?.role || user.role,
      grantedFeatures: Array.isArray(staff?.grantedFeatures)
        ? (staff.grantedFeatures as unknown[]).filter((f): f is string => typeof f === "string")
        : [],
    };
  } catch {
    // DB hiccup: fall back to token claims — stale beats a hard 500 on read paths.
    return { role: user.role, grantedFeatures: user.features ?? [] };
  }
}
