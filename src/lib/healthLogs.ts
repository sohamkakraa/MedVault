import type {
  BloodPressureLogEntry,
  HealthLogsBundle,
  MedicationIntakeLogEntry,
  MedicationReminderEntry,
  SideEffectLogEntry,
} from "@/lib/types";

const MAX_EACH = 500;

export function defaultHealthLogs(): HealthLogsBundle {
  return {
    bloodPressure: [],
    medicationIntake: [],
    sideEffects: [],
    medicationReminders: [],
  };
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function clampArray<T>(arr: T[]): T[] {
  return arr.slice(0, MAX_EACH);
}

function normalizeHHmm(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function normalizeHealthLogs(raw: unknown): HealthLogsBundle {
  const base = defaultHealthLogs();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;

  const bp: BloodPressureLogEntry[] = [];
  if (Array.isArray(o.bloodPressure)) {
    for (const row of o.bloodPressure) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const sys = Number(r.systolic);
      const dia = Number(r.diastolic);
      if (!isNonEmptyString(r.id) || !isNonEmptyString(r.loggedAtISO) || !Number.isFinite(sys) || !Number.isFinite(dia))
        continue;
      const pulse = Number(r.pulseBpm);
      bp.push({
        id: r.id.trim(),
        loggedAtISO: r.loggedAtISO.trim(),
        systolic: sys,
        diastolic: dia,
        pulseBpm: Number.isFinite(pulse) ? pulse : undefined,
        notes: isNonEmptyString(r.notes) ? String(r.notes).trim().slice(0, 2000) : undefined,
      });
    }
  }

  const med: MedicationIntakeLogEntry[] = [];
  if (Array.isArray(o.medicationIntake)) {
    for (const row of o.medicationIntake) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const action = r.action;
      if (
        !isNonEmptyString(r.id) ||
        !isNonEmptyString(r.loggedAtISO) ||
        !isNonEmptyString(r.medicationName) ||
        (action !== "taken" && action !== "skipped" && action !== "missed" && action !== "extra")
      )
        continue;
      const dStd = Number(r.doseAmountStandard);
      med.push({
        id: r.id.trim(),
        loggedAtISO: r.loggedAtISO.trim(),
        medicationName: String(r.medicationName).trim().slice(0, 200),
        action,
        notes: isNonEmptyString(r.notes) ? String(r.notes).trim().slice(0, 2000) : undefined,
        doseAmountStandard: Number.isFinite(dStd) ? dStd : undefined,
        doseStandardUnit: isNonEmptyString(r.doseStandardUnit)
          ? String(r.doseStandardUnit).trim().slice(0, 24)
          : undefined,
        doseUserEnteredLabel: isNonEmptyString(r.doseUserEnteredLabel)
          ? String(r.doseUserEnteredLabel).trim().slice(0, 80)
          : undefined,
      });
    }
  }

  const reminders: MedicationReminderEntry[] = [];
  if (Array.isArray(o.medicationReminders)) {
    for (const row of o.medicationReminders) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const hhmm = isNonEmptyString(r.timeLocalHHmm) ? normalizeHHmm(String(r.timeLocalHHmm)) : null;
      const repeatDaily = r.repeatDaily === true;
      const once = isNonEmptyString(r.remindOnceAtISO) ? String(r.remindOnceAtISO).trim() : "";
      const onceOk = once ? !Number.isNaN(new Date(once).getTime()) : false;
      if (!isNonEmptyString(r.id) || !isNonEmptyString(r.medicationName) || !isNonEmptyString(r.createdAtISO)) continue;
      if (repeatDaily && !hhmm) continue;
      if (!repeatDaily && !onceOk) continue;
      const enabled = r.enabled !== false;
      reminders.push({
        id: r.id.trim(),
        medicationName: String(r.medicationName).trim().slice(0, 200),
        timeLocalHHmm: hhmm ?? "09:00",
        repeatDaily,
        remindOnceAtISO: repeatDaily ? undefined : onceOk ? once : undefined,
        enabled,
        createdAtISO: r.createdAtISO.trim(),
        notes: isNonEmptyString(r.notes) ? String(r.notes).trim().slice(0, 2000) : undefined,
      });
    }
  }

  const se: SideEffectLogEntry[] = [];
  if (Array.isArray(o.sideEffects)) {
    for (const row of o.sideEffects) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const intensity = r.intensity;
      if (!isNonEmptyString(r.id) || !isNonEmptyString(r.loggedAtISO) || !isNonEmptyString(r.description)) continue;
      if (
        intensity !== undefined &&
        intensity !== "mild" &&
        intensity !== "moderate" &&
        intensity !== "strong" &&
        intensity !== "unspecified"
      )
        continue;
      se.push({
        id: r.id.trim(),
        loggedAtISO: r.loggedAtISO.trim(),
        description: String(r.description).trim().slice(0, 4000),
        relatedMedicationName: isNonEmptyString(r.relatedMedicationName)
          ? String(r.relatedMedicationName).trim().slice(0, 200)
          : undefined,
        intensity: intensity as SideEffectLogEntry["intensity"],
      });
    }
  }

  return {
    bloodPressure: clampArray(bp),
    medicationIntake: clampArray(med),
    sideEffects: clampArray(se),
    medicationReminders: clampArray(reminders),
  };
}

export function newHealthLogId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `hl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
