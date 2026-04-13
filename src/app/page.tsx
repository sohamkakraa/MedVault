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
              Upload your reports, track your medicines, and talk to UMA using your own records — all explained in
              plain language you can actually act on, not medical jargon.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/login">
                <Button className="gap-2">
                  <Sparkles className="h-4 w-4" /> Get started free
                </Button>
              </Link>
            </div>
            <p className="mt-8 text-[11px] mv-muted leading-relaxed max-w-xl">
              Not medical advice. UMA does not diagnose or replace your doctor. It helps you understand and
              organise your own health information.
            </p>
          </div>
        </section>

        {/* ─── Feature grid — live today ────────────────────────── */}
        <section className="border-t border-[var(--border)] bg-[var(--panel)]/60 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl md:text-3xl font-semibold mv-title">Everything available right now</h2>
            <p className="mt-3 text-sm mv-muted max-w-2xl leading-relaxed">
              Upload a PDF or start chatting — UMA connects the dots across your reports, medicines, and
              daily health notes in one place.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Upload,
                  title: "PDF report extraction",
                  body: "Drop in a lab report, prescription, or imaging note. UMA reads it and pulls out labs, medicines, allergies, conditions, and a plain-language summary — automatically.",
                },
                {
                  icon: TrendingUp,
                  title: "Lab trends & gauges",
                  body: "All your key biomarkers in one normalised chart. Hover any line to see the exact value. Gauge cards beneath show where each latest result sits relative to the healthy range.",
                },
                {
                  icon: HeartPulse,
                  title: "Health dashboard",
                  body: "Your newest files, active medicines, upcoming visit date, quick profile snapshot, and a printable one-page summary ready for your next appointment.",
                },
                {
                  icon: MessageCircle,
                  title: "AI health chat",
                  body: "Ask UMA anything — \"What was my last HbA1c?\", \"Am I still on Metformin?\", \"What does this result mean?\" — and get a plain-English answer grounded in your own records.",
                },
                {
                  icon: Pill,
                  title: "Medication management",
                  body: "Add or update medicines by just saying it in chat. UMA writes the change to your record immediately. Edit dose, form, and frequency directly from the dashboard too.",
                },
                {
                  icon: Bell,
                  title: "Medication reminders",
                  body: "After any medicine mention, UMA offers one-tap reminder setup — 8 AM, 8 PM, or pick your own time. Reminders show as bell badges on your dashboard medicines.",
                },
                {
                  icon: ClipboardList,
                  title: "Health journal",
                  body: "Log a dose taken, missed, skipped, or extra directly from chat — UMA writes it to your health log automatically. Also track blood pressure readings and side effects.",
                },
                {
                  icon: Activity,
                  title: "Interactive body map",
                  body: "Scroll through an illustrated body diagram. Each section lights up with your relevant lab values — testosterone for hormones, CBC for blood, lipids for heart, and more.",
                },
                {
                  icon: History,
                  title: "Persistent chat history",
                  body: "Your conversation is saved across sessions so UMA remembers context. Start a new chat anytime to reset, or pick up right where you left off.",
                },
                {
                  icon: FileText,
                  title: "Document library",
                  body: "Every uploaded report lives in a searchable list with its extracted summary, date, provider, and all the numbers. Tap any doc to read the full details.",
                },
                {
                  icon: Stethoscope,
                  title: "Profile & conditions",
                  body: "Store your name, DOB, allergies, conditions, and primary care provider. Allergies and conditions found in your uploaded documents merge in automatically.",
                },
                {
                  icon: Shield,
                  title: "Secure sign-in",
                  body: "Sign in with your email and a short one-time code — no password to remember or lose. Your data stays on this device until you choose to connect other services.",
                },
              ].map((item) => (
                <div key={item.title} className="tool-tile rounded-2xl p-6">
                  <item.icon className="h-5 w-5 text-[var(--accent)]" aria-hidden />
                  <h3 className="mt-4 text-sm font-semibold text-[var(--fg)]">{item.title}</h3>
                  <p className="mt-2 text-sm mv-muted leading-relaxed">{item.body}</p>
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
                  body: "Drop in any PDF — lab results, discharge summaries, prescriptions, imaging reports. UMA reads them and builds your health timeline.",
                },
                {
                  step: "2",
                  title: "See everything in one place",
                  body: "Your dashboard shows trends, medicines, and a plain summary of each document. The body map connects your numbers to the organs they belong to.",
                },
                {
                  step: "3",
                  title: "Talk to UMA",
                  body: "Ask questions, log doses, add medicines, set reminders — all by chatting. UMA acts on what you say and shows the change on your dashboard immediately.",
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
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/10 px-3 py-0.5 text-[11px] font-medium text-[var(--accent-2)]">
                Coming soon
              </span>
              <h2 className="text-2xl md:text-3xl font-semibold mv-title">What we are building next</h2>
            </div>
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
                <h3 className="text-sm font-semibold text-[var(--fg)]">Family health view</h3>
                <p className="mt-2 text-sm mv-muted leading-relaxed">
                  Optionally link with a family member to share relevant context — only when everyone agrees and
                  each person controls their own information.
                </p>
              </div>
              <div className="mv-card-muted rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-[var(--fg)]">Insurance help</h3>
                <p className="mt-2 text-sm mv-muted leading-relaxed">
                  Simpler claims help, bill reminders, and a clear view of what your plan covers — plain language,
                  no fine print.
                </p>
              </div>
              <div className="mv-card-muted rounded-2xl p-6 md:col-span-2 flex flex-col sm:flex-row sm:items-start gap-4">
                <Smartphone className="h-8 w-8 shrink-0 text-[var(--accent)]" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg)]">Mobile app</h3>
                  <p className="mt-2 text-sm mv-muted leading-relaxed">
                    The same calm feel on iPhone and Android — upload from anywhere, get gentle check-ins, and see
                    your trends on the go.
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
          UMA — Ur Medical Assistant. Your data stays on this device unless you connect other services. Not medical advice.
        </div>
      </footer>
    </div>
  );
}
