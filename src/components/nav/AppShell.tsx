"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { AppSideNav } from "@/components/nav/AppSideNav";

/**
 * Adds a slim left rail (profile, upload, etc.) for signed-in app routes.
 * Login stays full-width without the rail.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  /** Marketing home and auth stay full-width without the app rail. */
  if (pathname === "/" || pathname === "/login") return <>{children}</>;

  return (
    <div className="flex w-full min-w-0 min-h-dvh">
      <Suspense fallback={null}>
        <AppSideNav />
      </Suspense>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
