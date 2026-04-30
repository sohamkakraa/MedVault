"use client";

import Link from "next/link";
import { Scale, ChevronRight } from "lucide-react";
import { CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { PatientStore } from "@/lib/types";
import { getBmiInfo, type BmiCategory } from "@/lib/bmi";

const CATEGORY_COLORS: Record<
  BmiCategory,
  { chip: string; text: string; bar: string; soft: string }
> = {
  underweight: {
    chip: "bg-sky-500/12 text-sky-600 border-sky-500/25",
    text: "text-sky-600",
    bar: "bg-sky-500",
    soft: "bg-sky-500/8",
  },
  healthy: {
    chip: "bg-emerald-500/12 text-emerald-600 border-emerald-500/25",
    text: "text-emerald-600",
    bar: "bg-emerald-500",
    soft: "bg-emerald-500/8",
  },
  overweight: {
    chip: "bg-amber-500/12 text-amber-600 border-amber-500/25",
    text: "text-amber-600",
    bar: "bg-amber-500",
    soft: "bg-amber-500/8",
  },
  obese: {
    chip: "bg-rose-500/12 text-rose-600 border-rose-500/25",
    text: "text-rose-600",
    bar: "bg-rose-500",
    soft: "bg-rose-500/8",
  },
};

/** Visual markers on the BMI scale (15–35 linear mapping). */
const SCALE_MARKERS = [
  { bmi: 18.5, label: "18.5" },
  { bmi: 25, label: "25" },
  { bmi: 30, label: "30" },
];
const SCALE_MIN = 15;
const SCALE_MAX = 35;

function markerPercent(bmi: number): number {
  const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, bmi));
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
}

export function BmiCard({ store }: { store: PatientStore }) {
  const bodyMetrics = store.profile.bodyMetrics;
  const info = getBmiInfo(bodyMetrics?.heightCm, bodyMetrics?.weightKg);

  if (!info) {
    return (
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--panel-2)] text-[var(--muted)]">
              <Scale className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold mv-title">Body mass index (BMI)</h3>
              <p className="mt-0.5 text-xs mv-muted leading-relaxed">
                Add your height and weight in your profile and we&apos;ll calculate your BMI and show
                whether it&apos;s in a healthy range.
              </p>
            </div>
          </div>
          <Link
            href="/profile#profile-patient-details"
            className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/8 px-3 py-2 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/15 transition-colors self-start sm:self-auto shrink-0"
          >
            Add height & weight <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
    );
  }

  const colors = CATEGORY_COLORS[info.category];
  const isHealthy = info.category === "healthy";

  return (
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Scale className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <h3 className="text-sm font-semibold mv-title truncate">BMI</h3>
          </div>
          <Badge className={colors.chip}>{info.label}</Badge>
        </div>

        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-semibold tracking-tight ${colors.text}`}>
            {info.bmi.toFixed(1)}
          </span>
          <span className="text-xs mv-muted">kg/m²</span>
        </div>

        {/* Scale bar */}
        <div className="space-y-1">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--panel-2)]" aria-hidden>
            <div
              className="absolute inset-y-0 bg-emerald-500/15"
              style={{ left: `${markerPercent(18.5)}%`, width: `${markerPercent(25) - markerPercent(18.5)}%` }}
            />
            <div
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${colors.bar} ring-2 ring-[var(--panel)] shadow-sm`}
              style={{ left: `${info.progressPercent}%` }}
              aria-label={`Your BMI is ${info.bmi.toFixed(1)}`}
            />
          </div>
          <div className="relative h-3 text-[10px] mv-muted">
            {SCALE_MARKERS.map((m) => (
              <span key={m.bmi} className="absolute -translate-x-1/2" style={{ left: `${markerPercent(m.bmi)}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs mv-muted">{info.summary}</p>

        <Link
          href="/profile#profile-patient-details"
          className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/8 transition-colors self-start"
        >
          Update <ChevronRight className="h-3 w-3" />
        </Link>
      </CardContent>
  );
}
