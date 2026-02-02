import { cn } from "./cn";

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs text-[var(--fg)]",
        className
      )}
    >
      {children}
    </span>
  );
}
