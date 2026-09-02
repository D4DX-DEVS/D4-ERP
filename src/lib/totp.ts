// ==================== Time-based one-time passwords (RFC 6238) ====================
// Turns a stored authenticator seed into the rotating 6-digit code, so a shared
// company account protected by Google Authenticator / Authy can actually be
// signed into by whoever holds the vault permission — not only by the person
// whose phone was used to set it up.
//
// Built on Web Crypto (crypto.subtle), which is available in the browser on a
// secure origin and in Node 20+, so the same code runs in the page and in tests.
// Verified against the RFC 6238 Appendix B vectors in totp.test.ts.
//
// Trade-off worth knowing: a seed stored beside the password means the vault
// holds both factors. That is the same choice 1Password and Bitwarden make —
// it protects against a leaked password, not against a compromised vault — so
// the field is optional and set per tool.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export interface TotpConfig {
  /** Base32 secret, normalised to uppercase with no spaces or padding. */
  secret: string;
  digits: number;
  /** Seconds each code is valid for. */
  period: number;
  algorithm: TotpAlgorithm;
  issuer?: string;
  label?: string;
}

const DEFAULTS = { digits: 6, period: 30, algorithm: "SHA-1" as TotpAlgorithm };

/** Decode an RFC 4648 base32 secret, tolerating the spacing and case apps display. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!clean) throw new Error("The authenticator secret is empty.");

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`"${char}" is not a valid base32 character.`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    // Only happens on an insecure origin (plain http on a non-localhost host).
    throw new Error("Authenticator codes need a secure (https) connection.");
  }
  return api;
}

/**
 * The code for the period containing `nowMs`. Async because Web Crypto's HMAC is.
 */
export async function generateTotp(config: TotpConfig, nowMs: number = Date.now()): Promise<string> {
  const key = base32Decode(config.secret);
  const counter = Math.floor(nowMs / 1000 / config.period);

  // 8-byte big-endian counter. Split across two 32-bit halves so counters past
  // 2^32 (year 2160 at a 30s step) stay exact.
  const message = new Uint8Array(8);
  new DataView(message.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  new DataView(message.buffer).setUint32(4, counter >>> 0);

  const cryptoKey = await subtle().importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: config.algorithm },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(await subtle().sign("HMAC", cryptoKey, message as BufferSource));

  // Dynamic truncation (RFC 4226 §5.3).
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  return String(binary % 10 ** config.digits).padStart(config.digits, "0");
}

/** Seconds left before the current code rolls over. */
export function totpSecondsRemaining(period: number, nowMs: number = Date.now()): number {
  return period - (Math.floor(nowMs / 1000) % period);
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function toAlgorithm(raw: string | null): TotpAlgorithm {
  switch (raw?.toUpperCase().replace("-", "")) {
    case "SHA256":
      return "SHA-256";
    case "SHA512":
      return "SHA-512";
    default:
      return "SHA-1";
  }
}

/**
 * Accept whatever the user pastes: the bare setup key a site shows next to the
 * QR code, or the whole `otpauth://totp/...` URI. Returns null when the input
 * could not be a working secret, so the caller can say so rather than storing junk.
 */
export function parseTotpInput(input: string): TotpConfig | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  if (/^otpauth:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    // hotp:// is counter-based, not time-based — its codes would never match.
    if (url.host.toLowerCase() !== "totp") return null;

    const secret = url.searchParams.get("secret");
    if (!secret) return null;
    const normalised = normaliseSecret(secret);
    if (!normalised) return null;

    const issuer = url.searchParams.get("issuer") ?? undefined;
    const label = decodeURIComponent(url.pathname.replace(/^\//, "")) || undefined;
    return {
      secret: normalised,
      digits: clamp(Number(url.searchParams.get("digits")), 6, 10, DEFAULTS.digits),
      period: clamp(Number(url.searchParams.get("period")), 10, 300, DEFAULTS.period),
      algorithm: toAlgorithm(url.searchParams.get("algorithm")),
      ...(issuer ? { issuer } : {}),
      ...(label ? { label } : {}),
    };
  }

  const normalised = normaliseSecret(trimmed);
  return normalised ? { secret: normalised, ...DEFAULTS } : null;
}

/** Uppercase, unspaced, unpadded — or null when it is not decodable base32. */
function normaliseSecret(raw: string): string | null {
  const clean = raw.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!clean) return null;
  for (const char of clean) {
    if (!BASE32_ALPHABET.includes(char)) return null;
  }
  return clean;
}
