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
});
