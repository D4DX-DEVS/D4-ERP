"use client";

import { createDocument, Timestamp } from "@/lib/firestore";
import type { AppNotification } from "@/types";

type NotificationType = AppNotification["type"];

interface CreateNotificationParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  entityId?: string;
  entityType?: string;
  senderName?: string;
}

/**
 * Sends the same notification as a web push (OneSignal, addressed by staff id).
 * Best-effort: the in-app record is the source of truth, push is a nudge.
 */
export function sendPush(recipientIds: string[], title: string, message: string, link?: string): void {
  fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipientIds, title, message, link }),
  })
    // A wrong app id / REST key answers 200-with-reason or 502, not a thrown
    // error, so without this a push that never left the server looks like a
    // success. Still best-effort — the in-app record already landed.
    .then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.sent === false) {
        console.error("Push not delivered:", res.status, body?.reason ?? body);
      }
    })
    .catch((error) => console.error("Failed to send push:", error));
}

/**
 * Creates an in-app notification for a specific user.
 * Never throws — failures are silently logged.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await createDocument("notifications", {
      recipientId: params.recipientId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link || "",
      imageUrl: "",
      senderName: params.senderName || "",
      isRead: false,
      metadata: params.entityId
        ? { entityId: params.entityId, entityType: params.entityType || "" }
        : null,
      createdAt: Timestamp.now(),
    });
    sendPush([params.recipientId], params.title, params.message, params.link);
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

/**
 * Creates notifications for multiple recipients at once.
 */
export async function createBulkNotifications(
  recipientIds: string[],
  params: Omit<CreateNotificationParams, "recipientId">
): Promise<void> {
  await Promise.allSettled(
    recipientIds.map((recipientId) => createNotification({ ...params, recipientId }))
  );
}
