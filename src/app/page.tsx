import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LandingHeader } from "@/components/nav/LandingHeader";
import { DedicationSection } from "@/components/DedicationSection";
import {
  Activity,
  Brain,
  Droplets,
  Flame,
  HeartPulse,
  MessageCircle,
  Shield,
  Smartphone,
  Upload,
  Users,
  Wine,
  Ban,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <LandingHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-widest mv-muted">Ur Medical Assistant</p>
            <h1 className="mt-4 text-4xl md:text-5xl font-semibold mv-title leading-tight">
              One calm place for your health story
            </h1>
            <p className="mt-6 text-lg mv-muted leading-relaxed">
              UMA pulls your labs, visits, and daily habits into plain language you can understand—then helps you prepare
              for conversations with your care team. Built for real life, not clinical jargon.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/login">
                <Button className="gap-2">
                  <Sparkles className="h-4 w-4" /> Start with a secure sign-in
                </Button>
              </Link>
            </div>
            <p className="mt-8 text-[11px] mv-muted leading-relaxed max-w-xl">
              Not medical advice. UMA does not diagnose or replace your clinician—it helps you organise and understand
              your own information.
            </p>
          </div>
        </section>

        {/* ─── Dedication to Uma Kakra ──────────────────────── */}
        <DedicationSection />

        <section className="border-t border-[var(--border)] bg-[var(--panel)]/60 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl md:text-3xl font-semibold mv-title">What you can use today</h2>
            <p className="mt-3 text-sm mv-muted max-w-2xl leading-relaxed">
              Upload records, track trends, and chat with a companion that knows your context—always framed in supportive,
              non-alarmist language.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: HeartPulse,
                  title: "Health dashboard",
                  body: "Trends for key labs, latest reports, medications, and a printable visit summary.",
                },
                {
                  icon: Upload,
                  title: "Document upload",
                  body: "PDFs become structured summaries you can explore without wading through raw reports.",
                },
                {
                  icon: MessageCircle,
                  title: "Health companion chat",
                  body: "Ask what your last result meant or whether you are still on a medication—grounded in your store.",
                },
                {
                  icon: Activity,
                  title: "Body & cycle tools",
                  body: "Optional body metrics and beta cycle logging to support conversations with your clinician.",
                },
                {
                  icon: Shield,
                  title: "Sign in with email",
                  body: "One-time codes arrive by email so you can sign in securely. Phone sign-in is coming later.",
                },
                {
                  icon: Users,
                  title: "Guided first-time setup",
                  body: "Two short steps: your details, then an optional document upload—at your pace.",
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

        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/10 px-3 py-0.5 text-[11px] font-medium text-[var(--accent-2)]">
                Coming soon
              </span>
              <h2 className="text-2xl md:text-3xl font-semibold mv-title">The one-stop shop we are building</h2>
            </div>
            <p className="mt-4 text-sm mv-muted max-w-3xl leading-relaxed">
              Insurance workflows, family-linked health context, proactive alerts, and a pocket-sized app—plus deeper
              lifestyle tools when you are ready for them.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="mv-card-muted rounded-2xl p-6 md:col-span-2">
                <h3 className="text-sm font-semibold text-[var(--fg)]">Insurance management</h3>
                <p className="mt-2 text-sm mv-muted leading-relaxed">
                  Claims support, premium reminders, and a clear coverage overview so benefits stop feeling like a second
                  job.
                </p>
              </div>
              <div className="mv-card-muted rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-[var(--fg)]">Family health graph</h3>
                <p className="mt-2 text-sm mv-muted leading-relaxed">
                  Connect with a family member to visualise shared risk factors and context—always with consent and clear
                  boundaries.
                </p>
              </div>
              <div className="mv-card-muted rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-[var(--fg)]">Emergency alerts for loved ones</h3>
                <p className="mt-2 text-sm mv-muted leading-relaxed">
                  Trusted contacts notified when someone in your circle needs help, based on rules you control.
                </p>
              </div>
              <div className="mv-card-muted rounded-2xl p-6 md:col-span-2 flex flex-col sm:flex-row sm:items-start gap-4">
                <Smartphone className="h-8 w-8 shrink-0 text-[var(--accent)]" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg)]">Mobile app</h3>
                  <p className="mt-2 text-sm mv-muted leading-relaxed">
                    The same calm experience on iOS and Android—upload on the go, glance at trends, and get gentle
                    check-ins.
                  </p>
                </div>
              </div>
            </div>

            <h3 className="mt-12 text-sm font-semibold text-[var(--fg)]">Advanced wellness modules</h3>
            <p className="mt-2 text-sm mv-muted max-w-3xl leading-relaxed">
              Layer in tools when you want them—never as a firehose. Everything stays optional and easy to pause.
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
            <p className="mt-6 text-xs mv-muted">
              …and more over time—nutrition coaching, sleep staging, medication titration reminders with your
              prescriber in the loop, and hospital connectors when systems allow secure access.
            </p>
          </div>
        </section>

        <section className="border-t border-[var(--border)] mv-surface py-16">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <h2 className="text-2xl font-semibold mv-title">Ready when you are</h2>
            <p className="mt-3 text-sm mv-muted max-w-lg mx-auto leading-relaxed">
              Sign in with your email, confirm a one-time code we send you, and walk through a short setup—optional steps
              included.
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
          UMA — Ur Medical Assistant. Prototype; data on this device stays local unless you connect external services.
        </div>
      </footer>
    </div>
  );
}
