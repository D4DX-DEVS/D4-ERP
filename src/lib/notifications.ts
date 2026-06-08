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
