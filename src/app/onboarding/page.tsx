"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { getStore, saveStore } from "@/lib/store";
// Phone feature disabled for now
// import { buildPhoneDialOptions } from "@/lib/phoneDialOptions";

const sexOptions = ["Male", "Female", "Prefer not to say"];

export default function OnboardingPage() {
  const router = useRouter();
  // const dialOptions = useMemo(() => buildPhoneDialOptions(), []);
  const [phase, setPhase] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("");

  useEffect(() => {
    const s = getStore();
    if (s.preferences.onboarding?.completedAtISO) {
      router.replace("/dashboard");
      return;
    }
    const step = s.preferences.onboarding?.lastStepReached ?? 1;
    setPhase(step >= 2 ? 2 : 1);
    setFirstName(s.profile.firstName ?? "");
    setLastName(s.profile.lastName ?? "");
    setDob(s.profile.dob ?? "");
    setSex(s.profile.sex ?? "");
    setEmail(s.profile.email ?? "");
    setPhone(s.profile.phone ?? "");
    setCountryCode(s.profile.countryCode ?? "");
  }, [router]);

  function persist(next: ReturnType<typeof getStore>) {
    saveStore(next);
  }

  async function completePhase1(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln || !dob) {
      setErr("Please add your name and date of birth.");
      return;
    }
    if (!sex.trim()) {
      setErr("Please pick an option for sex.");
      return;
    }
    const em = email.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setErr("Please enter a valid email.");
      return;
    }
    // Phone validation disabled — feature coming soon
    const digits = phone.replace(/\D/g, "");

    setSaving(true);
    try {
      const r = await fetch("/api/auth/refresh-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: em,
          ...(countryCode.trim() ? { phoneCountryCode: countryCode.trim() } : {}),
          ...(digits ? { phoneNational: digits } : {}),
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not link email and phone");

      const full = [fn, ln].join(" ").trim();
      const cur = getStore();
      const next = {
        ...cur,
        profile: {
          ...cur.profile,
          firstName: fn,
          lastName: ln,
          name: full,
          dob,
          sex: sex || undefined,
          email: em,
          countryCode,
          phone: digits,
        },
        preferences: {
          ...cur.preferences,
          onboarding: {
            ...cur.preferences.onboarding,
            lastStepReached: 2 as const,
          },
        },
      };
      persist(next);
      setPhase(2);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function finishOnboarding() {
    const cur = getStore();
    const next = {
      ...cur,
      preferences: {
        ...cur.preferences,
        onboarding: {
          ...cur.preferences.onboarding,
          lastStepReached: 2 as const,
          completedAtISO: new Date().toISOString(),
        },
      },
    };
    persist(next);
    router.push("/dashboard");
    router.refresh();
  }

  const steps = [
    { n: 1, label: "About you" },
    { n: 2, label: "Files" },
  ];

  return (
    <div className="min-h-screen pb-24">
      <AppTopNav />
      <main className="mx-auto max-w-lg px-4 py-10 space-y-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mv-muted">Welcome</p>
          <h1 className="mt-1 text-2xl font-semibold mv-title">Let&apos;s set things up</h1>
          <p className="mt-2 text-sm mv-muted leading-relaxed">
            Two quick steps. You can skip the upload—your home screen is still there.
          </p>
        </div>

        <div className="flex gap-2">
          {steps.map((s) => (
            <div
              key={s.n}
              className={`flex-1 rounded-2xl border px-3 py-2 text-center text-xs font-medium ${
                phase === s.n
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                  : "border-[var(--border)] mv-muted"
              }`}
            >
              {s.n}. {s.label}
            </div>
          ))}
        </div>

        {phase === 1 && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium">Your details</h2>
              <p className="text-xs mv-muted mt-1">
                We use your email to sign you in.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={completePhase1} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs mv-muted">
                    First name(s)
                    <Input className="mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </label>
                  <label className="text-xs mv-muted">
                    Last name
                    <Input className="mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </label>
                  <label className="text-xs mv-muted">
                    Date of birth
                    <Input className="mt-1" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                  </label>
                  <label className="text-xs mv-muted">
                    Sex
                    <Select
                      required
                      className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] py-2 text-sm text-[var(--fg)]"
                      value={sex}
                      onChange={(e) => setSex(e.target.value)}
                    >
                      <option value="" disabled>
                        Select sex
                      </option>
                      {sexOptions.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="text-xs mv-muted sm:col-span-2">
                    Email
                    <Input
                      className="mt-1"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </label>
                  {/* Phone number — disabled for now, feature coming soon */}
                  {/* <div className="text-xs mv-muted sm:col-span-2">
                    Mobile number
                    ...
                  </div> */}
                </div>
                {err && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                    {err}
                  </div>
                )}
                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? "Saving…" : "Continue"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {phase === 2 && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium">Add a health file (optional)</h2>
              <p className="text-xs mv-muted mt-1">
                You can upload a lab printout or prescription so UMA can chart your numbers and explain them in simple
                words.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/upload" className="block">
                <Button className="w-full">Go to upload page</Button>
              </Link>
              <Button type="button" className="w-full" onClick={finishOnboarding}>
                Go to home screen
              </Button>
              <p className="text-[11px] mv-muted leading-relaxed">
                Not medical advice. You can upload files anytime from the home screen.
              </p>
            </CardContent>
          </Card>
        )}

      </main>
    </div>
  );
}
