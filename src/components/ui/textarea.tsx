import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[120px] w-full rounded-[22px] border border-slate-200/90 bg-white/95 px-4 py-3 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.05)] ring-offset-white/80 placeholder:text-slate-400 backdrop-blur-sm hover:border-teal-300/70 hover:bg-white focus-visible:border-teal-500 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/14 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
