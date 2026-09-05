// ==================== Staff-portal navigation (pure) ====================
// Derives the portal's granted-module nav from the feature registry so the
// layout, the route guard and the tests share one source of truth. A module
// is the feature's hub page; its links are the sub-pages an admin reaches from
// the dashboard sidebar (rendered inside the portal via wrapper routes).

import { FEATURES, type FeatureKey, type PortalSection } from "@/lib/permissions";

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
