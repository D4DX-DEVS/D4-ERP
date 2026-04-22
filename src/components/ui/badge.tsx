import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement> & { variant?: string }>(
  ({ className, variant, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border border-white/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors",
        variant || "bg-teal-50 text-teal-700",
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge };
