/**
 * Dashboard layout helpers.
 *
 * The dashboard is a row-based grid of widgets. Each row holds 1–3 widgets
 * that auto-resize (equal columns). Empty rows are pruned when the layout
 * is saved. A widget can be "hidden" (parked in the palette) so the user
 * can add it back later without losing their arrangement.
 *
 * Pure data helpers — no React, no localStorage. The dashboard page wires
 * this to its state/store via `useDashboardLayout`.
 */

import type {
  DashboardLayout,
  DashboardRow,
  DashboardWidgetId,
} from "./types";

/** How many widgets can share a single row. */
export const MAX_WIDGETS_PER_ROW = 3;

/** All widget ids recognised by the renderer. Order = palette order. */
export const ALL_WIDGET_IDS: DashboardWidgetId[] = [
  "snapshot",
  "documents",
  "medications",
  "healthLogs",
  "healthTrends",
  "labs",
  "bmi",
];

export type DashboardWidgetMeta = {
  id: DashboardWidgetId;
  label: string;
  description: string;
  /** When true, this widget cannot be removed (prevents locking the user out). */
  required?: boolean;
};

/**
 * Static metadata shown in the widget palette. Kept separate from the render
 * logic so new copy / labels don't force a dashboard recompile.
 */
export const DASHBOARD_WIDGET_META: Record<DashboardWidgetId, DashboardWidgetMeta> = {
  snapshot: {
    id: "snapshot",
    label: "At a glance",
    description: "Your summary, conditions, allergies, and next appointment.",
    required: true,
  },
  documents: {
    id: "documents",
    label: "Upload documents",
    description: "Your most recently uploaded lab reports and prescriptions.",
  },
  medications: {
    id: "medications",
    label: "Your medicines",
    description: "Active medications, refills, and adherence.",
  },
  healthLogs: {
    id: "healthLogs",
    label: "Health log",
    description: "Blood pressure readings and side-effect notes.",
  },
  healthTrends: {
    id: "healthTrends",
    label: "Health trends",
    description: "Charts for pinned biomarkers over time.",
  },
  labs: {
    id: "labs",
    label: "Recent test results",
    description: "Your latest lab values with flagged readings first.",
  },
  bmi: {
    id: "bmi",
    label: "Body mass index (BMI)",
    description: "Calculated from your height and weight with guidance.",
  },
};

function newRowId(): string {
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Default layout applied to new accounts and users who haven't customised.
 * BMI sits near the bottom so the more actionable content (snapshot, docs,
 * meds, logs) stays at the top of a mobile scroll.
 */
export function defaultDashboardLayout(): DashboardLayout {
  return {
    rows: [
      { id: newRowId(), widgets: ["snapshot"] },
      { id: newRowId(), widgets: ["documents", "medications"] },
      { id: newRowId(), widgets: ["healthLogs"] },
      { id: newRowId(), widgets: ["healthTrends"] },
      { id: newRowId(), widgets: ["labs"] },
      { id: newRowId(), widgets: ["bmi"] },
    ],
    hidden: [],
  };
}

/**
 * Takes a raw stored layout (possibly from an older build) and returns a
 * layout that:
 *  - only references known widget ids (unknown ids are dropped),
 *  - has each widget appearing at most once,
 *  - caps each row at `MAX_WIDGETS_PER_ROW`,
 *  - prunes empty rows and empty row-ids,
 *  - has every known widget either placed or in `hidden` (new widgets
 *    shipped after the user's layout was saved are appended to `hidden`
 *    so they don't silently appear).
 */
export function normalizeDashboardLayout(
  raw: Partial<DashboardLayout> | null | undefined,
): DashboardLayout {
  const known = new Set<DashboardWidgetId>(ALL_WIDGET_IDS);
  const seen = new Set<DashboardWidgetId>();
  const rows: DashboardRow[] = [];

  for (const row of raw?.rows ?? []) {
    const widgets: DashboardWidgetId[] = [];
    for (const w of row?.widgets ?? []) {
      if (!known.has(w as DashboardWidgetId)) continue;
      if (seen.has(w as DashboardWidgetId)) continue;
      seen.add(w as DashboardWidgetId);
      widgets.push(w as DashboardWidgetId);
      if (widgets.length >= MAX_WIDGETS_PER_ROW) break;
    }
    if (widgets.length > 0) {
      rows.push({ id: typeof row?.id === "string" && row.id ? row.id : newRowId(), widgets });
    }
  }

  const hiddenFromRaw = (raw?.hidden ?? []).filter(
    (w): w is DashboardWidgetId => known.has(w as DashboardWidgetId) && !seen.has(w as DashboardWidgetId),
  );

  const hiddenSet = new Set<DashboardWidgetId>(hiddenFromRaw);
  // Any known widget that's neither placed nor in hidden → surface it in hidden
  // so users can add it via the palette. This also means a freshly-released
  // widget lands in the palette for existing users instead of vanishing.
  for (const w of ALL_WIDGET_IDS) {
    if (!seen.has(w) && !hiddenSet.has(w)) hiddenSet.add(w);
  }

  return { rows, hidden: Array.from(hiddenSet) };
}

function cloneLayout(layout: DashboardLayout): DashboardLayout {
  return {
    rows: layout.rows.map((r) => ({ id: r.id, widgets: [...r.widgets] })),
    hidden: [...layout.hidden],
  };
}

function removeWidgetFromRows(
  layout: DashboardLayout,
  widget: DashboardWidgetId,
): DashboardLayout {
  const next = cloneLayout(layout);
  for (const row of next.rows) {
    const idx = row.widgets.indexOf(widget);
    if (idx !== -1) row.widgets.splice(idx, 1);
  }
  // Drop empty rows so the grid never renders a blank slot.
  next.rows = next.rows.filter((r) => r.widgets.length > 0);
  return next;
}

/**
 * Move `widget` to `targetRowIndex` at `targetPosition`. If `targetRowIndex`
 * equals `rows.length`, a new row is appended. If the widget is currently
 * in a row that would become empty after removal, that row is pruned.
 */
export function moveWidget(
  layout: DashboardLayout,
  widget: DashboardWidgetId,
  targetRowIndex: number,
  targetPosition: number,
): DashboardLayout {
  // Capture source coords BEFORE removal so we can correctly bias the insert
  // position when dragging within the same row (splice after removal shifts
  // indices by 1). Without this adjustment, moving right-by-one is a no-op.
  let sourceRowIndex = -1;
  let sourceWidgetIndex = -1;
  for (let ri = 0; ri < layout.rows.length; ri++) {
    const wi = layout.rows[ri]!.widgets.indexOf(widget);
    if (wi !== -1) {
      sourceRowIndex = ri;
      sourceWidgetIndex = wi;
      break;
    }
  }

  const stripped = removeWidgetFromRows(layout, widget);
  // Re-resolve the target row index post-removal: if the source row was
  // pruned AND it was above the target, the target shifted up by one.
  let rowIndex = targetRowIndex;
  if (
    sourceRowIndex !== -1 &&
    layout.rows[sourceRowIndex]!.widgets.length === 1 && // row will be gone
    sourceRowIndex < targetRowIndex
  ) {
    rowIndex -= 1;
  }

  let position = targetPosition;
  if (
    sourceRowIndex !== -1 &&
    sourceRowIndex === targetRowIndex &&
    sourceWidgetIndex < targetPosition
  ) {
    // Same row drag right: removing first shifts everything left, so the
    // desired insertion point also shifts left by one.
    position -= 1;
  }

  // Append as new row if the target row doesn't exist yet (drop on end zone).
  if (rowIndex < 0) rowIndex = 0;
  if (rowIndex >= stripped.rows.length) {
    stripped.rows.push({ id: newRowId(), widgets: [widget] });
    stripped.hidden = stripped.hidden.filter((w) => w !== widget);
    return stripped;
  }

  const row = stripped.rows[rowIndex]!;
  // Cap enforcement: if the row is already full, push the widget onto a new
  // row inserted directly AFTER the full row rather than silently failing.
  if (row.widgets.length >= MAX_WIDGETS_PER_ROW) {
    stripped.rows.splice(rowIndex + 1, 0, { id: newRowId(), widgets: [widget] });
  } else {
    const clamped = Math.max(0, Math.min(position, row.widgets.length));
    row.widgets.splice(clamped, 0, widget);
  }

  stripped.hidden = stripped.hidden.filter((w) => w !== widget);
  return stripped;
}

/** Hide a widget (move to the palette). Empty rows are pruned. */
export function hideWidget(
  layout: DashboardLayout,
  widget: DashboardWidgetId,
): DashboardLayout {
  const next = removeWidgetFromRows(layout, widget);
  if (!next.hidden.includes(widget)) next.hidden.push(widget);
  return next;
}

/** Re-add a hidden widget to the end of the grid as its own new row. */
export function showWidget(
  layout: DashboardLayout,
  widget: DashboardWidgetId,
): DashboardLayout {
  const next = cloneLayout(layout);
  next.hidden = next.hidden.filter((w) => w !== widget);
  // Skip if it's somehow already visible (shouldn't happen, but defensive).
  const alreadyVisible = next.rows.some((r) => r.widgets.includes(widget));
  if (alreadyVisible) return next;
  next.rows.push({ id: newRowId(), widgets: [widget] });
  return next;
}
