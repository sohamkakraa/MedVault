"use client";

/**
 * Editable dashboard grid.
 *
 * - Read mode: renders `layout.rows` as a stack of rows. Each row is a 1, 2, or
 *   3-column grid (equal widths) on >= md; collapses to a single column on
 *   mobile so the vertical flow stays clean.
 * - Edit mode: each widget shows a drag handle (HTML5 drag) + remove button,
 *   and drop zones appear inside every row and between rows. Dragging a widget
 *   onto a drop zone calls `moveWidget` (pure helper in `@/lib/dashboardLayout`)
 *   and bubbles the new layout up through `onLayoutChange`.
 *
 * Empty rows are pruned by the helper. Rows cap at 3 widgets — if a 4th lands,
 * the helper automatically inserts a new row rather than silently failing.
 *
 * Mobile drag-and-drop is not reliable across browsers, so we also surface
 * explicit "move up / move down / break into new row" controls when edit mode
 * is on. Those controls work anywhere a drag works.
 */

import {
  Fragment,
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { GripVertical, X, ArrowUp, ArrowDown, SplitSquareVertical } from "lucide-react";
import {
  MAX_WIDGETS_PER_ROW,
  moveWidget,
  hideWidget,
} from "@/lib/dashboardLayout";
import type {
  DashboardLayout,
  DashboardWidgetId,
} from "@/lib/types";
import { DASHBOARD_WIDGET_META } from "@/lib/dashboardLayout";

type DropTarget = { rowIndex: number; position: number };

export function DashboardGrid({
  layout,
  onLayoutChange,
  editMode,
  renderWidget,
}: {
  layout: DashboardLayout;
  onLayoutChange: (next: DashboardLayout) => void;
  editMode: boolean;
  renderWidget: (id: DashboardWidgetId) => ReactNode;
}) {
  const [dragging, setDragging] = useState<DashboardWidgetId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // Drag events can fire rapidly (dragEnter on a child triggers dragLeave on
  // the parent); we debounce clear with a ref so the highlight doesn't flicker.
  const clearTimer = useRef<number | null>(null);

  const setTarget = useCallback((t: DropTarget | null) => {
    if (clearTimer.current) {
      window.clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    if (t === null) {
      clearTimer.current = window.setTimeout(() => setDropTarget(null), 40);
    } else {
      setDropTarget(t);
    }
  }, []);

  const onDragStart = useCallback(
    (e: DragEvent, id: DashboardWidgetId) => {
      if (!editMode) return;
      setDragging(id);
      e.dataTransfer.setData("application/uma-widget", id);
      e.dataTransfer.effectAllowed = "move";
    },
    [editMode],
  );

  const onDragEnd = useCallback(() => {
    setDragging(null);
    setDropTarget(null);
  }, []);

  const onDropAt = useCallback(
    (e: DragEvent, rowIndex: number, position: number) => {
      e.preventDefault();
      const id =
        (e.dataTransfer.getData("application/uma-widget") as DashboardWidgetId) ||
        dragging;
      if (!id) return;
      onLayoutChange(moveWidget(layout, id, rowIndex, position));
      setDragging(null);
      setDropTarget(null);
    },
    [dragging, layout, onLayoutChange],
  );

  const onDragOverSlot = useCallback(
    (e: DragEvent, rowIndex: number, position: number) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setTarget({ rowIndex, position });
    },
    [dragging, setTarget],
  );

  const onRemove = useCallback(
    (id: DashboardWidgetId) => {
      if (DASHBOARD_WIDGET_META[id]?.required) return;
      onLayoutChange(hideWidget(layout, id));
    },
    [layout, onLayoutChange],
  );

  const moveRow = useCallback(
    (id: DashboardWidgetId, direction: -1 | 1) => {
      // Find the widget's current row; move the entire widget to a neighbour
      // row (as a single-widget insertion) or bubble within its own row if
      // there's a sibling in the direction.
      const rowIndex = layout.rows.findIndex((r) => r.widgets.includes(id));
      if (rowIndex === -1) return;
      const row = layout.rows[rowIndex]!;
      const pos = row.widgets.indexOf(id);
      // Prefer in-row shuffle when the direction has a sibling.
      if (direction === -1 && pos > 0) {
        onLayoutChange(moveWidget(layout, id, rowIndex, pos - 1));
        return;
      }
      if (direction === 1 && pos < row.widgets.length - 1) {
        onLayoutChange(moveWidget(layout, id, rowIndex, pos + 1));
        return;
      }
      // Otherwise move to the end of the neighbour row (or create one at top).
      const target = rowIndex + direction;
      if (target < 0) {
        onLayoutChange(moveWidget(layout, id, 0, 0));
        return;
      }
      if (target >= layout.rows.length) {
        onLayoutChange(moveWidget(layout, id, layout.rows.length, 0));
        return;
      }
      onLayoutChange(moveWidget(layout, id, target, layout.rows[target]!.widgets.length));
    },
    [layout, onLayoutChange],
  );

  const breakIntoNewRow = useCallback(
    (id: DashboardWidgetId) => {
      const rowIndex = layout.rows.findIndex((r) => r.widgets.includes(id));
      if (rowIndex === -1) return;
      onLayoutChange(moveWidget(layout, id, rowIndex + 1, 0));
    },
    [layout, onLayoutChange],
  );

  return (
    <div className="space-y-4">
      {layout.rows.map((row, rowIndex) => {
        // A widget may render `null` in read mode (e.g. "health trends" with
        // no pinned metrics). Dropping those from the visible row keeps
        // columns visually even and avoids a ghost slot; the data-model row
        // still holds the id so the widget reappears when it has content.
        const visibleWidgets = editMode
          ? row.widgets
          : row.widgets.filter((w) => renderWidget(w) != null);
        if (visibleWidgets.length === 0 && !editMode) return null;

        const cols = visibleWidgets.length || row.widgets.length;
        // Mobile always single-column so we don't reintroduce horizontal
        // cramping; md+ gets 1 / 2 / 3 equal columns depending on widget count.
        const colClass =
          cols === 1
            ? "grid-cols-1"
            : cols === 2
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-1 md:grid-cols-3";

        const canAddMore = row.widgets.length < MAX_WIDGETS_PER_ROW;

        return (
          <Fragment key={row.id}>
            {editMode && (
              <NewRowDropZone
                active={!!dragging}
                isTarget={
                  dropTarget?.rowIndex === rowIndex && dropTarget.position === -1
                }
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setTarget({ rowIndex, position: -1 });
                }}
                onDragLeave={() => setTarget(null)}
                onDrop={(e) => {
                  // position=-1 is the "new row above" sentinel; we splice a
                  // fresh row in by reinserting the widget at rowIndex with
                  // position 0 in a phantom row — the helper already creates
                  // the row for us when rowIndex >= rows.length, but for
                  // inserting ABOVE we need to nudge existing rows down.
                  // Simpler: convert "drop above row N" into "drop at end of
                  // previous row with a split". We do that by inserting at
                  // rowIndex with position 0 after temporarily removing,
                  // which `moveWidget` handles via the same code path.
                  e.preventDefault();
                  const id =
                    (e.dataTransfer.getData("application/uma-widget") as DashboardWidgetId) ||
                    dragging;
                  if (!id) return;
                  // Nudge down: take the current layout, splice an empty
                  // placeholder row at rowIndex, then drop there.
                  const withGap: DashboardLayout = {
                    rows: [
                      ...layout.rows.slice(0, rowIndex),
                      { id: `row-gap-${Date.now().toString(36)}`, widgets: [] },
                      ...layout.rows.slice(rowIndex),
                    ],
                    hidden: [...layout.hidden],
                  };
                  onLayoutChange(moveWidget(withGap, id, rowIndex, 0));
                  setDragging(null);
                  setDropTarget(null);
                }}
              />
            )}

            <div
              className={`grid gap-4 ${colClass}`}
              role={editMode ? "list" : undefined}
              aria-label={
                editMode ? `Dashboard row ${rowIndex + 1}` : undefined
              }
            >
              {visibleWidgets.map((widgetId, widgetPos) => {
                const meta = DASHBOARD_WIDGET_META[widgetId];
                const isDragSource = dragging === widgetId;
                const isDropHere =
                  dropTarget?.rowIndex === rowIndex &&
                  dropTarget.position === widgetPos;
                return (
                  <WidgetSlot
                    key={widgetId}
                    editMode={editMode}
                    label={meta?.label ?? widgetId}
                    required={!!meta?.required}
                    isDragSource={isDragSource}
                    isDropHere={isDropHere}
                    onDragStart={(e) => onDragStart(e, widgetId)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => onDragOverSlot(e, rowIndex, widgetPos)}
                    onDragLeave={() => setTarget(null)}
                    onDrop={(e) => onDropAt(e, rowIndex, widgetPos)}
                    onRemove={() => onRemove(widgetId)}
                    onMoveUp={() => moveRow(widgetId, -1)}
                    onMoveDown={() => moveRow(widgetId, 1)}
                    onBreakRow={cols > 1 ? () => breakIntoNewRow(widgetId) : undefined}
                  >
                    {renderWidget(widgetId)}
                  </WidgetSlot>
                );
              })}

              {/* After-last-widget insertion slot (only in edit mode). Lets
                  you drop into the tail of the row without needing to aim
                  inside the last widget. */}
              {editMode && canAddMore && (
                <RowTailDropSlot
                  active={!!dragging}
                  isTarget={
                    dropTarget?.rowIndex === rowIndex &&
                    dropTarget.position === row.widgets.length
                  }
                  onDragOver={(e) =>
                    onDragOverSlot(e, rowIndex, row.widgets.length)
                  }
                  onDragLeave={() => setTarget(null)}
                  onDrop={(e) => onDropAt(e, rowIndex, row.widgets.length)}
                />
              )}
            </div>
          </Fragment>
        );
      })}

      {editMode && (
        <NewRowDropZone
          active={!!dragging}
          isTarget={
            dropTarget?.rowIndex === layout.rows.length &&
            dropTarget.position === 0
          }
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setTarget({ rowIndex: layout.rows.length, position: 0 });
          }}
          onDragLeave={() => setTarget(null)}
          onDrop={(e) => onDropAt(e, layout.rows.length, 0)}
          label="Drop here to start a new row"
        />
      )}
    </div>
  );
}

/** Individual widget slot — renders children plus edit-mode chrome. */
function WidgetSlot({
  children,
  editMode,
  label,
  required,
  isDragSource,
  isDropHere,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onRemove,
  onMoveUp,
  onMoveDown,
  onBreakRow,
}: {
  children: ReactNode;
  editMode: boolean;
  label: string;
  required: boolean;
  isDragSource: boolean;
  isDropHere: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onBreakRow?: () => void;
}) {
  if (!editMode) {
    return <div className="min-w-0">{children}</div>;
  }
  return (
    <div
      className={[
        "relative min-w-0 rounded-3xl transition-all",
        isDragSource
          ? "opacity-40 ring-2 ring-[var(--accent)]"
          : isDropHere
            ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]"
            : "ring-1 ring-dashed ring-[var(--border)] hover:ring-[var(--accent)]/40",
      ].join(" ")}
      draggable
      role="listitem"
      aria-label={label}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
        <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)]/95 px-2 py-1 text-[11px] font-medium text-[var(--fg)] shadow-sm backdrop-blur cursor-grab active:cursor-grabbing select-none">
          <GripVertical className="h-3.5 w-3.5 text-[var(--muted)]" />
          <span className="truncate max-w-[9rem]">{label}</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--panel)]/95 text-[var(--fg)] shadow-sm backdrop-blur hover:bg-[var(--panel-2)]"
            aria-label={`Move ${label} up`}
            title="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--panel)]/95 text-[var(--fg)] shadow-sm backdrop-blur hover:bg-[var(--panel-2)]"
            aria-label={`Move ${label} down`}
            title="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          {onBreakRow && (
            <button
              type="button"
              onClick={onBreakRow}
              className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--panel)]/95 text-[var(--fg)] shadow-sm backdrop-blur hover:bg-[var(--panel-2)]"
              aria-label={`Move ${label} to its own row`}
              title="Move to its own row"
            >
              <SplitSquareVertical className="h-3.5 w-3.5" />
            </button>
          )}
          {!required && (
            <button
              type="button"
              onClick={onRemove}
              className="grid h-7 w-7 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-600 shadow-sm backdrop-blur hover:bg-rose-500/20"
              aria-label={`Remove ${label}`}
              title="Remove from dashboard"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* Widget content sits in a dimmed wrapper during edit so the chrome
          stays readable without covering anything important. */}
      <div
        className={[
          "relative rounded-3xl",
          isDragSource ? "" : "pt-12",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

/** Between-rows drop zone — creates a new row at the target position. */
function NewRowDropZone({
  active,
  isTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  label = "Drop here to start a new row",
}: {
  active: boolean;
  isTarget: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  label?: string;
}) {
  if (!active && !isTarget) {
    return <div className="h-1" aria-hidden />;
  }
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        "flex items-center justify-center rounded-2xl border-2 border-dashed text-[11px] font-medium transition-colors",
        isTarget
          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] h-14"
          : "border-[var(--border)] text-[var(--muted)] h-9 hover:border-[var(--accent)]/60 hover:text-[var(--accent)]",
      ].join(" ")}
      aria-label={label}
    >
      {isTarget ? label : "+ New row"}
    </div>
  );
}

/** Tail drop slot visible inside a row that still has capacity (< 3 widgets). */
function RowTailDropSlot({
  active,
  isTarget,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  active: boolean;
  isTarget: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}) {
  if (!active && !isTarget) return null;
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        "grid min-h-[120px] place-items-center rounded-3xl border-2 border-dashed text-xs font-medium transition-colors",
        isTarget
          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
          : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)]",
      ].join(" ")}
      aria-label="Drop here to add to this row"
    >
      Drop to add to this row
    </div>
  );
}
