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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-[1.65rem] font-semibold tracking-[-0.04em] text-slate-950">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="self-start sm:self-auto">{action}</div> : null}
    </div>
  );
}

export function ListingStatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
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
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-[18px] bg-slate-100 text-slate-700",
            toneClassName
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-0.5 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
          {meta ? <p className="mt-0.5 text-xs text-slate-500">{meta}</p> : null}
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