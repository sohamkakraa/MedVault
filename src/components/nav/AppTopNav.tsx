"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { UmaLogo } from "@/components/branding/UmaLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/body", label: "Body" },
];

export function AppTopNav({
  fixed = false,
  rightSlot,
}: {
  fixed?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = useMemo(
    () => Math.max(0, NAV_ITEMS.findIndex((item) => pathname === item.href)),
    [pathname]
  );

  function onNavKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = (activeIndex + delta + NAV_ITEMS.length) % NAV_ITEMS.length;
    router.push(NAV_ITEMS[next].href);
  }

  return (
    <header
      className={cn(
        "no-print z-40 border-b border-[var(--border)] bg-[var(--panel)]/90 backdrop-blur",
        fixed ? "fixed inset-x-0 top-0" : "sticky top-0"
      )}
    >
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-2 sm:gap-3">
        <Link href="/dashboard" className="shrink-0">
          <UmaLogo compact className="sm:hidden" />
          <UmaLogo className="hidden sm:inline-flex" />
        </Link>

        <div className="flex-1 flex justify-center min-w-0">
          <div
            ref={navRef}
            role="tablist"
            tabIndex={0}
            onKeyDown={onNavKeyDown}
            className="relative inline-flex rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-1 min-w-[220px] sm:min-w-[300px]"
          >
            <span
              className="pointer-events-none absolute top-1 bottom-1 rounded-xl bg-[var(--panel)] shadow-sm transition-[left,width] duration-300 ease-out"
              style={{
                /* p-1 = 4px padding; segment width = inner track / n (not 100%/n − 8px, which shrinks each tab wrongly) */
                left: `calc(4px + ${activeIndex} * (100% - 8px) / ${NAV_ITEMS.length})`,
                width: `calc((100% - 8px) / ${NAV_ITEMS.length})`,
              }}
              aria-hidden
            />
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "relative z-10 min-w-0 rounded-xl px-2 sm:px-3 py-1.5 text-xs sm:text-sm transition text-center flex-1",
                    active
                      ? "text-[var(--fg)]"
                      : "text-[var(--muted)] hover:text-[var(--fg)]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="hidden sm:flex min-w-[180px] items-center justify-end gap-2">
          <ThemeToggle />
          {rightSlot}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="sm:hidden h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--fg)] grid place-items-center"
          aria-label="Toggle mobile actions"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", mobileOpen && "rotate-180")} />
        </button>
      </div>

      {mobileOpen && (
        <div className="sm:hidden border-t border-[var(--border)] px-4 py-2 bg-[var(--panel)]/95">
          <div className="flex items-center justify-end gap-2">
            <ThemeToggle />
            {rightSlot}
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        Tip: use the left and right arrow keys to move between tabs.
      </div>
    </header>
  );
}
