import { describe, it, expect } from "vitest";
import {
  base32Decode,
  generateTotp,
  parseTotpInput,
  totpSecondsRemaining,
  type TotpConfig,
} from "@/lib/totp";

/**
 * RFC 6238 Appendix B seeds, base32-encoded. The ASCII seeds are
 * "12345678901234567890" (SHA1), extended to 32 bytes for SHA256 and 64 for SHA512.
 */
const RFC_SEED_SHA1 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const RFC_SEED_SHA256 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA";
const RFC_SEED_SHA512 =
  "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA";

function config(secret: string, algorithm: TotpConfig["algorithm"], digits = 8): TotpConfig {
  return { secret, algorithm, digits, period: 30 };
}

describe("base32Decode", () => {
  it("decodes a standard RFC 4648 base32 string", () => {
    expect(Buffer.from(base32Decode(RFC_SEED_SHA1)).toString("ascii")).toBe("12345678901234567890");
  });

  it("tolerates the spacing, lowercase and padding authenticator apps show", () => {
    const spaced = "gezd gnbv gy3t qojq gezd gnbv gy3t qojq";
    expect(base32Decode(spaced)).toEqual(base32Decode(RFC_SEED_SHA1));
    expect(base32Decode("MZXW6===")).toEqual(base32Decode("mzxw6"));
    expect(Buffer.from(base32Decode("MZXW6===")).toString("ascii")).toBe("foo");
  });

  it("rejects characters outside the base32 alphabet", () => {
    expect(() => base32Decode("MZXW6!!!")).toThrow(/base32/i);
    expect(() => base32Decode("18901")).toThrow(/base32/i); // 1, 8, 0 are not in the alphabet
  });

  it("rejects an empty secret", () => {
    expect(() => base32Decode("")).toThrow(/empty/i);
    expect(() => base32Decode("   ")).toThrow(/empty/i);
  });
});

describe("generateTotp — RFC 6238 Appendix B vectors", () => {
  const vectors: [number, TotpConfig["algorithm"], string, string][] = [
    [59, "SHA-1", RFC_SEED_SHA1, "94287082"],
    [59, "SHA-256", RFC_SEED_SHA256, "46119246"],
    [59, "SHA-512", RFC_SEED_SHA512, "90693936"],
    [1111111109, "SHA-1", RFC_SEED_SHA1, "07081804"],
    [1111111111, "SHA-1", RFC_SEED_SHA1, "14050471"],
    [1234567890, "SHA-1", RFC_SEED_SHA1, "89005924"],
    [2000000000, "SHA-1", RFC_SEED_SHA1, "69279037"],
    [20000000000, "SHA-1", RFC_SEED_SHA1, "65353130"],
    [1111111109, "SHA-256", RFC_SEED_SHA256, "68084774"],
    [1234567890, "SHA-512", RFC_SEED_SHA512, "93441116"],
  ];

  for (const [seconds, algorithm, secret, expected] of vectors) {
    it(`${algorithm} at T=${seconds} produces ${expected}`, async () => {
      expect(await generateTotp(config(secret, algorithm), seconds * 1000)).toBe(expected);
    });
  }

  it("produces the 6-digit codes authenticator apps actually show", async () => {
    const code = await generateTotp({ ...config(RFC_SEED_SHA1, "SHA-1", 6) }, 59_000);
    expect(code).toBe("287082"); // last 6 of the 8-digit RFC vector
    expect(code).toMatch(/^\d{6}$/);
  });

  it("holds the same code for a whole period and changes at the boundary", async () => {
    const c = config(RFC_SEED_SHA1, "SHA-1", 6);
    const at30 = await generateTotp(c, 30_000);
    const at59 = await generateTotp(c, 59_000);
    const at60 = await generateTotp(c, 60_000);
    expect(at30).toBe(at59);
    expect(at60).not.toBe(at59);
  });

  it("pads short codes to the full digit count", async () => {
    // T=1111111109 SHA-1 is 07081804 — the leading zero must survive.
    expect(await generateTotp(config(RFC_SEED_SHA1, "SHA-1"), 1111111109_000)).toMatch(/^0/);
  });

  it("reports a bad secret clearly instead of returning a wrong code", async () => {
    await expect(generateTotp(config("not base32!", "SHA-1"))).rejects.toThrow(/base32/i);
  });
});

describe("totpSecondsRemaining", () => {
  it("counts down within the period and resets at the boundary", () => {
    expect(totpSecondsRemaining(30, 0)).toBe(30);
    expect(totpSecondsRemaining(30, 1_000)).toBe(29);
    expect(totpSecondsRemaining(30, 29_000)).toBe(1);
    expect(totpSecondsRemaining(30, 30_000)).toBe(30);
    expect(totpSecondsRemaining(60, 45_000)).toBe(15);
  });
});

describe("parseTotpInput", () => {
  it("accepts a bare setup key and applies authenticator-app defaults", () => {
    expect(parseTotpInput(RFC_SEED_SHA1)).toEqual({
      secret: RFC_SEED_SHA1,
      digits: 6,
      period: 30,
      algorithm: "SHA-1",
    });
  });

  it("normalises the spaced, lowercase form shown during setup", () => {
    expect(parseTotpInput("gezd gnbv gy3t qojq")?.secret).toBe("GEZDGNBVGY3TQOJQ");
    expect(parseTotpInput("GEZD-GNBV-GY3T-QOJQ")?.secret).toBe("GEZDGNBVGY3TQOJQ");
  });

  it("parses a full otpauth:// URI from a QR code", () => {
    const uri =
      "otpauth://totp/Adobe:accounts@d4media.in?secret=GEZDGNBVGY3TQOJQ&issuer=Adobe&digits=6&period=30&algorithm=SHA1";
    expect(parseTotpInput(uri)).toEqual({
      secret: "GEZDGNBVGY3TQOJQ",
      digits: 6,
      period: 30,
      algorithm: "SHA-1",
      issuer: "Adobe",
      label: "Adobe:accounts@d4media.in",
    });
  });

  it("honours non-default digits, period and algorithm from the URI", () => {
    const uri = "otpauth://totp/X?secret=GEZDGNBVGY3TQOJQ&digits=8&period=60&algorithm=SHA512";
    const parsed = parseTotpInput(uri);
    expect(parsed?.digits).toBe(8);
    expect(parsed?.period).toBe(60);
    expect(parsed?.algorithm).toBe("SHA-512");
  });

  it("rejects input that is not a usable secret", () => {
    expect(parseTotpInput("")).toBeNull();
    expect(parseTotpInput("   ")).toBeNull();
    expect(parseTotpInput("hello world!")).toBeNull();
    expect(parseTotpInput("otpauth://totp/X?issuer=NoSecret")).toBeNull();
  });

  it("rejects counter-based otpauth URIs, which are not time-based codes", () => {
    expect(parseTotpInput("otpauth://hotp/X?secret=GEZDGNBVGY3TQOJQ&counter=1")).toBeNull();
  });

  it("clamps nonsense digit and period values rather than producing junk codes", () => {
    const parsed = parseTotpInput("otpauth://totp/X?secret=GEZDGNBVGY3TQOJQ&digits=99&period=0");
    expect(parsed?.digits).toBe(6);
    expect(parsed?.period).toBe(30);
  });

  it("round-trips into a working code generator", async () => {
    const parsed = parseTotpInput(`otpauth://totp/T?secret=${RFC_SEED_SHA1}&digits=8`);
    expect(parsed).not.toBeNull();
    expect(await generateTotp(parsed as TotpConfig, 59_000)).toBe("94287082");
  });
});
