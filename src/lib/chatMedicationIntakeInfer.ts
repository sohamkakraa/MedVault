import type { MedicationIntakeLogEntry, MedicationProductCategory, PatientStore } from "@/lib/types";

/** Fields the chat API returns so the client can append a Health log row (client assigns `id`). */
export type MedicationIntakeChatPatch = Pick<MedicationIntakeLogEntry, "medicationName" | "action" | "notes">;

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function titleCaseMedName(raw: string): string {
  const t = normalizeWs(raw);
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((w) => (w.length <= 3 && /^(b|d|d3|b6|b12|iu)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function isJunkMedicationToken(s: string): boolean {
  return /^(today|tonight|yesterday|this|morning|evening|dose|my)$/i.test(normalizeWs(s));
}

/** Longest medication name on file that appears in the utterance (case-insensitive). */
function matchMedicationFromStore(qLower: string, store: PatientStore): string | null {
  const meds = store.meds ?? [];
  const names = meds.map((m) => m.name.trim()).filter(Boolean);
  names.sort((a, b) => b.length - a.length);
  for (const n of names) {
    if (qLower.includes(n.toLowerCase())) return n;
  }
  return null;
}

/**
 * Extract a medicine phrase after "my … med|pill|dose" etc., or after missed/forgot + "my".
 */
function extractFreeMedicationPhrase(q: string): string | null {
  const patterns: RegExp[] = [
    /\bmy\s+([^\n,.!?]{1,48}?)\s+(?:med|medicine|medication|pill|pills|tablet|tablets|capsule|capsules|dose|doses|supplement)\b/i,
    /\bmissed\s+([a-z0-9][a-z0-9\s\-\+]{1,40}?)(?=\s+today|\s+tonight|\s+this morning|\s+yesterday|\s*$)/i,
    /\bmissed\s+my\s+([^\n,.!?]{1,48}?)(?=\s+(?:med|medicine|pill|dose|today|tonight|this morning|yesterday)|\s*$)/i,
    /\bforgot(?:\s+to\s+take)?\s+my\s+([^\n,.!?]{1,48}?)(?=\s+(?:med|medicine|pill|dose|today|tonight)|\s*$)/i,
    /\bdidn'?t\s+take\s+my\s+([^\n,.!?]{1,48}?)(?=\s+(?:today|tonight|this morning|yesterday)|\s*$)/i,
    /\b(?:took|taken)\s+my\s+([^\n,.!?]{1,48}?)(?=\s+(?:today|tonight|this morning|just now)|\s*$)/i,
  ];
  for (const re of patterns) {
    const m = q.match(re);
    if (m?.[1]) {
      const inner = normalizeWs(m[1]).replace(/\s+med$/i, "").trim();
      if (inner.length >= 2 && inner.length <= 60 && !isJunkMedicationToken(inner)) return inner;
    }
  }
  return null;
}

function inferAction(q: string): MedicationIntakeLogEntry["action"] | null {
  const ql = q.toLowerCase();
  if (/\b(extra dose|took (an |a )?extra|double dose|took (it |my )?twice|took two)\b/i.test(q)) return "extra";
  if (/\b(skipped on purpose|intentionally skipped|decided not to take|didn'?t want to take|avoided (my |the )?dose)\b/i.test(q))
    return "skipped";
  if (/\b(missed|forgot(?: to take)?|didn'?t take|did not take|failed to take)\b/i.test(q)) return "missed";
  if (
    /\b(took my|took the|have taken|remembered to take|just took my|just took)\b/i.test(q) &&
    !/\b(blood pressure|bp reading|temperature|temp\b|shower|walk|bus|nap|bath)\b/i.test(ql)
  ) {
    if (/\b(pill|med|medicine|dose|tablet|capsule|supplement|vitamin|omega|insulin|spray|inhaler|patch|drop)\b/i.test(q)) return "taken";
    if (/\bmy\s+[a-z]/i.test(q)) return "taken";
  }
  return null;
}

/**
 * Best-effort: if the user clearly reports a dose event and we can infer a medicine name, return a patch for Health log.
 * Client persists; not a medical device.
 */
export function inferMedicationIntakeFromUtterance(rawQuestion: string, store: PatientStore): MedicationIntakeChatPatch | null {
  const q = normalizeWs(rawQuestion);
  if (q.length < 6) return null;

  const action = inferAction(q);
  if (!action) return null;

  const ql = q.toLowerCase();
  const fromStore = matchMedicationFromStore(ql, store);
  const fromPhrase = extractFreeMedicationPhrase(q);
  const nameRaw = fromStore ?? fromPhrase;
  if (!nameRaw) return null;

  const medicationName = fromStore ?? titleCaseMedName(nameRaw);
  if (!medicationName || medicationName.length < 2) return null;

  return {
    medicationName: medicationName.slice(0, 200),
    action,
    notes: "From health chat",
  };
}

// ─── medication add inference ──────────────────────────────────────────────

/**
 * Fields returned when the chat detects an intent to add a new medication.
 * `productCategory` is filled server-side before sending to the client.
 */
export type MedicationAddChatPatch = {
  name: string;
  dose?: string;
  /** Dosage form string (pill, tablet, capsule, liquid, injection, spray, drops, ointment, cream, gel, patch, inhaler, powder). */
  form?: string;
  frequency?: string;
  productCategory?: MedicationProductCategory;
};

// Matches explicit "add / track / include / record …" at the start of the message
const ADD_TRIGGER_RE = /^(?:please\s+)?(?:add|track|include|record)\s+(?:a\s+)?(?:new\s+)?/i;
const DOSAGE_FORM_RE =
  /\b(pill|tablet|capsule|liquid|injection|spray|drops?|ointment|cream|gel|patch|inhaler|powder|suppository)\b/i;
const DOSE_INLINE_RE = /\b(\d+(?:\.\d+)?\s*(?:mg|mcg|ug|µg|g|ml|iu|units?))\b/i;
const FREQ_INLINE_RE =
  /\b(once(?:\s+a\s+day)?|twice(?:\s+a\s+day)?|daily|every\s*day|weekly|every\s*week|\d+\s*x\s*(?:per\s+|a\s+)?(?:day|week))\b/i;
const JUNK_SUFFIX_MEDS_RE =
  /\s+(?:to\s+)?(?:my\s+)?(?:medicines|medications|meds|list|records?|profile)\s*\.?$/i;

function extractNameDoseFreq(
  raw: string,
  form?: string
): MedicationAddChatPatch | null {
  let w = normalizeWs(raw);

  // Strip trailing "to my medicines / meds"
  w = w.replace(JUNK_SUFFIX_MEDS_RE, "").trim();

  // Extract dose
  const dm = DOSE_INLINE_RE.exec(w);
  let dose: string | undefined;
  if (dm) {
    dose = dm[1].trim();
    w = w.replace(dm[0], " ").trim();
  }

  // Extract frequency
  const fm = FREQ_INLINE_RE.exec(w);
  let frequency: string | undefined;
  if (fm) {
    frequency = fm[1].trim();
    w = w.replace(fm[0], " ").trim();
  }

  // Extract dosage form from name only if not already known
  let finalForm = form;
  if (!finalForm) {
    const ffm = DOSAGE_FORM_RE.exec(w);
    if (ffm) {
      finalForm = ffm[1].toLowerCase();
      w = w.replace(ffm[0], " ").trim();
    }
  }

  // Strip generic category words that don't belong in the name
  w = w
    .replace(/\bsupplement\b/gi, " ")
    .replace(/\b(a|an|the|my|new)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = w.split(/\s+/).filter((t) => t.length > 0 && !isJunkMedicationToken(t));
  if (!tokens.length) return null;

  const name = titleCaseMedName(tokens.join(" "));
  if (!name || name.length < 2) return null;

  return { name, dose, form: finalForm, frequency };
}

/**
 * If the user clearly asks to add / track a new medication return a patch; otherwise null.
 * This intentionally only matches explicit add-commands so it doesn't conflict with dose-event inference.
 */
export function inferMedicationAddFromUtterance(
  utterance: string
): MedicationAddChatPatch | null {
  const s = normalizeWs(utterance);
  if (!ADD_TRIGGER_RE.test(s)) return null;

  // Pattern A: "[trigger] [form] for/called/named [name]"  e.g. "add a pill for vitamin B12"
  const pA =
    /^(?:please\s+)?(?:add|track|include|record)\s+(?:a\s+)?(?:new\s+)?([a-z0-9]+)\s+(?:for|called|named|of)\s+(.+)/i.exec(
      s
    );
  if (pA) {
    const [, maybeForm, nameRaw] = pA;
    if (DOSAGE_FORM_RE.test(maybeForm)) {
      return extractNameDoseFreq(nameRaw, maybeForm.toLowerCase());
    }
  }

  // Pattern B: "[trigger] [name] as [a] [form]"  e.g. "add vitamin D3 as a capsule"
  const pB =
    /^(?:please\s+)?(?:add|track|include|record)\s+(?:a\s+)?(?:new\s+)?(.+?)\s+as\s+(?:a\s+)?([a-z]+)\s*$/i.exec(
      s
    );
  if (pB) {
    const [, nameRaw, maybeForm] = pB;
    if (DOSAGE_FORM_RE.test(maybeForm)) {
      return extractNameDoseFreq(nameRaw, maybeForm.toLowerCase());
    }
  }

  // Generic: "[trigger] [name with optional dose/freq/form]"
  const pG = /^(?:please\s+)?(?:add|track|include|record)\s+(?:a\s+)?(?:new\s+)?(.+)/i.exec(s);
  if (pG) {
    return extractNameDoseFreq(pG[1], undefined);
  }

  return null;
}

/** Extra system instructions when the user is adding a medication. */
export function buildMedicationAddLLMAugment(patch: MedicationAddChatPatch): string {
  const details = [patch.dose, patch.form, patch.frequency].filter(Boolean).join(", ");
  return [
    "### Medication addition (this message)",
    `The app has added **${patch.name}**${details ? ` (${details})` : ""} to the user's medicines list automatically.`,
    "In your reply: (1) Confirm it in past tense: \"Done — I've added [name] to your medicines.\" (2) If dose or frequency was not detected, ask for exactly one missing detail. (3) Do NOT tell them to navigate to Profile or Medicines — it is already saved. (4) Mention it will appear on their Dashboard.",
    "IMPORTANT: You did NOT set any reminder. Do not claim to have set, created, or scheduled any reminder or notification. The UI will offer clickable reminder buttons separately.",
  ].join("\n");
}

// ─── end medication add inference ──────────────────────────────────────────

// ─── medication update inference ───────────────────────────────────────────

/** Fields returned when the chat detects an intent to update an existing medication's details. */
export type MedicationUpdateChatPatch = {
  name: string;
  dose?: string;
  frequency?: string;
  form?: string;
};

/**
 * Attempt to pull dose + optional frequency out of a free-form string.
 * Returns null if nothing useful is found.
 */
function extractDoseFreqFromRaw(raw: string): Pick<MedicationUpdateChatPatch, "dose" | "frequency"> | null {
  let w = normalizeWs(raw);
  const dm = DOSE_INLINE_RE.exec(w);
  const dose = dm ? dm[1].trim() : undefined;
  if (dm) w = w.replace(dm[0], " ").trim();
  const fm = FREQ_INLINE_RE.exec(w);
  const frequency = fm ? fm[1].trim() : undefined;
  if (!dose && !frequency) return null;
  return { dose, frequency };
}

/**
 * Scan `msg` for any medication name that is currently in `store.meds` and a nearby
 * dose-inquiry phrase. Used to resolve context for bare dose replies like "1000 mcg".
 */
function findMedBeingAskedAbout(
  msg: string,
  store: PatientStore
): string | null {
  const lower = msg.toLowerCase();
  // Must look like the assistant was asking for dose/frequency info
  if (!/\b(dose|dosage|strength|how much|how many|bottle|tablet|mcg|mg|iu|frequency|schedule)\b/i.test(msg)) return null;
  return matchMedicationFromStore(lower, store);
}

/**
 * If the user is clearly updating dose / frequency for an already-stored medication, return a patch.
 * Handles three patterns:
 *  1. Explicit: "update/change/set [name] to [details]"
 *  2. Declarative: "[name] is [details]" / "[name]: [details]"
 *  3. Context-aware: last assistant message was asking about dose for a specific med → bare reply
 */
export function inferMedicationUpdateFromUtterance(
  utterance: string,
  store: PatientStore,
  recentHistory: Array<{ role: string; content: string }> = []
): MedicationUpdateChatPatch | null {
  const u = normalizeWs(utterance);
  if (!u || u.length < 3) return null;

  // — Pattern 1: explicit update command —
  // "update/change/set/edit my B12 to 1000 mcg once daily"
  const p1 =
    /^(?:please\s+)?(?:update|change|set|edit|modify)\s+(?:my\s+)?(.+?)\s+(?:dose\s+)?to\s+(.+)/i.exec(u);
  if (p1) {
    const matched = matchMedicationFromStore(p1[1].toLowerCase(), store);
    if (matched) {
      const details = extractDoseFreqFromRaw(p1[2]);
      if (details) return { name: matched, ...details };
    }
  }

  // — Pattern 2: declarative — "[name] is [details]" / "[name]: [details]"
  const p2 = /^(.+?)\s*(?:is|are|:)\s+(.+)/i.exec(u);
  if (p2) {
    const matched = matchMedicationFromStore(p2[1].toLowerCase(), store);
    if (matched) {
      const details = extractDoseFreqFromRaw(p2[2]);
      if (details) return { name: matched, ...details };
    }
  }

  // — Pattern 3: context-aware —
  // If the user's message looks like ONLY a dose / frequency (no named medication),
  // and the last assistant turn was asking about dose for a specific stored med, infer an update.
  const hasDoseOrFreq = DOSE_INLINE_RE.test(u) || FREQ_INLINE_RE.test(u);
  const noMedNameInUtterance = !matchMedicationFromStore(u.toLowerCase(), store);
  if (hasDoseOrFreq && noMedNameInUtterance && recentHistory.length > 0) {
    // Walk backwards to find the most recent assistant message that was asking about dose
    for (let i = recentHistory.length - 1; i >= 0; i--) {
      const msg = recentHistory[i];
      if (msg.role !== "assistant") continue;
      const contextMed = findMedBeingAskedAbout(msg.content, store);
      if (contextMed) {
        const details = extractDoseFreqFromRaw(u);
        if (details) return { name: contextMed, ...details };
      }
      break; // only look one assistant message back
    }
  }

  return null;
}

/** Extra system instructions when the user is updating a medication's details. */
export function buildMedicationUpdateLLMAugment(patch: MedicationUpdateChatPatch): string {
  const parts: string[] = [];
  if (patch.dose) parts.push(`dose → ${patch.dose}`);
  if (patch.frequency) parts.push(`frequency → ${patch.frequency}`);
  const detail = parts.join(", ");
  return [
    "### Medication update (this message)",
    `The app has updated **${patch.name}** on the user's medicines list (${detail}).`,
    "In your reply: (1) Confirm in past tense: \"Done — I've updated [name] to [details].\". (2) Optionally add one brief health tip (e.g. best time to take B12). (3) Do NOT tell them to navigate anywhere — the Dashboard already reflects the change. (4) Ask at most one follow-up.",
    "IMPORTANT: You did NOT set any reminder. Do not claim to have set, created, or scheduled any reminder or notification — ever. Only the UI reminder buttons can create reminders. If you mention reminders, say \"tap the reminder button that appears below\" — never \"I've set a reminder\".",
  ].join("\n");
}

// ─── end medication update inference ───────────────────────────────────────

/** Whether the message likely describes adherence / dosing (for LLM hint even if infer returns null). */
export function utteranceMentionsDoseEvent(rawQuestion: string): boolean {
  const q = normalizeWs(rawQuestion).toLowerCase();
  if (q.length < 6) return false;
  return /\b(missed|forgot|didn'?t take|did not take|skipped|extra dose|took my|just took|remembered to take|adherence|dose)\b/i.test(q);
}

/** Extra system instructions when the user may be reporting a dose event (for the chat LLM). */
export function buildMedicationDiaryLLMAugmentFromPatch(
  patch: MedicationIntakeChatPatch | null,
  question: string
): string {
  if (patch) {
    return [
      "### Medication diary (this message)",
      `A Health log row is saved on their device with this chat response: **${patch.action}** · **${patch.medicationName}**.`,
      "In your reply: (1) Brief plain-language reassurance when appropriate—**not** a diagnosis. (2) **Say clearly that this was saved to their Health log on this device** (past tense). (3) Ask **exactly one** concrete follow-up (e.g. any side effects, sleep last night, whether they want a reminder for the next dose). (4) Suggest **Health log → Medication reminders** for gentle ongoing check-ins. (5) Keep your usual **Next steps** block—do not end with only a generic “anything else?” closer.",
    ].join("\n");
  }
  if (utteranceMentionsDoseEvent(question)) {
    return [
      "### Medication diary",
      "The user seems to describe a dose or adherence event, but the **medicine name was not clear enough** to log automatically.",
      "Ask **one** short question to get the exact medicine and what happened (missed / skipped on purpose / extra dose / took it). Say that a short follow-up like “Missed my metformin this morning” lets UMA log it from chat.",
    ].join("\n");
  }
  return "";
}
