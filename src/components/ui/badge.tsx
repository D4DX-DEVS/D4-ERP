import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement> & { variant?: string }>(
  ({ className, variant, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variant || "bg-blue-100 text-blue-800",
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge };
