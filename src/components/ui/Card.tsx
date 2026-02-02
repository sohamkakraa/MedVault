import { cn } from "./cn";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mv-card rounded-3xl", className)}>{children}</div>;
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="p-5 border-b border-[var(--border)]">{children}</div>;
}

export function CardContent({ children }: { children: React.ReactNode }) {
  return <div className="p-5">{children}</div>;
}
