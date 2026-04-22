import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants: Record<string, string> = {
      default: "bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-500 text-white shadow-[0_14px_34px_rgba(15,118,110,0.26)] hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,118,110,0.32)]",
      destructive: "bg-gradient-to-r from-orange-700 via-orange-600 to-rose-500 text-white shadow-[0_14px_34px_rgba(194,65,12,0.24)] hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(194,65,12,0.32)]",
      outline: "border border-white/70 bg-white/70 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl hover:bg-white hover:text-slate-950",
      secondary: "bg-slate-900 text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] hover:-translate-y-0.5 hover:bg-slate-800",
      ghost: "text-slate-600 hover:bg-white/70 hover:text-slate-950",
      link: "text-teal-700 underline-offset-4 hover:text-teal-800 hover:underline",
    };
    const sizes: Record<string, string> = {
      default: "h-11 px-5 py-2",
      sm: "h-9 px-4 text-sm",
      lg: "h-12 px-7 text-base",
      icon: "h-11 w-11",
    };
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-[-0.01em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          variants[variant],
          sizes[size],
          size === "icon" && "rounded-full",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
