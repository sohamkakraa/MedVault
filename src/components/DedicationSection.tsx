"use client";

import { UmaCharacter } from "@/components/chat/UmaCharacter";

/**
 * Dedication section for the landing page — honouring Uma Kakra (1916–2026).
 *
 * Rendered as a client component so the animated ASCII character can hydrate
 * inside the otherwise server-rendered landing page.
 */
export function DedicationSection() {
  return (
    <section className="border-t border-[var(--border)] py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-xl text-center">
          {/* ─── Animated ASCII character ─────────────────── */}
          <div
            className="inline-flex justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-5 py-4 mb-8"
            style={{ fontSize: "11px" }}
          >
            <UmaCharacter mood="idle" />
          </div>

          {/* ─── Decorative divider ──────────────────────── */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className="h-px w-12 bg-[var(--border)]" />
            <span className="text-[var(--accent)] text-sm">✦</span>
            <span className="h-px w-12 bg-[var(--border)]" />
          </div>

          {/* ─── Tribute text ────────────────────────────── */}
          <p className="text-xs font-medium uppercase tracking-widest mv-muted">
            In loving memory
          </p>

          <h2 className="mt-3 text-2xl md:text-3xl font-semibold mv-title">
            Uma Kakra
          </h2>

          <p className="mt-1 text-sm mv-muted tracking-wide">1976 – 2026</p>

          <p className="mt-8 text-sm mv-muted leading-relaxed max-w-lg mx-auto">
            Dedicated to her lifelong strength through chronic conditions that
            traced through family lines — and to my father, who walked every
            step beside her.
          </p>

          <p className="mt-4 text-sm mv-muted leading-relaxed max-w-lg mx-auto">
            The hardest part was never the illness alone. It was the scattered
            records, the clinical jargon no one explained, the questions that
            went unanswered because the information lived in too many places.
          </p>

          <p className="mt-4 text-sm mv-muted leading-relaxed max-w-lg mx-auto">
            UMA exists to change that — one calm place to collect your health
            story, understand it in plain language, and face what comes next
            with a little more clarity.
          </p>
        </div>
      </div>
    </section>
  );
}
