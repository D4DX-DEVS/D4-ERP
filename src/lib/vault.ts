// ==================== Field-level secret encryption ====================
// Credentials stored by the Tools & Accounts vault are encrypted before they
// reach MongoDB, so a database dump, a backup file or a stray Atlas login never
// exposes a readable password. Decryption happens in the /api/db proxy, which
// already requires an authenticated session with the feature that guards the
// collection — the page itself just masks the value behind a reveal toggle.
//
// Key: TOOLS_VAULT_KEY (32 bytes, as 64 hex chars or base64). When it is not
// set the key is derived from JWT_SECRET so the feature is safe out of the box;
// the payload records which key encrypted it, so switching to a dedicated key
// later never silently mis-decrypts older rows.
//
//   Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Rotating either secret makes existing credentials unreadable (they surface as
// "locked" in the UI and must be re-entered) — set the same value in every
// environment that shares the database.

import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const PREFIX = "tv1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
/** Domain separator so the derived key is not the JWT signing key itself. */
const DERIVE_SALT = "d4erp.tools-vault.v1";

/** Which key a payload was sealed with: explicit env key, or derived from JWT_SECRET. */
type KeySource = "k" | "d";

/** Collections whose listed fields are stored encrypted, as a JSON blob. */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  company_tools: ["secret"],
};

const derivedCache = new Map<string, Buffer>();

function explicitKey(): Buffer | null {
  const raw = process.env.TOOLS_VAULT_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error("TOOLS_VAULT_KEY must decode to 32 bytes (64 hex characters, or base64).");
  }
  return buf;
}

function derivedKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET is required to derive the credential vault key.");
  }
  let key = derivedCache.get(secret);
  if (!key) {
    key = scryptSync(secret, DERIVE_SALT, KEY_BYTES);
    derivedCache.set(secret, key);
  }
  return key;
}

function keyFor(source: KeySource): Buffer {
  if (source === "d") return derivedKey();
  const key = explicitKey();
  if (!key) {
    throw new Error(
      "TOOLS_VAULT_KEY is not configured, so credentials sealed with it cannot be read."
    );
  }
  return key;
}

/** Whether a stored value is one of our sealed payloads. */
export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

/** Seal a string. Output format: `tv1:<key source>:<iv>:<tag>:<ciphertext>`, all base64. */
export function encryptSecret(value: string): string {
  const explicit = explicitKey();
  const source: KeySource = explicit ? "k" : "d";
  const key = explicit ?? derivedKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    PREFIX,
    source,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Open a sealed string. Throws when the payload is malformed, tampered with, or sealed under another key. */
export function decryptSecret(payload: string): string {
  const parts = typeof payload === "string" ? payload.split(":") : [];
  if (parts.length !== 5 || parts[0] !== PREFIX || (parts[1] !== "k" && parts[1] !== "d")) {
    throw new Error("Malformed encrypted value.");
  }
  const [, source, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_BYTES || tag.length !== 16) {
    throw new Error("Malformed encrypted value.");
  }
  const decipher = createDecipheriv(ALGORITHM, keyFor(source as KeySource), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function hasContent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(
    (v) => typeof v === "string" && v.trim() !== ""
  );
}

/**
 * Seal every registered field of an outgoing write. Fields the payload omits
 * stay omitted (partial updates never clobber a stored credential); a field
 * that is present but empty is stored as null so it can be deliberately erased.
 */
export function encryptDocFields(
  collection: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const fields = ENCRYPTED_FIELDS[collection];
  if (!fields) return data;
  const out = { ...data };
  for (const field of fields) {
    if (!(field in out)) continue;
    const value = out[field];
    if (isEncrypted(value)) continue; // already sealed — leave as-is
    out[field] = hasContent(value) ? encryptSecret(JSON.stringify(value)) : null;
  }
  return out;
}

/**
 * Open every registered field of a document on its way to the client. A value
 * that cannot be opened (key rotated, row corrupted) is reported as locked
 * rather than throwing, so one bad row never breaks the whole listing.
 */
export function decryptDocFields(
  collection: string,
  doc: Record<string, unknown>
): Record<string, unknown> {
  const fields = ENCRYPTED_FIELDS[collection];
  if (!fields) return doc;
  for (const field of fields) {
    const value = doc[field];
    if (!isEncrypted(value)) continue;
    try {
      doc[field] = JSON.parse(decryptSecret(value));
    } catch {
      doc[field] = null;
      doc[`${field}Locked`] = true;
    }
  }
  return doc;
}

/** Replace registered fields with a placeholder before a payload is written to the audit log. */
export function redactEncryptedFields(collection: string, data: unknown): unknown {
  const fields = ENCRYPTED_FIELDS[collection];
  if (!fields || !data || typeof data !== "object") return data;
  const out = { ...(data as Record<string, unknown>) };
  for (const field of fields) {
    if (field in out) out[field] = "[redacted]";
  }
  return out;
}
