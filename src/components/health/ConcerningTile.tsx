"use client";

/**
 * ConcerningTile — a single flagged item card within the "Concerning items"
 * hero section. Supports lab results, BMI status, and an empty-state fallback.
 *
 * Design rules:
 *  - Only CSS variables, no hardcoded colours.
 *  - status="above"|"below" → var(--accent-2) (warm orange)
 *  - status="in"            → var(--accent) (green)
 *  - status="neutral"       → var(--fg)
 *  - Minimum tap target h-11 w-11 for interactive elements.
 *  - No text-xs for user-facing copy; text-sm minimum.
 */

import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

// ─── types ───────────────────────────────────────────────────────────────────

export type ConcerningStatus = "above" | "below" | "in" | "neutral";

export type ConcerningRangeBar = {
  min: number;
  max: number;
  current: number;
  lowLabel: string;
  midLabel: string;
  highLabel: string;
};

export type ConcerningTileProps = {
  kind: "lab" | "bmi" | "empty";
  icon: LucideIcon;
  label: string;
  value: string;
  date?: string;
  status: ConcerningStatus;
  rangeBar?: ConcerningRangeBar;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_BADGE_TEXT: Record<ConcerningStatus, string | null> = {
  above: "Above range",
  below: "Below range",
  in: "In range",
  neutral: null,
};

// Returns inline style for value colour based on status
function valueColorStyle(status: ConcerningStatus): CSSProperties {
  if (status === "above" || status === "below") {
    return { color: "var(--accent-2)" };
  }
  if (status === "in") {
    return { color: "var(--accent)" };
  }
  return { color: "var(--fg)" };
}

// Returns inline style for badge chip background/text based on status
function badgeStyle(status: ConcerningStatus): CSSProperties {
  if (status === "above" || status === "below") {
    return {
      background: "color-mix(in srgb, var(--accent-2) 15%, transparent)",
      color: "var(--accent-2)",
      border: "1px solid color-mix(in srgb, var(--accent-2) 30%, transparent)",
    };
  }
  if (status === "in") {
    return {
      background: "color-mix(in srgb, var(--accent) 15%, transparent)",
      color: "var(--accent)",
      border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
    };
  }
  return {
    background: "color-mix(in srgb, var(--fg) 10%, transparent)",
    color: "var(--muted)",
    border: "1px solid var(--border)",
  };
}

// Returns the track segment colour for the range bar marker dot
function dotColorStyle(status: ConcerningStatus): CSSProperties {
  if (status === "above" || status === "below") {
    return { background: "var(--accent-2)" };
  }
  if (status === "in") {
    return { background: "var(--accent)" };
  }
  return { background: "var(--fg)" };
}

/**
 * Clamps a value to [min, max] and returns its percentage position (0–100).
 * Expands range by 25% on each side so the dot can sit outside the green zone
 * visually, matching GaugeCard behaviour.
 */
function markerPercent(current: number, min: number, max: number): number {
  const range = max - min;
  const expandedMin = min - range * 0.25;
  const expandedMax = max + range * 0.25;
  const expandedRange = expandedMax - expandedMin;
  if (expandedRange <= 0) return 50;
  const clamped = Math.max(expandedMin, Math.min(expandedMax, current));
  return ((clamped - expandedMin) / expandedRange) * 100;
}

// ─── component ───────────────────────────────────────────────────────────────

export function ConcerningTile(props: ConcerningTileProps) {
  const { kind, icon: Icon, label, value, date, status, rangeBar } = props;

  // Empty state — spans all columns via parent grid, calm copy, no sad icons
  if (kind === "empty") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="col-span-full flex flex-col items-center justify-center gap-3 rounded-2xl p-8 text-center"
        style={{ background: "var(--panel-2)", minHeight: "160px" }}
      >
        <Icon className="h-8 w-8" style={{ color: "var(--muted)" }} aria-hidden />
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)", maxWidth: "36rem" }}>
          Nothing in your records is currently flagged. Keep your reports up-to-date
          and UMA will tell you if anything changes.
        </p>
      </motion.div>
    );
  }

  const badgeText = STATUS_BADGE_TEXT[status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        minHeight: "160px",
      }}
    >
      {/* Header row: icon + label + date */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--border) 60%, transparent)" }}
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} aria-hidden />
          </div>
          <p className="text-sm font-semibold leading-tight break-words" style={{ color: "var(--fg)" }}>
            {label}
          </p>
        </div>
        {date && (
          <span className="text-sm shrink-0" style={{ color: "var(--muted)" }}>
            {date}
          </span>
        )}
      </div>

      {/* Value + badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-2xl font-bold leading-none tracking-tight" style={valueColorStyle(status)}>
          {value}
        </span>
        {badgeText && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium"
            style={badgeStyle(status)}
          >
            {badgeText}
          </span>
        )}
      </div>

      {/* Range bar */}
      {rangeBar && (
        <div className="space-y-1">
          {/* Track */}
          <div className="relative h-2 w-full overflow-hidden rounded-full">
            {/* Left zone (low) */}
            <div
              className="absolute inset-y-0"
              style={{
                left: "0%",
                width: "16.7%",
                background: "color-mix(in srgb, var(--accent-2) 40%, transparent)",
              }}
            />
            {/* Middle zone (normal) */}
            <div
              className="absolute inset-y-0"
              style={{
                left: "16.7%",
                width: "66.6%",
                background: "color-mix(in srgb, var(--accent) 30%, transparent)",
              }}
            />
            {/* Right zone (high) */}
            <div
              className="absolute inset-y-0"
              style={{
                left: "83.3%",
                width: "16.7%",
                background: "color-mix(in srgb, var(--accent-2) 40%, transparent)",
              }}
            />
            {/* Marker dot */}
            <div
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 shadow-sm transition-[left]"
              style={{
                left: `${markerPercent(rangeBar.current, rangeBar.min, rangeBar.max)}%`,
                outline: "2px solid var(--panel)",
                ...dotColorStyle(status),
              }}
            />
          </div>
          {/* Labels */}
          <div className="flex justify-between text-sm leading-none" style={{ color: "var(--muted)" }}>
            <span className="shrink-0">{rangeBar.lowLabel}</span>
            <span className="truncate text-center px-1">{rangeBar.midLabel}</span>
            <span className="shrink-0 text-right">{rangeBar.highLabel}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
