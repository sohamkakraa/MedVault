"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Menu, UserRound, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { UmaLogo } from "@/components/branding/UmaLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { FamilySwitcher } from "@/components/family/FamilySwitcher";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { TidyButton } from "@/components/nav/TidyButton";

type NavItem = {
  href: string;
  label: string;
  disabled?: boolean;
  tooltip?: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
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
  const [burgerOpen, setBurgerOpen] = useState(false);
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
        {/* Logo */}
        <div className="flex min-w-0 items-center justify-start">
          <Link href="/dashboard" className="shrink-0">
            <UmaLogo compact className="sm:hidden" />
            <UmaLogo className="max-sm:hidden sm:inline-flex" />
          </Link>
        </div>

        {/* Tab group */}
        <div className="flex min-w-0 justify-center">
          <div
            ref={navRef}
            role="tablist"
            tabIndex={0}
            onKeyDown={onNavKeyDown}
            className="relative grid w-full max-w-[240px] rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-1"
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
                    className="relative z-10 rounded-xl px-2 py-1.5 text-sm text-center text-[var(--muted)] opacity-50 cursor-not-allowed"
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
                    "relative z-10 rounded-xl px-2 py-1.5 text-sm transition text-center",
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

        {/* Right-side controls */}
        <div className="flex min-w-0 items-center justify-end gap-2">
          {/* Desktop controls — visible at md (768px) and above */}
          <div className="max-md:hidden md:flex items-center justify-end gap-2">
            <TidyButton />
            <FamilySwitcher />
            <NotificationCenter />
            <ThemeToggle />
            {rightSlot}
          </div>

          {/* Hamburger button — visible below md (768px) */}
          <button
            type="button"
            onClick={() => setBurgerOpen((v) => !v)}
            className="md:hidden h-10 w-10 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] text-[var(--fg)] grid place-items-center"
            aria-label={burgerOpen ? "Close menu" : "Open menu"}
            aria-expanded={burgerOpen}
          >
            {burgerOpen
              ? <X className="h-5 w-5" aria-hidden />
              : <Menu className="h-5 w-5" aria-hidden />
            }
          </button>
        </div>
      </div>

      {/* Burger dropdown — tablet and below */}
      {burgerOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--panel)]/95">
          <nav aria-label="Site menu" className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-1">
            {/* Profile link */}
            <Link
              href="/profile"
              onClick={() => setBurgerOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
            >
              <UserRound className="h-5 w-5 text-[var(--accent)] shrink-0" aria-hidden />
              Profile
            </Link>

            <div className="h-px bg-[var(--border)] my-1" aria-hidden />

            {/* Inline row: Tidy, Family, Notifications, Theme */}
            <div className="flex items-center gap-2 px-1 py-1">
              <TidyButton />
              <FamilySwitcher />
              <NotificationCenter />
              <ThemeToggle />
              {rightSlot}
            </div>
          </nav>
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        Tip: use the left and right arrow keys to move between tabs.
      </div>
    </header>
  );
}
