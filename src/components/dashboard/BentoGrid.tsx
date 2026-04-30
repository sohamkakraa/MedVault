"use client";

/**
 * BentoGrid — CSS Grid primitive for the dashboard.
 *
 * Read mode: 12-column CSS Grid (6 on tablet, 1 on mobile) with per-widget
 *   column/row spans based on BentoSize. Cards animate in with a staggered
 *   240 ms ease-out fade + 4 px translateY (respects prefers-reduced-motion).
 *
 * Edit mode: Framer Motion Reorder.Group (vertical stack) with drag handles,
 *   size picker, and remove buttons. On reorder the new flat ID list is passed
 *   to onReorder.
 *
 * Dark mode at ≥1280 px: ::before overlay with hairline gradient. Light mode:
 *   flat border + hover background, no shadows.
 */

import { useRef } from "react";
import { Reorder, useDragControls, motion } from "framer-motion";
import { GripVertical, X, ChevronDown } from "lucide-react";
import type { DashboardWidgetId, BentoSize } from "@/lib/types";
import {
  BENTO_COL_SPAN,
  BENTO_ROW_SPAN,
  DASHBOARD_WIDGET_META,
} from "@/lib/dashboardLayout";
import type { ReactNode } from "react";

export type BentoItem = {
  id: DashboardWidgetId;
  size: BentoSize;
  content: ReactNode;
  required?: boolean;
};

const SIZE_LABELS: Record<BentoSize, string> = {
  hero: "Hero",
  large: "Large",
  medium: "Medium",
  small: "Small",
  micro: "Micro",
};

const ALL_SIZES: BentoSize[] = ["hero", "large", "medium", "small", "micro"];

const STAGGER_MS = 30;

// ─── Main export ─────────────────────────────────────────────────────────────

export function BentoGrid({
  items,
  editMode = false,
  onReorder,
  onRemove,
  onSizeChange,
}: {
  items: BentoItem[];
  editMode?: boolean;
  onReorder?: (ids: DashboardWidgetId[]) => void;
  onRemove?: (id: DashboardWidgetId) => void;
  onSizeChange?: (id: DashboardWidgetId, size: BentoSize) => void;
}) {
  const reducedMotion = useRef(
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  if (editMode) {
    return (
      <Reorder.Group
        axis="y"
        values={items.map((i) => i.id)}
        onReorder={(newIds) => onReorder?.(newIds as DashboardWidgetId[])}
        className="space-y-3"
        as="div"
        layoutScroll
      >
        {items.map((item) => (
          <EditCell
            key={item.id}
            item={item}
            onRemove={onRemove}
            onSizeChange={onSizeChange}
          />
        ))}
      </Reorder.Group>
    );
  }

  return (
    <div className="bento-grid">
      {items.map((item, index) => (
        <ReadCell
          key={item.id}
          item={item}
          index={index}
          reducedMotion={reducedMotion.current}
        />
      ))}
    </div>
  );
}

// ─── Read mode cell ───────────────────────────────────────────────────────────

function ReadCell({
  item,
  index,
  reducedMotion,
}: {
  item: BentoItem;
  index: number;
  reducedMotion: boolean;
}) {
  const meta = DASHBOARD_WIDGET_META[item.id];
  const labelId = `bento-label-${item.id}`;
  return (
    <motion.div
      style={{
        gridColumn: `span ${BENTO_COL_SPAN[item.size]}`,
      }}
      initial={reducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.24,
        ease: "easeOut",
        delay: reducedMotion ? 0 : (index * STAGGER_MS) / 1000,
      }}
      className="bento-card relative min-w-0 overflow-hidden rounded-3xl"
      role="region"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="sr-only">
        {meta?.label ?? item.id}
      </span>
      {item.content}
    </motion.div>
  );
}

// ─── Edit mode cell ───────────────────────────────────────────────────────────

function EditCell({
  item,
  onRemove,
  onSizeChange,
}: {
  item: BentoItem;
  onRemove?: (id: DashboardWidgetId) => void;
  onSizeChange?: (id: DashboardWidgetId, size: BentoSize) => void;
}) {
  const dragControls = useDragControls();
  const meta = DASHBOARD_WIDGET_META[item.id];

  return (
    <Reorder.Item
      value={item.id}
      dragListener={false}
      dragControls={dragControls}
      className="bento-card--edit relative overflow-hidden rounded-3xl ring-1 ring-dashed ring-[var(--border)] hover:ring-[var(--accent)]/40"
    >
      {/* Edit chrome */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
        {/* Drag handle */}
        <div
          className="pointer-events-auto inline-flex cursor-grab select-none items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)]/95 px-2 py-1 text-[11px] font-medium text-[var(--fg)] shadow-sm backdrop-blur active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
          aria-hidden
        >
          <GripVertical className="h-3.5 w-3.5 text-[var(--muted)]" />
          <span className="max-w-[8rem] truncate">{meta?.label ?? item.id}</span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1">
          {onSizeChange && (
            <SizePicker
              widgetId={item.id}
              current={item.size}
              onChange={(s) => onSizeChange(item.id, s)}
            />
          )}
          {!item.required && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="grid h-7 w-7 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-600 shadow-sm backdrop-blur hover:bg-rose-500/20"
              aria-label={`Remove ${meta?.label ?? item.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="pt-12 opacity-80">{item.content}</div>
    </Reorder.Item>
  );
}

// ─── Size picker ──────────────────────────────────────────────────────────────

function SizePicker({
  widgetId,
  current,
  onChange,
}: {
  widgetId: DashboardWidgetId;
  current: BentoSize;
  onChange: (s: BentoSize) => void;
}) {
  const meta = DASHBOARD_WIDGET_META[widgetId];
  return (
    <div className="relative">
      <details className="group">
        <summary
          className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel)]/95 px-2 py-1 text-[11px] font-medium text-[var(--fg)] shadow-sm backdrop-blur hover:bg-[var(--panel-2)]"
          aria-label={`Change size of ${meta?.label ?? widgetId}, currently ${SIZE_LABELS[current]}`}
        >
          {SIZE_LABELS[current]}
          <ChevronDown className="h-3 w-3" />
        </summary>
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[110px] rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-lg">
          {ALL_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className={[
                "block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[var(--panel-2)]",
                s === current ? "font-semibold text-[var(--accent)]" : "text-[var(--fg)]",
              ].join(" ")}
            >
              {SIZE_LABELS[s]}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
