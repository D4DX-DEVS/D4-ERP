// ==================== Staff-portal navigation (pure) ====================
// Derives the portal's granted-module nav from the feature registry so the
// layout, the route guard and the tests share one source of truth. A module
// is the feature's hub page; its links are the sub-pages an admin reaches from
// the dashboard sidebar (rendered inside the portal via wrapper routes).

import { FEATURES, type FeatureKey, type PortalSection } from "@/lib/permissions";
import type { StaffRole } from "@/types";

export interface PortalLink {
  href: string;
  label: string;
}

export interface PortalModule {
  feature: FeatureKey;
  section: PortalSection;
  href: string;
  label: string;
  links: PortalLink[];
}

/** Portal nav sections in display order (shared by the layout and the grant editor preview). */
export const PORTAL_SECTION_ORDER: PortalSection[] = ["Operations", "Work", "Finance", "Insights"];

/** Granted modules in registry order (the order shown in the UI). */
export const PORTAL_MODULES: PortalModule[] = FEATURES.filter((f) => f.portal).map((f) => ({
  feature: f.key,
  section: f.portal!.section,
  href: f.portal!.href,
  label: f.portal!.label ?? f.label,
  links: f.portal!.links ?? [],
}));

export interface PortalGuardEntry {
  href: string;
  feature: FeatureKey;
  moduleHref: string;
  /** Set when the entry is a sub-page link rather than the module hub. */
  linkHref?: string;
  label: string;
}

/**
 * Every guarded href (hubs and links), longest first, so a nested path
 * resolves to its most specific owner: /tasks/work-logs → work-logs (not tasks),
 * /tasks/daily-updates → the work-logs link (not the tasks hub).
 */
export const PORTAL_GUARD: PortalGuardEntry[] = PORTAL_MODULES.flatMap((m) => [
  { href: m.href, feature: m.feature, moduleHref: m.href, label: m.label },
  ...m.links.map((l) => ({
    href: l.href,
    feature: m.feature,
    moduleHref: m.href,
    linkHref: l.href,
    label: l.label,
  })),
]).sort((a, b) => b.href.length - a.href.length);

/**
 * Which grant a portal path needs and which nav entry it belongs to.
 * Null for self-service pages (home, profile, attendance…) that need no grant.
 * Matches whole path segments only: /staff-portal/eventsX is not /events.
 */
export function resolvePortalRoute(pathname: string | null | undefined): PortalGuardEntry | null {
  if (!pathname) return null;
  return (
    PORTAL_GUARD.find((g) => pathname === g.href || pathname.startsWith(`${g.href}/`)) ?? null
  );
}

/**
 * Dashboard twin of a portal module path (hub, sub-page link, or a detail page
 * under either), or null for self-service pages that exist only in the portal.
 * Portal module routes re-export the dashboard pages, so the twin always
 * exists (enforced by portal-nav.test.ts). Used when an admin follows a portal
 * deep link such as an event notification: the dashboard is the admin's shell,
 * but the target page must survive the redirect.
 */
export function dashboardPathFor(pathname: string | null | undefined): string | null {
  if (!pathname || !resolvePortalRoute(pathname)) return null;
  return pathname.replace(/^\/staff-portal/, "/dashboard");
}

/**
 * Portal twin of a dashboard module path — the reverse of dashboardPathFor.
 *
 * Only exact hubs and links map: those are the hrefs portal-nav.test.ts pins to
 * a wrapper route on disk. Detail pages (/dashboard/events/abc123) and
 * admin-only sub-pages (/dashboard/assets/categories) have no guaranteed
 * wrapper, so forwarding there would swap "Access denied" for a 404.
 */
export function portalPathFor(pathname: string | null | undefined): string | null {
  if (!pathname || !pathname.startsWith("/dashboard")) return null;
  const twin = pathname.replace(/^\/dashboard/, "/staff-portal");
  return PORTAL_GUARD.some((g) => g.href === twin) ? twin : null;
}

/**
 * The shell a role belongs in. Staff live in the portal; every other role runs
 * the dashboard. An unknown/missing role gets the portal because it is the only
 * shell that turns nobody away — /dashboard denies plain staff outright.
 */
export function landingPathFor(role: StaffRole | string | null | undefined): string {
  if (!role) return "/staff-portal";
  return role === "staff" ? "/staff-portal" : "/dashboard";
}

/**
 * The other shell a role can open, or null when it only has one.
 *
 * Department heads and accounts manage their team from the dashboard, but they
 * are staff too: their own attendance, leave requests and balance live in the
 * portal. Each shell links to the other for them. Admins have no self-service
 * session and plain staff cannot open /dashboard, so they get no switch.
 */
export function otherShellFor(
  role: StaffRole | string | null | undefined,
  current: "/dashboard" | "/staff-portal"
): "/dashboard" | "/staff-portal" | null {
  if (!role || role === "admin" || role === "staff") return null;
  return current === "/dashboard" ? "/staff-portal" : "/dashboard";
}

/**
 * Where to send someone the dashboard guard refused.
 *
 * Bouncing everyone to /dashboard was the dead end behind the stuck "Access
 * denied" card: a staff member cannot open /dashboard either, so the guard
 * denied the page it had just redirected them to, forever. The answer must be a
 * route the role can actually open — their own shell, or the portal twin of the
 * page they were reaching for so a deep link still lands somewhere useful.
 */
export function deniedRedirectFor(
  role: StaffRole | string | null | undefined,
  pathname: string | null | undefined
): string {
  const target =
    (role === "staff" ? portalPathFor(pathname) : null) ?? landingPathFor(role);
  // Redirecting a page to itself is the loop this function exists to prevent;
  // the root route re-routes by role, so it is always a safe way out.
  return target === pathname ? "/" : target;
}
