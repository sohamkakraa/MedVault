/**
 * classifyIntent — LLM-driven detection of any add/remove/set intent on the
 * patient store. Returns a StorePatch when the user's message clearly asks
 * for a structured mutation; otherwise returns null and the caller falls
 * through to the normal conversational LLM call.
 *
 * Why a dedicated call instead of bolting this onto the main chat call:
 * we want a SMALL, FAST model with a STRICT tool schema and zero room for
 * hallucinated fields. The chat reply needs context, retries, and free-form
 * formatting; mixing the two muddies both. The classifier runs first; if it
 * commits a patch, the user gets a deterministic confirmation reply
 * generated from the applier's `applied` lines (no second LLM call).
 *
 * Cost: one tool-use round-trip on the cheapest available Claude model.
 * Latency: typically 300–700 ms. Fast paths (deterministic reminderIntent,
 * conditionIntent) run BEFORE this so the most common requests skip it.
 *
 * Failure mode: any error → return null. The chat continues normally; the
 * user can rephrase or do the change in the UI. We never silently mutate
 * the store on a degraded LLM response.
 */
import type { PatientStore } from "@/lib/types";
import { StorePatchSchema, type StorePatch } from "./storePatch";

/**
 * Anthropic tool schema for `propose_store_patch`. Mirrors StorePatchSchema
 * structurally, but specified in JSON-Schema form because that's what the
 * Anthropic SDK expects for `tools[].input_schema`. Any change to the Zod
 * schema needs a matching change here — covered by a runtime sanity check
 * inside classifyIntent that validates the LLM's tool-use payload through
 * the Zod schema before applying.
 */
const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  required: ["ops", "summary"],
  properties: {
    summary: {
      type: "string",
      description:
        "One-sentence plain-English description of every op in `ops`, written in second person ('Adding peanuts to your allergies').",
    },
    ops: {
      type: "array",
      maxItems: 10,
      items: {
        oneOf: [
          opLeaf("add_condition", { value: stringLeaf(120) }),
          opLeaf("remove_condition", { value: stringLeaf(120) }),
          opLeaf("add_allergy", { value: stringLeaf(120) }),
          opLeaf("remove_allergy", { value: stringLeaf(120) }),
          opLeaf(
            "add_medication",
            {
              name: stringLeaf(120),
              dose: stringLeaf(60, true),
              frequency: stringLeaf(120, true),
              usualTimeLocalHHmm: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
            },
            ["name"],
          ),
          opLeaf("remove_medication", { name: stringLeaf(120) }),
          opLeaf("add_doctor", { name: stringLeaf(120) }),
          opLeaf("remove_doctor", { name: stringLeaf(120) }),
          opLeaf("add_hospital", { name: stringLeaf(120) }),
          opLeaf("remove_hospital", { name: stringLeaf(120) }),
          opLeaf(
            "set_next_appointment",
            {
              doctor: stringLeaf(120, true),
              clinic: stringLeaf(120, true),
              dateISO: { type: "string", description: "ISO date 'YYYY-MM-DD' or full ISO datetime." },
              timeHHmm: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
            },
            [],
          ),
          opLeaf("clear_next_appointment", {}, []),
          opLeaf(
            "log_side_effect",
            {
              description: stringLeaf(400),
              intensity: { type: "string", enum: ["mild", "moderate", "strong", "unspecified"] },
              relatedMedicationName: stringLeaf(120, true),
            },
            ["description"],
          ),
          opLeaf("clear_side_effects_matching", { query: stringLeaf(120) }),
          opLeaf(
            "set_reminder",
            {
              medicationName: stringLeaf(120),
              timeLocalHHmm: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
              repeatDaily: { type: "boolean" },
            },
            ["medicationName", "timeLocalHHmm"],
          ),
          opLeaf("cancel_reminder", { medicationName: stringLeaf(120) }),
          opLeaf(
            "set_profile_field",
            {
              field: {
                type: "string",
                enum: [
                  "name",
                  "preferredName",
                  "dob",
                  "sex",
                  "primaryCareProvider",
                  "nextVisitHospital",
                  "phone",
                  "email",
                ],
              },
              value: stringLeaf(200),
            },
            ["field", "value"],
          ),
        ],
      },
    },
  },
};

function stringLeaf(maxLength: number, optional = false) {
  return optional
    ? { type: "string" as const, maxLength }
    : { type: "string" as const, minLength: 1, maxLength };
}

function opLeaf(
  kind: string,
  fields: Record<string, unknown>,
  required: string[] = Object.keys(fields),
) {
  return {
    type: "object" as const,
    required: ["kind", ...required],
    properties: {
      kind: { type: "string", const: kind },
      ...fields,
    },
    additionalProperties: false,
  };
}

/**
 * Build a compact context summary the LLM sees so it can validate proposed
 * removals (e.g. "remove peanuts" should only fire if peanuts is actually
 * in the allergies list). Keeps the prompt under ~300 tokens.
 */
function summarizeStore(store: PatientStore | null): string {
  if (!store) return "(no patient record on file)";
  const profile = store.profile ?? {};
  const lines: string[] = [];
  if (profile.conditions?.length) lines.push(`conditions: ${profile.conditions.slice(0, 12).join(", ")}`);
  if (profile.allergies?.length) lines.push(`allergies: ${profile.allergies.slice(0, 12).join(", ")}`);
  if (store.meds?.length)
    lines.push(
      `medications: ${store.meds
        .slice(0, 10)
        .map((m) => m.name + (m.dose ? ` (${m.dose})` : ""))
        .join(", ")}`,
    );
  if (profile.doctorQuickPick?.length)
    lines.push(`doctors: ${profile.doctorQuickPick.slice(0, 8).join(", ")}`);
  if (profile.facilityQuickPick?.length)
    lines.push(`hospitals: ${profile.facilityQuickPick.slice(0, 8).join(", ")}`);
  return lines.join("\n") || "(empty record)";
}

const SYSTEM_PROMPT = `You are an intent classifier for a personal health app.

Given the user's message and a summary of what's already in their patient record, decide whether they are asking to ADD, REMOVE, or UPDATE something.

If yes, call the propose_store_patch tool with one or more ops describing the change. If no — if the user is asking a question, having a conversation, or saying something ambiguous — DO NOT call the tool. Just respond with a brief acknowledgement and the orchestrator will route the message to the conversational agent.

Hard rules:
1. Never invent data. Only propose ops the user explicitly asked for.
2. Removals must match something already in the record. If they ask to remove "X" but X isn't in the record, do NOT call the tool — let the conversational agent explain.
3. Use the user's wording for names. Don't expand abbreviations or correct spellings without certainty.
4. If the user is asking a question (e.g. "what conditions do I have?"), do NOT call the tool — that is a question, not a mutation.
5. Be conservative — if you're unsure whether the user is asking for a change or just chatting, do not call the tool.
6. Times must be 24-hour HH:mm. Convert "8am" to "08:00", "8:30 pm" to "20:30".
7. Dates must be ISO YYYY-MM-DD. If the user says a relative date ("tomorrow", "next Friday"), pass the absolute date computed from today.

If you call the tool, the patch is applied automatically and the user gets a deterministic confirmation. So one well-formed tool call is enough — do NOT also write a long natural-language reply.`;

const USER_TEMPLATE = (storeSummary: string, userMsg: string, todayISO: string) =>
  `Today is ${todayISO}.

Patient record summary:
${storeSummary}

User said:
"""${userMsg}"""

Decide whether to call propose_store_patch.`;

/**
 * Run the classifier. Returns a validated StorePatch or null.
 *
 * Caller MUST:
 *   - run deterministic parsers (reminderIntent, conditionIntent) first
 *   - persist the resulting store with patientRecord.upsert
 *   - reply to the user using the applier's `applied`/`skipped` lines
 */
export async function classifyIntent(
  userMessage: string,
  store: PatientStore | null,
): Promise<StorePatch | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const trimmed = userMessage.trim();
  if (trimmed.length < 4 || trimmed.length > 4000) return null;

  // Cheap heuristic prefilter — if the message has no imperative or
  // declarative cue, skip the LLM entirely. Saves cost on plain questions
  // ("what was my last HbA1c?") and chitchat.
  if (!looksLikeMutationIntent(trimmed)) return null;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });
    const model =
      process.env.ANTHROPIC_INTENT_MODEL ||
      process.env.ANTHROPIC_MODEL ||
      "claude-haiku-4-5-20251001";

    const todayISO = new Date().toISOString().slice(0, 10);
    const completion = await anthropic.messages.create({
      model,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "propose_store_patch",
          description:
            "Apply a structured change to the patient's record (add/remove/update conditions, allergies, medications, doctors, hospitals, appointment, side effects, reminders, or profile fields).",
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      messages: [
        {
          role: "user",
          content: USER_TEMPLATE(summarizeStore(store), trimmed, todayISO),
        },
      ],
    });

    // Find the first tool_use block addressed to our tool.
    const toolUse = completion.content.find(
      (b) => b.type === "tool_use" && (b as { name?: string }).name === "propose_store_patch",
    ) as { input?: unknown } | undefined;
    if (!toolUse?.input) return null;

    const parsed = StorePatchSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      // Don't throw — just bail. The conversational LLM will pick this up.
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Quick gate to avoid an LLM call on messages that obviously aren't
 * mutation requests. Tuned conservatively — false negatives are fine (we'd
 * rather miss a few weird phrasings than burn cost on every chat tick).
 */
function looksLikeMutationIntent(msg: string): boolean {
  const m = msg.toLowerCase();
  // Imperative cues
  if (/\b(add|remove|delete|set|change|update|cancel|stop|forget|clear|book|schedule|log|register|note that|make a note)\b/.test(m)) return true;
  // Self-statements
  if (/\bi (have|am|'m|got|don'?t have|no longer|stopped|started|need|want)\b/.test(m)) return true;
  if (/\bmy (\w+\s+){0,2}(is|are|has|have|was|were|hurts?|aches?)\b/.test(m)) return true;
  // Phrasings the deterministic parsers might miss
  if (/\b(allerg(y|ies|ic)|medicine|medication|appointment|doctor|hospital|symptom|condition|reminder)\b/.test(m)) return true;
  return false;
}
