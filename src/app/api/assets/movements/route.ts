import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { itemBusyReason, type BookingLike, type MovementLike, type AssetEventLike } from "@/lib/asset-availability";
import {
  assetStatusAfterCheckout,
  assetStatusAfterReturn,
  authorizeMovementAction,
  damageTypeFor,
  reportSlice,
} from "@/lib/asset-movements";
import type { StudioBookingStatus } from "@/types";

/** Load + normalize cross-availability inputs (all OUT movements, asset-events, studio bookings). */
async function loadAvailabilityContext(): Promise<{
  outMovements: MovementLike[];
  assetEvents: AssetEventLike[];
  studioBookings: BookingLike[];
}> {
  const [outs, events, bookings] = await Promise.all([
    getModel("asset-movements").find({ status: "OUT" }).lean(),
    getModel("asset-events").find().lean(),
    getModel("studio_bookings").find().lean(),
  ]);
  const idOf = (d: Record<string, unknown>) => (d._id as { toString(): string }).toString();
  return {
    outMovements: (outs as Record<string, unknown>[]).map((m) => ({
      assetId: String(m.assetId ?? ""),
      eventId: String(m.eventId ?? ""),
      eventName: m.eventName as string | undefined,
      status: String(m.status ?? ""),
    })),
    assetEvents: (events as Record<string, unknown>[]).map((e) => ({
      id: idOf(e),
      name: e.name as string | undefined,
      fromDate: e.fromDate,
      toDate: e.toDate,
    })),
    studioBookings: (bookings as Record<string, unknown>[]).map((b) => ({
      id: idOf(b),
      date: String(b.date ?? ""),
      startTime: String(b.startTime ?? ""),
      endTime: String(b.endTime ?? ""),
      status: b.status as StudioBookingStatus,
      reservedItems: b.reservedItems as BookingLike["reservedItems"],
      purpose: b.purpose as string | undefined,
      studioName: b.studioName as string | undefined,
    })),
  };
}

/**
 * Record an asset-status sync that failed after its movement was committed.
 * The movement is the source of truth; this leaves a trail so the stale
 * `asset.status` can be reconciled instead of drifting unnoticed.
 */
async function logStatusSyncFailure(
  ActivityLog: ReturnType<typeof getModel>,
  actorName: string,
  assetId: string,
  assetName: unknown,
  direction: "OUT" | "IN"
): Promise<void> {
  try {
    await ActivityLog.create({
      userName: actorName,
      action: "STATUS-SYNC-FAILED",
      module: "Movements",
      resourceId: assetId,
      details: `Asset "${assetName || assetId}" status not updated after ${direction}; movement is authoritative`,
      createdAt: new Date(),
    });
  } catch { /* logging never breaks main flow */ }
}

export async function POST(req: NextRequest) {
  try {
    // ── Authentication: every movement request requires a valid session ─────
    const authUser = getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    await connectDB();

    // ── Authorization on CURRENT grants (never the JWT claim, which can be
    // stale for up to the token TTL after an admin edits permissions) ───────
    const staffDoc = (await getModel("staff")
      .findById(authUser.uid)
      .select("role grantedFeatures")
      .lean()) as { role?: string; grantedFeatures?: unknown } | null;
    const denied = authorizeMovementAction(
      {
        role: staffDoc?.role || authUser.role,
        grantedFeatures: Array.isArray(staffDoc?.grantedFeatures)
          ? (staffDoc.grantedFeatures as unknown[]).filter((f): f is string => typeof f === "string")
          : [],
      },
      typeof action === "string" ? action : ""
    );
    if (denied) {
      return NextResponse.json({ error: denied }, { status: denied === "Invalid action" ? 400 : 403 });
    }

    // Trusted actor identity from the verified token — never the request body,
    // which any caller could set to someone else's name.
    const actorName = authUser.name || authUser.email || "Unknown";

    const Movement = getModel("asset-movements");
    const Asset = getModel("assets");
    const DamageReport = getModel("asset-damage-reports");
    const ActivityLog = getModel("asset-activity-logs");

    // ── CHECKOUT (Issue asset) ──────────────────────────────────────────
    if (action === "checkout") {
      const { assetId, assetName, assetCategory, eventId, eventName, eventLocation, allocatedPersonId, allocatedPersonName, condition, damageReason, remarks } = body;

      if (!assetId || !eventId || !allocatedPersonId) {
        return NextResponse.json({ error: "Missing required fields: assetId, eventId, allocatedPersonId" }, { status: 400 });
      }

      // Enforce allowOutside gate
      const asset = await Asset.findById(assetId).lean();
      if (!asset) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
      // allowOutside defaults to true if not explicitly set to false
      if ((asset as Record<string, unknown>).allowOutside === false) {
        return NextResponse.json({ error: "This asset is not allowed to be taken outside" }, { status: 403 });
      }

      // Prevent duplicate OUT for same asset+event
      const existing = await Movement.findOne({ assetId, eventId, status: "OUT" });
      if (existing) {
        return NextResponse.json({ error: "This asset is already checked out for this event" }, { status: 409 });
      }

      // Hard block: reject if the asset is committed elsewhere (studio booking or
      // another event) during this event's window.
      const eventDoc = (await getModel("asset-events").findById(eventId).lean()) as Record<string, unknown> | null;
      if (eventDoc) {
        const ctx = await loadAvailabilityContext();
        const conflict = itemBusyReason(
          { id: assetId, kind: "asset" },
          { kind: "event", fromDate: eventDoc.fromDate, toDate: eventDoc.toDate },
          { ...ctx, ignoreEventId: String(eventId) }
        );
        if (conflict.busy && conflict.reason) {
          const label = conflict.reason.type === "event" ? "another event" : "a studio booking";
          return NextResponse.json(
            { error: `Asset is reserved by ${label} ("${conflict.reason.name}") during this period` },
            { status: 409 }
          );
        }
      }

      const now = new Date();
      const outCondition = condition || "good";
      const movement = await Movement.create({
        assetId,
        assetName: assetName || "",
        assetCategory: assetCategory || "",
        eventId,
        eventName: eventName || "",
        eventLocation: eventLocation || "",
        allocatedPersonId,
        allocatedPersonName: allocatedPersonName || "",
        outByName: actorName,
        outDate: now,
        status: "OUT",
        // `condition` mirrors the latest known condition for legacy readers;
        // outCondition/inCondition are the durable record.
        outCondition,
        condition: outCondition,
        damageReason: damageReason || "",
        remarks: remarks || "",
        createdAt: now,
        updatedAt: now,
      });

      // The asset is no longer in the store — keep its status truthful. The
      // movement is already committed, so a failed sync must not fail the
      // request; it is recorded instead, and the movement stays the authority.
      try {
        await Asset.findByIdAndUpdate(assetId, {
          $set: {
            status: assetStatusAfterCheckout((asset as Record<string, unknown>).status as string | undefined),
            updatedAt: now,
          },
        });
      } catch {
        await logStatusSyncFailure(ActivityLog, actorName, assetId, assetName, "OUT");
      }

      // Auto-create damage report if condition is not good
      const outDamageType = damageTypeFor(outCondition);
      if (outDamageType) {
        await DamageReport.create({
          movementId: movement._id.toString(),
          assetId,
          assetName: assetName || "",
          eventId,
          eventName: eventName || "",
          type: outDamageType,
          reason: damageReason || "No reason provided",
          reportedByName: actorName,
          isResolved: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Log activity
      try {
        await ActivityLog.create({
          userName: actorName,
          action: "OUT",
          module: "Movements",
          resourceId: movement._id.toString(),
          details: `Asset "${assetName}" checked out for event "${eventName}"`,
          createdAt: now,
        });
      } catch { /* logging never breaks main flow */ }

      const doc = movement.toObject();
      doc.id = doc._id.toString();
      return NextResponse.json({ success: true, data: doc }, { status: 201 });
    }

    // ── RETURN (Check-in asset) ─────────────────────────────────────────
    if (action === "return") {
      const { movementId, returnBy, verifiedBy, condition, damageReason, remarks } = body;

      if (!movementId) {
        return NextResponse.json({ error: "Missing movementId" }, { status: 400 });
      }

      const now = new Date();
      const inCondition = condition || "good";
      const updateFields: Record<string, unknown> = {
        status: "IN",
        inDate: now,
        updatedAt: now,
        // The issue condition is preserved; only the return condition is new.
        inCondition,
        condition: inCondition,
      };
      if (returnBy) updateFields.returnBy = returnBy;
      if (verifiedBy) updateFields.verifiedBy = verifiedBy;
      if (damageReason) updateFields.damageReason = damageReason;
      if (remarks) updateFields.remarks = remarks;

      // One atomic guarded write: two concurrent returns cannot both win, so a
      // double-click never files two damage reports for the same handover.
      const updated = await Movement.findOneAndUpdate(
        { _id: movementId, status: { $ne: "IN" } },
        { $set: updateFields },
        { new: true, lean: true }
      ) as Record<string, unknown> | null;

      if (!updated) {
        const exists = await Movement.exists({ _id: movementId });
        return exists
          ? NextResponse.json({ error: "This asset has already been returned" }, { status: 409 })
          : NextResponse.json({ error: "Movement not found" }, { status: 404 });
      }
      const movement = updated;

      // The asset is back (or accounted for) — keep its status truthful.
      const returnedAsset = (await Asset.findById(movement.assetId).select("status").lean()) as
        | Record<string, unknown>
        | null;
      if (returnedAsset) {
        try {
          await Asset.findByIdAndUpdate(movement.assetId, {
            $set: {
              status: assetStatusAfterReturn(returnedAsset.status as string | undefined, inCondition),
              updatedAt: now,
            },
          });
        } catch {
          await logStatusSyncFailure(ActivityLog, actorName, String(movement.assetId), movement.assetName, "IN");
        }
      }

      // Auto-create damage report if condition is not good
      const inDamageType = damageTypeFor(inCondition);
      if (inDamageType) {
        await DamageReport.create({
          movementId: movementId,
          assetId: movement.assetId,
          assetName: movement.assetName || "",
          eventId: movement.eventId,
          eventName: movement.eventName || "",
          type: inDamageType,
          reason: damageReason || "No reason provided",
          reportedByName: actorName,
          isResolved: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Log activity
      try {
        await ActivityLog.create({
          userName: actorName,
          action: "IN",
          module: "Movements",
          resourceId: movementId,
          details: `Asset "${movement.assetName}" returned. Condition: ${inCondition}`,
          createdAt: now,
        });
      } catch { /* logging never breaks main flow */ }

      return NextResponse.json({ success: true, data: { ...updated, id: (updated._id as { toString(): string }).toString() } });
    }

    // ── AVAILABILITY CHECK ──────────────────────────────────────────────
    if (action === "check-availability") {
      const { searchTerm, assetId, categoryName, fromDate, toDate } = body;

      /** Safely convert a stored date field (Date, {seconds}, string, or number) to ms */
      function toMs(val: unknown): number | null {
        if (!val) return null;
        if (val instanceof Date) return val.getTime();
        if (typeof val === "object" && typeof (val as Record<string, unknown>).seconds === "number") {
          return (val as { seconds: number }).seconds * 1000;
        }
        const n = new Date(val as string | number).getTime();
        return isNaN(n) ? null : n;
      }

      // Build asset query
      let assetFilter: Record<string, unknown> = { isActive: { $ne: false } };
      if (assetId) {
        assetFilter = { _id: assetId };
      } else if (searchTerm?.trim()) {
        const regex = new RegExp(searchTerm.trim(), "i");
        assetFilter.$or = [{ name: regex }, { category: regex }, { productCode: regex }];
      } else if (categoryName) {
        assetFilter.category = categoryName;
      }

      const assets = await Asset.find(assetFilter).lean();
      if (!assets.length) return NextResponse.json({ success: true, data: [] });

      const assetIds = (assets as Record<string, unknown>[]).map((a) => (a._id as { toString(): string }).toString());

      // Find all OUT movements for these assets
      const outMovements = (await Movement.find({ assetId: { $in: assetIds }, status: "OUT" }).lean()) as Record<string, unknown>[];

      const busyAssetIds = new Set<string>();
      const busyMovementMap = new Map<string, Record<string, unknown>>();

      if (fromDate || toDate) {
        // Date-based check: cross-reference with event date ranges
        const EventModel = getModel("asset-events");
        const eventIds = [...new Set(outMovements.map((m) => m.eventId as string).filter(Boolean))];
        const events =
          eventIds.length > 0
            ? ((await EventModel.find({ _id: { $in: eventIds } }).lean()) as Record<string, unknown>[])
            : [];
        const eventMap = new Map(events.map((e) => [(e._id as { toString(): string }).toString(), e]));

        const reqFromMs = fromDate ? new Date(fromDate as string).getTime() : null;
        const reqToMs = toDate ? new Date(toDate as string).getTime() : null;

        for (const m of outMovements) {
          const aid = m.assetId as string;
          const event = m.eventId ? eventMap.get(m.eventId as string) : null;

          // Get event date range; fall back to movement outDate if event not found
          const evFromMs = event ? toMs(event.fromDate) : toMs(m.outDate);
          const evToMs = event ? toMs(event.toDate) : null;

          // Overlap: evStart <= reqEnd AND (evEnd is null OR evEnd >= reqStart)
          const overlapStart = !reqToMs || !evFromMs || evFromMs <= reqToMs;
          const overlapEnd = !reqFromMs || !evToMs || evToMs >= reqFromMs;

          if (overlapStart && overlapEnd) {
            busyAssetIds.add(aid);
            if (!busyMovementMap.has(aid)) busyMovementMap.set(aid, m);
          }
        }
      } else {
        // Current availability: any active OUT movement = unavailable
        for (const m of outMovements) {
          const aid = m.assetId as string;
          busyAssetIds.add(aid);
          busyMovementMap.set(aid, m);
        }
      }

      // Also mark assets reserved by an overlapping blocking studio booking as busy.
      if (fromDate || toDate) {
        const { studioBookings } = await loadAvailabilityContext();
        for (const aid of assetIds) {
          if (busyAssetIds.has(aid)) continue;
          const res = itemBusyReason(
            { id: aid, kind: "asset" },
            { kind: "event", fromDate, toDate },
            { outMovements: [], assetEvents: [], studioBookings }
          );
          if (res.busy) busyAssetIds.add(aid);
        }
      }

      const results = (assets as Record<string, unknown>[]).map((a) => {
        const aid = (a._id as { toString(): string }).toString();
        const outMovement = busyMovementMap.get(aid);
        return {
          id: aid,
          name: a.name,
          category: a.category,
          productCode: a.productCode,
          available: !busyAssetIds.has(aid),
          movement: outMovement
            ? {
                eventName: outMovement.eventName,
                eventLocation: outMovement.eventLocation,
                allocatedPersonName: outMovement.allocatedPersonName,
                outDate: outMovement.outDate,
                condition: outMovement.condition,
              }
            : null,
        };
      });

      return NextResponse.json({ success: true, data: results });
    }

    // ── GET REPORTS ─────────────────────────────────────────────────────
    if (action === "get-reports") {
      const { reportType, from, to, assetName, status, searchTerm, page = 1, limit = 10, all } = body;
      // `all` is the export path: the whole filtered set (capped), not the page
      // the table happens to be showing.
      const slice = reportSlice({ page, limit, all: all === true });
      const { skip } = slice;
      const pageSize = slice.limit;

      // Pulling the whole filtered set is an export — record who took it.
      if (all === true) {
        try {
          await ActivityLog.create({
            userName: actorName,
            action: "EXPORT",
            module: "Reports",
            details: `Exported ${reportType} report${from || to ? ` (${from || "start"} → ${to || "today"})` : ""}`,
            createdAt: new Date(),
          });
        } catch { /* logging never breaks main flow */ }
      }

      if (reportType === "movement") {
        const filter: Record<string, unknown> = {};
        if (assetName?.trim()) filter.assetName = new RegExp(assetName.trim(), "i");
        if (status) filter.status = status;
        if (from || to) {
          filter.createdAt = {};
          if (from) (filter.createdAt as Record<string, unknown>).$gte = new Date(from);
          if (to) (filter.createdAt as Record<string, unknown>).$lte = new Date(to + "T23:59:59.999Z");
        }
        const [data, total] = await Promise.all([
          Movement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
          Movement.countDocuments(filter),
        ]);
        const mapped = (data as Record<string, unknown>[]).map((d) => ({ ...d, id: (d._id as { toString(): string }).toString() }));
        return NextResponse.json({ success: true, data: mapped, pagination: { total, totalPages: Math.ceil(total / pageSize), page, limit: pageSize } });
      }

      if (reportType === "damage") {
        const filter: Record<string, unknown> = {};
        if (assetName?.trim()) filter.assetName = new RegExp(assetName.trim(), "i");
        if (status === "resolved") filter.isResolved = true;
        if (status === "open") filter.isResolved = false;
        if (from || to) {
          filter.createdAt = {};
          if (from) (filter.createdAt as Record<string, unknown>).$gte = new Date(from);
          if (to) (filter.createdAt as Record<string, unknown>).$lte = new Date(to + "T23:59:59.999Z");
        }
        const [data, total] = await Promise.all([
          DamageReport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
          DamageReport.countDocuments(filter),
        ]);
        const mapped = (data as Record<string, unknown>[]).map((d) => ({ ...d, id: (d._id as { toString(): string }).toString() }));
        return NextResponse.json({ success: true, data: mapped, pagination: { total, totalPages: Math.ceil(total / pageSize), page, limit: pageSize } });
      }

      if (reportType === "activity") {
        const filter: Record<string, unknown> = {};
        if (searchTerm?.trim()) {
          const regex = new RegExp(searchTerm.trim(), "i");
          filter.$or = [{ userName: regex }, { action: regex }, { module: regex }, { details: regex }];
        }
        if (from || to) {
          filter.createdAt = {};
          if (from) (filter.createdAt as Record<string, unknown>).$gte = new Date(from);
          if (to) (filter.createdAt as Record<string, unknown>).$lte = new Date(to + "T23:59:59.999Z");
        }
        const [data, total] = await Promise.all([
          ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
          ActivityLog.countDocuments(filter),
        ]);
        const mapped = (data as Record<string, unknown>[]).map((d) => ({ ...d, id: (d._id as { toString(): string }).toString() }));
        return NextResponse.json({ success: true, data: mapped, pagination: { total, totalPages: Math.ceil(total / pageSize), page, limit: pageSize } });
      }

      return NextResponse.json({ error: "Invalid reportType" }, { status: 400 });
    }

    // ── UPDATE DAMAGE REPORT ────────────────────────────────────────────
    if (action === "update-damage-report") {
      const { reportId, type, reason, notes, isResolved } = body;
      if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });

      const now = new Date();
      const updateFields: Record<string, unknown> = { updatedAt: now };
      if (type) updateFields.type = type;
      if (reason) updateFields.reason = reason;
      if (notes !== undefined) updateFields.notes = notes;
      if (isResolved !== undefined) {
        updateFields.isResolved = isResolved;
        if (isResolved) {
          updateFields.resolvedAt = now;
          updateFields.resolvedByName = actorName;
        } else {
          updateFields.resolvedAt = null;
          updateFields.resolvedByName = null;
        }
      }

      const updated = await DamageReport.findByIdAndUpdate(
        reportId,
        { $set: updateFields },
        { new: true, lean: true }
      ) as Record<string, unknown> | null;

      if (!updated) return NextResponse.json({ error: "Report not found" }, { status: 404 });

      try {
        await ActivityLog.create({
          userName: actorName,
          action: isResolved === undefined ? "UPDATE" : isResolved ? "RESOLVE" : "REOPEN",
          module: "Damage Reports",
          resourceId: reportId,
          details: `Damage report for "${updated.assetName || "asset"}" updated`,
          createdAt: now,
        });
      } catch { /* logging never breaks main flow */ }

      return NextResponse.json({ success: true, data: { ...updated, id: (updated._id as { toString(): string }).toString() } });
    }

    // ── EVENT MOVEMENT COUNTS ───────────────────────────────────────────
    if (action === "event-movement-counts") {
      const { eventIds } = body;
      if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
        return NextResponse.json({ success: true, data: {} });
      }

      const counts = await Movement.aggregate([
        { $match: { eventId: { $in: eventIds } } },
        {
          $group: {
            _id: "$eventId",
            outCount: { $sum: { $cond: [{ $eq: ["$status", "OUT"] }, 1, 0] } },
            inCount: { $sum: { $cond: [{ $eq: ["$status", "IN"] }, 1, 0] } },
          },
        },
      ]);

      const countMap: Record<string, { outCount: number; inCount: number; total: number }> = {};
      for (const c of counts) {
        countMap[c._id] = { outCount: c.outCount, inCount: c.inCount, total: c.outCount + c.inCount };
      }
      return NextResponse.json({ success: true, data: countMap });
    }

    // ── GET OUT MOVEMENTS FOR EVENT ─────────────────────────────────────
    if (action === "get-event-out-movements") {
      const { eventId, limit: mLimit = 100 } = body;
      if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

      const movements = await Movement.find({ eventId, status: "OUT" })
        .sort({ createdAt: -1 })
        .limit(mLimit as number)
        .lean();

      const mapped = (movements as Record<string, unknown>[]).map((m) => ({
        ...m,
        id: (m._id as { toString(): string }).toString(),
      }));
      return NextResponse.json({ success: true, data: mapped });
    }

    // ── GET ALL MOVEMENTS FOR EVENT (for export) ────────────────────────
    if (action === "get-event-movements") {
      const { eventId, status: mStatus, limit: mLimit = 100 } = body;
      if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

      const filter: Record<string, unknown> = { eventId };
      if (mStatus) filter.status = mStatus;

      const movements = await Movement.find(filter)
        .sort({ createdAt: -1 })
        .limit(mLimit as number)
        .lean();

      const mapped = (movements as Record<string, unknown>[]).map((m) => ({
        ...m,
        id: (m._id as { toString(): string }).toString(),
      }));
      return NextResponse.json({ success: true, data: mapped });
    }

    // ── EVENT DELETE VALIDATION ─────────────────────────────────────────
    if (action === "validate-event-delete") {
      const { eventId } = body;
      if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

      const Event = getModel("asset-events");
      const event = await Event.findById(eventId).lean();
      if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

      if ((event as Record<string, unknown>).status === "completed") {
        return NextResponse.json({ error: "Cannot delete a completed event" }, { status: 400 });
      }

      const outCount = await Movement.countDocuments({ eventId, status: "OUT" });
      if (outCount > 0) {
        return NextResponse.json({ error: `Cannot delete event: ${outCount} asset(s) are still checked out` }, { status: 400 });
      }

      return NextResponse.json({ success: true, canDelete: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Asset movements API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
