import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  DocumentData,
  QueryConstraint,
  limit,
  startAfter,
  DocumentSnapshot,
  getCountFromServer,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ==================== Audit Logging ====================
// Set current user for audit tracking (call from auth)
let _auditUser: { uid: string; firstName: string; lastName: string } | null = null;
export function setAuditUser(user: typeof _auditUser) {
  _auditUser = user;
}

async function writeAuditLog(
  action: "create" | "update" | "delete",
  collectionName: string,
  entityId: string,
  description: string,
  extra?: { previousData?: Record<string, unknown>; newData?: Record<string, unknown> }
) {
  // Don't log audit_logs or settings writes to avoid recursion
  if (collectionName === "audit_logs" || collectionName === "settings") return;
  try {
    await addDoc(collection(db, "audit_logs"), {
      userId: _auditUser?.uid || "system",
      userName: _auditUser ? `${_auditUser.firstName} ${_auditUser.lastName}` : "System",
      action,
      module: collectionName,
      entityType: collectionName,
      entityId,
      description,
      details: description,
      timestamp: Timestamp.now(),
      previousData: extra?.previousData || null,
      newData: extra?.newData || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch {
    // Never let audit logging break main operations
  }
}

// ==================== Generic CRUD ====================
export async function getDocuments<T>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<(T & { id: string })[]> {
  const q = query(collection(db, collectionName), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as (T & { id: string })[];
}

export async function getDocumentsPaginated<T>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  pageSize: number = 25,
  cursor?: DocumentSnapshot | null
): Promise<{ data: (T & { id: string })[]; lastDoc: DocumentSnapshot | null; total: number }> {
  // Count
  const countQ = query(collection(db, collectionName), ...constraints.filter(c => {
    // Remove orderBy/limit/startAfter for count query — keep only where
    const str = String(c);
    return !str.includes("orderBy") && !str.includes("limit") && !str.includes("startAfter");
  }));
  let total = 0;
  try {
    const countSnap = await getCountFromServer(query(collection(db, collectionName)));
    total = countSnap.data().count;
  } catch {
    total = 0;
  }

  // Paginated query
  const pageConstraints = [...constraints, limit(pageSize)];
  if (cursor) pageConstraints.push(startAfter(cursor));

  const q = query(collection(db, collectionName), ...pageConstraints);
  const snapshot = await getDocs(q);
  const data = snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as (T & { id: string })[];

  const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

  return { data, lastDoc, total };
}

export async function getDocument<T>(
  collectionName: string,
  docId: string
): Promise<(T & { id: string }) | null> {
  const docRef = doc(db, collectionName, docId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as T & { id: string };
}

export async function createDocument<T extends DocumentData>(
  collectionName: string,
  data: T
): Promise<string> {
  const docRef = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  // Auto audit log
  writeAuditLog("create", collectionName, docRef.id, `Created ${collectionName} record`, {
    newData: data as Record<string, unknown>,
  });
  return docRef.id;
}

export async function updateDocument<T extends DocumentData>(
  collectionName: string,
  docId: string,
  data: Partial<T>
): Promise<void> {
  const docRef = doc(db, collectionName, docId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
  // Auto audit log
  writeAuditLog("update", collectionName, docId, `Updated ${collectionName} record`, {
    newData: data as Record<string, unknown>,
  });
}

export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  const docRef = doc(db, collectionName, docId);
  await deleteDoc(docRef);
  // Auto audit log
  writeAuditLog("delete", collectionName, docId, `Deleted ${collectionName} record`);
}

// Sub-collection operations
export async function getSubDocuments<T>(
  parentCollection: string,
  parentId: string,
  subCollection: string,
  constraints: QueryConstraint[] = []
): Promise<(T & { id: string })[]> {
  const q = query(
    collection(db, parentCollection, parentId, subCollection),
    ...constraints
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as (T & { id: string })[];
}

export async function createSubDocument<T extends DocumentData>(
  parentCollection: string,
  parentId: string,
  subCollection: string,
  data: T
): Promise<string> {
  const docRef = await addDoc(
    collection(db, parentCollection, parentId, subCollection),
    {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }
  );
  // Auto audit log
  writeAuditLog("create", `${parentCollection}/${parentId}/${subCollection}`, docRef.id, `Created ${subCollection} sub-document`);
  return docRef.id;
}

// Helper exports for query building
export { where, orderBy, limit, startAfter, Timestamp, query, collection, doc, getCountFromServer };
export type { DocumentSnapshot, QueryConstraint };
