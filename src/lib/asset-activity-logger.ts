import { createDocument, Timestamp } from "@/lib/firestore";

interface LogActivityParams {
  userName: string;
  action: string;
  module: string;
  resourceId?: string;
  details?: string;
}

export async function logAssetActivity(params: LogActivityParams): Promise<void> {
  try {
    await createDocument("asset-activity-logs", {
      userName: params.userName,
      action: params.action,
      module: params.module,
      resourceId: params.resourceId || "",
      details: params.details || "",
      createdAt: Timestamp.now(),
    });
  } catch {
    // Logging failures must never break the main flow
    console.error("Failed to log asset activity:", params);
  }
}
