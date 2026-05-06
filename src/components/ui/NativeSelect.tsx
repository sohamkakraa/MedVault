"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          "h-10 w-full appearance-none rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 pr-9 text-sm text-[var(--fg)]",
          "outline-none transition-colors",
          "focus:ring-2 focus:ring-[var(--ring)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";
