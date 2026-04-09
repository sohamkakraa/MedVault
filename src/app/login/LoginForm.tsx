"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { afterOtpSignIn, getStore, syncPatientStoreWithServer } from "@/lib/store";
import { buildPhoneDialOptions } from "@/lib/phoneDialOptions";

type LoginFormProps = {
  /** Shown when the server has AUTH_BETA_DEMO_* configured (no secrets in the client). */
  showBetaDemoGuidance?: boolean;
};

export default function LoginForm({ showBetaDemoGuidance }: LoginFormProps) {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/dashboard";
  const router = useRouter();

  const dialOptions = buildPhoneDialOptions();

  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phoneNational, setPhoneNational] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+1");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"enter" | "otp">("enter");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [betaOtpHint, setBetaOtpHint] = useState<string | null>(null);

  const identifier = mode === "email" ? email.trim() : phoneNational.trim();

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setInfo(null);
    setDevOtpHint(null);
    setBetaOtpHint(null);
    try {
      const r = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier,
          ...(mode === "phone" ? { phoneCountryCode } : {}),
        }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        devOtp?: string;
        betaDemoOtp?: string;
      };
      if (!j.ok) throw new Error(j.error ?? "Could not send code");
      setStep("otp");
      if (j.message) setInfo(j.message);
      if (typeof j.devOtp === "string") setDevOtpHint(j.devOtp);
      if (typeof j.betaDemoOtp === "string") setBetaOtpHint(j.betaDemoOtp);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier,
          code: code.trim(),
          ...(mode === "phone" ? { phoneCountryCode } : {}),
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Verification failed");

      const s = await fetch("/api/auth/session");
      const sj = (await s.json()) as {
        ok?: boolean;
        email?: string | null;
        phoneE164?: string | null;
      };
      if (!sj.ok) throw new Error("Signed in but session could not be loaded.");

      afterOtpSignIn({ email: sj.email, phoneE164: sj.phoneE164 });
      await syncPatientStoreWithServer();

      const store = getStore();
      const done = Boolean(store.preferences.onboarding?.completedAtISO);
      router.push(done ? next : "/onboarding");
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="text-sm mv-muted hover:text-[var(--fg)]">
            ← Back to home
          </Link>
        </div>
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold mv-title">Sign in to UMA</h1>
              <p className="text-sm mv-muted">
                Use your email or mobile number. We will send a one-time code (prototype: see note below).
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {showBetaDemoGuidance && (
              <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-xs leading-relaxed text-[var(--fg)]">
                <p className="font-medium text-[var(--fg)]">Beta testers</p>
                <p className="mt-1 mv-muted">
                  Use the <span className="text-[var(--fg)]">demo email</span> you were given, then request a code.
                  Enter the <span className="text-[var(--fg)]">6-digit beta code</span> from your invite. If your host
                  enabled on-screen hints, the code appears after you tap Send code.
                </p>
              </div>
            )}
            {step === "enter" ? (
              <form onSubmit={requestOtp} className="space-y-4">
                <div className="flex gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-1">
                  <button
                    type="button"
                    className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${
                      mode === "email" ? "bg-[var(--panel)] shadow-sm text-[var(--fg)]" : "mv-muted"
                    }`}
                    onClick={() => setMode("email")}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${
                      mode === "phone" ? "bg-[var(--panel)] shadow-sm text-[var(--fg)]" : "mv-muted"
                    }`}
                    onClick={() => setMode("phone")}
                  >
                    Phone
                  </button>
                </div>

                {mode === "email" ? (
                  <label className="text-xs mv-muted block">
                    Email
                    <Input
                      type="email"
                      className="mt-1"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </label>
                ) : (
                  <div className="space-y-2">
                    <span className="text-xs mv-muted">Phone</span>
                    <div className="grid grid-cols-[minmax(0,130px)_1fr] gap-2">
                      <Select
                        className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] py-2 text-sm text-[var(--fg)] min-w-0 truncate"
                        value={phoneCountryCode}
                        onChange={(e) => setPhoneCountryCode(e.target.value)}
                        aria-label="Country calling code"
                      >
                        {dialOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                      <Input
                        inputMode="tel"
                        value={phoneNational}
                        onChange={(e) => setPhoneNational(e.target.value)}
                        placeholder="National number"
                        autoComplete="tel-national"
                      />
                    </div>
                  </div>
                )}

                {info && (
                  <p className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-xs leading-relaxed mv-muted">
                    {info}
                  </p>
                )}

                {err && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                    {err}
                  </div>
                )}

                <Button disabled={loading || !identifier} className="w-full">
                  {loading ? "Sending…" : "Send code"}
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyOtp} className="space-y-4">
                <p className="text-sm mv-muted">
                  Enter the 6-digit code for <span className="text-[var(--fg)]">{identifier}</span>.
                </p>
                {devOtpHint && (
                  <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-xs text-[var(--fg)]">
                    Development: your code is <span className="font-mono font-semibold">{devOtpHint}</span>
                  </p>
                )}
                {betaOtpHint && (
                  <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-xs text-[var(--fg)]">
                    Beta demo: your one-time code is{" "}
                    <span className="font-mono font-semibold">{betaOtpHint}</span>
                  </p>
                )}
                <label className="text-xs mv-muted block">
                  One-time code
                  <Input
                    className="mt-1 font-mono tracking-widest"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    autoComplete="one-time-code"
                  />
                </label>
                {err && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                    {err}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setStep("enter");
                      setCode("");
                      setErr(null);
                      setBetaOtpHint(null);
                      setDevOtpHint(null);
                    }}
                  >
                    Back
                  </Button>
                  <Button disabled={loading || code.length !== 6} className="flex-1">
                    {loading ? "Checking…" : "Verify"}
                  </Button>
                </div>
              </form>
            )}

            <p className="mt-6 text-[11px] leading-relaxed mv-muted">
              Not medical advice. This sign-in flow is a prototype: connect a real SMS/email provider and{" "}
              <code className="text-[var(--fg)]">AUTH_SECRET</code> in production.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
