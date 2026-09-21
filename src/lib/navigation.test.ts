import { describe, it, expect } from "vitest";
import { navigationModules, getAllNavItems, type NavItem } from "@/lib/navigation";
import { PORTAL_MODULES } from "@/lib/portal-nav";

/** Item-level feature, else the feature declared on the owning module. */
function sidebarFeature(href: string): string | undefined {
  for (const mod of navigationModules) {
    const items: NavItem[] = [...(mod.items ?? []), ...(mod.subGroups?.flatMap((sg) => sg.items) ?? [])];
    const item = items.find((i) => i.href === href);
    if (item) return item.feature ?? mod.feature;
  }
  return undefined;
}

describe("dashboard navigation feature gating", () => {
  it("every item under /dashboard/events carries the events feature", () => {
    const eventItems = getAllNavItems().filter((i) => i.href.startsWith("/dashboard/events"));
    expect(eventItems.length).toBeGreaterThan(0);
    const ungated = eventItems.filter((i) => sidebarFeature(i.href) !== "events").map((i) => i.href);
    expect(ungated).toEqual([]);
  });

  it("every portal link mirrors a sidebar item gated by the same feature", () => {
    const mismatches: string[] = [];
    for (const mod of PORTAL_MODULES) {
      for (const link of mod.links) {
        const dashboardHref = link.href.replace(/^\/staff-portal/, "/dashboard");
        if (sidebarFeature(dashboardHref) !== mod.feature) mismatches.push(link.href);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("puts Daily Updates in People, where admins look for staff reports", () => {
    const people = navigationModules.find((m) => m.id === "people");
    const item = people?.items?.find((i) => i.href === "/dashboard/tasks/daily-updates");
    expect(item, "Daily Updates should sit under the People module").toBeDefined();
    expect(item?.roles).toContain("department-head");
    // One home only — a second copy under Work lights up two sidebar rows at once.
    const copies = getAllNavItems().filter((i) => i.href === "/dashboard/tasks/daily-updates");
    expect(copies).toHaveLength(1);
  });

  it("keeps the department report flow in People, where heads and admins look for it", () => {
    const people = navigationModules.find((m) => m.id === "people");
    const deptReports = people?.items?.find((i) => i.href === "/dashboard/reports/department");
    const finalReport = people?.items?.find((i) => i.href === "/dashboard/reports/company");
    expect(deptReports?.roles).toContain("department-head");
    expect(deptReports?.roles).toContain("admin");
    // The roll-up is the admin's sign-off view; a head only files their own.
    expect(finalReport?.roles).toEqual(["admin"]);
    // One home each, so the sidebar cannot light up two rows for one page.
    for (const href of ["/dashboard/reports/department", "/dashboard/reports/company"]) {
      expect(getAllNavItems().filter((i) => i.href === href)).toHaveLength(1);
    }
  });

  it("gives the organization report builder a home a head cannot open", () => {
    const people = navigationModules.find((m) => m.id === "people");
    const builder = people?.items?.find((i) => i.href === "/dashboard/reports/organization");
    expect(builder, "Org Reports should sit under People, beside the filings it is built from").toBeDefined();
    // It prints every department's numbers — reporting roles only.
    expect(builder?.roles).toEqual(["admin", "accounts"]);
    expect(getAllNavItems().filter((i) => i.href === "/dashboard/reports/organization")).toHaveLength(1);
  });

  it("keeps every People item readable by a department head except the admin-only ones", () => {
    const people = navigationModules.find((m) => m.id === "people");
    expect(people?.roles).toContain("department-head");
    const headItems = (people?.items ?? []).filter((i) => i.roles?.includes("department-head"));
    expect(headItems.map((i) => i.href)).toContain("/dashboard/attendance");
  });
});
