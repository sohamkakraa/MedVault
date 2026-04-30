/**
 * Detects reminder-set, reminder-cancel, and "list my reminders" intents in
 * incoming WhatsApp text. This is a deterministic pre-pass that runs BEFORE
 * the LLM call so that:
 *   1. We don't pay for a round-trip on a structured request
 *   2. The user gets an immediate, predictable confirmation
 *   3. The webapp's `MedicationReminderEntry` list stays in sync
 *
 * The parser is conservative — it only fires when the phrasing is clearly a
 * reminder request. Anything ambiguous falls through to the LLM.
 */
import { randomUUID } from "crypto";
import type { MedicationReminderEntry, PatientStore } from "@/lib/types";

export type ReminderIntent =
  | {
      kind: "set";
      medicationName: string;
      timeLocalHHmm: string;
      repeatDaily: boolean;
    }
  | { kind: "cancel"; medicationName: string }
  | { kind: "list" }
  | null;

/** Convert a freeform time fragment like "8am", "8:30 pm", "20:15" to "HH:mm". */
export function parseTimeToHHmm(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  // 24h "08:00", "8:30", "23:59"
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }
  // 12h "8am", "8:30am", "8 am", "8:30 pm"
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m12) {
    let h = Number(m12[1]);
    const min = m12[2] ? Number(m12[2]) : 0;
    const ampm = m12[3];
    if (h < 1 || h > 12 || min < 0 || min > 59) return null;
    if (ampm === "am") {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Parse a "remind me…" intent. Examples that match:
 *   "remind me to take Metformin at 8am every day"
 *   "remind me to take vitamin D at 8:30 pm daily"
 *   "set a reminder for losartan at 21:00"
 *   "stop reminders for metformin"
 *   "cancel my reminder for vitamin d"
 *   "list my reminders"
 */
export function parseReminderIntent(text: string): ReminderIntent {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  // List
  if (
    /(^|\b)(list|show|what are)( all)?( my)? reminders?\b/.test(lower) ||
    /\bwhat reminders? (do i have|are set)\b/.test(lower)
  ) {
    return { kind: "list" };
  }

  // Cancel
  const cancelMatch = lower.match(
    /\b(?:cancel|stop|remove|delete|disable)\b[^.]*?\breminders?\b[^.]*?\b(?:for|on|to take)\b\s+([a-z0-9 \-]+?)(?:[.?!]|$)/,
  );
  if (cancelMatch) {
    const name = cancelMatch[1].trim();
    if (name) return { kind: "cancel", medicationName: titleCase(name) };
  }

  // Set
  const setRegexes = [
    // "remind me to take <med> at <time> [every day|daily|once]"
    /\b(?:remind me to take|set (?:a )?reminder (?:to take|for))\s+([a-z0-9][a-z0-9 \-]{1,80}?)\s+(?:at\s+)?((?:\d{1,2}(?::\d{2})?\s*(?:am|pm))|(?:\d{1,2}:\d{2}))\s*(every day|daily|each day|once)?\b/,
    // "remind me about <med> at <time>"
    /\bremind me about\s+([a-z0-9][a-z0-9 \-]{1,80}?)\s+(?:at\s+)?((?:\d{1,2}(?::\d{2})?\s*(?:am|pm))|(?:\d{1,2}:\d{2}))\s*(every day|daily|each day|once)?\b/,
  ];
  for (const re of setRegexes) {
    const m = lower.match(re);
    if (!m) continue;
    const med = (m[1] ?? "").trim();
    const time = parseTimeToHHmm((m[2] ?? "").trim());
    if (!med || !time) continue;
    const repeatToken = (m[3] ?? "every day").toLowerCase();
    const repeatDaily = repeatToken !== "once";
    return {
      kind: "set",
      medicationName: titleCase(med),
      timeLocalHHmm: time,
      repeatDaily,
    };
  }

  return null;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Apply a parsed intent to a PatientStore copy. Returns the new store and a
 * human-friendly WhatsApp confirmation message. Does NOT persist — caller is
 * responsible for writing to prisma.patientRecord and serializing.
 */
export function applyReminderIntent(
  store: PatientStore,
  intent: NonNullable<ReminderIntent>,
): { store: PatientStore; reply: string } {
  const hl = store.healthLogs ?? { bloodPressure: [], medicationIntake: [], sideEffects: [], medicationReminders: [] };
  const reminders = hl.medicationReminders ?? [];

  if (intent.kind === "list") {
    if (reminders.filter((r) => r.enabled).length === 0) {
      return { store, reply: "You don't have any active reminders right now. Try: \"remind me to take Metformin at 8am every day\"." };
    }
    const lines = reminders
      .filter((r) => r.enabled)
      .map((r) => `• ${r.medicationName} at ${r.timeLocalHHmm}${r.repeatDaily ? " daily" : " (once)"}`);
    return { store, reply: `Your reminders:\n${lines.join("\n")}` };
  }

  if (intent.kind === "cancel") {
    const target = intent.medicationName.toLowerCase();
    const next = reminders.map((r) =>
      r.medicationName.toLowerCase() === target ? { ...r, enabled: false } : r,
    );
    const removedAny = next.some((r, i) => r.enabled !== reminders[i].enabled);
    if (!removedAny) {
      return { store, reply: `I couldn't find an active reminder for ${intent.medicationName}.` };
    }
    return {
      store: { ...store, healthLogs: { ...hl, medicationReminders: next } },
      reply: `Stopped reminders for ${intent.medicationName}. ✅`,
    };
  }

  // set — replace any existing same-medication reminder so we don't pile up duplicates
  const target = intent.medicationName.toLowerCase();
  const filtered = reminders.filter((r) => r.medicationName.toLowerCase() !== target);
  const entry: MedicationReminderEntry = {
    id: randomUUID(),
    medicationName: intent.medicationName,
    timeLocalHHmm: intent.timeLocalHHmm,
    repeatDaily: intent.repeatDaily,
    enabled: true,
    createdAtISO: new Date().toISOString(),
  };
  return {
    store: { ...store, healthLogs: { ...hl, medicationReminders: [entry, ...filtered] } },
    reply: `Got it — I'll remind you to take ${intent.medicationName} at ${intent.timeLocalHHmm}${intent.repeatDaily ? " every day" : " once"}. You'll see this in the webapp under Medication reminders too.`,
  };
}
