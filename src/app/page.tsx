import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LandingHeader } from "@/components/nav/LandingHeader";
import { DedicationSection } from "@/components/DedicationSection";
import {
  Activity,
  Bell,
  Brain,
  ClipboardList,
  Droplets,
  FileText,
  Flame,
  HeartPulse,
  History,
  MessageCircle,
  Pill,
  Shield,
  Smartphone,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  Wine,
  Ban,
  Stethoscope,
  Zap,
  Wallet,
  Watch,
  CheckCircle,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <LandingHeader />

      <main className="flex-1">
        {/* ─── Hero ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-widest mv-muted">Ur Medical Assistant</p>
            <h1 className="mt-4 text-4xl md:text-5xl font-semibold mv-title leading-tight">
              One calm place for your health story
            </h1>
            <p className="mt-6 text-lg mv-muted leading-relaxed">
              Upload your reports, track your medicines, manage your insurance, and talk to UMA using your own
              records — all explained in plain language you can actually act on, not medical jargon.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/login">
                <Button className="gap-2">
                  <Sparkles className="h-4 w-4" /> Get started free
                </Button>
              </Link>
            </div>
            <p className="mt-8 text-[11px] mv-muted leading-relaxed max-w-xl">
              UMA does not diagnose or replace your doctor. It helps you understand and
              organise your own health information.
            </p>
          </div>
        </section>

        {/* ─── Reliability bar ──────────────────────────────────── */}
        <section className="border-y border-[var(--border)] bg-[var(--panel-2)]">
          <div className="mx-auto max-w-6xl px-4 py-5">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[var(--accent)] shrink-0" aria-hidden />
                <span className="text-xs text-[var(--fg)] font-medium">96 / 100 on end-to-end eval suite</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[var(--accent)] shrink-0" aria-hidden />
                <span className="text-xs text-[var(--fg)] font-medium">Perfect scores: extraction · chat Q&A · clinical reasoning</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[var(--accent)] shrink-0" aria-hidden />
                <span className="text-xs text-[var(--fg)] font-medium">0 clinical hallucinations across 40+ adversarial tests</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[var(--accent)] shrink-0" aria-hidden />
                <span className="text-xs text-[var(--fg)] font-medium">Insurance agent: 9 / 10</span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Feature grid — live today ────────────────────────── */}
        <section className="border-t border-[var(--border)] bg-[var(--panel)]/60 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl md:text-3xl font-semibold mv-title">Everything available right now</h2>
            <p className="mt-3 text-sm mv-muted max-w-2xl leading-relaxed">
              Upload a PDF or start chatting — UMA connects the dots across your reports, medicines, insurance,
              and daily health notes in one place.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {([
                {
                  icon: Upload,
                  title: "Reports & records",
                  bullets: [
                    "Drop in any PDF — lab results, prescriptions, imaging notes",
                    "UMA extracts labs, medicines, allergies, and conditions automatically",
                    "Every file lives in a searchable library with full extracted details",
                  ],
                },
                {
                  icon: TrendingUp,
                  title: "Lab trends & body map",
                  bullets: [
                    "Key biomarkers charted over time with plain-language labels",
                    "Gauge cards show where each latest result sits in the healthy range",
                    "Interactive body diagram lights up with your relevant values",
                  ],
                },
                {
                  icon: MessageCircle,
                  title: "AI health chat",
                  bullets: [
                    "Ask anything — \"What was my last HbA1c?\" or \"What does this mean?\"",
                    "Answers drawn directly from your uploaded records, not generic advice",
                    "Add or update medicines, log doses, and set reminders just by chatting",
                  ],
                },
                {
                  icon: Pill,
                  title: "Medicines & reminders",
                  bullets: [
                    "Full medicine list with dose, form, frequency, and start date",
                    "One-tap reminder setup — 8 AM, 8 PM, or a custom time",
                    "Log taken, missed, skipped, or extra doses from chat or dashboard",
                  ],
                },
                {
                  icon: Wallet,
                  title: "Insurance tracking",
                  bullets: [
                    "Store your plans with policy number, coverage amount, and renewal date",
                    "UMA flags unpaid bills that need a claim filed — no more missed deadlines",
                    "Ask chat \"How do I file a claim?\" and get the exact contact email",
                  ],
                },
                {
                  icon: Watch,
                  title: "Apple Health sync",
                  bullets: [
                    "iOS app syncs heart rate, SpO2, blood glucose, steps, and sleep",
                    "Wearable data appears alongside lab results in your dashboard charts",
                    "Live Activity and home-screen widgets show your next scheduled dose",
                  ],
                },
                {
                  icon: HeartPulse,
                  title: "Dashboard & profile",
                  bullets: [
                    "Newest files, active medicines, and upcoming visit at a glance",
                    "Profile stores allergies, conditions, and your care provider",
                    "Blood pressure log, side-effect notes, and a printable visit summary",
                  ],
                },
                {
                  icon: Shield,
                  title: "Privacy & sign-in",
                  bullets: [
                    "Email + one-time code — no password to remember or lose",
                    "Data stays on your device until you choose to connect other services",
                    "All sensitive data kept private — never used to train AI models",
                  ],
                },
              ] as { icon: React.ElementType; title: string; bullets: string[] }[]).map((item) => (
                <div key={item.title} className="tool-tile rounded-2xl p-5">
                  <item.icon className="h-5 w-5 text-[var(--accent)]" aria-hidden />
                  <h3 className="mt-3 text-sm font-semibold text-[var(--fg)]">{item.title}</h3>
                  <ul className="mt-2 space-y-1.5">
                    {item.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-1.5 text-xs mv-muted leading-relaxed">
                        <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]/50" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── How it works ─────────────────────────────────────── */}
        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl md:text-3xl font-semibold mv-title">How it works</h2>
            <p className="mt-3 text-sm mv-muted max-w-2xl leading-relaxed">
              Three steps, no jargon, no complicated setup.
            </p>
            <ol className="mt-10 grid gap-6 sm:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Upload your reports",
                  body: "Drop in any PDF — lab results, discharge summaries, prescriptions, imaging reports. UMA reads them and builds your health timeline automatically.",
                },
                {
                  step: "2",
                  title: "See everything in one place",
                  body: "Your dashboard shows trends, medicines, insurance status, and a plain summary of each document. Apple Health data flows in from your phone automatically.",
                },
                {
                  step: "3",
                  title: "Talk to UMA",
                  body: "Ask questions, log doses, add medicines, check your insurance, set reminders — all by chatting. UMA looks up answers from your actual records, not generic health information.",
                },
              ].map((item) => (
                <li key={item.step} className="flex flex-col gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/12 text-sm font-semibold text-[var(--accent)]">
                    {item.step}
                  </span>
                  <h3 className="text-sm font-semibold text-[var(--fg)]">{item.title}</h3>
                  <p className="text-sm mv-muted leading-relaxed">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── Coming soon ──────────────────────────────────────── */}
        <section className="border-t border-[var(--border)] bg-[var(--panel)]/60 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <span className="inline-block rounded-full border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/10 px-3 py-0.5 text-[11px] font-medium text-[var(--accent-2)]">
              Coming soon
            </span>
            <h2 className="mt-3 text-2xl md:text-3xl font-semibold mv-title">What we are building next</h2>
            <p className="mt-4 text-sm mv-muted max-w-3xl leading-relaxed">
              Hospital connections, appointment booking, doctor recommendations, and more — in a steady, careful rollout.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="mv-card-muted rounded-2xl p-6 md:col-span-2 flex flex-col sm:flex-row sm:items-start gap-4">
                <Zap className="h-8 w-8 shrink-0 text-[var(--accent)]" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg)]">Hospital database connectors</h3>
                  <p className="mt-2 text-sm mv-muted leading-relaxed">
                    Connect directly to hospitals and clinics you have visited via FHIR-compliant APIs — so your
                    records arrive automatically instead of needing manual upload.
                  </p>
                </div>
              </div>
              <div className="mv-card-muted rounded-2xl p-6 md:col-span-2 flex flex-col sm:flex-row sm:items-start gap-4">
                <MessageCircle className="h-8 w-8 shrink-0" style={{ color: "#25D366" }} aria-hidden />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-[var(--fg)]">WhatsApp health assistant<span className="ml-2 inline-block rounded-full bg-[var(--accent-2)]/10 border border-[var(--accent-2)]/30 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-2)]">Coming soon</span></h3>
                  <p className="mt-2 text-sm mv-muted leading-relaxed">
                    Chat with UMA directly on WhatsApp — upload a photo of your report, ask about your medicines, log a dose, or get a plain-English explanation of any result.
                  </p>
                  <p className="mt-2 text-sm mv-muted leading-relaxed">
                    Works both ways: save your phone number on UMA and get a verification code via WhatsApp to link your account. Or message UMA on WhatsApp first — if you already have an account, just confirm your email; if not, UMA will walk you through signing up right in the chat.
                  </p>
                  <span className="mt-3 inline-block rounded-full bg-[#25D366]/10 border border-[#25D366]/30 px-3 py-1 text-[11px] font-medium" style={{color:"#25D366"}}>
                    WhatsApp Business API · Two-way verification
                  </span>
                </div>
              </div>
              <div className="mv-card-muted rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-[var(--fg)]">Appointment booking</h3>
                <p className="mt-2 text-sm mv-muted leading-relaxed">
                  Book visits with doctors from linked clinics directly inside chat — UMA surfaces available slots
                  based on your conditions and location.
                </p>
              </div>
              <div className="mv-card-muted rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-[var(--fg)]">Doctor recommendations</h3>
                <p className="mt-2 text-sm mv-muted leading-relaxed">
                  When a referral or specialist is needed, UMA suggests appropriate doctors matched to your
                  conditions, location, and preferences.
                </p>
              </div>
              <div className="mv-card-muted rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-[var(--fg)]">Wellness check-ins</h3>
                <p className="mt-2 text-sm mv-muted leading-relaxed">
                  Gentle daily and weekly prompts in chat — one question at a time — to track how you feel, spot
                  patterns, and catch early warning signs before they become problems.
                </p>
              </div>
              <div className="mv-card-muted rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-[var(--fg)]">Family health view</h3>
                <p className="mt-2 text-sm mv-muted leading-relaxed">
                  Optionally link with a family member to share relevant context — only when everyone agrees and
                  each person controls their own information.
                </p>
              </div>
              <div className="mv-card-muted rounded-2xl p-6 md:col-span-2 flex flex-col sm:flex-row sm:items-start gap-4">
                <Smartphone className="h-8 w-8 shrink-0 text-[var(--accent)]" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg)]">
                    Android app
                    <span className="ml-2 text-[11px] font-normal mv-muted">(iOS app already in early access)</span>
                  </h3>
                  <p className="mt-2 text-sm mv-muted leading-relaxed">
                    The iOS app is already available with Apple Health sync, Live Activities, and home-screen
                    widgets. Android support — including Google Fit and Wear OS integration — is next on the
                    roadmap.
                  </p>
                </div>
              </div>
            </div>

            <h3 className="mt-12 text-sm font-semibold text-[var(--fg)]">Optional wellness extras</h3>
            <p className="mt-2 text-sm mv-muted max-w-3xl leading-relaxed">
              Turn on extra tools only when you want them. Nothing is required, and you can pause or remove any
              of these at any time.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              {[
                { icon: Droplets, label: "Water & hydration" },
                { icon: Flame, label: "Calorie awareness" },
                { icon: Brain, label: "Mental health check-ins" },
                { icon: Activity, label: "Physical fitness" },
                { icon: Wine, label: "Alcohol tracking" },
                { icon: Ban, label: "Smoking cessation support" },
              ].map((row) => (
                <li
                  key={row.label}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3"
                >
                  <row.icon className="h-4 w-4 text-[var(--accent)] shrink-0" aria-hidden />
                  <span className="text-[var(--fg)]">{row.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── Dedication ───────────────────────────────────────── */}
        <DedicationSection />

        {/* ─── CTA ──────────────────────────────────────────────── */}
        <section className="border-t border-[var(--border)] mv-surface py-16">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <h2 className="text-2xl font-semibold mv-title">Ready when you are</h2>
            <p className="mt-3 text-sm mv-muted max-w-lg mx-auto leading-relaxed">
              Enter your email, use the short code we send, and finish a brief setup — skip any optional parts.
              No password needed.
            </p>
            <Link href="/login" className="mt-8 inline-block">
              <Button className="gap-2">
                <Sparkles className="h-4 w-4" /> Open UMA
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-8 text-center text-[11px] mv-muted">
        <div className="mx-auto max-w-6xl px-4">
          UMA — Ur Medical Assistant. Your data stays on this device unless you connect other services.
        </div>
      </footer>
    </div>
  );
}
