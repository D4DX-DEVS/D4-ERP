import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Collection names are plain strings passed through /api/db, so a typo makes a
 * page read an empty collection or a policy map guard nothing. These spellings
 * were live bugs (calendar/reports read `leave_requests`, the payments gate was
 * keyed `invoice_payments`); the canonical names are the ones in db-authz.ts.
 */
const WRONG_NAMES: Record<string, string> = {
  '"leave_requests"': '"leaveRequests"',
  '"invoice_payments"': '"invoicePayments"',
};

const ROOTS = ["src/app", "src/lib", "src/hooks", "src/components", "src/store"].map((p) =>
  path.resolve(__dirname, "../..", p)
);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("collection names", () => {
  it("no source file uses a misspelled collection name", () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((r) => walk(r))) {
      const text = fs.readFileSync(file, "utf8");
      for (const [wrong, right] of Object.entries(WRONG_NAMES)) {
        if (text.includes(wrong)) offenders.push(`${path.relative(process.cwd(), file)}: ${wrong} → use ${right}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
