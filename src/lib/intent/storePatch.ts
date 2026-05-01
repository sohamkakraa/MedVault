/**
 * StorePatch — the canonical "what did the user just ask me to change" type.
 *
 * The chat surface (web + WhatsApp) detects user intent in three tiers:
 *
 *   1. Deterministic regex parsers (reminderIntent, conditionIntent) for the
 *      two most common structured requests. Free, instant, predictable.
 *   2. LLM-based classifyIntent() that returns a StorePatch when the user is
 *      asking for any other add/remove/set on the patient store. Catches
 *      everything tier 1 doesn't.
 *   3. Plain conversation — the LLM just chats, no mutation.
 *
 * A StorePatch is a flat list of ops. Each op describes ONE atomic change.
 * The applier handles dedup, case-insensitivity, and rejection of obviously
 * malformed values; it never throws and it never partially applies (an op
 * either succeeds or is silently dropped — so the user's reply summary is
 * always honest).
 */
import { randomUUID } from "crypto";
import { z } from "zod";
import type {
  ExtractedMedication,
  MedicationReminderEntry,
  PatientStore,
  SideEffectLogEntry,
} from "@/lib/types";

// ── Op shapes ────────────────────────────────────────────────────────────
//
// Add ops accept the value as written — the applier title-cases names where
// appropriate so storage stays consistent regardless of how the user typed
// it ("metformin" vs "Metformin" vs "METFORMIN" all dedupe).
//
// Remove ops match case-insensitively with light singular/plural tolerance
// (so "headaches" cancels "headache" and vice-versa).
//
// Set ops replace a scalar field on the profile. They are intentionally
// conservative — only fields we expose in the profile editor are settable
// from chat, so a malicious or confused message can't reshape the store.

export const STORE_PATCH_OP_KINDS = [
  "add_condition",
  "remove_condition",
  "add_allergy",
  "remove_allergy",
  "add_medication",
  "remove_medication",
  "add_doctor",
  "remove_doctor",
  "add_hospital",
  "remove_hospital",
  "set_next_appointment",
  "clear_next_appointment",
  "log_side_effect",
  "clear_side_effects_matching",
  "set_reminder",
  "cancel_reminder",
  "set_interval_reminder",
  "cancel_interval_reminder",
  "set_profile_field",
] as const;

export const StorePatchOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add_condition"), value: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("remove_condition"), value: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("add_allergy"), value: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("remove_allergy"), value: z.string().min(1).max(120) }),
  z.object({
    kind: z.literal("add_medication"),
    name: z.string().min(1).max(120),
    dose: z.string().max(60).optional(),
    frequency: z.string().max(120).optional(),
    usualTimeLocalHHmm: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
  }),
  z.object({ kind: z.literal("remove_medication"), name: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("add_doctor"), name: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("remove_doctor"), name: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("add_hospital"), name: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("remove_hospital"), name: z.string().min(1).max(120) }),
  z.object({
    kind: z.literal("set_next_appointment"),
    doctor: z.string().max(120).optional(),
    clinic: z.string().max(120).optional(),
    dateISO: z.string().max(40).optional(),
    timeHHmm: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
  }),
  z.object({ kind: z.literal("clear_next_appointment") }),
  z.object({
    kind: z.literal("log_side_effect"),
    description: z.string().min(1).max(400),
    intensity: z.enum(["mild", "moderate", "strong", "unspecified"]).optional(),
    relatedMedicationName: z.string().max(120).optional(),
  }),
  z.object({ kind: z.literal("clear_side_effects_matching"), query: z.string().min(1).max(120) }),
  z.object({
    kind: z.literal("set_reminder"),
    medicationName: z.string().min(1).max(120),
    timeLocalHHmm: z.string().regex(/^\d{2}:\d{2}$/),
    repeatDaily: z.boolean().default(true),
  }),
  z.object({ kind: z.literal("cancel_reminder"), medicationName: z.string().min(1).max(120) }),
  z.object({
    kind: z.literal("set_interval_reminder"),
    label: z.string().min(1).max(120),
    intervalMinutes: z.number().int().min(1).max(1440),
    windowStartHHmm: z.string().regex(/^\d{2}:\d{2}$/),
    windowEndHHmm: z.string().regex(/^\d{2}:\d{2}$/),
    bottleMl: z.number().int().min(1).max(10000).optional(),
    startingFromHHmm: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }),
  z.object({ kind: z.literal("cancel_interval_reminder"), label: z.string().min(1).max(120) }),
  z.object({
    kind: z.literal("set_profile_field"),
    field: z.enum([
      "name",
      "preferredName",
      "dob",
      "sex",
      "primaryCareProvider",
      "nextVisitHospital",
      "phone",
      "email",
    ]),
    value: z.string().min(1).max(200),
  }),
]);

export type StorePatchOp = z.infer<typeof StorePatchOpSchema>;

export const StorePatchSchema = z.object({
  ops: z.array(StorePatchOpSchema).max(10),
  summary: z.string().min(1).max(500),
});

export type StorePatch = z.infer<typeof StorePatchSchema>;

// ── Applier ──────────────────────────────────────────────────────────────

export type ApplyResult = {
  store: PatientStore;
  /** Lines describing what actually happened — used in the chat reply. */
  applied: string[];
  /** Lines describing ops that were proposed but couldn't be applied. */
  skipped: string[];
};

/**
 * Apply a patch to a copy of the store. Pure — never mutates `store`.
 * Each op is wrapped in a try/catch so one bad op never stops the rest.
 */
export function applyStorePatch(store: PatientStore, patch: StorePatch): ApplyResult {
  let s = cloneStore(store);
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const rawOp of patch.ops) {
    try {
      const r = applyOp(s, rawOp);
      s = r.store;
      if (r.applied) applied.push(r.applied);
      else if (r.skipped) skipped.push(r.skipped);
    } catch {
      skipped.push(`Could not apply ${rawOp.kind}.`);
    }
  }
  return { store: s, applied, skipped };
}

function applyOp(
  store: PatientStore,
  op: StorePatchOp,
): { store: PatientStore; applied?: string; skipped?: string } {
  switch (op.kind) {
    case "add_condition": {
      const v = titleCase(op.value);
      const list = store.profile.conditions ?? [];
      if (containsCI(list, v)) return { store, skipped: `${v} already in your medical history.` };
      return {
        store: setProfile(store, { conditions: [...list, v] }),
        applied: `Added ${v} to your medical history.`,
      };
    }
    case "remove_condition": {
      const list = store.profile.conditions ?? [];
      const next = list.filter((c) => !looseMatch(c, op.value));
      if (next.length === list.length) return { store, skipped: `${op.value} wasn't in your medical history.` };
      return { store: setProfile(store, { conditions: next }), applied: `Removed ${op.value} from your medical history.` };
    }
    case "add_allergy": {
      const v = titleCase(op.value);
      const list = store.profile.allergies ?? [];
      if (containsCI(list, v)) return { store, skipped: `${v} already in your allergies.` };
      return { store: setProfile(store, { allergies: [...list, v] }), applied: `Added ${v} to your allergies.` };
    }
    case "remove_allergy": {
      const list = store.profile.allergies ?? [];
      const next = list.filter((c) => !looseMatch(c, op.value));
      if (next.length === list.length) return { store, skipped: `${op.value} wasn't in your allergies.` };
      return { store: setProfile(store, { allergies: next }), applied: `Removed ${op.value} from your allergies.` };
    }
    case "add_medication": {
      const name = titleCase(op.name);
      const meds = store.meds ?? [];
      if (meds.some((m) => sameNameCI(m.name, name)))
        return { store, skipped: `${name} is already on your medicine list.` };
      const med: ExtractedMedication = {
        name,
        dose: op.dose?.trim() || "",
        frequency: op.frequency?.trim() || "",
        ...(op.usualTimeLocalHHmm ? { usualTimeLocalHHmm: op.usualTimeLocalHHmm } : {}),
      };
      return {
        store: { ...store, meds: [med, ...meds] },
        applied: `Added ${name}${op.dose ? ` (${op.dose})` : ""} to your medicines.`,
      };
    }
    case "remove_medication": {
      const meds = store.meds ?? [];
      const next = meds.filter((m) => !looseMatch(m.name, op.name));
      if (next.length === meds.length) return { store, skipped: `${op.name} wasn't on your medicine list.` };
      return { store: { ...store, meds: next }, applied: `Removed ${op.name} from your medicines.` };
    }
    case "add_doctor": {
      const v = titleCase(op.name);
      const list = store.profile.doctorQuickPick ?? [];
      const hidden = (store.profile.doctorQuickPickHidden ?? []).filter((h) => !looseMatch(h, v));
      if (containsCI(list, v))
        return {
          store: setProfile(store, { doctorQuickPickHidden: hidden }),
          skipped: `${v} is already saved as a doctor.`,
        };
      return {
        store: setProfile(store, { doctorQuickPick: [...list, v], doctorQuickPickHidden: hidden }),
        applied: `Added ${v} to your doctors.`,
      };
    }
    case "remove_doctor": {
      const list = store.profile.doctorQuickPick ?? [];
      const next = list.filter((c) => !looseMatch(c, op.name));
      // Always also add to the hidden list — that's how doc-derived names get
      // suppressed (same fix as Tidy).
      const hidden = store.profile.doctorQuickPickHidden ?? [];
      const hiddenNext = containsCI(hidden, op.name) ? hidden : [...hidden, titleCase(op.name)];
      return {
        store: setProfile(store, { doctorQuickPick: next, doctorQuickPickHidden: hiddenNext }),
        applied: `Removed ${op.name} from your doctors.`,
      };
    }
    case "add_hospital": {
      const v = titleCase(op.name);
      const list = store.profile.facilityQuickPick ?? [];
      const hidden = (store.profile.facilityQuickPickHidden ?? []).filter((h) => !looseMatch(h, v));
      if (containsCI(list, v))
        return {
          store: setProfile(store, { facilityQuickPickHidden: hidden }),
          skipped: `${v} is already saved as a hospital.`,
        };
      return {
        store: setProfile(store, { facilityQuickPick: [...list, v], facilityQuickPickHidden: hidden }),
        applied: `Added ${v} to your hospitals/clinics.`,
      };
    }
    case "remove_hospital": {
      const list = store.profile.facilityQuickPick ?? [];
      const next = list.filter((c) => !looseMatch(c, op.name));
      const hidden = store.profile.facilityQuickPickHidden ?? [];
      const hiddenNext = containsCI(hidden, op.name) ? hidden : [...hidden, titleCase(op.name)];
      return {
        store: setProfile(store, { facilityQuickPick: next, facilityQuickPickHidden: hiddenNext }),
        applied: `Removed ${op.name} from your hospitals/clinics.`,
      };
    }
    case "set_next_appointment": {
      const profile: PatientStore["profile"] = { ...store.profile };
      const parts: string[] = [];
      if (op.doctor) {
        profile.primaryCareProvider = op.doctor.trim();
        parts.push(`with ${op.doctor.trim()}`);
      }
      if (op.clinic) {
        profile.nextVisitHospital = op.clinic.trim();
        parts.push(`at ${op.clinic.trim()}`);
      }
      // Compose nextVisitDate as "YYYY-MM-DDTHH:mm:00" when both supplied.
      if (op.dateISO) {
        profile.nextVisitDate = composeNextVisit(op.dateISO, op.timeHHmm);
        parts.push(`on ${op.dateISO}${op.timeHHmm ? ` at ${op.timeHHmm}` : ""}`);
      }
      if (parts.length === 0) return { store, skipped: "No appointment details to set." };
      return { store: { ...store, profile }, applied: `Set your next appointment ${parts.join(" ")}.` };
    }
    case "clear_next_appointment": {
      return {
        store: setProfile(store, {
          nextVisitDate: undefined,
          primaryCareProvider: store.profile.primaryCareProvider, // keep as the regular doctor
          nextVisitHospital: undefined,
        }),
        applied: "Cleared your next appointment.",
      };
    }
    case "log_side_effect": {
      const hl = healthLogsOrDefault(store);
      const entry: SideEffectLogEntry = {
        id: randomUUID(),
        loggedAtISO: new Date().toISOString(),
        description: op.description.trim().slice(0, 400),
        intensity: op.intensity ?? "unspecified",
        relatedMedicationName: op.relatedMedicationName?.trim() || undefined,
      };
      return {
        store: { ...store, healthLogs: { ...hl, sideEffects: [entry, ...hl.sideEffects] } },
        applied: `Logged "${entry.description}" in your symptoms.`,
      };
    }
    case "clear_side_effects_matching": {
      const hl = healthLogsOrDefault(store);
      const q = op.query.trim().toLowerCase();
      const next = hl.sideEffects.filter((e) => !e.description.toLowerCase().includes(q));
      const removed = hl.sideEffects.length - next.length;
      if (removed === 0) return { store, skipped: `No symptom log entries mention "${op.query}".` };
      return {
        store: { ...store, healthLogs: { ...hl, sideEffects: next } },
        applied: `Cleared ${removed} symptom entr${removed === 1 ? "y" : "ies"} matching "${op.query}".`,
      };
    }
    case "set_reminder": {
      const hl = healthLogsOrDefault(store);
      const target = op.medicationName.trim().toLowerCase();
      const filtered = hl.medicationReminders.filter(
        (r) => r.medicationName.toLowerCase() !== target,
      );
      const entry: MedicationReminderEntry = {
        id: randomUUID(),
        medicationName: titleCase(op.medicationName),
        timeLocalHHmm: op.timeLocalHHmm,
        repeatDaily: op.repeatDaily,
        enabled: true,
        createdAtISO: new Date().toISOString(),
      };
      return {
        store: { ...store, healthLogs: { ...hl, medicationReminders: [entry, ...filtered] } },
        applied: `Reminder set for ${entry.medicationName} at ${entry.timeLocalHHmm}${entry.repeatDaily ? " daily" : " once"}.`,
      };
    }
    case "cancel_reminder": {
      const hl = healthLogsOrDefault(store);
      const target = op.medicationName.trim().toLowerCase();
      const next = hl.medicationReminders.map((r) =>
        r.medicationName.toLowerCase() === target ? { ...r, enabled: false } : r,
      );
      const changed = next.some((r, i) => r.enabled !== hl.medicationReminders[i].enabled);
      if (!changed) return { store, skipped: `No active reminder for ${op.medicationName}.` };
      return {
        store: { ...store, healthLogs: { ...hl, medicationReminders: next } },
        applied: `Stopped reminders for ${op.medicationName}.`,
      };
    }
    case "set_interval_reminder": {
      const hl = healthLogsOrDefault(store);
      const existing = hl.intervalReminders ?? [];
      const targetLabel = op.label.trim().toLowerCase();
      // Disable any existing reminder with the same label first (replace semantics)
      const filtered = existing.map((r) =>
        r.label.trim().toLowerCase() === targetLabel ? { ...r, enabled: false } : r,
      );
      const entry: import("@/lib/types").IntervalReminderEntry = {
        id: randomUUID(),
        label: op.label.trim(),
        intervalMinutes: op.intervalMinutes,
        windowStartHHmm: op.windowStartHHmm,
        windowEndHHmm: op.windowEndHHmm,
        bottleMl: op.bottleMl,
        enabled: true,
        createdAtISO: new Date().toISOString(),
        startingFromHHmm: op.startingFromHHmm,
      };
      const every = op.intervalMinutes >= 60
        ? `every ${op.intervalMinutes / 60}h`
        : `every ${op.intervalMinutes}min`;
      return {
        store: { ...store, healthLogs: { ...hl, intervalReminders: [...filtered, entry] } },
        applied: `Set reminder: "${op.label}" ${every}, ${op.windowStartHHmm}–${op.windowEndHHmm}.`,
      };
    }
    case "cancel_interval_reminder": {
      const hl = healthLogsOrDefault(store);
      const target = op.label.trim().toLowerCase();
      const existing = hl.intervalReminders ?? [];
      const next = existing.map((r) =>
        r.label.trim().toLowerCase() === target ? { ...r, enabled: false } : r,
      );
      const changed = next.some((r, i) => r.enabled !== existing[i].enabled);
      if (!changed) return { store, skipped: `No active interval reminder matching "${op.label}".` };
      return {
        store: { ...store, healthLogs: { ...hl, intervalReminders: next } },
        applied: `Stopped interval reminders for "${op.label}".`,
      };
    }
    case "set_profile_field": {
      // Only allow exactly-listed fields. The Zod schema already enforces this.
      const profile = { ...store.profile, [op.field]: op.value.trim() };
      return {
        store: { ...store, profile },
        applied: `Updated your ${humanFieldLabel(op.field)} to ${op.value.trim()}.`,
      };
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function cloneStore(store: PatientStore): PatientStore {
  // Cheap structured clone; the store fits comfortably in memory.
  return JSON.parse(JSON.stringify(store)) as PatientStore;
}

function setProfile(
  store: PatientStore,
  patch: Partial<PatientStore["profile"]>,
): PatientStore {
  return { ...store, profile: { ...store.profile, ...patch } };
}

function healthLogsOrDefault(store: PatientStore) {
  const hl = store.healthLogs ?? {
    bloodPressure: [],
    medicationIntake: [],
    sideEffects: [],
    medicationReminders: [],
    intervalReminders: [],
  };
  return {
    bloodPressure: hl.bloodPressure ?? [],
    medicationIntake: hl.medicationIntake ?? [],
    sideEffects: hl.sideEffects ?? [],
    medicationReminders: hl.medicationReminders ?? [],
    intervalReminders: (hl as { intervalReminders?: import("@/lib/types").IntervalReminderEntry[] }).intervalReminders ?? [],
  };
}

function containsCI(list: string[], v: string): boolean {
  const t = v.trim().toLowerCase();
  return list.some((x) => x.trim().toLowerCase() === t);
}

function looseMatch(a: string, b: string): boolean {
  const al = a.trim().toLowerCase();
  const bl = b.trim().toLowerCase();
  if (al === bl) return true;
  // Singular/plural tolerance
  if (al === bl + "s" || al + "s" === bl) return true;
  return false;
}

function sameNameCI(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function composeNextVisit(dateISO: string, timeHHmm?: string): string {
  // Accept "2026-05-15" or full ISO. If full ISO, return as-is.
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateISO)) return dateISO;
  const date = dateISO.slice(0, 10);
  const t = timeHHmm ?? "09:00";
  return `${date}T${t}:00`;
}

function humanFieldLabel(field: string): string {
  switch (field) {
    case "name":
      return "name";
    case "preferredName":
      return "preferred name";
    case "dob":
      return "date of birth";
    case "sex":
      return "sex";
    case "primaryCareProvider":
      return "regular doctor";
    case "nextVisitHospital":
      return "regular hospital";
    case "phone":
      return "phone number";
    case "email":
      return "email address";
    default:
      return field;
  }
}
