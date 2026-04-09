"use client";

import Image from "next/image";
import { cn } from "@/components/ui/cn";

const LOGO_SRC = "/logo.svg";

export function UmaLogo({
  compact = false,
  loader = false,
  className,
}: {
  compact?: boolean;
  /** Gentle motion for full-screen loading (e.g. post sign-in). */
  loader?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5",
        loader && "relative flex-col items-center justify-center gap-0",
        className,
      )}
    >
      {loader && (
        <span
          className="uma-logo-loader-ring pointer-events-none absolute inset-[-10px] rounded-full border-2 border-[var(--accent)]/35"
          aria-hidden
        />
      )}
      <Image
        src={LOGO_SRC}
        alt="UMA"
        width={loader ? 56 : 32}
        height={loader ? 56 : 32}
        className={cn(
          "shrink-0 object-contain relative z-[1]",
          loader ? "h-14 w-14 uma-logo-loader-img" : "h-8 w-8",
        )}
        priority={loader}
      />
      {!compact && (
        <div className="leading-tight">
          <p className="text-[11px] uppercase tracking-[0.18em] mv-muted">UMA</p>
          <p className="text-sm font-semibold text-[var(--fg)]">Ur Medical Assistant</p>
        </div>
      )}
    </div>
  );
}
