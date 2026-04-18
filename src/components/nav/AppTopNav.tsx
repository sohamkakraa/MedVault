"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { UmaLogo } from "@/components/branding/UmaLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { FamilySwitcher } from "@/components/family/FamilySwitcher";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

type NavItem = {
  href: string;
  label: string;
  disabled?: boolean;
  tooltip?: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/body", label: "Body", disabled: true, tooltip: "Coming soon" },
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
  const activeIndex = useMemo(() => {
    const exact = NAV_ITEMS.findIndex((item) => !item.disabled && pathname === item.href);
    if (exact !== -1) return exact;
    const prefix = NAV_ITEMS.findIndex(
      (item) => !item.disabled && item.href !== "/" && pathname.startsWith(item.href + "/"),
    );
    return prefix !== -1 ? prefix : -1;
  }, [pathname]);

  function onNavKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const base = activeIndex >= 0 ? activeIndex : 0;
    const delta = e.key === "ArrowRight" ? 1 : -1;
    let next = (base + delta + NAV_ITEMS.length) % NAV_ITEMS.length;
    // Skip disabled items
    let tries = NAV_ITEMS.length;
    while (NAV_ITEMS[next].disabled && tries-- > 0) {
      next = (next + delta + NAV_ITEMS.length) % NAV_ITEMS.length;
    }
    if (!NAV_ITEMS[next].disabled) router.push(NAV_ITEMS[next].href);
  }

  return (
    <header
      className={cn(
        "no-print z-40 border-b border-[var(--border)] bg-[var(--panel)]/90 backdrop-blur",
        fixed ? "fixed inset-x-0 top-0" : "sticky top-0"
      )}
    >
      <div className="mx-auto grid h-14 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:gap-3">
        <div className="flex min-w-0 items-center justify-start">
          <Link href="/dashboard" className="shrink-0">
            <UmaLogo compact className="sm:hidden" />
            <UmaLogo className="hidden sm:inline-flex" />
          </Link>
        </div>

        <div className="flex min-w-0 justify-center">
          <div
            ref={navRef}
            role="tablist"
            tabIndex={0}
            onKeyDown={onNavKeyDown}
            className="relative grid w-full max-w-[300px] sm:max-w-[340px] rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-1"
            style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)` }}
          >
            {activeIndex >= 0 && (
              <span
                className="pointer-events-none absolute inset-y-1 rounded-xl bg-[var(--panel)] shadow-sm transition-[left,width] duration-300 ease-out"
                style={{
                  left: `calc(4px + ${activeIndex} * ((100% - 8px) / ${NAV_ITEMS.length}))`,
                  width: `calc((100% - 8px) / ${NAV_ITEMS.length})`,
                }}
                aria-hidden
              />
            )}
            {NAV_ITEMS.map((item, idx) => {
              const active = idx === activeIndex;
              if (item.disabled) {
                return (
                  <span
                    key={item.href}
                    role="tab"
                    aria-selected={false}
                    aria-disabled="true"
                    title={item.tooltip}
                    className="relative z-10 rounded-xl px-2 py-1.5 text-xs sm:px-3 sm:text-sm text-center text-[var(--muted)] opacity-50 cursor-not-allowed"
                  >
                    {item.label}
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "relative z-10 rounded-xl px-2 py-1.5 text-xs sm:px-3 sm:text-sm transition text-center",
                    active
                      ? "font-semibold text-[var(--fg)]"
                      : "text-[var(--muted)] hover:text-[var(--fg)]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <div className="hidden sm:flex items-center justify-end gap-2">
            <FamilySwitcher />
            <NotificationCenter />
            <ThemeToggle />
            {rightSlot}
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="sm:hidden h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--fg)] grid place-items-center"
            aria-label="Toggle mobile actions"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", mobileOpen && "rotate-180")} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="sm:hidden border-t border-[var(--border)] px-4 py-2 bg-[var(--panel)]/95">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-xs font-medium text-[var(--fg)] hover:bg-[var(--panel)]"
            >
              <UserRound className="h-4 w-4 text-[var(--accent)]" aria-hidden />
              Profile
            </Link>
            <div className="flex items-center gap-2">
              <FamilySwitcher />
              <NotificationCenter />
              <ThemeToggle />
              {rightSlot}
            </div>
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        Tip: use the left and right arrow keys to move between tabs.
      </div>
    </header>
  );
}
