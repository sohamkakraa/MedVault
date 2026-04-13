"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { syncPatientStoreWithServer } from "@/lib/store";

/**
 * Pulls cloud patient data when the user may have a session (no-op on 401).
 * Mounted once from `app/layout.tsx` so it applies to every UI route; `/login` is skipped
 * to avoid noisy 401s before the user has completed sign-in.
 */
export function PatientStoreBootstrap() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login") return;
    void syncPatientStoreWithServer();
  }, [pathname]);

  return null;
}
