import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  encryptDocFields,
  decryptDocFields,
  redactEncryptedFields,
  ENCRYPTED_FIELDS,
} from "@/lib/vault";

const KEY_A = "a".repeat(64); // 32 bytes of hex
const KEY_B = "b".repeat(64);

function withKey(key: string | undefined) {
  if (key === undefined) delete process.env.TOOLS_VAULT_KEY;
  else process.env.TOOLS_VAULT_KEY = key;
}

describe("vault: secret encryption", () => {
  beforeEach(() => withKey(undefined));
  afterEach(() => withKey(undefined));

  it("round-trips a value using the JWT-derived key when no vault key is set", () => {
    const payload = encryptSecret("hunter2");
    expect(decryptSecret(payload)).toBe("hunter2");
  });

  it("round-trips a value using an explicit hex vault key", () => {
    withKey(KEY_A);
    const payload = encryptSecret("s3cret-pass");
    expect(decryptSecret(payload)).toBe("s3cret-pass");
  });

  it("round-trips a base64 vault key", () => {
    withKey(Buffer.alloc(32, 7).toString("base64"));
    expect(decryptSecret(encryptSecret("via-base64"))).toBe("via-base64");
  });

  it("never leaks the plaintext into the stored payload", () => {
    const payload = encryptSecret("adobe-password-2026");
    expect(payload).not.toContain("adobe-password-2026");
  });

  it("produces a different payload each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("round-trips unicode and long values", () => {
    const value = "パスワード🔐 " + "x".repeat(5000);
    expect(decryptSecret(encryptSecret(value))).toBe(value);
  });

  it("rejects a tampered payload instead of returning garbage", () => {
    const parts = encryptSecret("tamper-me").split(":");
    parts[4] = Buffer.from("not-the-original").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptSecret("not-encrypted")).toThrow(/malformed/i);
    expect(() => decryptSecret("tv1:k:only:three")).toThrow(/malformed/i);
  });

  it("cannot decrypt with a different vault key", () => {
    withKey(KEY_A);
    const payload = encryptSecret("locked-away");
    withKey(KEY_B);
    expect(() => decryptSecret(payload)).toThrow();
  });

  it("reports a missing vault key rather than silently using the derived one", () => {
    withKey(KEY_A);
    const payload = encryptSecret("needs-the-key");
    withKey(undefined);
    expect(() => decryptSecret(payload)).toThrow(/TOOLS_VAULT_KEY/);
  });

  it("rejects a vault key that is not 32 bytes", () => {
    withKey("tooshort");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });

  it("recognises its own payloads", () => {
    expect(isEncrypted(encryptSecret("x"))).toBe(true);
    expect(isEncrypted("plain text")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted({ password: "x" })).toBe(false);
  });
});

describe("vault: document field encryption", () => {
  beforeEach(() => withKey(undefined));
  afterEach(() => withKey(undefined));

  it("registers the tool credential field", () => {
    expect(ENCRYPTED_FIELDS.company_tools).toContain("secret");
  });

  it("encrypts only the registered field and leaves the rest readable", () => {
    const out = encryptDocFields("company_tools", {
      name: "Adobe Creative Cloud",
      cost: 45000,
      secret: { password: "adobe-pass", licenseKey: "ABC-123" },
    });
    expect(out.name).toBe("Adobe Creative Cloud");
    expect(out.cost).toBe(45000);
    expect(isEncrypted(out.secret)).toBe(true);
    expect(JSON.stringify(out)).not.toContain("adobe-pass");
    expect(JSON.stringify(out)).not.toContain("ABC-123");
  });

  it("leaves unregistered collections untouched", () => {
    const data = { secret: { password: "p" } };
    expect(encryptDocFields("assets", data).secret).toEqual({ password: "p" });
  });

  it("does not add the field when the payload omits it (partial update)", () => {
    const out = encryptDocFields("company_tools", { name: "Canva" });
    expect("secret" in out).toBe(false);
  });

  it("clears the field when it is explicitly emptied", () => {
    expect(encryptDocFields("company_tools", { secret: null }).secret).toBeNull();
    expect(encryptDocFields("company_tools", { secret: {} }).secret).toBeNull();
  });

  it("round-trips a document through encrypt and decrypt", () => {
    const stored = encryptDocFields("company_tools", {
      name: "GitHub",
      secret: { password: "gh-pass", recoveryEmail: "ops@d4.in" },
    });
    const read = decryptDocFields("company_tools", { ...stored });
    expect(read.secret).toEqual({ password: "gh-pass", recoveryEmail: "ops@d4.in" });
    expect(read.secretLocked).toBeUndefined();
  });

  it("flags the document instead of throwing when the value cannot be decrypted", () => {
    withKey(KEY_A);
    const stored = encryptDocFields("company_tools", { secret: { password: "p" } });
    withKey(KEY_B);
    const read = decryptDocFields("company_tools", { ...stored });
    expect(read.secret).toBeNull();
    expect(read.secretLocked).toBe(true);
  });

  it("passes through documents that were never encrypted", () => {
    const read = decryptDocFields("company_tools", { name: "Figma" });
    expect(read).toEqual({ name: "Figma" });
  });

  it("does not mutate the input document", () => {
    const input: Record<string, unknown> = { secret: { password: "p" } };
    encryptDocFields("company_tools", input);
    expect(input.secret).toEqual({ password: "p" });
  });
});

describe("vault: audit redaction", () => {
  it("strips credential payloads before they reach the audit log", () => {
    const redacted = redactEncryptedFields("company_tools", {
      name: "Canva",
      secret: { password: "canva-pass" },
    }) as Record<string, unknown>;
    expect(redacted.name).toBe("Canva");
    expect(redacted.secret).toBe("[redacted]");
    expect(JSON.stringify(redacted)).not.toContain("canva-pass");
  });

  it("leaves other collections and non-object payloads alone", () => {
    expect(redactEncryptedFields("assets", { secret: "keep" })).toEqual({ secret: "keep" });
    expect(redactEncryptedFields("company_tools", undefined)).toBeUndefined();
  });
});
