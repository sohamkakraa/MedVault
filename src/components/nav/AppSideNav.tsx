"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, UserRound, FileUp, MessageCircle } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: "/dashboard" },
  { href: "/profile", label: "Profile & health details", icon: UserRound, match: "/profile" },
  { href: "/dashboard?upload=1", label: "Upload documents", icon: FileUp, match: "upload" },
  { href: "/chat", label: "Chat", icon: MessageCircle, match: "/chat" },
] as const;

export function AppSideNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const uploadActive = searchParams?.get("upload") === "1";

  return (
    <aside
      className="sticky top-0 z-30 hidden h-dvh w-[3.25rem] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)] py-3 sm:flex"
      aria-label="Main navigation"
    >
      <nav className="flex flex-1 flex-col items-center gap-1 px-1">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active =
            match === "upload"
              ? uploadActive
              : match === "/dashboard"
                ? pathname === "/dashboard" && !uploadActive
                : pathname === match || pathname.startsWith(`${match}/`);
          return (
            <Tooltip key={href} delayDuration={300}>
              <TooltipTrigger asChild>
                <Link
                  href={href}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]"
                      : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--panel-2)] hover:text-[var(--fg)]",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="sr-only">{label}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
