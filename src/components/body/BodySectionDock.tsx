"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BodyScrollSection } from "@/lib/bodyScrollRegistry";
import { cn } from "@/components/ui/cn";

type BodySectionDockProps = {
  sections: BodyScrollSection[];
  activeIndex: number;
  isLight: boolean;
  onGoTo: (index: number) => void;
};

const btnBase =
  "rounded-2xl border border-[var(--border)] px-3 py-2.5 text-left transition min-w-0 sm:max-w-[220px] sm:w-[220px] flex flex-col justify-center gap-0.5";

export function BodySectionDock({ sections, activeIndex, isLight, onGoTo }: BodySectionDockProps) {
  const prev = activeIndex > 0 ? sections[activeIndex - 1] : null;
  const next = activeIndex < sections.length - 1 ? sections[activeIndex + 1] : null;

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] backdrop-blur-md",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 px-3 sm:px-4",
        isLight ? "bg-[var(--panel)]/92 shadow-[0_-8px_32px_rgba(18,24,24,0.08)]" : "bg-[var(--panel)]/88 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]"
      )}
      aria-label="Body areas"
    >
      <div className="mx-auto max-w-6xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && onGoTo(activeIndex - 1)}
          className={cn(
            btnBase,
            prev
              ? "bg-[var(--panel-2)] hover:bg-[var(--panel)] text-[var(--fg)]"
              : "opacity-40 cursor-not-allowed bg-[var(--panel-2)]/50 text-[var(--muted)]"
          )}
        >
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
            <ChevronLeft className="h-3 w-3 shrink-0" aria-hidden />
            Before
          </span>
          <span className="text-xs font-medium truncate">{prev?.title ?? "Start"}</span>
        </button>

        <div
          className="order-first sm:order-none flex items-center justify-center gap-1.5 overflow-x-auto max-w-full flex-1 min-w-0 py-0.5 px-1 [scrollbar-width:thin]"
          role="tablist"
          aria-label="Jump to a body area"
        >
          {sections.map((s, i) => {
            const active = i === activeIndex;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={s.title}
                onClick={() => onGoTo(i)}
                className="shrink-0 p-1.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
              >
                <span
                  className="block rounded-full transition-all duration-300"
                  style={{
                    height: 7,
                    width: active ? 22 : 7,
                    background: active ? s.color : isLight ? "rgba(15,21,24,0.2)" : "rgba(255,255,255,0.22)",
                  }}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!next}
          onClick={() => next && onGoTo(activeIndex + 1)}
          className={cn(
            btnBase,
            "text-right sm:text-right",
            next
              ? "bg-[var(--panel-2)] hover:bg-[var(--panel)] text-[var(--fg)]"
              : "opacity-40 cursor-not-allowed bg-[var(--panel-2)]/50 text-[var(--muted)]"
          )}
        >
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] flex items-center justify-end gap-1">
            Next
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          </span>
          <span className="text-xs font-medium truncate">{next?.title ?? "End"}</span>
        </button>
      </div>
    </nav>
  );
}
