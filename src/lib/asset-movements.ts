import { hasFeature, type FeatureSubject } from "@/lib/permissions";
import type { Asset, AssetCondition, AssetDamageType, AssetMovementStatus } from "@/types";

/**
 * Server-side rules for the asset movement API. Kept out of the route handler
 * so the authorization, condition and asset-status decisions are unit-tested
 * rather than inferred from the endpoint's behaviour.
 */

/** Every action the movement endpoint answers. Anything else is rejected. */
export const MOVEMENT_ACTIONS = [
  "checkout",
  "return",
  "check-availability",
  "get-reports",
  "update-damage-report",
  "event-movement-counts",
  "get-event-out-movements",
  "get-event-movements",
  "validate-event-delete",
] as const;

export type MovementAction = (typeof MOVEMENT_ACTIONS)[number];

const ACTION_SET = new Set<string>(MOVEMENT_ACTIONS);

/**
 * Error message when the caller may not run `action`, else null.
 *
 * Reads and writes both require the `asset-management` feature — by role
 * default (admin, department-head) or an explicit grant, exactly as the
 * asset collections are gated in db-authz. Evaluate against CURRENT grants
 * from the staff record, never the feature claim carried in the JWT.
 */
export function authorizeMovementAction(
  subject: FeatureSubject | null | undefined,
  action: string
): string | null {
  if (!ACTION_SET.has(action)) return "Invalid action";
  if (!subject) return "You do not have permission to manage asset movements.";
  if (!hasFeature(subject, "asset-management")) {
    return "You do not have permission to manage asset movements.";
  }
  return null;
}

/**
 * Condition at issue and at return, resolved for both the split fields and
 * legacy documents that carried a single `condition` overwritten on return.
 * A legacy returned movement cannot say what condition it left in, so the
 * issue condition reads as unknown rather than a comforting "good".
 */
export function movementConditions(movement: {
  status?: AssetMovementStatus | string;
  condition?: AssetCondition | string;
  outCondition?: AssetCondition | string;
  inCondition?: AssetCondition | string;
}): { out: AssetCondition | null; in: AssetCondition | null } {
  const isIn = movement.status === "IN";
  const out = (movement.outCondition as AssetCondition | undefined) ??
    (isIn ? null : ((movement.condition as AssetCondition | undefined) ?? "good"));
  const inCond = isIn
    ? ((movement.inCondition as AssetCondition | undefined) ??
       (movement.condition as AssetCondition | undefined) ??
       "good")
    : null;
  return { out: out ?? null, in: inCond };
}

/** Asset status once it is issued out. A retired asset keeps its status. */
export function assetStatusAfterCheckout(current?: Asset["status"] | string): Asset["status"] {
  if (current === "retired") return "retired";
  return "assigned";
}

/**
 * Asset status once it comes back. Damaged and defective items go to
 * maintenance; a missing item stays `assigned` because it is not in the store,
 * and a retired asset is never revived by a return.
 */
export function assetStatusAfterReturn(
  current: Asset["status"] | string | undefined,
  condition: AssetCondition | string | undefined
): Asset["status"] {
  if (current === "retired") return "retired";
  if (condition === "damaged" || condition === "defective") return "maintenance";
  if (condition === "missing") return "assigned";
  return "available";
}

/** Damage report type for a condition, or null when nothing is wrong. */
export function damageTypeFor(condition?: AssetCondition | string): AssetDamageType | null {
  if (condition === "damaged") return "damage";
  if (condition === "defective") return "defect";
  if (condition === "missing") return "missing";
  return null;
}

/** Hard ceiling on rows a single report request may return. */
export const REPORT_EXPORT_MAX = 5000;

const DEFAULT_REPORT_LIMIT = 10;

/**
 * Skip/limit for a report request. `all` is the export path: the whole
 * filtered set (capped), not just the page the table happens to show.
 */
export function reportSlice(opts: { page?: number; limit?: number; all?: boolean }): {
  skip: number;
  limit: number;
} {
  if (opts.all) return { skip: 0, limit: REPORT_EXPORT_MAX };
  const rawLimit = Number(opts.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), REPORT_EXPORT_MAX)
    : DEFAULT_REPORT_LIMIT;
  const rawPage = Number(opts.page);
  const page = Number.isFinite(rawPage) && rawPage > 1 ? Math.floor(rawPage) : 1;
  return { skip: (page - 1) * limit, limit };
}
