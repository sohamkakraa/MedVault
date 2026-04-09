"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  afterOtpSignIn,
  getStore,
  syncPatientStoreWithServer,
} from "@/lib/store";
import { buildPhoneDialOptions } from "@/lib/phoneDialOptions";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UmaLogo } from "@/components/branding/UmaLogo";

/** Local assets (Unsplash originals: wellness stretch, forest path). */
const LOGIN_HERO = "/images/login/hero-wellness.jpg";
const LOGIN_ACCENT = "/images/login/accent-plants.jpg";

/** Beta / dev: staggered OTP “typing” when the server returns a visible hint. */
const OTP_ANIM_START_MS = 280;
const OTP_DIGIT_MS = 125;
const OTP_AUTO_VERIFY_AFTER_MS = 480;
/** Full-screen logo bridge before client navigation after a successful verify. */
const POST_AUTH_OVERLAY_MS = 2400;

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
  const [otpAnimating, setOtpAnimating] = useState(false);
  const [postAuthTarget, setPostAuthTarget] = useState<string | null>(null);

  const verifyLock = useRef(false);

  const identifier = mode === "email" ? email.trim() : phoneNational.trim();

  const completeSignIn = useCallback(
    async (sixDigitCode: string) => {
      const normalized = sixDigitCode.replace(/\D/g, "").slice(0, 6);
      if (normalized.length !== 6 || verifyLock.current) return;
      verifyLock.current = true;
      setLoading(true);
      setErr(null);
      setOtpAnimating(false);
      try {
        const r = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            identifier,
            code: normalized,
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
        if (!sj.ok)
          throw new Error("Signed in but session could not be loaded.");

        afterOtpSignIn({ email: sj.email, phoneE164: sj.phoneE164 });
        await syncPatientStoreWithServer();

        const store = getStore();
        const done = Boolean(store.preferences.onboarding?.completedAtISO);
        setPostAuthTarget(done ? next : "/onboarding");
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Verification failed");
      } finally {
        setLoading(false);
        verifyLock.current = false;
      }
    },
    [identifier, mode, phoneCountryCode, next],
  );

  useEffect(() => {
    if (!postAuthTarget) return;
    const id = window.setTimeout(() => {
      router.push(postAuthTarget);
      router.refresh();
      setPostAuthTarget(null);
    }, POST_AUTH_OVERLAY_MS);
    return () => window.clearTimeout(id);
  }, [postAuthTarget, router]);

  useEffect(() => {
    if (step !== "otp") return;
    const raw = (devOtpHint ?? betaOtpHint ?? "")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (raw.length !== 6) return;

    let cancelled = false;
    const timeoutIds: number[] = [];
    setCode("");
    setOtpAnimating(true);

    for (let k = 1; k <= 6; k++) {
      const len = k;
      timeoutIds.push(
        window.setTimeout(
          () => {
            if (cancelled) return;
            setCode(raw.slice(0, len));
          },
          OTP_ANIM_START_MS + (k - 1) * OTP_DIGIT_MS,
        ),
      );
    }

    timeoutIds.push(
      window.setTimeout(
        () => {
          if (!cancelled) void completeSignIn(raw);
        },
        OTP_ANIM_START_MS + 5 * OTP_DIGIT_MS + OTP_AUTO_VERIFY_AFTER_MS,
      ),
    );

    return () => {
      cancelled = true;
      for (const id of timeoutIds) window.clearTimeout(id);
      setOtpAnimating(false);
    };
  }, [step, devOtpHint, betaOtpHint, completeSignIn]);

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

  function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    void completeSignIn(code);
  }

  return (
    <>
      {postAuthTarget && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-[var(--bg)]/96 px-6 text-center backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Signing you in"
        >
          <UmaLogo loader compact className="scale-110" />
          <div className="space-y-1">
            <p className="text-base font-medium text-[var(--fg)]">
              Signing you in
            </p>
            <p className="text-sm mv-muted max-w-xs mx-auto leading-relaxed">
              Syncing your space—almost there.
            </p>
          </div>
        </div>
      )}
      <div className="min-h-screen flex flex-col bg-[var(--bg)] lg:flex-row">
        <aside className="relative hidden min-h-0 shrink-0 overflow-hidden lg:flex lg:w-[min(42vw,480px)] xl:w-[min(38vw,520px)] lg:min-h-screen">
          <Image
            src={LOGIN_HERO}
            alt=""
            fill
            priority
            className="object-cover object-[center_30%]"
            sizes="(max-width: 1024px) 0px, 42vw"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--accent)]/20 via-transparent to-[var(--bg)]/50"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/25 to-transparent"
            aria-hidden
          />
          <div className="relative z-10 mt-auto flex flex-col gap-6 p-8 xl:p-10">
            <div
              className="relative hidden h-28 w-40 shrink-0 overflow-hidden rounded-2xl border border-[var(--border)] shadow-lg xl:block"
              aria-hidden
            >
              <Image
                src={LOGIN_ACCENT}
                alt=""
                fill
                className="object-cover"
                sizes="160px"
              />
            </div>
            <div className="max-w-sm">
              <p className="text-lg font-semibold leading-snug text-[var(--fg)] drop-shadow-[0_1px_12px_var(--bg)]">
                One calm place for your health story.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fg)]/85 drop-shadow-[0_1px_8px_var(--bg)]">
                Sign in to pick up where you left off—labs, visits, and
                reminders in plain language.
              </p>
            </div>
          </div>
        </aside>

        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-12 lg:py-12 min-w-0">
          <div className="w-full max-w-md space-y-6">
            <div
              className="relative aspect-[2.35/1] w-full overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm lg:hidden"
              aria-hidden
            >
              <Image
                src={LOGIN_HERO}
                alt=""
                fill
                priority
                className="object-cover object-[center_25%]"
                sizes="100vw"
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--bg)]/90 to-transparent"
                aria-hidden
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Link
                href="/"
                className="text-sm mv-muted hover:text-[var(--fg)] shrink-0 transition-colors"
              >
                Discover UMA
              </Link>
              <ThemeToggle className="shrink-0 -mr-2" />
            </div>
            <Card className="overflow-hidden">
              <CardHeader>
                <h1 className="text-2xl font-semibold mv-title">
                  Sign in to UMA
                </h1>
              </CardHeader>
              <CardContent>
                {showBetaDemoGuidance && (
                  <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-xs leading-relaxed text-[var(--fg)]">
                    <p className="font-medium text-[var(--fg)]">Beta testers</p>
                    <p className="mt-1 mv-muted">
                      Use the{" "}
                      <span className="text-[var(--fg)]">demo email</span> you
                      were given, then request a code. Enter the{" "}
                      <span className="text-[var(--fg)]">
                        6-digit beta code
                      </span>{" "}
                      from your invite. If your host enabled on-screen hints,
                      the code appears after you tap Send code.
                    </p>
                  </div>
                )}
                {step === "enter" ? (
                  <form onSubmit={requestOtp} className="space-y-4">
                    <div className="flex gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-1">
                      <button
                        type="button"
                        className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${
                          mode === "email"
                            ? "bg-[var(--panel)] shadow-sm text-[var(--fg)]"
                            : "mv-muted"
                        }`}
                        onClick={() => setMode("email")}
                      >
                        Email
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${
                          mode === "phone"
                            ? "bg-[var(--panel)] shadow-sm text-[var(--fg)]"
                            : "mv-muted"
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
                        <div className="flex rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] overflow-hidden focus-within:ring-2 focus-within:ring-[var(--accent)]/30">
                          <Select
                            className="shrink-0 w-[4.75rem] sm:w-[5.25rem] rounded-none border-0 border-r border-[var(--border)] bg-transparent py-2.5 pl-2 pr-1 text-sm text-[var(--fg)]"
                            value={phoneCountryCode}
                            onChange={(e) =>
                              setPhoneCountryCode(e.target.value)
                            }
                            aria-label="Country calling code"
                          >
                            {dialOptions.map((o) => (
                              <option
                                key={o.value}
                                value={o.value}
                                title={o.countryName}
                              >
                                {o.label}
                              </option>
                            ))}
                          </Select>
                          <Input
                            className="flex-1 min-w-0 rounded-none border-0 bg-transparent py-2.5 px-3 text-sm"
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

                    <Button
                      disabled={loading || !identifier}
                      className="w-full"
                    >
                      {loading ? "Sending…" : "Send code"}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={verifyOtp} className="space-y-4">
                    <p className="text-sm mv-muted">
                      Enter the 6-digit code for{" "}
                      <span className="text-[var(--fg)]">{identifier}</span>.
                    </p>
                    {devOtpHint && (
                      <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-xs text-[var(--fg)]">
                        Development: your code is{" "}
                        <span className="font-mono font-semibold">
                          {devOtpHint}
                        </span>
                      </p>
                    )}
                    {betaOtpHint && (
                      <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-xs text-[var(--fg)]">
                        Beta demo: your one-time code is{" "}
                        <span className="font-mono font-semibold">
                          {betaOtpHint}
                        </span>
                      </p>
                    )}
                    <label className="text-xs mv-muted block">
                      One-time code
                      <Input
                        className="mt-1 font-mono tracking-widest"
                        inputMode="numeric"
                        maxLength={6}
                        value={code}
                        onChange={(e) =>
                          setCode(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="000000"
                        autoComplete="one-time-code"
                        readOnly={otpAnimating || loading}
                        aria-busy={otpAnimating}
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
                      <Button
                        disabled={loading || code.length !== 6 || otpAnimating}
                        className="flex-1"
                      >
                        {loading
                          ? "Checking…"
                          : otpAnimating
                            ? "Entering code…"
                            : "Verify"}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
