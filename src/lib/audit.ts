"use client";

import { createDocument, Timestamp } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";

interface AuditLogEntry {
  userId: string;
  userName: string;
  action: "create" | "update" | "delete" | "login" | "logout" | "approve" | "reject";
  module: string;
  entityId: string;
  entityType: string;
  description: string;
  details?: string;
  timestamp: typeof Timestamp;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}

export async function logAudit(
  action: AuditLogEntry["action"],
  module: string,
  entityType: string,
  entityId: string,
  description: string,
  user: { uid: string; firstName: string; lastName: string } | null,
  extra?: { previousData?: Record<string, unknown>; newData?: Record<string, unknown> }
) {
  try {
    await createDocument("audit_logs", {
      userId: user?.uid || "system",
      userName: user ? `${user.firstName} ${user.lastName}` : "System",
      action,
      module,
      entityType,
      entityId,
      description,
      details: description,
      timestamp: Timestamp.now(),
      previousData: extra?.previousData || null,
      newData: extra?.newData || null,
    });
  } catch (error) {
    // Audit logging should never break the main operation
    console.error("Audit log failed:", error);
  }
}
