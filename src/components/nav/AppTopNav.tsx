"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Menu, UserRound, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
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
  const [burgerOpen, setBurgerOpen] = useState(false);
  const activeHref = useMemo(() => {
    const exact = NAV_ITEMS.find((item) => !item.disabled && pathname === item.href);
    if (exact) return exact.href;
    const prefix = NAV_ITEMS.find(
      (item) => !item.disabled && item.href !== "/" && pathname.startsWith(item.href + "/"),
    );
    return prefix?.href ?? "";
  }, [pathname]);

  return (
    <header
      className={cn(
        "no-print z-40 border-b border-[var(--border)] bg-[var(--panel)]/90 backdrop-blur",
        // Fixed positioning is viewport-relative; inset-x-0 would cover AppSideNav (z-30).
        // Match rail width sm+: AppSideNav uses w-[3.25rem]; rail is hidden below sm.
        fixed ? "fixed top-0 right-0 left-0 sm:left-[3.25rem]" : "sticky top-0"
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
          <Tabs value={activeHref} className="w-full max-w-[240px]">
            <TabsList
              className="grid w-full"
              style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)` }}
            >
              {NAV_ITEMS.map((item) =>
                item.disabled ? (
                  <span
                    key={item.href}
                    role="tab"
                    aria-disabled="true"
                    title={item.tooltip}
                    className="inline-flex items-center justify-center rounded-xl px-2 py-1.5 text-sm text-[var(--muted)] opacity-50 cursor-not-allowed"
                  >
                    {item.label}
                  </span>
                ) : (
                  <TabsTrigger key={item.href} value={item.href} asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </TabsTrigger>
                ),
              )}
            </TabsList>
          </Tabs>
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
