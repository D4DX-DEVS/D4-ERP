import "server-only";

// ==================== New request checks (server) ====================
// Run by /api/db before a staff request is stored. The form already warns about
// both of these; this is the part a direct API call cannot skip.
//   1. No second live request for a day (or overtime window) already claimed.
//   2. Flexible leave fits the wallet it names, after what is already pending.

import { getModel } from "@/models";
import { normalizeSettings, type AppSettings } from "@/lib/settings";
import {
  allowsNegativeBalance,
  computeLeaveLedger,
  consumesLeaveBalance,
  resolveQuota,
  walletOf,
  type LeavePolicyConfig,
} from "@/lib/leave-ledger";
import {
  findRequestConflict,
  pendingWalletDays,
  requestDayCount,
  type ConflictRequest,
} from "@/lib/request-conflicts";
import { REQUEST_TYPE_LABELS } from "@/lib/request-labels";
import { DEFAULT_TIME_ZONE, dateKeyInZone } from "@/lib/tz";
import type { FlexWallet, LeaveAdjustment, Staff, StaffRequest, SundayDuty } from "@/types";

type Doc = Record<string, unknown>;

/** Mongo Dates → the { seconds } timestamps the pure ledger reads. */
function toTimestamps<T>(value: unknown): T {
  if (value instanceof Date) return { seconds: Math.floor(value.getTime() / 1000), nanoseconds: 0 } as T;
  if (Array.isArray(value)) return value.map((v) => toTimestamps(v)) as T;
  if (value && typeof value === "object") {
    const out: Doc = {};
    for (const [k, v] of Object.entries(value as Doc)) out[k] = k === "_id" ? String(v) : toTimestamps(v);
    return out as T;
  }
  return value as T;
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = (await getModel("settings").findOne({}).lean()) as Partial<AppSettings> | null;
    return normalizeSettings(raw);
  } catch {
    return normalizeSettings(null);
  }
}

/** Error message, or null when the request may be stored. `data` is the create payload (Dates). */
export async function validateNewRequest(data: Doc): Promise<string | null> {
  const staffId = String(data.staffId ?? "");
  const start = data.startDate instanceof Date ? data.startDate : null;
  if (!staffId || !start) return null; // shape is checked by authorizeRequestCreate

  const Requests = getModel("leaveRequests");
  // A generous window: a long leave that started earlier can still cover the day.
  const windowStart = new Date(start.getTime() - 120 * 86400000);
  const live = (await Requests.find({
    staffId,
    status: { $in: ["pending", "approved"] },
    $or: [{ endDate: { $gte: windowStart } }, { startDate: { $gte: windowStart } }],
  }).lean()) as (Doc & ConflictRequest)[];

  const candidate = data as unknown as ConflictRequest;
  const clash = findRequestConflict(candidate, live);
  if (clash) {
    const label = REQUEST_TYPE_LABELS[clash.type as StaffRequest["type"]] ?? String(clash.type);
    const day = dateKeyInZone(clash.startDate, DEFAULT_TIME_ZONE);
    return `You already have a ${clash.status} ${label.toLowerCase()} request for ${day}. Cancel it first or pick other dates.`;
  }

  if (!consumesLeaveBalance(String(data.type)) || data.leaveType !== "CO") return null;
  const wallet = (data.leaveWallet as FlexWallet | undefined) ?? "FL";
  const year = Number(dateKeyInZone(start, DEFAULT_TIME_ZONE)?.slice(0, 4));

  const [settings, staffDoc, approved, adjustments, duties] = await Promise.all([
    loadSettings(),
    getModel("staff").findById(staffId).select("employmentType contractType leaveQuota").lean(),
    Requests.find({ staffId, status: "approved" }).lean(),
    getModel("leave_adjustments").find({ staffId, year }).lean(),
    getModel("sunday_duties").find({ staffId, year }).lean(),
  ]);
  const staff = staffDoc as Pick<Staff, "employmentType" | "contractType" | "leaveQuota"> | null;
  const policy = settings.leavePolicy as LeavePolicyConfig;
  if (allowsNegativeBalance(staff, policy)) return null;

  const ledger = computeLeaveLedger({
    requests: toTimestamps<StaffRequest[]>(approved),
    adjustments: toTimestamps<LeaveAdjustment[]>(adjustments),
    sundayDuties: toTimestamps<SundayDuty[]>(duties),
    quota: resolveQuota(staff, policy),
    year,
    allowNegative: false,
    fullDayHours: settings.attendanceRules?.fullDayHours,
  });
  const available = walletOf(ledger, wallet).balance - pendingWalletDays(live, wallet);
  const requested = requestDayCount(candidate);
  if (requested > available) {
    const name = wallet === "OT" ? "overtime leave (OT)" : "flexible leave (FL)";
    return `Not enough ${name} balance: ${Math.max(0, available)} day(s) available after pending requests, ${requested} requested.`;
  }
  return null;
}
