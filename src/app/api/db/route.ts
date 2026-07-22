import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";
import {
  authorize,
  sanitizeDoc,
  MAX_QUERY_LIMIT,
  isReadAction,
  scopeFilter,
  DEPT_SCOPED_BY_FIELD,
  DEPT_SCOPED_BY_STAFF,
} from "@/lib/db-authz";
import type { TokenPayload } from "@/lib/auth";
import { canTransitionTask, transitionNeedsRemark } from "@/lib/task-workflow";
import type { StaffRole, TaskStatus } from "@/types";

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

// ── Server-side scoping helpers ───────────────────────────────────────────────

/** Department id of a dept-head caller (from their staff doc; token has no dept). */
async function callerDepartmentId(user: TokenPayload): Promise<string | null> {
  try {
    const Staff = getModel("staff");
    const doc = (await Staff.findById(user.uid).select("departmentId").lean()) as {
      departmentId?: string;
    } | null;
    return doc?.departmentId || null;
  } catch {
    return null;
  }
}

async function deptStaffIds(departmentId: string): Promise<string[]> {
  const Staff = getModel("staff");
  const docs = (await Staff.find({ departmentId }).select("_id").lean()) as { _id: object }[];
  return docs.map((d) => d._id.toString());
}

/** AND a role-based scope into a read filter. Returns the (possibly wrapped) filter. */
async function applyReadScope(
  user: TokenPayload,
  collectionName: string,
  filter: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const needsDept =
    user.role === "department-head" &&
    (collectionName in DEPT_SCOPED_BY_FIELD || DEPT_SCOPED_BY_STAFF.has(collectionName));
  const deptId = needsDept ? await callerDepartmentId(user) : null;
  const staffIds =
    needsDept && deptId && DEPT_SCOPED_BY_STAFF.has(collectionName)
      ? await deptStaffIds(deptId)
      : null;
  const scope = scopeFilter(user, collectionName, deptId, staffIds);
  if (!scope) return filter;
  return Object.keys(filter).length ? { $and: [filter, scope] } : scope;
}

/**
 * Guard writes to leaveRequests (2-step approval): dept heads may only decide
 * the deptHead step on own-dept docs; staff may only cancel their own pending
 * request. Admin/accounts unrestricted. Returns error message or null.
 */
async function guardRequestUpdate(
  user: TokenPayload,
  id: string,
  data: Record<string, unknown>
): Promise<string | null> {
  const Model = getModel("leaveRequests");
  const doc = (await Model.findById(id).lean()) as Record<string, unknown> | null;
  if (!doc) return null; // let the update no-op
  const allowedKeys = (keys: string[]) =>
    Object.keys(data).every((k) => keys.includes(k) || k === "updatedAt");

  // Terminal states are immutable for everyone: no re-deciding or reopening.
  const touchesWorkflow = ["deptHead", "admin", "status"].some((k) => k in data);
  const isTerminal = ["approved", "rejected", "cancelled"].includes(doc.status as string);
  if (touchesWorkflow && isTerminal) {
    return "Request already finalised.";
  }

  if (user.role === "admin") return null;

  if (user.role === "department-head") {
    const deptId = await callerDepartmentId(user);
    if (doc.departmentId && deptId && doc.departmentId !== deptId) {
      return "You may only act on requests from your own department.";
    }
    if (!allowedKeys(["deptHead", "status"])) {
      return "Department heads may only decide the department step.";
    }
    return null;
  }
  if (user.role === "staff") {
    if (doc.staffId !== user.uid) return "You may only modify your own requests.";
    const cancelOnly = allowedKeys(["status"]) && data.status === "cancelled";
    if (!cancelOnly) return "You may only cancel your own pending request.";
    if (doc.status !== "pending") return "Request already finalised.";
    return null;
  }
  return null;
}

/**
 * Guard writes to tasks (review-gated workflow): status moves must pass
 * canTransitionTask for the caller's role; staff may only touch their own
 * tasks. Admin unrestricted. Returns error message or null.
 */
async function guardTaskUpdate(
  user: TokenPayload,
  id: string,
  data: Record<string, unknown>
): Promise<string | null> {
  if (user.role === "admin") return null;
  const Model = getModel("tasks");
  const doc = (await Model.findById(id).lean()) as Record<string, unknown> | null;
  if (!doc) return null; // let the update no-op

  const isAssignee = doc.assigneeId === user.uid;
  if (user.role === "staff" && !isAssignee) {
    return "You may only update tasks assigned to you.";
  }
  if (user.role === "department-head" && !isAssignee) {
    const deptId = await callerDepartmentId(user);
    if (doc.departmentId && deptId && doc.departmentId !== deptId) {
      return "You may only act on your own department's tasks.";
    }
  }

  if ("status" in data && data.status !== doc.status) {
    const from = doc.status as TaskStatus;
    const to = data.status as TaskStatus;
    if (!canTransitionTask(user.role as StaffRole, isAssignee, from, to)) {
      return `Status change ${from} → ${to} is not allowed for your role.`;
    }
    if (transitionNeedsRemark(from, to) && !isAssignee) {
      const history = data.statusHistory as { remarks?: string }[] | undefined;
      const last = history?.[history.length - 1];
      if (!last?.remarks?.trim()) {
        return "A reason is required when returning a task from review.";
      }
    }
  }
  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Authentication: every DB request requires a valid session ───────────
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const body = await req.json();
    const { action, collection: collectionName } = body;

    if (typeof action !== "string" || typeof collectionName !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // ── Authorization: role-based collection access ─────────────────────────
    const denied = authorize(user, action, collectionName);
    if (denied) {
      return NextResponse.json({ error: denied }, { status: 403 });
    }

    // Trusted audit identity derived from the verified token — never the body.
    const auditUser = { uid: user.uid, name: user.name || user.email || "Unknown" };

    const Model = getModel(collectionName);

    switch (action) {
      // ── FIND (getDocuments) ──────────────────────────────────────────────
      case "find": {
        const { constraints = [] } = body;
        const { filter: rawFilter, sort, limit: lim } = buildQuery(constraints);
        const filter = await applyReadScope(user, collectionName, rawFilter);
        let q = Model.find(filter);
        if (Object.keys(sort).length) q = q.sort(sort);
        q = q.limit(Math.min(lim || MAX_QUERY_LIMIT, MAX_QUERY_LIMIT));
        const docs = await q.lean();
        return NextResponse.json(
          docs.map((d: Record<string, unknown>) => dateToTs(sanitizeDoc({ ...d, id: (d._id as object).toString(), _id: undefined, __v: undefined })))
        );
      }

      // ── FIND ONE (getDocument) ──────────────────────────────────────────
      case "findOne": {
        const { id } = body;
        const doc = await Model.findById(id).lean();
        if (!doc) return NextResponse.json(null);
        const d = doc as Record<string, unknown>;
        return NextResponse.json(dateToTs(sanitizeDoc({ ...d, id: (d._id as object).toString(), _id: undefined, __v: undefined })));
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
        if (collectionName === "leaveRequests") {
          const deniedUpdate = await guardRequestUpdate(user, id, data);
          if (deniedUpdate) {
            return NextResponse.json({ error: deniedUpdate }, { status: 403 });
          }
        }
        if (collectionName === "tasks") {
          const deniedUpdate = await guardTaskUpdate(user, id, data);
          if (deniedUpdate) {
            return NextResponse.json({ error: deniedUpdate }, { status: 403 });
          }
        }
        data.updatedAt = new Date();
        await Model.findByIdAndUpdate(id, { $set: data });
        writeAuditLog("update", collectionName, id, `Updated ${collectionName} record`, auditUser, { newData: rawData });
        return NextResponse.json({ success: true });
      }

      // ── DELETE ──────────────────────────────────────────────────────────
      case "delete": {
        const { id } = body;
        if (collectionName === "staff") {
          const target = (await Model.findById(id).select("email").lean()) as { email?: string } | null;
          // Demo login accounts are protected — reseed via scripts/seed-demo.mjs.
          if (target?.email && ["admin@d4media.in", "staff@d4media.in"].includes(target.email)) {
            return NextResponse.json(
              { error: "Demo accounts cannot be deleted" },
              { status: 403 }
            );
          }
        }
        await Model.findByIdAndDelete(id);
        writeAuditLog("delete", collectionName, id, `Deleted ${collectionName} record`, auditUser);
        return NextResponse.json({ success: true });
      }

      // ── NEXT SEQUENCE (atomic counter for document numbering) ───────────
      // Guarantees gap-free, duplicate-free numbers even with concurrent users.
      case "nextSequence": {
        const { key } = body;
        if (!key || typeof key !== "string") {
          return NextResponse.json({ error: "Sequence key is required" }, { status: 400 });
        }
        const SeqModel = getModel("number_sequences");
        const doc = await SeqModel.findOneAndUpdate(
          { key },
          { $inc: { current: 1 }, $setOnInsert: { createdAt: new Date() }, $set: { updatedAt: new Date() } },
          { new: true, upsert: true }
        ).lean();
        const value = (doc as Record<string, unknown>).current as number;
        return NextResponse.json({ value });
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
          docs.map((d: Record<string, unknown>) => dateToTs(sanitizeDoc({ ...d, id: (d._id as object).toString(), _id: undefined, __v: undefined })))
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
        const { filter: rawFilter } = buildQuery(constraints);
        const filter = await applyReadScope(user, collectionName, rawFilter);
        const total = await Model.countDocuments(filter);
        return NextResponse.json({ total });
      }

      // ── PAGINATE ────────────────────────────────────────────────────────
      case "paginate": {
        const { constraints = [], pageSize = 25, page = 0 } = body;
        const { filter: rawFilter, sort } = buildQuery(constraints);
        const filter = await applyReadScope(user, collectionName, rawFilter);
        const total = await Model.countDocuments(filter);
        let q = Model.find(filter);
        if (Object.keys(sort).length) q = q.sort(sort);
        const safePageSize = Math.min(Math.max(Number(pageSize) || 25, 1), MAX_QUERY_LIMIT);
        const safePage = Math.max(Number(page) || 0, 0);
        q = q.skip(safePage * safePageSize).limit(safePageSize);
        const docs = await q.lean();
        return NextResponse.json({
          data: docs.map((d: Record<string, unknown>) => dateToTs(sanitizeDoc({ ...d, id: (d._id as object).toString(), _id: undefined, __v: undefined }))),
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
