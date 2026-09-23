import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FEATURES } from "@/lib/permissions";
import {
  PORTAL_MODULES,
  PORTAL_GUARD,
  resolvePortalRoute,
  dashboardPathFor,
  portalPathFor,
  landingPathFor,
  deniedRedirectFor,
  otherShellFor,
} from "@/lib/portal-nav";

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

describe("landingPathFor (which shell a role belongs in)", () => {
  it("sends staff to the portal and everyone else to the dashboard", () => {
    expect(landingPathFor("staff")).toBe("/staff-portal");
    expect(landingPathFor("admin")).toBe("/dashboard");
    expect(landingPathFor("department-head")).toBe("/dashboard");
    expect(landingPathFor("accounts")).toBe("/dashboard");
  });

  it("falls back to the portal when the role is missing — the shell nobody is locked out of", () => {
    expect(landingPathFor(null)).toBe("/staff-portal");
    expect(landingPathFor(undefined)).toBe("/staff-portal");
  });
});

describe("otherShellFor (a role that works in both shells)", () => {
  it("links department heads and accounts from each shell to the other", () => {
    expect(otherShellFor("department-head", "/dashboard")).toBe("/staff-portal");
    expect(otherShellFor("department-head", "/staff-portal")).toBe("/dashboard");
    expect(otherShellFor("accounts", "/dashboard")).toBe("/staff-portal");
    expect(otherShellFor("accounts", "/staff-portal")).toBe("/dashboard");
  });

  it("offers no switch to roles that only have one shell", () => {
    // Admins have no self-service session; plain staff cannot open /dashboard.
    expect(otherShellFor("admin", "/dashboard")).toBeNull();
    expect(otherShellFor("staff", "/staff-portal")).toBeNull();
    expect(otherShellFor(null, "/staff-portal")).toBeNull();
    expect(otherShellFor(undefined, "/dashboard")).toBeNull();
  });
});

describe("portalPathFor (staff opens a dashboard module link)", () => {
  it("maps a dashboard path onto the portal hub or link that re-exports it", () => {
    expect(portalPathFor("/dashboard/events")).toBe("/staff-portal/events");
    expect(portalPathFor("/dashboard/tasks/daily-updates")).toBe("/staff-portal/tasks/daily-updates");
  });

  it("returns null when no wrapper route is guaranteed to exist", () => {
    // Only hubs and links are enforced on disk; detail pages and admin-only
    // sub-pages are not, so forwarding there would 404 inside the portal.
    expect(portalPathFor("/dashboard/events/abc123")).toBeNull();
    expect(portalPathFor("/dashboard/assets/categories")).toBeNull();
    expect(portalPathFor("/dashboard")).toBeNull();
    expect(portalPathFor("/dashboard/settings")).toBeNull();
    expect(portalPathFor("/staff-portal/events")).toBeNull();
    expect(portalPathFor(null)).toBeNull();
  });
});

describe("deniedRedirectFor (the dashboard guard turned someone away)", () => {
  it("never returns a dashboard path for staff — /dashboard denies them too, which is the dead end", () => {
    expect(deniedRedirectFor("staff", "/dashboard")).toBe("/staff-portal");
    expect(deniedRedirectFor("staff", "/dashboard/settings")).toBe("/staff-portal");
    // A module the portal mirrors keeps the deep link alive; the portal's own
    // guard sends them home from there if the grant is missing.
    expect(deniedRedirectFor("staff", "/dashboard/events")).toBe("/staff-portal/events");
  });

  it("sends dashboard roles back to the dashboard home they can always open", () => {
    expect(deniedRedirectFor("department-head", "/dashboard/settings")).toBe("/dashboard");
    expect(deniedRedirectFor("accounts", "/dashboard/staff")).toBe("/dashboard");
  });

  it("never returns the path it was called with, whatever the role", () => {
    for (const role of ["staff", "admin", "department-head", "accounts"] as const) {
      for (const path of ["/dashboard", "/staff-portal", "/dashboard/events", "/dashboard/reports"]) {
        expect(deniedRedirectFor(role, path)).not.toBe(path);
      }
    }
  });
});
