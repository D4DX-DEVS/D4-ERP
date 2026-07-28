import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ListingHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div>
        {/* ponytail: phone titles run a size down — 1.65rem eats the fold */}
        <h1 className="text-xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[1.65rem]">{title}</h1>
        {description ? <p className="mt-0.5 text-xs text-slate-500 sm:mt-1 sm:text-sm">{description}</p> : null}
      </div>
      {action ? <div className="self-start sm:self-auto">{action}</div> : null}
    </div>
  );
}

export function ListingStatGrid({ children, cols }: { children: React.ReactNode; cols?: 3 }) {
  // ponytail: 2-up on phones instead of a tall single-column stack.
  // Odd count → last card spans the full row so it doesn't sit orphaned beside a gap.
  // cols=3 opts into 3-up on phones instead — only use it when the card count is exactly 3.
  if (cols === 3) {
    return <div className="grid grid-cols-3 gap-2 sm:gap-3">{children}</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4 xl:[&>*:last-child:nth-child(odd)]:col-span-1">
      {children}
    </div>
  );
}

export function ListingStatCard({
  icon,
  label,
  value,
  toneClassName,
  meta,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  toneClassName?: string;
  meta?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] bg-slate-100 text-slate-700 sm:h-10 sm:w-10 sm:rounded-[18px]",
            toneClassName
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 sm:text-[11px] sm:tracking-[0.16em]">{label}</p>
          <p className="mt-0.5 truncate text-lg font-semibold tracking-[-0.04em] text-slate-950 sm:text-[1.7rem]">{value}</p>
          {meta ? <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">{meta}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ListingPanel({
  title,
  description,
  action,
  children,
  contentClassName,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

export function ClickableListingCard({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const interactiveProps = onClick
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        },
      }
    : {};

  return (
    <Card
      className={cn(
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.1)]",
        className
      )}
      {...interactiveProps}
    >
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}