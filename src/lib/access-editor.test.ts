import { describe, it, expect } from "vitest";
import { FEATURES, BUNDLE_ORDER, featureMeta } from "@/lib/permissions";
import {
  accessSections,
  isUnsupported,
  toggleKey,
  setBundle,
  grantDiff,
  sanitizeForRole,
  portalPreview,
  sensitiveKeys,
  sidebarPagesFor,
  sectionStatus,
  previewFor,
  type AccessSection,
} from "@/lib/access-editor";

function section(role: string, granted: string[], bundle: string) {
  const s = accessSections(role, granted).find((x) => x.bundle === bundle);
  if (!s) throw new Error(`no ${bundle} section`);
  return s;
}

describe("registry bundles", () => {
  it("every feature belongs to a bundle in sidebar order", () => {
    for (const f of FEATURES) expect(BUNDLE_ORDER).toContain(f.bundle);
    expect(BUNDLE_ORDER).toEqual(["People", "Work", "Bookings", "Assets", "Finance", "System"]);
  });

  it("marks salary and credential modules as sensitive", () => {
    expect(featureMeta("payroll")?.sensitive).toMatch(/salar/i);
    expect(featureMeta("tools-vault")?.sensitive).toMatch(/login/i);
    expect(featureMeta("events")?.sensitive).toBeUndefined();
  });

  it("explains what a staff grant still does not include where that is true", () => {
    expect(featureMeta("accounting")?.grantNote).toMatch(/delete/i);
    expect(featureMeta("tasks")?.grantNote).toMatch(/review|approv/i);
  });
});

describe("accessSections", () => {
  it("lists every feature exactly once, grouped in sidebar order", () => {
    const sections = accessSections("staff", []);
    expect(sections.map((s) => s.bundle)).toEqual(BUNDLE_ORDER);
    const keys = sections.flatMap((s) => s.rows.map((r) => r.key));
    expect([...keys].sort()).toEqual(FEATURES.map((f) => f.key).sort());
  });

  it("for a staff member: portal modules are available, dept-management ones unsupported", () => {
    const bookings = section("staff", [], "Bookings");
    const byKey = Object.fromEntries(bookings.rows.map((r) => [r.key, r]));
    expect(byKey["events"].state).toBe("available");
    expect(byKey["studio-booking"].state).toBe("available");
    expect(byKey["studio-manage"].state).toBe("unsupported");
    expect(bookings.grantable).toEqual(["studio-booking", "events"]);
  });

  it("shows granted state and the pages a grant opens", () => {
    const bookings = section("staff", ["events"], "Bookings");
    const events = bookings.rows.find((r) => r.key === "events")!;
    expect(events.state).toBe("granted");
    expect(events.includes).toEqual(["Hub", "All Events", "Booking Calendar", "Reports"]);
    expect(bookings.grantedCount).toBe(1);
  });

  it("for a department head: role defaults are locked on, extras stay available", () => {
    const bookings = section("department-head", [], "Bookings");
    expect(bookings.rows.find((r) => r.key === "events")!.state).toBe("role-default");
    const finance = section("department-head", [], "Finance");
    expect(finance.rows.find((r) => r.key === "accounting")!.state).toBe("available");
  });

  it("carries sensitive and note text onto rows", () => {
    const people = section("staff", [], "People");
    expect(people.rows.find((r) => r.key === "payroll")!.sensitive).toMatch(/salar/i);
    const finance = section("staff", [], "Finance");
    expect(finance.rows.find((r) => r.key === "accounting")!.note).toMatch(/delete/i);
  });
});

describe("editing helpers", () => {
  it("isUnsupported is true only for non-default modules without a portal page", () => {
    expect(isUnsupported("staff", "leaves-manage")).toBe(true);
    expect(isUnsupported("staff", "events")).toBe(false);
    expect(isUnsupported("department-head", "leaves-manage")).toBe(false);
  });

  it("toggleKey adds and removes without duplicates", () => {
    expect(toggleKey([], "events")).toEqual(["events"]);
    expect(toggleKey(["events"], "events")).toEqual([]);
    expect(toggleKey(["events", "events"], "events")).toEqual([]);
  });

  it("setBundle grants only the grantable keys and removes the same set", () => {
    const bookings = section("staff", [], "Bookings");
    const on = setBundle([], bookings, true);
    expect(on).toEqual(["studio-booking", "events"]);
    expect(on).not.toContain("studio-manage");
    expect(setBundle([...on, "clients"], bookings, false)).toEqual(["clients"]);
  });

  it("grantDiff reports added, removed and total count", () => {
    expect(grantDiff(["events"], ["events", "clients"])).toEqual({ added: ["clients"], removed: [], count: 1 });
    expect(grantDiff(["events", "clients"], ["clients"])).toEqual({ added: [], removed: ["events"], count: 1 });
    expect(grantDiff(["a"], ["a"]).count).toBe(0);
  });

  it("sanitizeForRole drops unsupported keys, role defaults and unknown keys when copying", () => {
    expect(sanitizeForRole("staff", ["events", "leaves-manage", "bogus", "events"])).toEqual(["events"]);
    expect(sanitizeForRole("department-head", ["events", "accounting"])).toEqual(["accounting"]);
  });
});

describe("portalPreview", () => {
  it("lists the modules the grants add, with page counts, grouped by portal section", () => {
    expect(portalPreview("staff", ["events", "accounting"])).toEqual([
      { section: "Operations", modules: [{ label: "Events", pages: 4 }] },
      { section: "Finance", modules: [{ label: "Accounting", pages: 1 }] },
    ]);
  });

  it("ignores role defaults and unsupported keys", () => {
    expect(portalPreview("department-head", ["events", "leaves-manage"])).toEqual([]);
    expect(portalPreview("staff", [])).toEqual([]);
  });
});

describe("sensitiveKeys", () => {
  it("returns only the sensitive keys among the given grants, in registry order", () => {
    expect(sensitiveKeys(["tools-vault", "events", "payroll"])).toEqual(["payroll", "tools-vault"]);
    expect(sensitiveKeys(["events", "bogus"])).toEqual([]);
  });
});

describe("dashboard roles (sidebar shell)", () => {
  it("a grant reveals the sidebar items gated by that feature which the role cannot already see", () => {
    expect(sidebarPagesFor("department-head", "payroll")).toEqual(["People › Payroll"]);
    expect(sidebarPagesFor("department-head", "studio-manage")).toEqual(["Bookings › Studio › Resources"]);
    expect(sidebarPagesFor("department-head", "tools-vault")).toEqual(["System › Tools & Accounts"]);
    expect(sidebarPagesFor("department-head", "events")).toEqual([]);
    expect(sidebarPagesFor("accounts", "tasks")).toEqual([]);
    expect(sidebarPagesFor("accounts", "work-logs")).toEqual(["Work › Daily Updates", "Work › Work Logs", "Work › Performance"]);
  });

  it("isUnsupported for a dashboard role means the grant reveals nothing in the sidebar", () => {
    expect(isUnsupported("department-head", "studio-manage")).toBe(false);
    expect(isUnsupported("department-head", "tools-vault")).toBe(false);
    expect(isUnsupported("accounts", "tasks")).toBe(true);
    expect(isUnsupported("accounts", "calendar")).toBe(true);
    expect(isUnsupported("accounts", "attendance-import")).toBe(false);
    expect(isUnsupported("staff", "studio-manage")).toBe(true);
  });

  it("rows say where a grant opens: portal pages for staff, sidebar items for dashboard roles", () => {
    const payrollStaff = section("staff", [], "People").rows.find((r) => r.key === "payroll")!;
    expect(payrollStaff.opens).toBe("portal");
    expect(payrollStaff.includes).toEqual(["One page"]);
    const payrollHead = section("department-head", [], "People").rows.find((r) => r.key === "payroll")!;
    expect(payrollHead.opens).toBe("sidebar");
    expect(payrollHead.includes).toEqual(["People › Payroll"]);
    const studioHead = section("department-head", [], "Bookings");
    expect(studioHead.rows.find((r) => r.key === "studio-manage")!.state).toBe("available");
    expect(studioHead.grantable).toEqual(["studio-manage"]);
  });

  it("sectionStatus reads mixed sections honestly", () => {
    expect(sectionStatus(section("department-head", [], "Work"), "department-head")).toBe("Included with the department-head role");
    expect(sectionStatus(section("staff", [], "Bookings"), "staff")).toBe("0 of 2 granted");
    expect(sectionStatus(section("staff", [], "System"), "staff")).toBe("Not available for this role");
    const mixed: AccessSection = {
      bundle: "Bookings",
      grantable: [],
      grantedCount: 0,
      rows: [
        { key: "studio-booking", label: "", description: "", state: "role-default", includes: [], opens: "sidebar" },
        { key: "studio-manage", label: "", description: "", state: "unsupported", includes: [], opens: "sidebar" },
      ],
    };
    expect(sectionStatus(mixed, "department-head")).toBe("Included with the department-head role · 1 not available");
  });

  it("previewFor lists sidebar additions for dashboard roles and portal modules for staff", () => {
    expect(previewFor("department-head", ["payroll", "studio-manage", "events"])).toEqual([
      { section: "People", modules: [{ label: "Payroll", pages: 1 }] },
      { section: "Bookings", modules: [{ label: "Studio › Resources", pages: 1 }] },
    ]);
    expect(previewFor("staff", ["events"])).toEqual([{ section: "Operations", modules: [{ label: "Events", pages: 4 }] }]);
    expect(previewFor("accounts", ["tasks"])).toEqual([]);
  });
});
