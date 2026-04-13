"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ExtractedLab, StandardLexiconEntry } from "@/lib/types";
import { interpretLab } from "@/lib/labInterpret";
import { AlertTriangle } from "lucide-react";

type Props = {
  lab: ExtractedLab;
  extensions?: StandardLexiconEntry[];
  className?: string;
  /** When false, hides the specimen/report date row (e.g. on document detail). */
  showDate?: boolean;
};

function LabTooltipBody({
  it,
  lab,
  flagLabel,
}: {
  it: ReturnType<typeof interpretLab>;
  lab: ExtractedLab;
  flagLabel: string | null;
}) {
  return (
    <>
      <p className="font-semibold text-[var(--fg)]">{it.shortLabel}</p>
      <p className="mt-1.5 leading-relaxed text-[var(--fg)]">{it.meaning}</p>
      <div className="mt-2 rounded-xl bg-[var(--panel-2)] px-2.5 py-2 space-y-1">
        <p className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wide">Typical range (general)</p>
        <p className="text-[var(--fg)] leading-relaxed">{it.typicalRangeDisplay}</p>
        {lab.refRange?.trim() ? (
          <p className="text-[var(--fg)]">
            <span className="text-[var(--muted)]">Reference printed on report: </span>
            {lab.refRange}
          </p>
        ) : null}
      </div>
      <div className="mt-2 grid gap-1 text-[11px] text-[var(--muted)]">
        <p>
          <span className="font-medium text-[var(--fg)]">Value shown: </span>
          {it.displayValue}
          {it.displayUnit ? ` ${it.displayUnit}` : ""}
        </p>
        {flagLabel ? (
          <p className="text-amber-700 dark:text-amber-400 font-medium">{flagLabel}</p>
        ) : it.flag === "in_range" ? (
          <p className="text-[var(--muted)]">Within the range UMA used for this comparison.</p>
        ) : (
          <p>UMA could not compare this value to a built-in range (unit or test type).</p>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-[var(--muted)] border-t border-[var(--border)] pt-2">
        {it.disclaimer} Not medical advice.
      </p>
    </>
  );
}

export function LabReadingTile({
  lab,
  extensions,
  className = "",
  showDate = true,
}: Props) {
  const it = interpretLab(lab, extensions);
  const out = it.flag === "low" || it.flag === "high";
  const borderClass = out
    ? "border-amber-500/55 bg-amber-500/[0.07]"
    : "border-[var(--border)] bg-[var(--panel-2)]";

  const flagLabel =
    it.flag === "low" ? "Below typical range" : it.flag === "high" ? "Above typical range" : null;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ left: number; top: number; show: boolean }>({
    left: 0,
    top: 0,
    show: false,
  });

  const positionTip = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(352, typeof window !== "undefined" ? window.innerWidth - 24 : 352);
    let left = r.left + r.width / 2;
    left = Math.max(w / 2 + 12, Math.min(left, (typeof window !== "undefined" ? window.innerWidth : left) - w / 2 - 12));
    const top = r.top - 8;
    setTip({ left, top, show: true });
  }, []);

  const hideTip = useCallback(() => setTip((s) => ({ ...s, show: false })), []);

  useLayoutEffect(() => {
    if (!tip.show) return;
    const onScroll = () => hideTip();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [tip.show, hideTip]);

  const tooltip =
    tip.show && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed z-[200] w-[min(calc(100vw-1.5rem),22rem)] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 text-xs shadow-xl pointer-events-none"
            style={{
              left: tip.left,
              top: tip.top,
              transform: "translate(-50%, -100%)",
            }}
            role="tooltip"
          >
            <LabTooltipBody it={it} lab={lab} flagLabel={flagLabel} />
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        ref={wrapRef}
        className={`rounded-2xl border px-3 py-2 text-sm outline-none transition-colors hover:ring-2 hover:ring-[var(--accent)]/25 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${borderClass} ${className}`}
        tabIndex={0}
        onMouseEnter={positionTip}
        onMouseLeave={hideTip}
        onFocus={positionTip}
        onBlur={hideTip}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-[var(--fg)]">{it.displayName}</span>
          {out ? (
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Flag
            </span>
          ) : null}
        </div>
        <div className="font-semibold mt-1 text-[var(--fg)]">
          {it.displayValue}
          {it.displayUnit ? ` ${it.displayUnit}` : lab.unit && !it.displayUnit ? ` ${lab.unit}` : ""}
        </div>
        {showDate ? <div className="text-xs mv-muted mt-1">{lab.date || "—"}</div> : null}
      </div>
      {tooltip}
    </>
  );
}
