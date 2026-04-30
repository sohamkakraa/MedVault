/**
 * Detect "my X is gone / resolved / cleared" type statements in a chat
 * message and apply them to the patient store.
 *
 * Why this lives in the WhatsApp folder even though the webapp uses it too:
 * conditionIntent and reminderIntent are siblings — both are deterministic
 * pre-passes that mutate the PatientStore before any LLM call. The webapp's
 * threaded chat route imports both, the WhatsApp processor imports both,
 * and behavior stays consistent across surfaces. Keeping them in
 * `lib/whatsapp/` as the canonical location is easier than splitting them.
 *
 * What it handles:
 *   1. Resolution: "my headache is gone", "the cough is finally cleared up",
 *      "I no longer have back pain", "the rash has resolved" — removes the
 *      symptom from `profile.conditions` AND closes any open
 *      `healthLogs.sideEffects` entries that mention it.
 *   2. Onset (light): "I'm having a headache", "I have a fever today" —
 *      adds a sideEffects entry but DOES NOT add to `profile.conditions`.
 *      Symptoms today are not chronic conditions; we keep that distinction.
 */
import { randomUUID } from "crypto";
import type { PatientStore, SideEffectLogEntry } from "@/lib/types";

export type ConditionIntent =
  | { kind: "resolved"; symptom: string }
  | { kind: "onset"; symptom: string }
  | null;

/**
 * A small, intentionally-conservative regex catalog. False negatives are
 * fine — the user can always type more explicit phrasing or click the X
 * next to a condition on the profile page. False positives would silently
 * delete medical history, which is much worse, so we err toward caution.
 */
export function parseConditionIntent(text: string): ConditionIntent {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  // Resolution patterns. The captured group is the symptom phrase.
  const resolutionRegexes: RegExp[] = [
    // "my headache is gone" / "my headaches are gone now"
    /\bmy\s+([a-z][a-z\s\-]{1,40}?)\s+(?:is|are|has|have|'s|'ve)\s+(?:finally\s+)?(?:gone|cleared(?:\s+up)?|resolved|over|better|fixed|healed)\b/,
    // "the headache is gone"
    /\bthe\s+([a-z][a-z\s\-]{1,40}?)\s+(?:is|are|has|have|'s|'ve)\s+(?:finally\s+)?(?:gone|cleared(?:\s+up)?|resolved|over|better|fixed|healed)\b/,
    // "headache is gone" (no determiner — riskier, so we require "gone" or "resolved" specifically)
    /^([a-z][a-z\s\-]{1,40}?)\s+(?:is|are)\s+(?:gone|resolved)\b/,
    // "I no longer have / I don't have any more"
    /\bi\s+(?:no longer have|don'?t have any more|don'?t have)\s+(?:a |an |the )?([a-z][a-z\s\-]{1,40}?)(?:[.?!]|\s+anymore|$)/,
    // "I don't feel X anymore"
    /\bi\s+don'?t\s+feel\s+([a-z][a-z\s\-]{1,40}?)\s+anymore\b/,
    // "fever broke", "rash cleared"
    /\b(?:my\s+)?([a-z][a-z\s\-]{1,40}?)\s+(?:broke|cleared)\b/,
  ];
  for (const re of resolutionRegexes) {
    const m = lower.match(re);
    if (!m) continue;
    const symptom = cleanSymptomPhrase(m[1]);
    if (symptom) return { kind: "resolved", symptom };
  }

  // Onset patterns. Conservative — we only match very plain phrasings.
  const onsetRegexes: RegExp[] = [
    /\bi\s+(?:have|'ve got|got|am having|'m having)\s+(?:a |an )?([a-z][a-z\s\-]{1,40}?)(?:[.?!]|$)/,
    /\bi\s+feel\s+([a-z][a-z\s\-]{1,40}?)(?:[.?!]|$)/,
    /\b(?:experiencing|suffering from)\s+(?:a |an |some )?([a-z][a-z\s\-]{1,40}?)(?:[.?!]|$)/,
  ];
  for (const re of onsetRegexes) {
    const m = lower.match(re);
    if (!m) continue;
    const symptom = cleanSymptomPhrase(m[1]);
    if (!symptom) continue;
    // Reject onset matches that are clearly NOT symptoms ("I have a question",
    // "I have a meeting"). Stop-words guard against the most common false
    // positives — we don't try to be exhaustive.
    if (NON_SYMPTOM_STOPWORDS.has(symptom.toLowerCase())) continue;
    return { kind: "onset", symptom };
  }

  return null;
}

const NON_SYMPTOM_STOPWORDS = new Set([
  "question",
  "meeting",
  "appointment",
  "doubt",
  "doctor",
  "report",
  "medicine",
  "medication",
  "test",
  "result",
  "results",
  "thing",
  "issue",
  "problem", // ambiguous — could be symptomatic; we'd rather miss than false-fire
  "concern",
  "feeling", // "I feel a feeling" type loops
  "good",
  "fine",
  "ok",
  "okay",
  "great",
  "well",
  "better", // "I feel better" handled by resolution path
]);

function cleanSymptomPhrase(raw: string): string {
  const trimmed = raw
    .replace(/\s+/g, " ")
    .replace(/[.?!,;:]+$/g, "")
    .trim();
  if (trimmed.length < 2 || trimmed.length > 60) return "";
  // Strip leading articles
  const stripped = trimmed.replace(/^(a |an |the |some |any )/, "");
  return titleCase(stripped);
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Apply a parsed intent to a copy of the store. Caller persists.
 */
export function applyConditionIntent(
  store: PatientStore,
  intent: NonNullable<ConditionIntent>,
): { store: PatientStore; reply: string } {
  if (intent.kind === "resolved") {
    const target = intent.symptom.toLowerCase();
    const conditions = store.profile.conditions ?? [];
    // Remove case-insensitively and also strip near-matches ("Headaches" → "Headache")
    const remainingConditions = conditions.filter((c) => {
      const lc = c.trim().toLowerCase();
      if (lc === target) return false;
      // simple plural/singular tolerance: "headache" vs "headaches"
      if (lc === target + "s" || lc + "s" === target) return false;
      return true;
    });
    const removedCondition = remainingConditions.length !== conditions.length;

    // Also clear unresolved side-effect log entries that mention the symptom.
    const hl = store.healthLogs ?? {
      bloodPressure: [],
      medicationIntake: [],
      sideEffects: [] as SideEffectLogEntry[],
      medicationReminders: [],
    };
    const remainingSideEffects = (hl.sideEffects ?? []).filter(
      (e) => !e.description.toLowerCase().includes(target),
    );
    const removedSideEffects = remainingSideEffects.length !== (hl.sideEffects ?? []).length;

    if (!removedCondition && !removedSideEffects) {
      // Nothing matched — return the store unchanged. The LLM will handle
      // the conversation naturally.
      return {
        store,
        reply: `Glad to hear ${intent.symptom.toLowerCase()} is better. I didn't find it in your medical history or symptom log, so nothing to remove there.`,
      };
    }

    return {
      store: {
        ...store,
        profile: { ...store.profile, conditions: remainingConditions },
        healthLogs: { ...hl, sideEffects: remainingSideEffects },
      },
      reply: `Removed ${intent.symptom.toLowerCase()} from your medical history${removedSideEffects ? " and cleared the matching symptom log entries" : ""}. ✅`,
    };
  }

  // onset
  const symptom = intent.symptom;
  const hl = store.healthLogs ?? {
    bloodPressure: [],
    medicationIntake: [],
    sideEffects: [] as SideEffectLogEntry[],
    medicationReminders: [],
  };
  const entry: SideEffectLogEntry = {
    id: randomUUID(),
    loggedAtISO: new Date().toISOString(),
    description: symptom,
    intensity: "unspecified",
  };
  return {
    store: {
      ...store,
      healthLogs: { ...hl, sideEffects: [entry, ...(hl.sideEffects ?? [])] },
    },
    reply: `Logged ${symptom.toLowerCase()} in your symptoms list. Tell me when it's gone and I'll clear it.`,
  };
}
