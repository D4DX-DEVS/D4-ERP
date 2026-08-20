import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /** Icon color class, e.g. "text-blue-600" */
  color: string;
  /** Icon background class, e.g. "bg-blue-50" */
  bg: string;
  /** When set, the whole card is a link. */
  href?: string;
  /** When set (and no href), the whole card is a keyboard-accessible button. */
  onClick?: () => void;
  /** Pressed/selected state for onClick cards (e.g. active filter). */
  active?: boolean;
  loading?: boolean;
  /** Keep the small phone sizing at every breakpoint — for dense 5-up rows. */
  compact?: boolean;
}

/** Compact, mobile-first stat card: 2-col grids below lg, whole card clickable. */
export function StatCard({ title, value, icon: Icon, color, bg, href, onClick, active, loading, compact }: StatCardProps) {
  const interactive = Boolean(href || onClick);
  const card = (
    <Card
      className={
        (interactive ? "h-full transition-shadow hover:shadow-md active:scale-[0.98]" : "h-full") +
        (active ? " ring-2 ring-slate-900/70" : "")
      }
    >
      <CardContent className={compact ? "p-3" : "p-2 sm:p-4"}>
        {/* ponytail: title gets the full card width on its own row; value + icon sit
            inline together below it, at every breakpoint */}
        <p className={compact ? "truncate text-[11px] font-medium leading-tight text-gray-500" : "text-[10px] font-medium leading-tight text-gray-500 sm:truncate sm:text-xs"}>{title}</p>
        <div className={compact ? "mt-1 flex items-center justify-between gap-1.5" : "mt-0.5 flex items-center justify-between gap-1.5 sm:mt-1.5 sm:gap-2"}>
          <p className={compact ? "text-lg font-bold tracking-[-0.02em] text-gray-900" : "text-base font-bold tracking-[-0.02em] text-gray-900 sm:text-lg"}>
            {loading ? "—" : value}
          </p>
          <div className={`flex shrink-0 items-center justify-center rounded-lg ${compact ? "h-7 w-7" : "h-6 w-6 sm:h-9 sm:w-9 sm:rounded-xl"} ${bg}`}>
            <Icon className={`${compact ? "h-3.5 w-3.5" : "h-3 w-3 sm:h-4 sm:w-4"} ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className="block w-full text-left">
        {card}
      </button>
    );
  }
  return card;
}

/** Standard responsive wrapper for StatCard groups. */
export function StatGrid({
  children,
  cols = 4,
  mobileCols,
  autoFit,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 5;
  /** Force this many columns on phones too — only use when the card count divides evenly into it (or equals it, for 5). */
  mobileCols?: 3 | 4 | 5;
  /** Desktop: fit as many cards per row as the width allows instead of a fixed
   *  column count. For groups whose size varies by role, where any fixed count
   *  leaves an orphan row. */
  autoFit?: boolean;
}) {
  const lgColsClass = autoFit
    ? "lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]"
    : cols === 2 ? "lg:grid-cols-2" : cols === 3 ? "lg:grid-cols-3" : cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
  // A 3-card group stays 3-up on phones; 2- and 4-card groups go 2-up, and an odd
  // last card spans the row rather than sitting orphaned beside a gap.
  const baseCols =
    mobileCols === 5 ? "grid-cols-5" : mobileCols === 4 ? "grid-cols-4" : mobileCols === 3 || cols === 3 ? "grid-cols-3" : "grid-cols-2";
  const orphanSpan =
    mobileCols || cols === 3 ? "" : "[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1";
  return (
    <div className={`grid ${baseCols} gap-2 ${orphanSpan} sm:gap-4 ${lgColsClass}`}>
      {children}
    </div>
  );
}
