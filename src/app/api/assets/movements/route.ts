import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { itemBusyReason, type BookingLike, type MovementLike, type AssetEventLike } from "@/lib/asset-availability";
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    await connectDB();
    const Movement = getModel("asset-movements");
    const Asset = getModel("assets");
    const DamageReport = getModel("asset-damage-reports");
    const ActivityLog = getModel("asset-activity-logs");

    // ── CHECKOUT (Issue asset) ──────────────────────────────────────────
    if (action === "checkout") {
      const { assetId, assetName, assetCategory, eventId, eventName, eventLocation, allocatedPersonId, allocatedPersonName, outByName, condition, damageReason, remarks } = body;

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
      const movement = await Movement.create({
        assetId,
        assetName: assetName || "",
        assetCategory: assetCategory || "",
        eventId,
        eventName: eventName || "",
        eventLocation: eventLocation || "",
        allocatedPersonId,
        allocatedPersonName: allocatedPersonName || "",
        outByName: outByName || "",
        outDate: now,
        status: "OUT",
        condition: condition || "good",
        damageReason: damageReason || "",
        remarks: remarks || "",
        createdAt: now,
        updatedAt: now,
      });

      // Auto-create damage report if condition is not good
      if (condition && condition !== "good") {
        const typeMap: Record<string, string> = { damaged: "damage", defective: "defect", missing: "missing" };
        await DamageReport.create({
          movementId: movement._id.toString(),
          assetId,
          assetName: assetName || "",
          eventId,
          eventName: eventName || "",
          type: typeMap[condition] || "damage",
          reason: damageReason || "No reason provided",
          reportedByName: outByName || "",
          isResolved: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Log activity
      try {
        await ActivityLog.create({
          userName: outByName || "System",
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
      const { movementId, returnBy, verifiedBy, condition, damageReason, remarks, userName } = body;

      if (!movementId) {
        return NextResponse.json({ error: "Missing movementId" }, { status: 400 });
      }

      const movement = await Movement.findById(movementId).lean() as Record<string, unknown> | null;
      if (!movement) {
        return NextResponse.json({ error: "Movement not found" }, { status: 404 });
      }

      const now = new Date();
      const updateFields: Record<string, unknown> = {
        status: "IN",
        inDate: now,
        updatedAt: now,
      };
      if (returnBy) updateFields.returnBy = returnBy;
      if (verifiedBy) updateFields.verifiedBy = verifiedBy;
      if (condition) updateFields.condition = condition;
      if (damageReason) updateFields.damageReason = damageReason;
      if (remarks) updateFields.remarks = remarks;

      const updated = await Movement.findByIdAndUpdate(
        movementId,
        { $set: updateFields },
        { new: true, lean: true }
      ) as Record<string, unknown> | null;

      if (!updated) {
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
      }

      // Auto-create damage report if condition is not good
      if (condition && condition !== "good") {
        const typeMap: Record<string, string> = { damaged: "damage", defective: "defect", missing: "missing" };
        await DamageReport.create({
          movementId: movementId,
          assetId: movement.assetId,
          assetName: movement.assetName || "",
          eventId: movement.eventId,
          eventName: movement.eventName || "",
          type: typeMap[condition] || "damage",
          reason: damageReason || "No reason provided",
          reportedByName: userName || "",
          isResolved: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Log activity
      try {
        await ActivityLog.create({
          userName: userName || "System",
          action: "IN",
          module: "Movements",
          resourceId: movementId,
          details: `Asset "${movement.assetName}" returned. Condition: ${condition || "good"}`,
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
      const { reportType, from, to, assetName, status, searchTerm, page = 1, limit = 10 } = body;
      const skip = ((page as number) - 1) * (limit as number);

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
          Movement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit as number).lean(),
          Movement.countDocuments(filter),
        ]);
        const mapped = (data as Record<string, unknown>[]).map((d) => ({ ...d, id: (d._id as { toString(): string }).toString() }));
        return NextResponse.json({ success: true, data: mapped, pagination: { total, totalPages: Math.ceil(total / (limit as number)), page, limit } });
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
          DamageReport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit as number).lean(),
          DamageReport.countDocuments(filter),
        ]);
        const mapped = (data as Record<string, unknown>[]).map((d) => ({ ...d, id: (d._id as { toString(): string }).toString() }));
        return NextResponse.json({ success: true, data: mapped, pagination: { total, totalPages: Math.ceil(total / (limit as number)), page, limit } });
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
          ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit as number).lean(),
          ActivityLog.countDocuments(filter),
        ]);
        const mapped = (data as Record<string, unknown>[]).map((d) => ({ ...d, id: (d._id as { toString(): string }).toString() }));
        return NextResponse.json({ success: true, data: mapped, pagination: { total, totalPages: Math.ceil(total / (limit as number)), page, limit } });
      }

      return NextResponse.json({ error: "Invalid reportType" }, { status: 400 });
    }

    // ── UPDATE DAMAGE REPORT ────────────────────────────────────────────
    if (action === "update-damage-report") {
      const { reportId, type, reason, notes, isResolved, userName } = body;
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
          updateFields.resolvedByName = userName || "";
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
