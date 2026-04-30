/**
 * /api/tidy — beta data-hygiene pass.
 *
 * Reads the user's PatientStore, runs an LLM pass to find data-quality issues
 * (entries that look like hospitals stored in the doctors list, duplicates,
 * obvious mis-classifications), and returns a structured suggestion set the
 * client can apply. The endpoint NEVER mutates the store directly — it
 * proposes patches and the client commits them. That keeps the user in
 * control during the beta and avoids data loss from a bad LLM call.
 *
 * Industry: digital health. We do not log or persist any patient content
 * beyond the in-memory request/response.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/sessionToken";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Patches the client should apply if the user accepts the suggestions.
 *
 *   - moveToHospitals: entries currently in `doctorQuickPick` that look like
 *     facility names (e.g. "Zia Medical Centre") and should move to
 *     `facilityQuickPick`.
 *   - moveToDoctors: the inverse — entries in `facilityQuickPick` that are
 *     actually a person's name and should move to `doctorQuickPick`.
 *   - removeFromDoctors / removeFromHospitals: junk entries (empty, single
 *     letters, obvious test data) that should be deleted outright.
 *   - addDoctors: doctor names mentioned recently in chat or report sections
 *     but missing from the dropdown.
 */
const TidySuggestionsSchema = z.object({
  moveToHospitals: z.array(z.string().min(1).max(120)).default([]),
  moveToDoctors: z.array(z.string().min(1).max(120)).default([]),
  removeFromDoctors: z.array(z.string().min(1).max(120)).default([]),
  removeFromHospitals: z.array(z.string().min(1).max(120)).default([]),
  addDoctors: z.array(z.string().min(1).max(120)).default([]),
  notes: z.string().max(2000).default(""),
});
export type TidySuggestions = z.infer<typeof TidySuggestionsSchema>;

const RequestBodySchema = z.object({
  store: z.object({
    profile: z
      .object({
        primaryCareProvider: z.string().optional().nullable(),
        nextVisitHospital: z.string().optional().nullable(),
        doctorQuickPick: z.array(z.string()).optional().default([]),
        facilityQuickPick: z.array(z.string()).optional().default([]),
        doctorQuickPickHidden: z.array(z.string()).optional().default([]),
        facilityQuickPickHidden: z.array(z.string()).optional().default([]),
      })
      .passthrough(),
    docs: z
      .array(
        z
          .object({
            id: z.string(),
            provider: z.string().optional().nullable(),
            doctors: z.array(z.string()).optional().default([]),
            facilityName: z.string().optional().nullable(),
          })
          .passthrough(),
      )
      .max(500),
  }),
});

export async function POST(req: NextRequest) {
  // Auth — Tidy reveals the user's lists to an LLM, so it must be authenticated.
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const claims = await verifySessionToken(raw);
  if (!claims?.sub) {
    return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request shape.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const { store } = parsed.data;

  // Collect doctor mentions from documents that aren't already in the dropdown
  const knownDoctors = new Set(
    [
      ...(store.profile.doctorQuickPick ?? []),
      ...(store.profile.doctorQuickPickHidden ?? []),
      store.profile.primaryCareProvider ?? "",
    ]
      .filter(Boolean)
      .map((s) => s.toLowerCase().trim()),
  );
  const docDoctorMentions = new Set<string>();
  for (const d of store.docs) {
    for (const dr of d.doctors ?? []) {
      const k = dr.toLowerCase().trim();
      if (k && !knownDoctors.has(k)) docDoctorMentions.add(dr.trim());
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No LLM available — return a deterministic best-effort using the heuristics below only.
    return NextResponse.json({
      ok: true,
      suggestions: heuristicSuggestions(store, docDoctorMentions),
      source: "heuristic",
    });
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_TIDY_MODEL || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

    const prompt = buildTidyPrompt(store, docDoctorMentions);
    const completion = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const content = completion.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("\n");

    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        ok: true,
        suggestions: heuristicSuggestions(store, docDoctorMentions),
        source: "heuristic_fallback",
        note: "LLM did not return parseable JSON.",
      });
    }
    const jsonText = jsonMatch[1] ?? jsonMatch[0];
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({
        ok: true,
        suggestions: heuristicSuggestions(store, docDoctorMentions),
        source: "heuristic_fallback",
        note: "LLM JSON did not parse.",
      });
    }
    const ok = TidySuggestionsSchema.safeParse(parsedJson);
    if (!ok.success) {
      return NextResponse.json({
        ok: true,
        suggestions: heuristicSuggestions(store, docDoctorMentions),
        source: "heuristic_fallback",
        note: "LLM JSON failed schema check.",
      });
    }

    return NextResponse.json({ ok: true, suggestions: ok.data, source: "llm" });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      suggestions: heuristicSuggestions(store, docDoctorMentions),
      source: "heuristic_fallback",
      note: err instanceof Error ? err.message.slice(0, 200) : "LLM error",
    });
  }
}

/**
 * Deterministic baseline that always runs even when the LLM is unavailable.
 * Catches the obvious cases (anything containing "hospital", "clinic",
 * "centre", "diagnostic") in the doctors list.
 */
function heuristicSuggestions(
  store: z.infer<typeof RequestBodySchema>["store"],
  docDoctorMentions: Set<string>,
): TidySuggestions {
  const FACILITY_TOKENS = /\b(hospital|hospitals|clinic|clinics|medical centre|medical center|centre|center|diagnostic|labs?|imaging|polyclinic|nursing home|institute)\b/i;
  const moveToHospitals: string[] = [];
  const removeFromDoctors: string[] = [];
  for (const e of store.profile.doctorQuickPick ?? []) {
    const v = e.trim();
    if (!v) continue;
    if (v.length < 2) {
      removeFromDoctors.push(v);
      continue;
    }
    if (FACILITY_TOKENS.test(v) && !/^dr\.?\s/i.test(v)) {
      moveToHospitals.push(v);
    }
  }
  return {
    moveToHospitals,
    moveToDoctors: [],
    removeFromDoctors,
    removeFromHospitals: [],
    addDoctors: Array.from(docDoctorMentions).slice(0, 10),
    notes:
      moveToHospitals.length || removeFromDoctors.length || docDoctorMentions.size
        ? "Heuristic pass — review and accept the suggestions you agree with."
        : "Nothing obvious to tidy.",
  };
}

function buildTidyPrompt(
  store: z.infer<typeof RequestBodySchema>["store"],
  docDoctorMentions: Set<string>,
): string {
  return `You are reviewing a patient's profile lists for data hygiene issues.

Current "doctors" list (these should be PERSON names like "Dr. Asha Iyer", "Dr Patel"):
${(store.profile.doctorQuickPick ?? []).map((d) => `- ${d}`).join("\n") || "(empty)"}

Current "hospitals/clinics" list (these should be FACILITY names like "Apollo Hospital", "Zia Medical Centre"):
${(store.profile.facilityQuickPick ?? []).map((f) => `- ${f}`).join("\n") || "(empty)"}

Doctor names mentioned in uploaded documents but missing from the dropdown:
${Array.from(docDoctorMentions).slice(0, 30).map((d) => `- ${d}`).join("\n") || "(none)"}

Rules:
1. Move entries to the right list. A name with "hospital", "clinic", "centre/center", "diagnostic", "labs", "polyclinic", "nursing home" is a facility, not a doctor.
2. Mark single-letter or obviously broken entries for removal.
3. Suggest adding doctor names from the document mentions if they look like genuine person names ("Dr. ..." or "Dr ..." prefix preferred).
4. Be conservative — when in doubt, do nothing.
5. Output STRICT JSON inside a \`\`\`json fence with this exact shape:

\`\`\`json
{
  "moveToHospitals": ["string", ...],
  "moveToDoctors": ["string", ...],
  "removeFromDoctors": ["string", ...],
  "removeFromHospitals": ["string", ...],
  "addDoctors": ["string", ...],
  "notes": "one or two sentences explaining what you found"
}
\`\`\`

Do not invent entries that are not in the input. Reproduce strings exactly as they appear.`;
}
