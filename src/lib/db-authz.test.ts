import { describe, it, expect } from "vitest";
import { authorize, sanitizeDoc, isWriteAction, MAX_QUERY_LIMIT } from "@/lib/db-authz";
import type { TokenPayload } from "@/lib/auth";

function user(role: string): TokenPayload {
  return { uid: "u1", email: "u1@d4.in", role, name: "User One" };
}

const admin = user("admin");
const accounts = user("accounts");
const deptHead = user("department-head");
const staff = user("staff");

describe("role authorization (/api/db permissions)", () => {
  describe("reads are open to any authenticated role", () => {
    for (const u of [admin, accounts, deptHead, staff]) {
      it(`allows ${u.role} to find a normal collection`, () => {
        expect(authorize(u, "find", "clients")).toBeNull();
        expect(authorize(u, "findOne", "invoices")).toBeNull();
        expect(authorize(u, "paginate", "tasks")).toBeNull();
        expect(authorize(u, "count", "leaveRequests")).toBeNull();
      });
    }
  });

  describe("admin-only collections", () => {
    for (const collection of ["settings", "companies", "departments"]) {
      it(`allows admin to write ${collection}`, () => {
        expect(authorize(admin, "create", collection)).toBeNull();
        expect(authorize(admin, "update", collection)).toBeNull();
        expect(authorize(admin, "delete", collection)).toBeNull();
      });
      it(`blocks non-admins from writing ${collection}`, () => {
        expect(authorize(accounts, "create", collection)).toMatch(/permission/i);
        expect(authorize(deptHead, "update", collection)).toMatch(/permission/i);
        expect(authorize(staff, "delete", collection)).toMatch(/permission/i);
      });
      it(`still allows non-admins to read ${collection}`, () => {
        expect(authorize(accounts, "find", collection)).toBeNull();
      });
    }
  });

  describe("staff collection writes (admin + department-head)", () => {
    it("allows admin and department-head", () => {
      expect(authorize(admin, "update", "staff")).toBeNull();
      expect(authorize(deptHead, "update", "staff")).toBeNull();
    });
    it("blocks accounts and staff", () => {
      expect(authorize(accounts, "update", "staff")).toMatch(/permission/i);
      expect(authorize(staff, "create", "staff")).toMatch(/permission/i);
    });
  });

  describe("payroll writes (admin + accounts)", () => {
    it("allows admin and accounts", () => {
      expect(authorize(admin, "create", "payroll")).toBeNull();
      expect(authorize(accounts, "update", "payroll")).toBeNull();
    });
    it("blocks department-head and staff", () => {
      expect(authorize(deptHead, "create", "payroll")).toMatch(/permission/i);
      expect(authorize(staff, "update", "payroll")).toMatch(/permission/i);
    });
  });

  describe("studios are admin-only", () => {
    it("allows admin to write", () => {
      expect(authorize(admin, "create", "studios")).toBeNull();
    });
    it("blocks other roles", () => {
      expect(authorize(deptHead, "create", "studios")).toMatch(/permission/i);
      expect(authorize(accounts, "update", "studios")).toMatch(/permission/i);
      expect(authorize(staff, "delete", "studios")).toMatch(/permission/i);
    });
  });

  describe("studio_bookings writes (role default OR granted feature)", () => {
    const staffWithFeature: TokenPayload = {
      uid: "u9",
      email: "u9@d4.in",
      role: "staff",
      name: "Granted Staff",
      features: ["studio-booking"],
    };
    it("allows admin and department-head by role", () => {
      expect(authorize(admin, "create", "studio_bookings")).toBeNull();
      expect(authorize(deptHead, "create", "studio_bookings")).toBeNull();
    });
    it("allows a staff member granted the studio-booking feature", () => {
      expect(authorize(staffWithFeature, "create", "studio_bookings")).toBeNull();
      expect(authorize(staffWithFeature, "update", "studio_bookings")).toBeNull();
    });
    it("blocks staff without the feature", () => {
      expect(authorize(staff, "create", "studio_bookings")).toMatch(/permission/i);
      expect(authorize(accounts, "create", "studio_bookings")).toMatch(/permission/i);
    });
    it("allows reads for anyone", () => {
      expect(authorize(staff, "find", "studio_bookings")).toBeNull();
    });
  });

  describe("audit_logs are append-only", () => {
    it("allows create from any role", () => {
      expect(authorize(staff, "create", "audit_logs")).toBeNull();
      expect(authorize(admin, "create", "audit_logs")).toBeNull();
    });
    it("blocks update and delete even for admin", () => {
      expect(authorize(admin, "update", "audit_logs")).toMatch(/append-only/i);
      expect(authorize(admin, "delete", "audit_logs")).toMatch(/append-only/i);
    });
    it("allows reads", () => {
      expect(authorize(admin, "find", "audit_logs")).toBeNull();
    });
  });

  describe("forbidden collections", () => {
    it("blocks direct access to number_sequences", () => {
      expect(authorize(admin, "find", "number_sequences")).toMatch(/not accessible/i);
      expect(authorize(admin, "create", "number_sequences")).toMatch(/not accessible/i);
    });
    it("permits the atomic nextSequence action", () => {
      expect(authorize(staff, "nextSequence", "number_sequences")).toBeNull();
    });
  });
});

describe("isWriteAction", () => {
  it("flags mutating actions", () => {
    expect(isWriteAction("create")).toBe(true);
    expect(isWriteAction("update")).toBe(true);
    expect(isWriteAction("delete")).toBe(true);
  });
  it("does not flag read actions", () => {
    expect(isWriteAction("find")).toBe(false);
    expect(isWriteAction("paginate")).toBe(false);
    expect(isWriteAction("nextSequence")).toBe(false);
  });
});

describe("sanitizeDoc", () => {
  it("strips password and passwordHash fields", () => {
    const cleaned = sanitizeDoc({
      id: "1",
      email: "a@b.c",
      password: "$2a$hash",
      passwordHash: "$2a$other",
    });
    expect(cleaned).not.toHaveProperty("password");
    expect(cleaned).not.toHaveProperty("passwordHash");
    expect(cleaned.email).toBe("a@b.c");
  });

  it("leaves documents without sensitive fields unchanged", () => {
    expect(sanitizeDoc({ id: "1", name: "X" })).toEqual({ id: "1", name: "X" });
  });
});

describe("MAX_QUERY_LIMIT", () => {
  it("is a sane positive backstop", () => {
    expect(MAX_QUERY_LIMIT).toBeGreaterThan(0);
  });
});
