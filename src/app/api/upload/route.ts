import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { isStorageConfigured, uploadToSpaces } from "@/lib/storage";

// Max upload size (15 MB) — guards memory and abuse.
const MAX_BYTES = 15 * 1024 * 1024;

// Allowed MIME types: images for branding/banners + documents for employee files.
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Folders the client may target, mapped to keep the bucket organised.
const ALLOWED_FOLDERS = new Set([
  "employee-documents",
  "branding",
  "banners",
  "notifications",
  "profiles",
  "misc",
]);

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "File storage is not configured on the server." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds the 15 MB limit" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  const folderInput = typeof formData.get("folder") === "string" ? (formData.get("folder") as string) : "misc";
  const folder = ALLOWED_FOLDERS.has(folderInput) ? folderInput : "misc";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadToSpaces({
      buffer,
      contentType: file.type,
      folder,
      originalName: file.name,
    });
    return NextResponse.json({ url: result.url, key: result.key, name: file.name, size: file.size });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
