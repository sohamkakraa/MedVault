import { Suspense } from "react";
import { getBetaDemoConfig } from "@/lib/auth/betaDemo";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams;
  const showBetaDemoGuidance = getBetaDemoConfig() !== null;
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center mv-muted text-sm">Loading…</div>}>
      <LoginForm showBetaDemoGuidance={showBetaDemoGuidance} />
    </Suspense>
  );
}
