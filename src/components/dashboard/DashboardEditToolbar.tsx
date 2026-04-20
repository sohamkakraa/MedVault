"use client";

/**
 * Toolbar shown while the dashboard is in edit mode. Surfaces:
 *  - a "Done" button to exit edit mode,
 *  - a palette of hidden widgets the user can re-add,
 *  - a reset-to-default action.
 *
 * Read-mode users see a compact "Edit dashboard" trigger placed in the
 * dashboard header by the page component (this file does not render it).
 */

import { useState } from "react";
import { Plus, RotateCcw, Check, Layers } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DASHBOARD_WIDGET_META,
  defaultDashboardLayout,
  showWidget,
} from "@/lib/dashboardLayout";
import type { DashboardLayout, DashboardWidgetId } from "@/lib/types";

export function DashboardEditToolbar({
  layout,
  onLayoutChange,
  onDone,
}: {
  layout: DashboardLayout;
  onLayoutChange: (next: DashboardLayout) => void;
  onDone: () => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const hidden = layout.hidden;

  return (
    <div className="sticky top-16 z-20 -mx-4 mb-3 rounded-none border-b border-[var(--border)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <Layers className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--fg)] truncate">
              Edit dashboard
            </p>
            <p className="text-[11px] text-[var(--muted)] leading-tight">
              Drag cards to reorder. Each row fits up to 3.
            </p>
          </div>
        </div>

        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            className="h-9 gap-1.5 px-3 text-xs"
            onClick={() => setPaletteOpen((o) => !o)}
            disabled={hidden.length === 0}
            aria-expanded={paletteOpen}
            title={
              hidden.length === 0
                ? "No hidden widgets — every card is already on your dashboard."
                : "Add a widget back to your dashboard"
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add widget
            {hidden.length > 0 && (
              <span className="rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                {hidden.length}
              </span>
            )}
          </Button>
          {paletteOpen && hidden.length > 0 && (
            <div
              className="absolute right-0 top-full z-30 mt-1 w-72 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-[var(--shadow)]"
              role="menu"
            >
              <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Hidden widgets
              </p>
              <ul className="space-y-1">
                {hidden.map((id) => {
                  const meta = DASHBOARD_WIDGET_META[id as DashboardWidgetId];
                  if (!meta) return null;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => {
                          onLayoutChange(showWidget(layout, id));
                          // Close once the palette is empty so we don't strand
                          // an empty popover on screen.
                          if (hidden.length <= 1) setPaletteOpen(false);
                        }}
                        className="flex w-full items-start gap-2 rounded-xl border border-transparent bg-[var(--panel-2)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)]/40"
                      >
                        <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[var(--fg)] truncate">
                            {meta.label}
                          </p>
                          <p className="text-[11px] text-[var(--muted)] leading-snug">
                            {meta.description}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          className="h-9 gap-1.5 px-3 text-xs"
          onClick={() => {
            if (window.confirm("Reset the dashboard to the default layout?")) {
              onLayoutChange(defaultDashboardLayout());
            }
          }}
          title="Restore the default layout"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>

        <Button
          type="button"
          className="h-9 gap-1.5 px-3 text-xs"
          onClick={onDone}
        >
          <Check className="h-3.5 w-3.5" />
          Done
        </Button>
      </div>
    </div>
  );
}
