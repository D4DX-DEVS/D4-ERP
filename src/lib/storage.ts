// ==================== DigitalOcean Spaces (S3-compatible) storage ====================
// Server-only helper for uploading user files (employee docs, signatures, seals,
// banner/notification images) to a DigitalOcean Space. Only the resulting public
// URL is persisted in MongoDB; the binary lives in object storage.
//
// Required env vars:
//   DO_SPACES_ENDPOINT   e.g. https://blr1.digitaloceanspaces.com
//   DO_SPACES_REGION     e.g. blr1            (defaults to us-east-1 if omitted)
//   DO_SPACES_KEY        Spaces access key
//   DO_SPACES_SECRET     Spaces secret key
//   DO_SPACES_BUCKET     Space (bucket) name
//   DO_SPACES_CDN_URL    optional public/CDN base, e.g. https://cdn.example.com

import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const endpoint = process.env.DO_SPACES_ENDPOINT?.replace(/\/+$/, "");
const region = process.env.DO_SPACES_REGION || "us-east-1";
const accessKeyId = process.env.DO_SPACES_KEY;
const secretAccessKey = process.env.DO_SPACES_SECRET;
const bucket = process.env.DO_SPACES_BUCKET;
const cdnBase = process.env.DO_SPACES_CDN_URL?.replace(/\/+$/, "");

/** True when all mandatory Spaces credentials are present. */
export function isStorageConfigured(): boolean {
  return Boolean(endpoint && accessKeyId && secretAccessKey && bucket);
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "DigitalOcean Spaces is not configured. Set DO_SPACES_ENDPOINT, DO_SPACES_KEY, DO_SPACES_SECRET and DO_SPACES_BUCKET."
    );
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      endpoint,
      region,
      forcePathStyle: false,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
  }
  return cachedClient;
}

/** Public base URL for objects in the bucket (CDN if provided, else origin). */
function publicBase(): string {
  if (cdnBase) return cdnBase;
  // Build the virtual-hosted–style origin: https://<bucket>.<region>.digitaloceanspaces.com
  const origin = endpoint!.replace(/^https?:\/\//, "");
  return `https://${bucket}.${origin}`;
}

const SAFE_EXT = /[^a-z0-9.\-_]/gi;

/** Builds a collision-resistant object key inside a logical folder. */
function buildKey(folder: string, originalName: string): string {
  const cleanFolder = folder.replace(/^\/+|\/+$/g, "").replace(SAFE_EXT, "-") || "misc";
  const dot = originalName.lastIndexOf(".");
  const ext = dot >= 0 ? originalName.slice(dot).toLowerCase().replace(SAFE_EXT, "") : "";
  return `${cleanFolder}/${Date.now()}-${randomUUID()}${ext}`;
}

export interface UploadResult {
  url: string;
  key: string;
}

/** Uploads a file buffer to the Space and returns its public URL + key. */
export async function uploadToSpaces(params: {
  buffer: Buffer;
  contentType: string;
  folder: string;
  originalName: string;
}): Promise<UploadResult> {
  const { buffer, contentType, folder, originalName } = params;
  const key = buildKey(folder, originalName);
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return { url: `${publicBase()}/${key}`, key };
}

/** Best-effort delete of an object given its public URL. Swallows errors. */
export async function deleteFromSpaces(fileUrl: string): Promise<void> {
  if (!isStorageConfigured() || !fileUrl) return;
  const base = publicBase();
  if (!fileUrl.startsWith(base)) return;
  const key = fileUrl.slice(base.length + 1);
  if (!key) return;
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket!, Key: key }));
  } catch (error) {
    console.error("Failed to delete object from Spaces:", error);
  }
}
