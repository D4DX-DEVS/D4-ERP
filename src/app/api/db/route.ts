import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";

// ── Timestamp helpers ─────────────────────────────────────────────────────────

/** Convert { _ts: true, seconds, nanoseconds } → Date for MongoDB storage */
function tsToDate(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(tsToDate);
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (o._ts === true && typeof o.seconds === "number") {
      return new Date((o.seconds as number) * 1000 + ((o.nanoseconds as number) || 0) / 1e6);
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(o)) {
      result[key] = tsToDate(o[key]);
    }
    return result;
  }
  return obj;
}

/** Convert Date → { seconds, nanoseconds } in API responses */
function dateToTs(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) {
    const ms = obj.getTime();
    return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 };
  }
  if (Array.isArray(obj)) return obj.map(dateToTs);
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(o)) {
      result[key] = dateToTs(o[key]);
    }
    return result;
  }
  return obj;
}

// ── Constraint → Mongo query builder ──────────────────────────────────────────

interface WhereConstraint {
  _type: "where";
  field: string;
  op: string;
  value: unknown;
}
interface OrderByConstraint {
  _type: "orderBy";
  field: string;
  direction: "asc" | "desc";
}
interface LimitConstraint {
  _type: "limit";
  value: number;
}
interface SearchConstraint {
  _type: "search";
  fields: string[];
  value: string;
}
type Constraint = WhereConstraint | OrderByConstraint | LimitConstraint | SearchConstraint;

function buildQuery(constraints: Constraint[]) {
  const filter: Record<string, unknown> = {};
  const sort: Record<string, 1 | -1> = {};
  const andClauses: Record<string, unknown>[] = [];
  let limitVal: number | undefined;

  for (const c of constraints) {
    if (c._type === "where") {
      // Convert timestamp-like values in where clauses
      const val = tsToDate(c.value);
      const ops: Record<string, string> = {
        "==": "$eq",
        "!=": "$ne",
        "<": "$lt",
        "<=": "$lte",
        ">": "$gt",
        ">=": "$gte",
        in: "$in",
        "not-in": "$nin",
        "array-contains": "$eq", // MongoDB: { field: value } checks array membership
      };
      const mongoOp = ops[c.op];
      if (c.op === "==" || c.op === "array-contains") {
        filter[c.field] = val;
      } else if (mongoOp) {
        filter[c.field] = { ...(filter[c.field] as object), [mongoOp]: val };
      }
    } else if (c._type === "orderBy") {
      sort[c.field] = c.direction === "asc" ? 1 : -1;
    } else if (c._type === "limit") {
      limitVal = c.value;
    } else if (c._type === "search") {
      const term = c.value?.trim();
      if (term) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        andClauses.push({
          $or: c.fields.map((field) => ({
            [field]: { $regex: escaped, $options: "i" },
          })),
        });
      }
    }
  }

  if (Object.keys(filter).length) {
    andClauses.push(filter);
  }

  const finalFilter =
    andClauses.length === 0 ? {} : andClauses.length === 1 ? andClauses[0] : { $and: andClauses };

  return { filter: finalFilter, sort, limit: limitVal };
}

// ── Audit logger (server-side) ────────────────────────────────────────────────

async function writeAuditLog(
  action: "create" | "update" | "delete",
  collectionName: string,
  entityId: string,
  description: string,
  auditUser?: { uid: string; name: string },
  extra?: { previousData?: unknown; newData?: unknown }
) {
  if (collectionName === "audit_logs" || collectionName === "settings") return;
  try {
    const AuditModel = getModel("audit_logs");
    await AuditModel.create({
      userId: auditUser?.uid || "system",
      userName: auditUser?.name || "System",
      action,
      module: collectionName,
      entityType: collectionName,
      entityId,
      description,
      details: description,
      timestamp: new Date(),
      previousData: extra?.previousData || null,
      newData: extra?.newData || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch {
    // Never let audit logging break main operations
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { action, collection: collectionName, auditUser } = body;

    const Model = getModel(collectionName);

    switch (action) {
      // ── FIND (getDocuments) ──────────────────────────────────────────────
      case "find": {
        const { constraints = [] } = body;
        const { filter, sort, limit: lim } = buildQuery(constraints);
        let q = Model.find(filter);
        if (Object.keys(sort).length) q = q.sort(sort);
        if (lim) q = q.limit(lim);
        const docs = await q.lean();
        return NextResponse.json(
          docs.map((d: Record<string, unknown>) => dateToTs({ ...d, id: (d._id as object).toString(), _id: undefined, __v: undefined }))
        );
      }

      // ── FIND ONE (getDocument) ──────────────────────────────────────────
      case "findOne": {
        const { id } = body;
        const doc = await Model.findById(id).lean();
        if (!doc) return NextResponse.json(null);
        const d = doc as Record<string, unknown>;
        return NextResponse.json(dateToTs({ ...d, id: (d._id as object).toString(), _id: undefined, __v: undefined }));
      }

      // ── CREATE ──────────────────────────────────────────────────────────
      case "create": {
        const data = tsToDate(body.data) as Record<string, unknown>;
        data.createdAt = new Date();
        data.updatedAt = new Date();
        const doc = await Model.create(data);
        const id = doc._id.toString();
        writeAuditLog("create", collectionName, id, `Created ${collectionName} record`, auditUser, { newData: body.data });
        return NextResponse.json({ id });
      }

      // ── UPDATE ──────────────────────────────────────────────────────────
      case "update": {
        const { id, data: rawData } = body;
        const data = tsToDate(rawData) as Record<string, unknown>;
        data.updatedAt = new Date();
        await Model.findByIdAndUpdate(id, { $set: data });
        writeAuditLog("update", collectionName, id, `Updated ${collectionName} record`, auditUser, { newData: rawData });
        return NextResponse.json({ success: true });
      }

      // ── DELETE ──────────────────────────────────────────────────────────
      case "delete": {
        const { id } = body;
        await Model.findByIdAndDelete(id);
        writeAuditLog("delete", collectionName, id, `Deleted ${collectionName} record`, auditUser);
        return NextResponse.json({ success: true });
      }

      // ── FIND SUB (getSubDocuments) ──────────────────────────────────────
      case "findSub": {
        const { parentCollection, parentId, subCollection, constraints = [] } = body;
        const SubModel = getModel(`${parentCollection}_${subCollection}`);
        const { filter, sort } = buildQuery(constraints);
        filter._parentId = parentId;
        let q = SubModel.find(filter);
        if (Object.keys(sort).length) q = q.sort(sort);
        const docs = await q.lean();
        return NextResponse.json(
          docs.map((d: Record<string, unknown>) => dateToTs({ ...d, id: (d._id as object).toString(), _id: undefined, __v: undefined }))
        );
      }

      // ── CREATE SUB (createSubDocument) ──────────────────────────────────
      case "createSub": {
        const { parentCollection, parentId, subCollection, data: subRaw } = body;
        const SubModel = getModel(`${parentCollection}_${subCollection}`);
        const data = tsToDate(subRaw) as Record<string, unknown>;
        data._parentId = parentId;
        data.createdAt = new Date();
        data.updatedAt = new Date();
        const doc = await SubModel.create(data);
        const id = doc._id.toString();
        writeAuditLog("create", `${parentCollection}/${parentId}/${subCollection}`, id, `Created ${subCollection} sub-document`, auditUser);
        return NextResponse.json({ id });
      }

      // ── COUNT ───────────────────────────────────────────────────────────
      case "count": {
        const { constraints = [] } = body;
        const { filter } = buildQuery(constraints);
        const total = await Model.countDocuments(filter);
        return NextResponse.json({ total });
      }

      // ── PAGINATE ────────────────────────────────────────────────────────
      case "paginate": {
        const { constraints = [], pageSize = 25, page = 0 } = body;
        const { filter, sort } = buildQuery(constraints);
        const total = await Model.countDocuments(filter);
        let q = Model.find(filter);
        if (Object.keys(sort).length) q = q.sort(sort);
        q = q.skip(page * pageSize).limit(pageSize);
        const docs = await q.lean();
        return NextResponse.json({
          data: docs.map((d: Record<string, unknown>) => dateToTs({ ...d, id: (d._id as object).toString(), _id: undefined, __v: undefined })),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error("DB API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
