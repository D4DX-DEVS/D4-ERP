import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";
import {
  authorize,
  authorizeReadDoc,
  featureReadFilter,
  sanitizeDoc,
  isWriteAction,
  MAX_QUERY_LIMIT,
  isReadAction,
  scopeFilter,
  DEPT_SCOPED_BY_FIELD,
  DEPT_SCOPED_BY_STAFF,
  OWN_WRITE_FOR_STAFF,
  authorizeOwnWorkLogWrite,
  authorizeSubCollection,
  type AuthzUser,
} from "@/lib/db-authz";
import { hasFeature } from "@/lib/permissions";
import {
  authorizeReportWrite,
  authorizeRequestCreate,
  authorizeRequestDelete,
  authorizeRequestUpdate,
  reportUpdatePrecondition,
  reportDeletePrecondition,
  requestUpdatePrecondition,
  type WorkflowActor,
} from "@/lib/workflow-authz";
import { validateNewRequest } from "@/lib/request-validation";
import type { TokenPayload } from "@/lib/auth";
import { canDeleteTask, canTransitionTask, transitionNeedsRemark, type TaskOwnership } from "@/lib/task-workflow";
import { isSoftDeleteCollection, softDeletePatch, withoutDeleted } from "@/lib/soft-delete";
import { decryptDocFields, encryptDocFields, redactEncryptedFields } from "@/lib/vault";
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

/**
 * Shape a stored document for the client: drop sensitive fields, unseal vault
 * fields (Tools & Accounts credentials), and convert Dates back to Timestamps.
 */
function outbound(collectionName: string, d: Record<string, unknown>) {
  return dateToTs(
    decryptDocFields(
      collectionName,
      sanitizeDoc({ ...d, id: (d._id as object).toString(), _id: undefined, __v: undefined })
    )
  );
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

/**
 * AND role scope + feature type-restrictions + the soft-delete guard into a read
 * filter. `includeDeleted` is the opt-in history views use to keep removed staff.
 */
async function applyReadScope(
  user: TokenPayload & AuthzUser,
  collectionName: string,
  filter: Record<string, unknown>,
  includeDeleted = false
): Promise<Record<string, unknown>> {
  const needsDept =
    user.role === "department-head" &&
    (collectionName in DEPT_SCOPED_BY_FIELD || DEPT_SCOPED_BY_STAFF.has(collectionName));
  const deptId = needsDept ? await callerDepartmentId(user) : null;
  const staffIds =
    needsDept && deptId && DEPT_SCOPED_BY_STAFF.has(collectionName)
      ? await deptStaffIds(deptId)
      : null;
  const clauses = [
    scopeFilter(user, collectionName, deptId, staffIds),
    featureReadFilter(user, collectionName),
  ].filter((c): c is Record<string, unknown> => !!c);
  const scoped = clauses.length
    ? (() => {
        const all = Object.keys(filter).length ? [filter, ...clauses] : clauses;
        return all.length === 1 ? all[0] : { $and: all };
      })()
    : filter;
  return withoutDeleted(collectionName, scoped, includeDeleted);
}

/** Stored document for a workflow guard, or null when the id matches nothing. */
async function loadDoc(collectionName: string, id: unknown): Promise<Record<string, unknown> | null> {
  if (typeof id !== "string" || !id) return null;
  return (await getModel(collectionName).findById(id).lean()) as Record<string, unknown> | null;
}

interface WorkflowGuard {
  denied: string | null;
  /** Extra match conditions an update must be applied under (see workflow-authz.ts). */
  precondition: Record<string, unknown>;
}

/** Workflow rules for staff requests and department filings (see workflow-authz.ts). */
async function guardWorkflowWrite(
  actor: WorkflowActor,
  action: string,
  collectionName: string,
  id: unknown,
  data: Record<string, unknown> | undefined
): Promise<WorkflowGuard> {
  const allow = (precondition: Record<string, unknown> = {}): WorkflowGuard => ({ denied: null, precondition });
  const deny = (denied: string | null): WorkflowGuard => ({ denied, precondition: {} });
  if (collectionName === "leaveRequests") {
    if (action === "create") {
      // Shape and ownership first; then the checks that need the database
      // (a day already claimed, a flexible-leave wallet that cannot cover it).
      return deny(authorizeRequestCreate(actor, data ?? {}) ?? (await validateNewRequest(data ?? {})));
    }
    if (action === "delete") return deny(authorizeRequestDelete(actor));
    const doc = await loadDoc(collectionName, id);
    if (!doc) return allow(); // let the update no-op
    const denied = authorizeRequestUpdate(actor, doc, data ?? {});
    return denied ? deny(denied) : allow(requestUpdatePrecondition(data ?? {}));
  }
  if (collectionName === "department_reports") {
    const existing = action === "create" ? null : await loadDoc(collectionName, id);
    const denied = authorizeReportWrite(actor, action, existing, data);
    if (denied) return deny(denied);
    if (action === "delete") return allow(reportDeletePrecondition(actor.role));
    return allow(
      action === "update" && existing ? reportUpdatePrecondition(existing, data ?? {}, actor.role) : {}
    );
  }
  return allow();
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

    // ── Authorization on CURRENT grants (never the JWT claim, which can be
    // stale for up to the token TTL after an admin edits permissions) ────────
    const staffDoc = (await getModel("staff")
      .findById(user.uid)
      .select("role grantedFeatures isDeleted departmentId")
      .lean()) as {
      role?: string;
      grantedFeatures?: unknown;
      isDeleted?: boolean;
      departmentId?: string;
    } | null;
    // Soft-deleted staff keep their row for history but lose access immediately,
    // even while their session cookie is still inside its window.
    if (staffDoc?.isDeleted) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authzUser: TokenPayload & AuthzUser = {
      ...user,
      role: staffDoc?.role || user.role,
      grantedFeatures: Array.isArray(staffDoc?.grantedFeatures)
        ? (staffDoc.grantedFeatures as unknown[]).filter((f): f is string => typeof f === "string")
        : [],
    };

    // Writes to the type-split invoices collection are authorized per document
    // type: payload type on create, the stored type on update/delete.
    let docType: unknown;
    if (collectionName === "invoices" && isWriteAction(action)) {
      if (action === "create") {
        docType = (body.data as Record<string, unknown> | undefined)?.type;
      } else {
        const existing = (await getModel("invoices")
          .findById(body.id)
          .select("type")
          .lean()) as { type?: string } | null;
        docType = existing?.type;
      }
    }

    // Own-record writes (the self-service daily work log) are allowed without
    // the management feature, so authorization needs the row's owner: the
    // payload on create, the stored document on update/delete.
    let ownerId: unknown;
    let ownerDoc: Record<string, unknown> | null = null;
    const ownerField = OWN_WRITE_FOR_STAFF[collectionName];
    if (ownerField && isWriteAction(action)) {
      if (action === "create") {
        ownerId = (body.data as Record<string, unknown> | undefined)?.[ownerField];
      } else {
        ownerDoc = (await getModel(collectionName)
          .findById(body.id)
          .select(`${ownerField} status`)
          .lean()) as Record<string, unknown> | null;
        ownerId = ownerDoc?.[ownerField];
      }
    }

    const denied = authorize(authzUser, action, collectionName, docType, ownerId);
    if (denied) {
      return NextResponse.json({ error: denied }, { status: 403 });
    }

    // Owner-side work log rules: a reviewer (work-logs grant) is unrestricted;
    // the owner may only edit a draft or returned log, may not mark it reviewed,
    // and may not write the reviewer's fields.
    if (
      collectionName === "work_logs" &&
      isWriteAction(action) &&
      !hasFeature(authzUser, "work-logs")
    ) {
      const deniedOwn = authorizeOwnWorkLogWrite(
        action,
        ownerDoc,
        body.data as Record<string, unknown> | undefined
      );
      if (deniedOwn) {
        return NextResponse.json({ error: deniedOwn }, { status: 403 });
      }
    }

    // Sub-documents are addressed by two body fields, not the authorized name.
    if (action === "findSub" || action === "createSub") {
      const deniedSub = authorizeSubCollection(
        authzUser,
        action,
        body.parentCollection,
        body.subCollection,
        body.parentId,
        collectionName
      );
      if (deniedSub) {
        return NextResponse.json({ error: deniedSub }, { status: 403 });
      }
    }

    // Approval workflows: who may file, decide, edit or delete, and in which state.
    let workflowPrecondition: Record<string, unknown> = {};
    if (isWriteAction(action)) {
      const actor: WorkflowActor = {
        uid: user.uid,
        role: authzUser.role,
        departmentId: staffDoc?.departmentId || null,
      };
      const payload = body.data ? (tsToDate(body.data) as Record<string, unknown>) : undefined;
      const guard = await guardWorkflowWrite(actor, action, collectionName, body.id, payload);
      if (guard.denied) {
        return NextResponse.json({ error: guard.denied }, { status: 403 });
      }
      workflowPrecondition = guard.precondition;
    }

    // Trusted audit identity derived from the verified token — never the body.
    const auditUser = { uid: user.uid, name: user.name || user.email || "Unknown" };

    const Model = getModel(collectionName);

    switch (action) {
      // ── FIND (getDocuments) ──────────────────────────────────────────────
      case "find": {
        const { constraints = [] } = body;
        const { filter: rawFilter, sort, limit: lim } = buildQuery(constraints);
        const filter = await applyReadScope(authzUser, collectionName, rawFilter, body.includeDeleted === true);
        let q = Model.find(filter);
        if (Object.keys(sort).length) q = q.sort(sort);
        q = q.limit(Math.min(lim || MAX_QUERY_LIMIT, MAX_QUERY_LIMIT));
        const docs = await q.lean();
        return NextResponse.json(
          docs.map((d: Record<string, unknown>) => outbound(collectionName, d))
        );
      }

      // ── FIND ONE (getDocument) ──────────────────────────────────────────
      case "findOne": {
        const { id } = body;
        const doc = await Model.findById(id).lean();
        if (!doc) return NextResponse.json(null);
        const d = doc as Record<string, unknown>;
        const deniedDoc = authorizeReadDoc(authzUser, collectionName, d);
        if (deniedDoc) {
          return NextResponse.json({ error: deniedDoc }, { status: 403 });
        }
        return NextResponse.json(outbound(collectionName, d));
      }

      // ── CREATE ──────────────────────────────────────────────────────────
      case "create": {
        const data = encryptDocFields(collectionName, tsToDate(body.data) as Record<string, unknown>);
        data.createdAt = new Date();
        data.updatedAt = new Date();
        const doc = await Model.create(data);
        const id = doc._id.toString();
        // Sealed fields are redacted: an audit entry must never carry a credential.
        writeAuditLog("create", collectionName, id, `Created ${collectionName} record`, auditUser, {
          newData: redactEncryptedFields(collectionName, body.data),
        });
        return NextResponse.json({ id });
      }

      // ── UPDATE ──────────────────────────────────────────────────────────
      case "update": {
        const { id, data: rawData } = body;
        const data = tsToDate(rawData) as Record<string, unknown>;
        if (collectionName === "tasks") {
          const deniedUpdate = await guardTaskUpdate(authzUser, id, data);
          if (deniedUpdate) {
            return NextResponse.json({ error: deniedUpdate }, { status: 403 });
          }
        }
        // A workflow write must land on the state the guard just checked: two
        // approvers acting at once would otherwise both pass and both write.
        data.updatedAt = new Date();
        if (Object.keys(workflowPrecondition).length > 0) {
          const result = await Model.updateOne(
            { _id: id, ...workflowPrecondition },
            { $set: encryptDocFields(collectionName, data) }
          );
          if (result.matchedCount === 0) {
            return NextResponse.json(
              { error: "Someone else changed this record just now. Refresh to see its current state." },
              { status: 409 }
            );
          }
        } else {
          await Model.findByIdAndUpdate(id, { $set: encryptDocFields(collectionName, data) });
        }
        writeAuditLog("update", collectionName, id, `Updated ${collectionName} record`, auditUser, {
          newData: redactEncryptedFields(collectionName, rawData),
        });
        return NextResponse.json({ success: true });
      }

      // ── DELETE ──────────────────────────────────────────────────────────
      case "delete": {
        const { id } = body;
        if (collectionName === "tasks") {
          // Tasks have no write-role gate (assignees must update their own),
          // so deletion needs its own rule or any session could delete any task.
          const task = (await Model.findById(id).lean()) as TaskOwnership | null;
          if (task) {
            const deptId =
              authzUser.role === "department-head" ? await callerDepartmentId(authzUser) : null;
            if (!canDeleteTask(authzUser.role as StaffRole, user.uid, deptId, task)) {
              return NextResponse.json(
                { error: "You may only delete tasks you created or that belong to your department." },
                { status: 403 }
              );
            }
          }
        }
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
        // Staff deletes are soft: attendance, payroll and leave rows point at
        // this _id, and a hard delete orphaned that history (the monthly grid
        // then re-invented every missing day as "Absent"). Flag the row instead
        // — it drops out of every listing via withoutDeleted(), and history
        // views read it back with includeDeleted.
        const pinned = Object.keys(workflowPrecondition).length > 0;
        const removed = isSoftDeleteCollection(collectionName)
          ? await Model.findByIdAndUpdate(id, { $set: softDeletePatch() }, { new: true }).lean()
          : pinned
            ? await Model.findOneAndDelete({ _id: id, ...workflowPrecondition }).lean()
            : await Model.findByIdAndDelete(id).lean();
        // A no-op delete used to return success, so the row silently came back
        // on refresh. Say so instead.
        if (!removed) {
          // Still there, so the workflow state moved on after the guard read it.
          if (pinned && (await Model.exists({ _id: id }))) {
            return NextResponse.json(
              { error: "Someone else changed this record just now. Refresh to see its current state." },
              { status: 409 }
            );
          }
          return NextResponse.json({ error: "Record not found — nothing was deleted." }, { status: 404 });
        }
        writeAuditLog("delete", collectionName, id, `Deleted ${collectionName} record`, auditUser);
        return NextResponse.json({ success: true });
      }

      // ── NEXT SEQUENCE (atomic counter for document numbering) ───────────
      // Guarantees gap-free, duplicate-free numbers even with concurrent users.
      case "nextSequence": {
        const { key, legacy } = body;
        if (!key || typeof key !== "string") {
          return NextResponse.json({ error: "Sequence key is required" }, { status: 400 });
        }
        const SeqModel = getModel("number_sequences");
        // Scope migration: when this key has no counter yet, seed it from the
        // highest legacy counter it replaces (e.g. per-FY keys collapsing into
        // one continuous serial) so numbering continues instead of restarting.
        if (legacy && typeof legacy.prefix === "string" && legacy.prefix) {
          const existing = await SeqModel.findOne({ key }).lean();
          if (!existing) {
            const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const suffix = typeof legacy.suffix === "string" ? legacy.suffix : "";
            const pattern = `^${esc(legacy.prefix)}.*${esc(suffix)}$`;
            const legacyDocs = await SeqModel.find({ key: { $regex: pattern } }).lean();
            const seed = legacyDocs.reduce(
              (max: number, d: Record<string, unknown>) => Math.max(max, Number(d.current) || 0),
              0
            );
            if (seed > 0) {
              // $setOnInsert keeps this race-safe: a concurrent first call
              // either inserts the seed or no-ops, then both $inc atomically.
              await SeqModel.updateOne(
                { key },
                { $setOnInsert: { current: seed, createdAt: new Date() } },
                { upsert: true }
              );
            }
          }
        }
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
          docs.map((d: Record<string, unknown>) => outbound(`${parentCollection}_${subCollection}`, d))
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
        const filter = await applyReadScope(authzUser, collectionName, rawFilter, body.includeDeleted === true);
        const total = await Model.countDocuments(filter);
        return NextResponse.json({ total });
      }

      // ── SUM (aggregate a numeric field over the full filtered set) ──────
      case "sum": {
        const { constraints = [], field } = body;
        if (typeof field !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(field)) {
          return NextResponse.json({ error: "A valid field name is required" }, { status: 400 });
        }
        const { filter: rawFilter } = buildQuery(constraints);
        const filter = await applyReadScope(authzUser, collectionName, rawFilter, body.includeDeleted === true);
        const rows = await Model.aggregate([
          { $match: filter },
          { $group: { _id: null, total: { $sum: `$${field}` } } },
        ]);
        return NextResponse.json({ total: rows[0]?.total ?? 0 });
      }

      // ── PAGINATE ────────────────────────────────────────────────────────
      case "paginate": {
        const { constraints = [], pageSize = 25, page = 0 } = body;
        const { filter: rawFilter, sort } = buildQuery(constraints);
        const filter = await applyReadScope(authzUser, collectionName, rawFilter, body.includeDeleted === true);
        const total = await Model.countDocuments(filter);
        let q = Model.find(filter);
        if (Object.keys(sort).length) q = q.sort(sort);
        const safePageSize = Math.min(Math.max(Number(pageSize) || 25, 1), MAX_QUERY_LIMIT);
        const safePage = Math.max(Number(page) || 0, 0);
        q = q.skip(safePage * safePageSize).limit(safePageSize);
        const docs = await q.lean();
        return NextResponse.json({
          data: docs.map((d: Record<string, unknown>) => outbound(collectionName, d)),
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
