"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HealthLogRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard#health-logs");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <p className="text-sm text-[var(--muted)]">Taking you to your dashboard…</p>
    </div>
  );
}
