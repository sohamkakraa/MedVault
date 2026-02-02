"use client";
import { cn } from "./cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium tracking-tight transition focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-110 shadow-sm",
    ghost: "border border-[var(--border)] bg-transparent text-[var(--fg)] hover:bg-[var(--panel-2)]",
    danger: "bg-red-500 text-white hover:bg-red-600",
  };
  return <button className={cn(base, variants[variant], className)} {...props} />;
}
