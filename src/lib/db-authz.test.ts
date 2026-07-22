import { describe, it, expect } from "vitest";
import {
  authorize,
  authorizeRead,
  authorizeReadDoc,
  featureReadFilter,
  sanitizeDoc,
  isWriteAction,
  MAX_QUERY_LIMIT,
  scopeFilter,
} from "@/lib/db-authz";
import type { TokenPayload } from "@/lib/auth";

function user(role: string, grantedFeatures: string[] = []): TokenPayload & { grantedFeatures: string[] } {
  return { uid: "u1", email: "u1@d4.in", role, name: "User One", grantedFeatures };
}

const admin = user("admin");
const accounts = user("accounts");
const deptHead = user("department-head");
const staff = user("staff");

describe("role authorization (/api/db permissions)", () => {
  describe("reads on non-finance collections are open to any authenticated role", () => {
    for (const u of [admin, accounts, deptHead, staff]) {
      it(`allows ${u.role} to find a normal collection`, () => {
        expect(authorize(u, "find", "clients")).toBeNull();
        expect(authorize(u, "findOne", "events")).toBeNull();
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
    const staffWithFeature = user("staff", ["studio-booking"]);
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

  describe("attendance writes (admin + department-head only)", () => {
    it("allows admin and department-head", () => {
      expect(authorize(admin, "update", "attendance")).toBeNull();
      expect(authorize(deptHead, "create", "attendance")).toBeNull();
    });
    it("blocks staff and accounts from editing the register", () => {
      expect(authorize(staff, "create", "attendance")).toMatch(/permission/i);
      expect(authorize(staff, "update", "attendance")).toMatch(/permission/i);
      expect(authorize(accounts, "update", "attendance")).toMatch(/permission/i);
    });
  });

  describe("attendance_corrections (staff submit, managers review)", () => {
    it("allows any role to create (submit) a correction request", () => {
      expect(authorize(staff, "create", "attendance_corrections")).toBeNull();
      expect(authorize(deptHead, "create", "attendance_corrections")).toBeNull();
    });
    it("blocks staff from updating (self-approving) a correction", () => {
      expect(authorize(staff, "update", "attendance_corrections")).toMatch(/manager/i);
      expect(authorize(staff, "delete", "attendance_corrections")).toMatch(/manager/i);
    });
    it("allows admin and department-head to review", () => {
      expect(authorize(admin, "update", "attendance_corrections")).toBeNull();
      expect(authorize(deptHead, "update", "attendance_corrections")).toBeNull();
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

  describe("finance server gates (feature-gated reads AND writes)", () => {
    const noGrants = user("staff");
    const accountingOnly = user("staff", ["accounting"]);
    const invoicesOnly = user("staff", ["invoices"]);
    const quotationsOnly = user("staff", ["quotations"]);
    const reportsOnly = user("staff", ["reports"]);

    it("blocks every finance operation for zero-grant staff", () => {
      for (const col of ["transactions", "invoices", "invoice_payments", "items", "categories"]) {
        expect(authorize(noGrants, "find", col)).toMatch(/permission/i);
        expect(authorize(noGrants, "findOne", col)).toMatch(/permission/i);
        expect(authorize(noGrants, "create", col)).toMatch(/permission/i);
        expect(authorize(noGrants, "update", col)).toMatch(/permission/i);
        expect(authorize(noGrants, "delete", col)).toMatch(/permission/i);
      }
    });

    it("accounting grant permits transactions only — not the rest of finance", () => {
      expect(authorize(accountingOnly, "find", "transactions")).toBeNull();
      expect(authorize(accountingOnly, "create", "transactions")).toBeNull();
      expect(authorize(accountingOnly, "find", "categories")).toBeNull(); // needed by the accounting page
      expect(authorize(accountingOnly, "create", "categories")).toMatch(/permission/i); // manage = admin/accounts
      expect(authorize(accountingOnly, "find", "invoices")).toMatch(/permission/i);
      expect(authorize(accountingOnly, "create", "invoices", "invoice")).toMatch(/permission/i);
      expect(authorize(accountingOnly, "find", "items")).toMatch(/permission/i);
      expect(authorize(accountingOnly, "create", "payroll")).toMatch(/permission/i);
    });

    it("invoices grant does not include quotations (shared collection, type-split)", () => {
      expect(authorize(invoicesOnly, "create", "invoices", "invoice")).toBeNull();
      expect(authorize(invoicesOnly, "update", "invoices", "invoice")).toBeNull();
      expect(authorize(invoicesOnly, "create", "invoices", "quotation")).toMatch(/permission/i);
      expect(authorize(invoicesOnly, "delete", "invoices", "quotation")).toMatch(/permission/i);
    });

    it("quotations grant does not include invoices", () => {
      expect(authorize(quotationsOnly, "create", "invoices", "quotation")).toBeNull();
      expect(authorize(quotationsOnly, "create", "invoices", "invoice")).toMatch(/permission/i);
      expect(authorize(quotationsOnly, "update", "invoices", undefined)).toMatch(/permission/i); // unknown type defaults to invoice
    });

    it("type-split read isolation via featureReadFilter", () => {
      expect(featureReadFilter(invoicesOnly, "invoices")).toEqual({ type: { $ne: "quotation" } });
      expect(featureReadFilter(quotationsOnly, "invoices")).toEqual({ type: "quotation" });
      expect(featureReadFilter(user("staff", ["invoices", "quotations"]), "invoices")).toBeNull();
      expect(featureReadFilter(reportsOnly, "invoices")).toBeNull();
      expect(featureReadFilter(accounts, "invoices")).toBeNull();
    });

    it("findOne per-document isolation on invoices", () => {
      expect(authorizeReadDoc(invoicesOnly, "invoices", { type: "invoice" })).toBeNull();
      expect(authorizeReadDoc(invoicesOnly, "invoices", { type: "quotation" })).toMatch(/permission/i);
      expect(authorizeReadDoc(quotationsOnly, "invoices", { type: "quotation" })).toBeNull();
      expect(authorizeReadDoc(quotationsOnly, "invoices", { type: "invoice" })).toMatch(/permission/i);
      expect(authorizeReadDoc(reportsOnly, "invoices", { type: "invoice" })).toBeNull();
    });

    it("reports grant is read-only across finance", () => {
      expect(authorize(reportsOnly, "find", "transactions")).toBeNull();
      expect(authorize(reportsOnly, "find", "invoices")).toBeNull();
      expect(authorize(reportsOnly, "create", "transactions")).toMatch(/permission/i);
      expect(authorize(reportsOnly, "create", "invoices", "invoice")).toMatch(/permission/i);
    });

    it("revocation applies immediately: same user without the grant is denied", () => {
      expect(authorize(user("staff", ["accounting"]), "create", "transactions")).toBeNull();
      expect(authorize(user("staff", []), "create", "transactions")).toMatch(/permission/i);
    });

    it("role defaults keep working for admin and accounts", () => {
      for (const u of [admin, accounts]) {
        expect(authorize(u, "find", "transactions")).toBeNull();
        expect(authorize(u, "create", "transactions")).toBeNull();
        expect(authorize(u, "create", "invoices", "invoice")).toBeNull();
        expect(authorize(u, "create", "invoices", "quotation")).toBeNull();
        expect(authorize(u, "create", "items")).toBeNull();
        expect(authorize(u, "create", "categories")).toBeNull();
        expect(authorizeRead(u, "invoice_payments")).toBeNull();
      }
    });

    it("dept-head has no finance access without grants", () => {
      expect(authorize(deptHead, "find", "transactions")).toMatch(/permission/i);
      expect(authorize(deptHead, "create", "invoices", "invoice")).toMatch(/permission/i);
    });

    it("payroll writes honor a granted payroll feature", () => {
      expect(authorize(user("staff", ["payroll"]), "create", "payroll")).toBeNull();
      expect(authorize(user("department-head", ["payroll"]), "update", "payroll")).toBeNull();
    });
  });

  describe("operations server gates (events, clients, assets — role default OR grant)", () => {
    const plainStaff = user("staff");

    it("blocks zero-grant staff from ops writes", () => {
      for (const col of ["events", "clients", "assets", "asset-categories", "asset-persons", "asset-events"]) {
        expect(authorize(plainStaff, "create", col)).toMatch(/permission/i);
        expect(authorize(plainStaff, "update", col)).toMatch(/permission/i);
        expect(authorize(plainStaff, "delete", col)).toMatch(/permission/i);
      }
    });

    it("granted staff can write only the granted module", () => {
      const eventsStaff = user("staff", ["events"]);
      expect(authorize(eventsStaff, "create", "events")).toBeNull();
      expect(authorize(eventsStaff, "create", "clients")).toMatch(/permission/i);
      expect(authorize(eventsStaff, "create", "assets")).toMatch(/permission/i);

      const assetsStaff = user("staff", ["asset-management"]);
      expect(authorize(assetsStaff, "create", "assets")).toBeNull();
      expect(authorize(assetsStaff, "update", "asset-events")).toBeNull();
      expect(authorize(assetsStaff, "create", "events")).toMatch(/permission/i);

      expect(authorize(user("staff", ["clients"]), "create", "clients")).toBeNull();
    });

    it("role defaults keep working (dept-head events/clients, accounts clients)", () => {
      expect(authorize(deptHead, "create", "events")).toBeNull();
      expect(authorize(deptHead, "create", "assets")).toBeNull();
      expect(authorize(deptHead, "create", "clients")).toBeNull();
      expect(authorize(accounts, "create", "clients")).toBeNull();
      expect(authorize(accounts, "create", "events")).toMatch(/permission/i);
    });

    it("ops reads stay open (calendar and pickers depend on them)", () => {
      expect(authorize(plainStaff, "find", "events")).toBeNull();
      expect(authorize(plainStaff, "find", "clients")).toBeNull();
    });

    it("tasks writes stay workflow-guarded, not feature-gated", () => {
      expect(authorize(plainStaff, "update", "tasks")).toBeNull(); // guardTaskUpdate decides
    });
  });

  describe("grants must not broaden data scope", () => {
    it("a management grant leaves staff read scoping unchanged", () => {
      const plain = user("staff");
      const granted = user("staff", ["tasks", "work-logs", "events", "asset-management"]);
      for (const col of ["leaveRequests", "attendance", "payroll", "attendance_corrections", "employee_documents", "tasks"]) {
        expect(scopeFilter(granted, col, null, null)).toEqual(scopeFilter(plain, col, null, null));
      }
    });

    it("a grant does not give staff dept-head department scope", () => {
      expect(scopeFilter(user("staff", ["tasks"]), "staff", "d1", ["s1"])).toEqual(
        scopeFilter(user("staff"), "staff", "d1", ["s1"])
      );
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

describe("scopeFilter (server-side dept/own-record isolation)", () => {
  it("never scopes admin or accounts", () => {
    expect(scopeFilter(admin, "staff", "d1", null)).toBeNull();
    expect(scopeFilter(accounts, "attendance", "d1", ["s1"])).toBeNull();
  });

  it("scopes dept heads to their department on departmentId collections", () => {
    expect(scopeFilter(deptHead, "leaveRequests", "d1", null)).toEqual({ departmentId: "d1" });
    expect(scopeFilter(deptHead, "staff", "d1", null)).toEqual({ departmentId: "d1" });
  });

  it("scopes dept heads by staff membership on attendance/payroll", () => {
    expect(scopeFilter(deptHead, "attendance", "d1", ["s1", "s2"])).toEqual({
      staffId: { $in: ["s1", "s2"] },
    });
  });

  it("does not scope dept heads on unscoped collections", () => {
    expect(scopeFilter(deptHead, "clients", "d1", null)).toBeNull();
  });

  it("scopes staff to their own records", () => {
    expect(scopeFilter(staff, "leaveRequests", null, null)).toEqual({ staffId: "u1" });
    expect(scopeFilter(staff, "payroll", null, null)).toEqual({ staffId: "u1" });
    expect(scopeFilter(staff, "attendance_corrections", null, null)).toEqual({ staffId: "u1" });
  });

  it("scopes dept heads to their members' correction requests", () => {
    expect(scopeFilter(deptHead, "attendance_corrections", "d1", ["s1", "s2"])).toEqual({
      staffId: { $in: ["s1", "s2"] },
    });
  });

  it("does not scope staff on tasks (public team board)", () => {
    expect(scopeFilter(staff, "tasks", null, null)).toBeNull();
  });
});
