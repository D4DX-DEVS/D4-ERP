// ==================== MongoDB-backed Firestore-compatible API ====================
// Drop-in replacement for the old Firebase Firestore client.
// All functions keep the same signatures so page components need zero changes.

// ── Timestamp (Firebase-compatible) ───────────────────────────────────────────
export class Timestamp {
  seconds: number;
  nanoseconds: number;

  constructor(seconds: number, nanoseconds: number = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now(): Timestamp {
    const ms = Date.now();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }

  static fromDate(date: Date): Timestamp {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1e6);
  }

  toJSON() {
    return { _ts: true, seconds: this.seconds, nanoseconds: this.nanoseconds };
  }
}

// ── Query constraint types ────────────────────────────────────────────────────
export interface QueryConstraint {
  _type: string;
  [key: string]: unknown;
}

export interface SearchConstraint extends QueryConstraint {
  _type: "search";
  fields: string[];
  value: string;
}

export function where(field: string, op: string, value: unknown): QueryConstraint {
  return { _type: "where", field, op, value };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc"): QueryConstraint {
  return { _type: "orderBy", field, direction };
}

export function limit(n: number): QueryConstraint {
  return { _type: "limit", value: n };
}

export function search(fields: string[], value: string): SearchConstraint {
  return { _type: "search", fields, value };
}

// Kept for API compat but not used with MongoDB pagination
export function startAfter(): QueryConstraint {
  return { _type: "startAfter" };
}

// ── Internal API caller ───────────────────────────────────────────────────────
let _auditUser: { uid: string; firstName: string; lastName: string } | null = null;

export function setAuditUser(user: typeof _auditUser) {
  _auditUser = user;
}

async function apiCall(body: Record<string, unknown>) {
  // Attach audit user info for server-side audit logging
  if (_auditUser) {
    body.auditUser = { uid: _auditUser.uid, name: `${_auditUser.firstName} ${_auditUser.lastName}` };
  }
  const res = await fetch("/api/db", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ── Generic CRUD (same signatures as before) ──────────────────────────────────

export async function getDocuments<T>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<(T & { id: string })[]> {
  return apiCall({ action: "find", collection: collectionName, constraints });
}

export async function getDocumentsPaginated<T>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  pageSize: number = 25,
  page: number = 0
): Promise<{ data: (T & { id: string })[]; total: number; page: number; pageSize: number; totalPages: number }> {
  return apiCall({ action: "paginate", collection: collectionName, constraints, pageSize, page });
}

export async function countDocuments(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<number> {
  const result = await apiCall({ action: "count", collection: collectionName, constraints });
  return result.total;
}

export async function getDocument<T>(
  collectionName: string,
  docId: string
): Promise<(T & { id: string }) | null> {
  return apiCall({ action: "findOne", collection: collectionName, id: docId });
}

export async function createDocument(
  collectionName: string,
  data: Record<string, unknown>
): Promise<string> {
  const result = await apiCall({ action: "create", collection: collectionName, data });
  return result.id;
}

export async function updateDocument(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  await apiCall({ action: "update", collection: collectionName, id: docId, data });
}

export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  await apiCall({ action: "delete", collection: collectionName, id: docId });
}

// ── Sub-collection operations ─────────────────────────────────────────────────

export async function getSubDocuments<T>(
  parentCollection: string,
  parentId: string,
  subCollection: string,
  constraints: QueryConstraint[] = []
): Promise<(T & { id: string })[]> {
  return apiCall({ action: "findSub", parentCollection, parentId, subCollection, collection: `${parentCollection}_${subCollection}`, constraints });
}

export async function createSubDocument(
  parentCollection: string,
  parentId: string,
  subCollection: string,
  data: Record<string, unknown>
): Promise<string> {
  const result = await apiCall({ action: "createSub", parentCollection, parentId, subCollection, collection: `${parentCollection}_${subCollection}`, data });
  return result.id;
}
