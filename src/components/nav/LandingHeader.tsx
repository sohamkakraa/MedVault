"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { UmaLogo } from "@/components/branding/UmaLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function LandingHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--panel)]/90 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="shrink-0">
          <UmaLogo className="max-sm:hidden sm:inline-flex" />
          <UmaLogo compact className="sm:hidden" />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Link href="/login">
            <Button className="text-sm">Sign in</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
