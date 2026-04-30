/**
 * DashboardKpiRegistry — tracks which dashboard widget "owns" each KPI so the
 * same metric never appears in two different cards simultaneously.
 *
 * Registration happens at module load time. In development, a duplicate
 * registration (same KPI, different widget) logs a console.error so the bug
 * surfaces immediately.
 */

import type { DashboardWidgetId } from "./types";

const registry = new Map<string, DashboardWidgetId>();

export function registerKpi(kpi: string, widgetId: DashboardWidgetId): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    const existing = registry.get(kpi);
    if (existing && existing !== widgetId) {
      console.error(
        `[DashboardKpiRegistry] KPI "${kpi}" is already owned by widget "${existing}". ` +
          `Cannot also register it for "${widgetId}". Remove the duplicate.`,
      );
      return;
    }
  }
  registry.set(kpi, widgetId);
}

export function getKpiOwner(kpi: string): DashboardWidgetId | undefined {
  return registry.get(kpi);
}

// ─── Widget KPI ownership declarations ───────────────────────────────────────
// Each widget registers the KPIs it exclusively displays. Any metric listed
// here must not appear in another widget as a primary display element.

registerKpi("health_summary", "snapshot");
registerKpi("conditions_list", "snapshot");
registerKpi("allergies_list", "snapshot");
registerKpi("next_appointment", "snapshot");

registerKpi("documents_list", "documents");
registerKpi("document_count", "documents");

registerKpi("medications_list", "medications");
registerKpi("medication_count", "medications");

registerKpi("blood_pressure_log", "bloodPressure");
registerKpi("side_effects_log", "sideEffects");

registerKpi("lab_trends_chart", "healthTrends");

registerKpi("recent_labs_list", "labs");

registerKpi("bmi_value", "bmi");
