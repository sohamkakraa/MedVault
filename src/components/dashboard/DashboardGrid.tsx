"use client";

/**
 * DashboardGrid — wires the BentoGrid primitive to the DashboardLayout data
 * model. Handles:
 *  - Flattening rows → ordered widget list for BentoGrid
 *  - Reorder callback → rebuilding rows from new flat order
 *  - Size changes via setWidgetSize
 *  - Widget removal via hideWidget
 */

import { useCallback } from "react";
import { BentoGrid, type BentoItem } from "./BentoGrid";
import {
  DEFAULT_BENTO_SIZES,
  DASHBOARD_WIDGET_META,
  MAX_WIDGETS_PER_ROW,
  hideWidget,
  setWidgetSize,
} from "@/lib/dashboardLayout";
import type { DashboardLayout, DashboardWidgetId, BentoSize } from "@/lib/types";
import type { ReactNode } from "react";

type Props = {
  layout: DashboardLayout;
  onLayoutChange: (next: DashboardLayout) => void;
  editMode: boolean;
  renderWidget: (id: DashboardWidgetId) => ReactNode;
};

export function DashboardGrid({ layout, onLayoutChange, editMode, renderWidget }: Props) {
  // Flatten rows → ordered widget list
  const orderedIds = layout.rows.flatMap((r) => r.widgets);
  const sizes = layout.sizes ?? {};

  const items: BentoItem[] = orderedIds
    .map((id): BentoItem | null => {
      const content = renderWidget(id);
      // In read mode, skip widgets that render null
      if (!editMode && content == null) return null;
      const meta = DASHBOARD_WIDGET_META[id];
      return {
        id,
        size: sizes[id] ?? DEFAULT_BENTO_SIZES[id] ?? "medium",
        content: content ?? <div className="p-6 text-sm mv-muted">{meta?.label}</div>,
        required: !!meta?.required,
      };
    })
    .filter((x): x is BentoItem => x !== null);

  const handleReorder = useCallback(
    (newIds: DashboardWidgetId[]) => {
      // Rebuild rows from the new flat order (max MAX_WIDGETS_PER_ROW per row)
      const newRows = [];
      for (let i = 0; i < newIds.length; i += MAX_WIDGETS_PER_ROW) {
        const chunk = newIds.slice(i, i + MAX_WIDGETS_PER_ROW);
        // Preserve the original row id if this chunk matches an existing row
        const existingRow = layout.rows.find(
          (r) => r.widgets.length === chunk.length && r.widgets.every((w, idx) => w === chunk[idx]),
        );
        newRows.push({
          id: existingRow?.id ?? `row-${Date.now().toString(36)}-${i}`,
          widgets: chunk,
        });
      }
      onLayoutChange({ ...layout, rows: newRows });
    },
    [layout, onLayoutChange],
  );

  const handleRemove = useCallback(
    (id: DashboardWidgetId) => {
      onLayoutChange(hideWidget(layout, id));
    },
    [layout, onLayoutChange],
  );

  const handleSizeChange = useCallback(
    (id: DashboardWidgetId, size: BentoSize) => {
      onLayoutChange(setWidgetSize(layout, id, size));
    },
    [layout, onLayoutChange],
  );

  return (
    <BentoGrid
      items={items}
      editMode={editMode}
      onReorder={handleReorder}
      onRemove={handleRemove}
      onSizeChange={handleSizeChange}
    />
  );
}
