/**
 * /api/tidy — beta data-hygiene pass.
 *
 * Reads the user's PatientStore, asks the LLM to find any add/remove/update
 * that would clean up data quality (mis-categorized entries, duplicates,
 * doctor names mentioned in reports but missing from the dropdown), and
 * returns a StorePatch the client can review and apply.
 *
 * Why this rewrite (v2): the v1 prompt asked the LLM for free-form JSON in
 * a markdown fence and parsed it with regex. If a single field was off, the
 * whole response failed the schema check and the user silently got a
 * regex-only heuristic fallback labelled "LLM did not return parseable
 * JSON". Anthropic's tool-use guarantees a typed payload, eliminates the
 * brittle parsing path, and lets Tidy share the exact `propose_store_patch`
 * tool schema and op vocabulary as the chat intent classifier — so what
 * Tidy can change == what the chat agent can change == what is auditable
 * and applied through the same `applyStorePatch` pipeline.
 *
 * Industry: digital health. We never log patient content, only counts.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/server/authSession";
import { prisma } from "@/lib/prisma";
import { parsePatientStoreJson } from "@/lib/patientStoreApi";
import { StorePatchSchema, StorePatchOpSchema, type StorePatchOp } from "@/lib/intent/storePatch";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── Internal store shape (loaded server-side from DB) ────────────────────
type ParsedStore = {
  profile: {
    primaryCareProvider?: string | null;
    nextVisitHospital?: string | null;
    doctorQuickPick?: string[];
    facilityQuickPick?: string[];
    doctorQuickPickHidden?: string[];
    facilityQuickPickHidden?: string[];
    conditions?: string[];
    allergies?: string[];
    [key: string]: unknown;
  };
  docs: Array<{
    id: string;
    provider?: string | null;
    doctors?: string[];
    facilityName?: string | null;
    [key: string]: unknown;
  }>;
  meds?: Array<{
    name: string;
    dose?: string;
    frequency?: string;
    [key: string]: unknown;
  }>;
};

// ── Response shape ───────────────────────────────────────────────────────
type TidyResponse = {
  ok: true;
  source: "llm" | "heuristic" | "heuristic_fallback";
  ops: StorePatchOp[];
  summary: string;
  /** Optional explanatory note from the LLM about what it found. */
  note?: string;
};

// ── Anthropic tool schema ────────────────────────────────────────────────
// Subset of the propose_store_patch tool: Tidy is allowed to suggest the
// same ops the chat intent classifier can call, so the user never sees a
// kind of mutation in Tidy that they couldn't also achieve by chatting.
//
// We expose all ops; the conservative scoping lives in the system prompt.
const TIDY_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  required: ["ops", "summary"],
  properties: {
    summary: { type: "string", maxLength: 500 },
    ops: {
      type: "array",
      maxItems: 30,
      items: {
        oneOf: [
          op("add_condition", { value: str(120) }),
          op("remove_condition", { value: str(120) }),
          op("add_allergy", { value: str(120) }),
          op("remove_allergy", { value: str(120) }),
          op("add_medication", { name: str(120), dose: str(60, true), frequency: str(120, true) }, ["name"]),
          op("remove_medication", { name: str(120) }),
          op("add_doctor", { name: str(120) }),
          op("remove_doctor", { name: str(120) }),
          op("add_hospital", { name: str(120) }),
          op("remove_hospital", { name: str(120) }),
        ],
      },
    },
  },
};

function str(maxLength: number, optional = false) {
  return optional
    ? { type: "string" as const, maxLength }
    : { type: "string" as const, minLength: 1, maxLength };
}
function op(
  kind: string,
  fields: Record<string, unknown>,
  required: string[] = Object.keys(fields),
) {
  return {
    type: "object" as const,
    required: ["kind", ...required],
    properties: { kind: { type: "string", const: kind }, ...fields },
    additionalProperties: false,
  };
}

// ── Route ────────────────────────────────────────────────────────────────
export async function POST(_req: NextRequest) {
  // Fixed VULN-001: load the patient store from the database using the
  // authenticated userId. The client must NOT supply the store — a malicious
  // client could inject adversarial strings into the LLM system prompt via
  // crafted conditions, allergies, docs, or meds values.
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const dbRecord = await prisma.patientRecord.findUnique({ where: { userId } });
  if (!dbRecord?.data) {
    return NextResponse.json({ ok: false, error: "No health records found on the server. Sync your data first." }, { status: 404 });
  }
  const patientStore = parsePatientStoreJson(dbRecord.data);
  if (!patientStore) {
    return NextResponse.json({ ok: false, error: "Could not read your health records from the server." }, { status: 500 });
  }

  // Shape the DB-loaded store into the internal ParsedStore type.
  const store: ParsedStore = {
    profile: patientStore.profile as ParsedStore["profile"],
    docs: (patientStore.docs ?? []).slice(0, 500) as ParsedStore["docs"],
    meds: (patientStore.meds ?? []) as ParsedStore["meds"],
  };

  const docDoctorMentions = collectDocDoctorMentions(store);

  // No API key? Return the heuristic. Surface that clearly.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const heur = heuristicOps(store, docDoctorMentions);
    return NextResponse.json<TidyResponse>({
      ok: true,
      source: "heuristic",
      ops: heur.ops,
      summary: heur.summary,
      note: "Anthropic API key not configured — running pattern-based heuristics only.",
    });
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });
    const model =
      process.env.ANTHROPIC_TIDY_MODEL ||
      process.env.ANTHROPIC_MODEL ||
      "claude-haiku-4-5-20251001";

    const completion = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: TIDY_SYSTEM_PROMPT,
      tools: [
        {
          name: "propose_store_patch",
          description:
            "Propose data-hygiene fixes to the patient's record. Each op is reviewed and approved by the user before being applied.",
          input_schema: TIDY_TOOL_INPUT_SCHEMA,
        },
      ],
      messages: [
        { role: "user", content: buildUserMessage(store, docDoctorMentions) },
      ],
    });

    const toolUse = completion.content.find(
      (b) => b.type === "tool_use" && (b as { name?: string }).name === "propose_store_patch",
    ) as { input?: unknown } | undefined;

    if (!toolUse?.input) {
      // The LLM declined to call the tool — that's a valid "nothing to do" signal.
      return NextResponse.json<TidyResponse>({
        ok: true,
        source: "llm",
        ops: [],
        summary: "Your lists look clean — nothing to tidy.",
      });
    }

    const ok = StorePatchSchema.safeParse(toolUse.input);
    if (!ok.success) {
      // Tool input didn't validate. Fall back to heuristic but keep going.
      const heur = heuristicOps(store, docDoctorMentions);
      return NextResponse.json<TidyResponse>({
        ok: true,
        source: "heuristic_fallback",
        ops: heur.ops,
        summary: heur.summary,
        note: "AI response didn't match the expected shape — showing pattern-based suggestions instead.",
      });
    }

    return NextResponse.json<TidyResponse>({
      ok: true,
      source: "llm",
      ops: ok.data.ops,
      summary: ok.data.summary,
    });
  } catch (err) {
    const heur = heuristicOps(store, docDoctorMentions);
    return NextResponse.json<TidyResponse>({
      ok: true,
      source: "heuristic_fallback",
      ops: heur.ops,
      summary: heur.summary,
      note: err instanceof Error ? err.message.slice(0, 200) : "AI call failed.",
    });
  }
}

// ── Prompt + context builders ────────────────────────────────────────────
const TIDY_SYSTEM_PROMPT = `You are a data-hygiene assistant for a personal health app.

The user has lists of conditions, allergies, medications, doctors, and hospitals/clinics. Your job is to spot ENTRIES THAT ARE CLEARLY MIS-CATEGORIZED OR JUNK and propose corrections via the propose_store_patch tool.

Rules — these are HARD constraints, not suggestions:

1. **Doctors list = PEOPLE.** "Dr. Asha Iyer", "Dr Patel", "Sharma". Names with "hospital", "clinic", "centre/center", "diagnostic", "labs", "polyclinic", "nursing home", "imaging" are facilities, not people. Propose remove_doctor + add_hospital to move them.

2. **Hospitals list = FACILITIES.** Person names there should be moved with remove_hospital + add_doctor.

3. **Add genuine doctor names mentioned in uploaded documents** that aren't already in the dropdown — but ONLY if they clearly look like person names ("Dr ...", "Dr. ..."). Do not invent names.

4. **Remove obviously junk entries** — single letters, empty strings, test data like "asdf".

5. **Do NOT touch conditions, allergies, or medications unless there is a clear, unambiguous quality issue** (e.g. an exact duplicate, or a clearly malformed entry like "<script>"). When in doubt, leave them alone — those are health-critical and the user almost always has a reason.

6. **Reproduce strings exactly as they appear** in the input. Do not correct spelling. Do not expand abbreviations.

7. If everything looks fine, do not call the tool at all. The orchestrator will tell the user nothing needs tidying.

Output a single tool call per response. Each op describes ONE atomic change. Pair related ops (remove + add) to express moves between lists.`;

function buildUserMessage(store: ParsedStore, docDoctorMentions: string[]): string {
  const lines: string[] = [];
  lines.push("Doctors list (should be people):");
  lines.push(formatList(store.profile.doctorQuickPick ?? []));
  lines.push("");
  lines.push("Hospitals/clinics list (should be facilities):");
  lines.push(formatList(store.profile.facilityQuickPick ?? []));
  lines.push("");
  if (docDoctorMentions.length > 0) {
    lines.push("Doctor names found in uploaded documents but NOT in the dropdown:");
    lines.push(formatList(docDoctorMentions.slice(0, 30)));
    lines.push("");
  }
  if ((store.profile.conditions ?? []).length > 0) {
    lines.push("Medical history (only flag clear duplicates / junk):");
    lines.push(formatList(store.profile.conditions ?? []));
    lines.push("");
  }
  if ((store.profile.allergies ?? []).length > 0) {
    lines.push("Allergies (only flag clear duplicates / junk):");
    lines.push(formatList(store.profile.allergies ?? []));
    lines.push("");
  }
  if ((store.meds ?? []).length > 0) {
    lines.push("Medications (only flag clear duplicates / junk):");
    lines.push(formatList((store.meds ?? []).map((m) => m.name)));
    lines.push("");
  }
  lines.push("Decide whether to call propose_store_patch. If there's nothing to fix, do not call the tool.");
  return lines.join("\n");
}

function formatList(arr: string[]): string {
  if (arr.length === 0) return "  (empty)";
  return arr.map((x) => `  - ${x}`).join("\n");
}

function collectDocDoctorMentions(store: ParsedStore): string[] {
  const known = new Set(
    [
      ...(store.profile.doctorQuickPick ?? []),
      ...(store.profile.doctorQuickPickHidden ?? []),
      store.profile.primaryCareProvider ?? "",
    ]
      .filter(Boolean)
      .map((s) => s.toLowerCase().trim()),
  );
  const mentions = new Set<string>();
  for (const d of store.docs) {
    for (const dr of d.doctors ?? []) {
      const k = dr.toLowerCase().trim();
      if (k && !known.has(k)) mentions.add(dr.trim());
    }
  }
  return [...mentions];
}

// ── Heuristic fallback ───────────────────────────────────────────────────
// Used when the LLM is unreachable or returns an invalid payload. Only
// catches the obvious facility-token-in-doctors case + adds doc-derived
// names. The user sees a "Heuristic suggestions" badge in the UI so they
// know this isn't the AI pass.
function heuristicOps(
  store: ParsedStore,
  docDoctorMentions: string[],
): { ops: StorePatchOp[]; summary: string } {
  const FACILITY_TOKENS =
    /\b(hospital|hospitals|clinic|clinics|medical centre|medical center|centre|center|diagnostic|labs?|imaging|polyclinic|nursing home|institute)\b/i;
  const ops: StorePatchOp[] = [];
  for (const e of store.profile.doctorQuickPick ?? []) {
    const v = e.trim();
    if (!v) continue;
    if (v.length < 2) {
      const removed = StorePatchOpSchema.safeParse({ kind: "remove_doctor", name: v });
      if (removed.success) ops.push(removed.data);
      continue;
    }
    if (FACILITY_TOKENS.test(v) && !/^dr\.?\s/i.test(v)) {
      const removed = StorePatchOpSchema.safeParse({ kind: "remove_doctor", name: v });
      const added = StorePatchOpSchema.safeParse({ kind: "add_hospital", name: v });
      if (removed.success) ops.push(removed.data);
      if (added.success) ops.push(added.data);
    }
  }
  for (const dr of docDoctorMentions.slice(0, 10)) {
    const added = StorePatchOpSchema.safeParse({ kind: "add_doctor", name: dr });
    if (added.success) ops.push(added.data);
  }
  return {
    ops,
    summary: ops.length === 0 ? "Nothing obvious to tidy." : "Pattern-based suggestions — review each one and accept what looks right.",
  };
}
