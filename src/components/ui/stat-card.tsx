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
}

/** Compact, mobile-first stat card: 2-col grids below lg, whole card clickable. */
export function StatCard({ title, value, icon: Icon, color, bg, href, onClick, active, loading }: StatCardProps) {
  const interactive = Boolean(href || onClick);
  const card = (
    <Card
      className={
        (interactive ? "h-full transition-shadow hover:shadow-md active:scale-[0.98]" : "h-full") +
        (active ? " ring-2 ring-slate-900/70" : "")
      }
    >
      <CardContent className="p-3 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-gray-500 sm:text-sm">{title}</p>
            <p className="mt-1 text-lg font-bold text-gray-900 sm:mt-2 sm:text-2xl">
              {loading ? "—" : value}
            </p>
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${bg}`}>
            <Icon className={`h-4 w-4 sm:h-6 sm:w-6 ${color}`} />
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
export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const lgColsClass = cols === 2 ? "lg:grid-cols-2" : cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${lgColsClass}`}>
      {children}
    </div>
  );
}
