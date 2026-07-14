"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { hasFeature } from "@/lib/permissions";
import { navigationModules, type NavModule, type NavItem } from "@/lib/navigation";
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load persisted expanded state once on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded(loadExpandedState());
  }, []);

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

  // Role-based visibility
  const isVisible = useCallback(
    (roles: string[], feature?: string) => {
      if (!user?.role) return false;
      if (roles.includes(user.role)) return true;
      if (feature && hasFeature(user, feature as Parameters<typeof hasFeature>[1])) return true;
      return false;
    },
    [user]
  );

  const visibleModules = useMemo(() => {
    return navigationModules.filter((mod) => isVisible(mod.roles, mod.feature));
  }, [isVisible]);

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="fixed left-4 top-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/70 bg-white/85 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:hidden"
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
        <div className="border-b border-slate-200/70 px-3.5 py-3.5">
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
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Media ERP</p>
                <p className="text-sm font-semibold tracking-[-0.03em] text-slate-950">Admin Console</p>
              </div>
            </Link>

            <div className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 lg:inline-flex">
              Live
            </div>
          </div>

          <div className="mt-3 rounded-[18px] bg-slate-950 px-3 py-2.5 text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                <Sparkles className="h-4.5 w-4.5 text-emerald-300" />
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
        <div className="border-t border-slate-200/70 px-2.5 py-2.5">
          <div className="rounded-[16px] bg-white/75 px-3 py-2">
            <p className="text-[13px] font-semibold text-slate-950">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{user?.role?.replace("-", " ")}</p>
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
  isVisible: (roles: string[], feature?: string) => boolean;
}) {
  const hasChildren = !!(mod.items?.length || mod.subGroups?.length);
  const isExpanded = expanded[mod.id] ?? false;
  const moduleActive = isModuleActive(mod, pathname);

  // Direct link module (e.g. Dashboard)
  if (!hasChildren && mod.href) {
    const isActive = mod.href === activeHref;
    return (
      <Link
        href={mod.href}
        onClick={onNavigate}
        className={cn(
          "group flex items-center gap-2 rounded-[14px] px-2.5 py-2 text-[13px] font-medium transition-all",
          isActive
            ? "bg-slate-950 text-white shadow-[0_10px_20px_rgba(15,23,42,0.12)]"
            : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[11px] transition-colors",
            isActive ? "bg-white/10 text-white" : "bg-white/80 text-slate-500 group-hover:text-slate-950"
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
            ? "bg-slate-100 text-slate-950"
            : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[11px] transition-colors",
            moduleActive ? "bg-slate-950 text-white" : "bg-white/80 text-slate-500 group-hover:text-slate-950"
          )}
        >
          <mod.icon className="h-4 w-4" />
        </span>
        <span className="flex-1">{mod.label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-400 transition-transform duration-200",
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
        <div className="ml-4 border-l border-slate-200/80 pl-2 pt-0.5 space-y-0.5">
          {/* Flat items */}
          {mod.items?.filter((item) => isVisible(item.roles, item.feature)).map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={item.href === activeHref}
              onNavigate={onNavigate}
            />
          ))}

          {/* Sub-groups */}
          {mod.subGroups?.map((sg) => {
            const visibleItems = sg.items.filter((item) => isVisible(item.roles, item.feature));
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
                    sgActive ? "text-slate-950" : "text-slate-400 hover:text-slate-700"
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
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-medium transition-all",
        isActive
          ? "bg-slate-950 text-white shadow-sm"
          : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
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
