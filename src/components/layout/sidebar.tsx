"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { navigationModules, PRIMARY_MOBILE_HREFS, type NavModule, type NavItem } from "@/lib/navigation";
import { useVisibleNavModules } from "@/hooks/use-visible-nav-modules";
import { useMobileNavStore } from "@/store/mobile-nav-store";
import { useNavConfigStore } from "@/store/nav-config-store";
import { ChevronDown, Menu, Sparkles, X } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";

const STORAGE_KEY = "d4-sidebar-expanded";

function loadExpandedState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExpandedState(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { fetchConfig } = useNavConfigStore();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNavStore();
  const { isVisible, visibleModules } = useVisibleNavModules();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load persisted expanded state and config once on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded(loadExpandedState());
    fetchConfig();
  }, [fetchConfig]);

  // Auto-expand the section containing the active route
  useEffect(() => {
    if (!pathname) return;
    const newExpanded = { ...expanded };
    let changed = false;

    for (const mod of navigationModules) {
      const moduleContainsActive = isModuleActive(mod, pathname);
      if (moduleContainsActive && !newExpanded[mod.id]) {
        newExpanded[mod.id] = true;
        changed = true;
      }
      if (mod.subGroups) {
        for (const sg of mod.subGroups) {
          const sgKey = `${mod.id}:${sg.label}`;
          const sgActive = sg.items.some((item) => isItemActive(item.href, pathname));
          if (sgActive && !newExpanded[sgKey]) {
            newExpanded[sgKey] = true;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(newExpanded);
      saveExpandedState(newExpanded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveExpandedState(next);
      return next;
    });
  }, []);

  const closeSidebar = () => setMobileOpen(false);

  // Compute all hrefs for active detection
  const allHrefs = useMemo(() => {
    const hrefs: string[] = [];
    for (const mod of navigationModules) {
      if (mod.href) hrefs.push(mod.href);
      if (mod.items) mod.items.forEach((i) => hrefs.push(i.href));
      if (mod.subGroups) mod.subGroups.forEach((sg) => sg.items.forEach((i) => hrefs.push(i.href)));
    }
    return hrefs;
  }, []);

  const activeHref = useMemo(() => {
    return allHrefs
      .filter((href) => pathname === href || pathname.startsWith(href + "/"))
      .sort((a, b) => b.length - a.length)[0];
  }, [allHrefs, pathname]);

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className={cn(
          "fixed left-4 top-4 z-50 inline-flex h-12 w-12 items-center justify-center text-indigo-900 lg:hidden",
          // Closed: bare icon over the page background. Open: it now sits on top of the
          // drawer's own logo/header art, so it needs a backdrop to stay legible.
          mobileOpen && "rounded-full bg-white/90 shadow-[0_8px_20px_rgba(15,23,42,0.18)] backdrop-blur-sm"
        )}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-slate-950/18 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeSidebar}
      />

      <aside
        className={cn(
          "glass-panel fixed inset-y-3 left-3 z-40 flex w-[min(82vw,280px)] flex-col overflow-hidden rounded-[28px] transition-transform duration-300 lg:inset-y-4 lg:left-4 lg:w-[var(--sidebar-width)]",
          mobileOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0"
        )}
      >
        {/* Header / Logo */}
        <div className="border-b border-indigo-100 px-3.5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="flex items-center gap-2.5" onClick={closeSidebar}>
              <div className="relative h-10 w-10 shrink-0 bg-transparent">
                <Image
                  src="/favicon.svg"
                  alt="D4 Media ERP"
                  fill
                  sizes="40px"
                  priority
                  className="object-contain"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-500/70">D4Media ERP</p>
                <p className="text-sm font-semibold tracking-[-0.03em] text-indigo-950">Admin Console</p>
              </div>
            </Link>

            <div className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 lg:inline-flex">
              Live
            </div>
          </div>

          <div className="mt-3 rounded-[18px] bg-gradient-to-br from-[#1f3a7a] via-[#3730a3] to-[#4c1d95] px-3 py-2.5 text-white shadow-[0_12px_26px_rgba(55,48,163,0.34)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
                <Sparkles className="h-4.5 w-4.5 text-violet-200" />
              </div>
              <div>
                <p className="text-[13px] font-semibold">Operations overview</p>
                <p className="text-[11px] leading-4 text-white/70">Teams, finance, and controls.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-scroll flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
          {visibleModules.map((mod) => (
            <ModuleItem
              key={mod.id}
              module={mod}
              expanded={expanded}
              activeHref={activeHref}
              pathname={pathname}
              onToggle={toggleExpand}
              onNavigate={closeSidebar}
              isVisible={isVisible}
            />
          ))}
        </nav>

        {/* Footer / user info */}
        <div className="border-t border-indigo-100 px-2.5 py-2.5">
          <div className="rounded-[16px] bg-gradient-to-r from-indigo-50/80 to-violet-50/80 px-3 py-2">
            <p className="text-[13px] font-semibold text-indigo-950">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-indigo-500/70">{user?.role?.replace("-", " ")}</p>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Module Item (top-level) ───────────────────────────────────────────────────

function ModuleItem({
  module: mod,
  expanded,
  activeHref,
  pathname,
  onToggle,
  onNavigate,
  isVisible,
}: {
  module: NavModule;
  expanded: Record<string, boolean>;
  activeHref: string | undefined;
  pathname: string;
  onToggle: (key: string) => void;
  onNavigate: () => void;
  isVisible: (roles: string[], feature?: string, href?: string) => boolean;
}) {
  const hasChildren = !!(mod.items?.length || mod.subGroups?.length);
  const isExpanded = expanded[mod.id] ?? false;
  const moduleActive = isModuleActive(mod, pathname);

  // Direct link module (e.g. Dashboard)
  if (!hasChildren && mod.href) {
    const isActive = mod.href === activeHref;
    // Already pinned to the mobile bottom bar — don't list it again in the drawer below lg.
    const pinnedToBottomBar = PRIMARY_MOBILE_HREFS.includes(mod.href);
    return (
      <Link
        href={mod.href}
        onClick={onNavigate}
        className={cn(
          "group items-center gap-2 rounded-[14px] px-2.5 py-2 text-[13px] font-medium transition-all",
          pinnedToBottomBar ? "hidden lg:flex" : "flex",
          isActive
            ? "bg-gradient-to-r from-[#1f3a7a] via-[#3730a3] to-[#4c1d95] text-white shadow-[0_10px_22px_rgba(55,48,163,0.32)]"
            : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-900"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[11px] transition-colors",
            isActive ? "bg-white/15 text-white" : "bg-white/80 text-indigo-600/70 group-hover:text-violet-700"
          )}
        >
          <mod.icon className="h-4 w-4" />
        </span>
        <span className="flex-1">{mod.label}</span>
      </Link>
    );
  }

  // Expandable module
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => onToggle(mod.id)}
        className={cn(
          "group flex w-full items-center gap-2 rounded-[14px] px-2.5 py-2 text-[13px] font-medium transition-all text-left",
          moduleActive
            ? "bg-indigo-50 text-indigo-900"
            : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-900"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[11px] transition-colors",
            moduleActive
              ? "bg-gradient-to-br from-[#1f3a7a] to-[#4c1d95] text-white"
              : "bg-white/80 text-indigo-600/70 group-hover:text-violet-700"
          )}
        >
          <mod.icon className="h-4 w-4" />
        </span>
        <span className="flex-1">{mod.label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-indigo-400 transition-transform duration-200",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded children */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="ml-4 border-l border-indigo-200/70 pl-2 pt-0.5 space-y-0.5">
          {/* Flat items */}
          {mod.items?.filter((item) => isVisible(item.roles, item.feature, item.href)).map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={item.href === activeHref}
              onNavigate={onNavigate}
            />
          ))}

          {/* Sub-groups */}
          {mod.subGroups?.map((sg) => {
            const visibleItems = sg.items.filter((item) => isVisible(item.roles, item.feature, item.href));
            if (visibleItems.length === 0) return null;
            const sgKey = `${mod.id}:${sg.label}`;
            const sgExpanded = expanded[sgKey] ?? false;
            const sgActive = sg.items.some((item) => isItemActive(item.href, pathname));

            return (
              <div key={sg.label} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => onToggle(sgKey)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors text-left",
                    sgActive ? "text-violet-800" : "text-indigo-400 hover:text-violet-700"
                  )}
                >
                  {sg.icon && <sg.icon className="h-3.5 w-3.5" />}
                  <span className="flex-1">{sg.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform duration-200",
                      sgExpanded && "rotate-180"
                    )}
                  />
                </button>

                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200",
                    sgExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div className="space-y-0.5 pl-2">
                    {visibleItems.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        isActive={item.href === activeHref}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Individual Nav Link ───────────────────────────────────────────────────────

function NavLink({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  onNavigate: () => void;
}) {
  // Already pinned to the mobile bottom bar — don't list it again in the drawer below lg.
  const pinnedToBottomBar = PRIMARY_MOBILE_HREFS.includes(item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-medium transition-all",
        pinnedToBottomBar ? "hidden lg:flex" : "flex",
        isActive
          ? "bg-gradient-to-r from-[#1f3a7a] via-[#3730a3] to-[#4c1d95] text-white shadow-sm"
          : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-900"
      )}
    >
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function isModuleActive(mod: NavModule, pathname: string): boolean {
  if (mod.href && isItemActive(mod.href, pathname)) return true;
  if (mod.items?.some((item) => isItemActive(item.href, pathname))) return true;
  if (mod.subGroups?.some((sg) => sg.items.some((item) => isItemActive(item.href, pathname)))) return true;
  return false;
}
