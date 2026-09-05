import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FEATURES } from "@/lib/permissions";
import { PORTAL_MODULES, PORTAL_GUARD, resolvePortalRoute, dashboardPathFor } from "@/lib/portal-nav";

const PORTAL_ROOT = path.resolve(__dirname, "../app/(staff-portal)/staff-portal");
const DASHBOARD_ROOT = path.resolve(__dirname, "../app/(dashboard)/dashboard");

function moduleFor(feature: string) {
  const mod = PORTAL_MODULES.find((m) => m.feature === feature);
  if (!mod) throw new Error(`no portal module for ${feature}`);
  return mod;
}

describe("portal nav derived from the feature registry", () => {
  it("events grant exposes All Events, Booking Calendar and Reports beside the hub", () => {
    const events = moduleFor("events");
    expect(events.href).toBe("/staff-portal/events");
    expect(events.links.map((l) => l.href)).toEqual([
      "/staff-portal/events/list",
      "/staff-portal/events/calendar",
      "/staff-portal/events/reports",
    ]);
    expect(events.links.map((l) => l.label)).toEqual(["All Events", "Booking Calendar", "Reports"]);
  });

  it("work-logs grant exposes Daily Updates and Performance", () => {
    const workLogs = moduleFor("work-logs");
    expect(workLogs.links.map((l) => l.href)).toEqual([
      "/staff-portal/tasks/daily-updates",
      "/staff-portal/tasks/performance",
    ]);
  });

  it("only registry entries with portal metadata become modules", () => {
    const expected = FEATURES.filter((f) => f.portal).map((f) => f.key);
    expect(PORTAL_MODULES.map((m) => m.feature)).toEqual(expected);
  });

  it("every portal href (hub + links) resolves to a wrapper route on disk", () => {
    const hrefs = PORTAL_MODULES.flatMap((m) => [m.href, ...m.links.map((l) => l.href)]);
    const missing = hrefs.filter((href) => {
      const rel = href.replace(/^\/staff-portal/, "");
      return !fs.existsSync(path.join(PORTAL_ROOT, rel, "page.tsx"));
    });
    expect(missing).toEqual([]);
  });

  it("every href is a portal path and unique across modules", () => {
    const hrefs = PORTAL_MODULES.flatMap((m) => [m.href, ...m.links.map((l) => l.href)]);
    for (const href of hrefs) expect(href.startsWith("/staff-portal/")).toBe(true);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("portal route guard", () => {
  it("orders longest href first so nested modules win over their parent", () => {
    const lengths = PORTAL_GUARD.map((g) => g.href.length);
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
  });

  it("resolves /staff-portal/tasks/work-logs to work-logs, not tasks", () => {
    expect(resolvePortalRoute("/staff-portal/tasks/work-logs")?.feature).toBe("work-logs");
  });

  it("resolves a nested link to its own feature (daily-updates needs work-logs, not tasks)", () => {
    expect(resolvePortalRoute("/staff-portal/tasks/daily-updates")?.feature).toBe("work-logs");
    expect(resolvePortalRoute("/staff-portal/tasks")?.feature).toBe("tasks");
  });

  it("marks the exact link active and keeps the module for detail pages", () => {
    const list = resolvePortalRoute("/staff-portal/events/list");
    expect(list).toMatchObject({
      feature: "events",
      moduleHref: "/staff-portal/events",
      linkHref: "/staff-portal/events/list",
    });

    const detail = resolvePortalRoute("/staff-portal/events/abc123");
    expect(detail).toMatchObject({ feature: "events", moduleHref: "/staff-portal/events" });
    expect(detail?.linkHref).toBeUndefined();
  });

  it("returns null for self-service pages that need no grant", () => {
    expect(resolvePortalRoute("/staff-portal")).toBeNull();
    expect(resolvePortalRoute("/staff-portal/profile")).toBeNull();
    expect(resolvePortalRoute(null)).toBeNull();
  });

  it("does not treat a sibling prefix as a match (/eventsX is not /events)", () => {
    expect(resolvePortalRoute("/staff-portal/eventsX")).toBeNull();
  });
});

describe("dashboardPathFor (admin opens a portal module link)", () => {
  it("maps a portal module path, detail pages included, onto the dashboard shell", () => {
    expect(dashboardPathFor("/staff-portal/events/abc123")).toBe("/dashboard/events/abc123");
    expect(dashboardPathFor("/staff-portal/tasks/daily-updates")).toBe("/dashboard/tasks/daily-updates");
    expect(dashboardPathFor("/staff-portal/events")).toBe("/dashboard/events");
  });

  it("returns null for self-service pages that have no dashboard twin", () => {
    expect(dashboardPathFor("/staff-portal")).toBeNull();
    expect(dashboardPathFor("/staff-portal/profile")).toBeNull();
    expect(dashboardPathFor(null)).toBeNull();
  });

  it("every portal hub and link has the dashboard page it re-exports", () => {
    const hrefs = PORTAL_MODULES.flatMap((m) => [m.href, ...m.links.map((l) => l.href)]);
    const missing = hrefs.filter((href) => {
      const rel = dashboardPathFor(href)!.replace(/^\/dashboard/, "");
      return !fs.existsSync(path.join(DASHBOARD_ROOT, rel, "page.tsx"));
    });
    expect(missing).toEqual([]);
  });
});
