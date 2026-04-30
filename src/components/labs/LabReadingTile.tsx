"use client";

import type { ExtractedLab, StandardLexiconEntry } from "@/lib/types";
import { interpretLab } from "@/lib/labInterpret";
import { getLabMeta } from "@/lib/labMeta";
import type { LabMeta } from "@/lib/labMeta";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip";

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
  meta,
}: {
  it: ReturnType<typeof interpretLab>;
  lab: ExtractedLab;
  flagLabel: string | null;
  meta: LabMeta | null;
}) {
  return (
    <>
      {meta ? (
        <>
          <p className="font-semibold text-[var(--fg)]">{meta.friendlyName}</p>
          <div className="mt-2 space-y-2 rounded-xl bg-[var(--panel-2)] px-2.5 py-2">
            <div>
              <p className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wide">What this test measures</p>
              <p className="mt-0.5 text-[var(--fg)] leading-relaxed text-sm">{meta.whatItMeasures}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wide">Why it matters</p>
              <p className="mt-0.5 text-[var(--fg)] leading-relaxed text-sm">{meta.whyItMatters}</p>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold text-[var(--fg)]">{it.shortLabel}</p>
          <p className="mt-1.5 leading-relaxed text-[var(--fg)]">{it.meaning}</p>
        </>
      )}
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
        {it.disclaimer}
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
  const meta = getLabMeta(it.canonicalName);
  const out = it.flag === "low" || it.flag === "high";
  const borderClass = out
    ? "border-amber-500/55 bg-amber-500/[0.07]"
    : "border-[var(--border)] bg-[var(--panel-2)]";

  const flagLabel =
    it.flag === "low" ? "Below typical range" : it.flag === "high" ? "Above typical range" : null;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <div
          className={`rounded-2xl border px-3 py-2 text-sm outline-none transition-colors hover:ring-2 hover:ring-[var(--accent)]/25 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 cursor-default ${borderClass} ${className}`}
          tabIndex={0}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                {meta && (
                  <span className="text-lg" aria-hidden>
                    {meta.emoji}
                  </span>
                )}
                <span className="font-medium text-[var(--fg)]">
                  {meta ? meta.friendlyName : it.displayName}
                </span>
              </div>
              {meta && meta.friendlyName !== it.displayName && (
                <p className="text-[11px] text-[var(--muted)] mt-0.5">{it.displayName}</p>
              )}
            </div>
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
      </TooltipTrigger>
      <TooltipContent side="top">
        <LabTooltipBody it={it} lab={lab} flagLabel={flagLabel} meta={meta} />
      </TooltipContent>
    </Tooltip>
  );
}
