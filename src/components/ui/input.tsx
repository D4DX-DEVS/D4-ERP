import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.05)] ring-offset-white/80 backdrop-blur-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 hover:border-teal-300/70 hover:bg-white focus-visible:border-teal-500 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/14 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
