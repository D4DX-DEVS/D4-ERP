// ==================== Access editor logic (pure) ====================
// Everything the Access & Features editor needs to decide, without React:
// how the registry groups into sidebar bundles for a given role, what a tick
// opens, which keys a bundle toggle may touch, and what the grants add to the
// person's shell. Shared by the Edit Staff dialog and the staff detail tab so
// the two screens cannot drift.
//
// Two shells: a `staff` role lives in the staff portal (grants add portal
// modules from portal-nav); every other role lives in the dashboard, where a
// grant reveals the sidebar items gated by that feature (navigation.ts, the
// same rule the sidebar applies: role listed OR feature held).

import {
  FEATURES,
  BUNDLE_ORDER,
  featureMeta,
  roleHasFeature,
  type FeatureBundle,
  type FeatureKey,
  type PortalSection,
} from "@/lib/permissions";
import { PORTAL_MODULES, PORTAL_SECTION_ORDER } from "@/lib/portal-nav";
import { navigationModules, type NavItem } from "@/lib/navigation";

export type Shell = "portal" | "sidebar";
export type RowState = "role-default" | "granted" | "available" | "unsupported";

export interface AccessRow {
  key: FeatureKey;
  label: string;
  description: string;
  state: RowState;
  /** Where the grant surfaces for this role. */
  opens: Shell;
  /** Portal pages ("Hub" first) or sidebar items ("People › Payroll") the grant opens; empty when none. */
  includes: string[];
  sensitive?: string;
  note?: string;
}

export interface AccessSection {
  bundle: FeatureBundle;
  rows: AccessRow[];
  /** Keys a bundle toggle may add or remove (not role defaults, not unsupported). */
  grantable: FeatureKey[];
  grantedCount: number;
}

export function shellFor(role: string): Shell {
  return role === "staff" ? "portal" : "sidebar";
}

/** Sidebar items a grant would reveal for this role: gated by the feature and not already listed for the role. */
export function sidebarPagesFor(role: string, key: FeatureKey): string[] {
  const out: string[] = [];
  for (const mod of navigationModules) {
    const groups: { prefix: string; items: NavItem[] }[] = [
      { prefix: mod.label, items: mod.items ?? [] },
      ...(mod.subGroups ?? []).map((sg) => ({ prefix: `${mod.label} › ${sg.label}`, items: sg.items })),
    ];
    for (const g of groups) {
      for (const item of g.items) {
        if (item.feature === key && !item.roles.includes(role)) out.push(`${g.prefix} › ${item.label}`);
      }
    }
  }
  return out;
}

/** A non-default module that opens nothing for this role: no portal page (staff) or no sidebar item (others). */
export function isUnsupported(role: string, key: FeatureKey): boolean {
  const meta = featureMeta(key);
  if (!meta || roleHasFeature(role, key)) return false;
  return shellFor(role) === "portal" ? !meta.portal : sidebarPagesFor(role, key).length === 0;
}

function portalPagesFor(key: FeatureKey): string[] {
  const mod = PORTAL_MODULES.find((m) => m.feature === key);
  if (!mod) return [];
  return mod.links.length ? ["Hub", ...mod.links.map((l) => l.label)] : ["One page"];
}

/** The registry grouped by sidebar bundle, with each row's state for this role and draft. */
export function accessSections(role: string, granted: string[]): AccessSection[] {
  const set = new Set(granted);
  const opens = shellFor(role);
  return BUNDLE_ORDER.map((bundle) => {
    const rows: AccessRow[] = FEATURES.filter((f) => f.bundle === bundle).map((f) => {
      const state: RowState = roleHasFeature(role, f.key)
        ? "role-default"
        : isUnsupported(role, f.key)
          ? "unsupported"
          : set.has(f.key)
            ? "granted"
            : "available";
      return {
        key: f.key,
        label: f.label,
        description: f.description,
        state,
        opens,
        includes: opens === "portal" ? portalPagesFor(f.key) : sidebarPagesFor(role, f.key),
        sensitive: f.sensitive,
        note: f.grantNote,
      };
    });
    const grantable = rows.filter((r) => r.state === "granted" || r.state === "available").map((r) => r.key);
    return { bundle, rows, grantable, grantedCount: rows.filter((r) => r.state === "granted").length };
  });
}

/** One-line status under a bundle header. */
export function sectionStatus(section: AccessSection, role: string): string {
  if (section.grantable.length > 0) return `${section.grantedCount} of ${section.grantable.length} granted`;
  const defaults = section.rows.filter((r) => r.state === "role-default").length;
  const dead = section.rows.filter((r) => r.state === "unsupported").length;
  if (defaults > 0) return `Included with the ${role} role${dead ? ` · ${dead} not available` : ""}`;
  return "Not available for this role";
}

export function toggleKey(granted: string[], key: FeatureKey): string[] {
  return granted.includes(key) ? granted.filter((k) => k !== key) : [...granted, key];
}

/** Grant or revoke every grantable key of a bundle, leaving other grants untouched. */
export function setBundle(granted: string[], section: AccessSection, on: boolean): string[] {
  if (on) return [...granted, ...section.grantable.filter((k) => !granted.includes(k))];
  return granted.filter((k) => !(section.grantable as string[]).includes(k));
}

export interface GrantDiff {
  added: string[];
  removed: string[];
  count: number;
}

export function grantDiff(saved: string[], draft: string[]): GrantDiff {
  const savedSet = new Set(saved);
  const draftSet = new Set(draft);
  const added = [...draftSet].filter((k) => !savedSet.has(k));
  const removed = [...savedSet].filter((k) => !draftSet.has(k));
  return { added, removed, count: added.length + removed.length };
}

/** Keys that mean something for this role: known, not a role default, not unsupported, unique. */
export function sanitizeForRole(role: string, keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const meta = featureMeta(k);
    if (!meta || out.includes(k)) continue;
    if (roleHasFeature(role, meta.key) || isUnsupported(role, meta.key)) continue;
    out.push(k);
  }
  return out;
}

/** Sensitive keys among the given grants, in registry order (confirmed before enabling). */
export function sensitiveKeys(keys: string[]): FeatureKey[] {
  return FEATURES.filter((f) => f.sensitive && keys.includes(f.key)).map((f) => f.key);
}

export interface PreviewSection {
  /** Portal section for staff, sidebar module label for dashboard roles. */
  section: string;
  modules: { label: string; pages: number }[];
}

/** What the grants add to the staff portal beyond the role: modules per section with page counts. */
export function portalPreview(role: string, granted: string[]): PreviewSection[] {
  const bySection = new Map<PortalSection, { label: string; pages: number }[]>();
  for (const m of PORTAL_MODULES) {
    if (roleHasFeature(role, m.feature) || !granted.includes(m.feature)) continue;
    const list = bySection.get(m.section) ?? [];
    list.push({ label: m.label, pages: 1 + m.links.length });
    bySection.set(m.section, list);
  }
  return PORTAL_SECTION_ORDER.filter((s) => bySection.has(s)).map((section) => ({
    section,
    modules: bySection.get(section)!,
  }));
}

/** What the grants add to the dashboard sidebar beyond the role: revealed items per module. */
export function sidebarPreview(role: string, granted: string[]): PreviewSection[] {
  const out: PreviewSection[] = [];
  for (const mod of navigationModules) {
    const groups: { prefix: string; items: NavItem[] }[] = [
      { prefix: "", items: mod.items ?? [] },
      ...(mod.subGroups ?? []).map((sg) => ({ prefix: `${sg.label} › `, items: sg.items })),
    ];
    const modules: { label: string; pages: number }[] = [];
    for (const g of groups) {
      for (const item of g.items) {
        const key = item.feature as FeatureKey | undefined;
        if (!key || !granted.includes(key) || roleHasFeature(role, key) || item.roles.includes(role)) continue;
        modules.push({ label: `${g.prefix}${item.label}`, pages: 1 });
      }
    }
    if (modules.length) out.push({ section: mod.label, modules });
  }
  return out;
}

/** Shell-appropriate preview for the role. */
export function previewFor(role: string, granted: string[]): PreviewSection[] {
  return shellFor(role) === "portal" ? portalPreview(role, granted) : sidebarPreview(role, granted);
}
