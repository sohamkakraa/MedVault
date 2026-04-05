import { NextResponse } from "next/server";
import { z } from "zod";
import type { PatientStore } from "@/lib/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  question: z.string().min(1),
  store: z.any(),
});

// ── Build system prompt from store ───────────────────────────────────────────

function buildSystemPrompt(store: PatientStore): string {
  const p = store.profile;
  const lines: string[] = [
    "You are a knowledgeable, warm health companion for a personal health records app called MedVault.",
    "You help the user understand their own stored medical records. You are NOT a doctor and never diagnose.",
    "Always be supportive, clear, and use plain language — avoid jargon without explanation.",
    "Never alarm the user. Always recommend speaking to a doctor for clinical decisions.",
    "Answer only from the records below. If data is missing, say so plainly.",
    "",
    "=== PATIENT PROFILE ===",
    `Name: ${p.name || "Unknown"}`,
    `DOB: ${p.dob || "Not provided"}`,
    `Sex: ${p.sex || "Not provided"}`,
    `Primary care provider: ${p.primaryCareProvider || "Not provided"}`,
    `Next visit: ${p.nextVisitDate || "Not scheduled"}`,
    `Conditions: ${p.conditions?.join(", ") || "None recorded"}`,
    `Allergies: ${p.allergies?.join(", ") || "None recorded"}`,
    "",
  ];

  if (store.meds?.length) {
    lines.push("=== CURRENT MEDICATIONS ===");
    store.meds.slice(0, 30).forEach((m) => {
      const parts = [m.name, m.dose, m.frequency].filter(Boolean).join(" — ");
      const dates = [m.startDate && `start: ${m.startDate}`, m.endDate && `end: ${m.endDate}`]
        .filter(Boolean)
        .join(", ");
      lines.push(`• ${parts}${dates ? ` (${dates})` : ""}${m.notes ? ` | Notes: ${m.notes}` : ""}`);
    });
    lines.push("");
  }

  if (store.labs?.length) {
    lines.push("=== LAB RESULTS (most recent first) ===");
    const sorted = [...store.labs].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    sorted.slice(0, 60).forEach((l) => {
      lines.push(
        `• ${l.name}: ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.refRange ? ` (ref: ${l.refRange})` : ""}${l.date ? ` — ${l.date}` : ""}`
      );
    });
    lines.push("");
  }

  if (store.docs?.length) {
    lines.push("=== DOCUMENTS ON FILE ===");
    store.docs.slice(0, 20).forEach((d) => {
      lines.push(`• [${d.type}] ${d.title}${d.dateISO ? ` (${d.dateISO})` : ""}${d.provider ? ` — ${d.provider}` : ""}: ${d.summary}`);
    });
    lines.push("");
  }

  lines.push(
    "=== INSTRUCTIONS ===",
    "Answer the user's question concisely and supportively.",
    "One question at a time in your response — do not overwhelm.",
    "If the user asks about something not in the records, say the data isn't stored yet.",
    "End with a brief, friendly note when appropriate (e.g. 'Let me know if you'd like more detail.').",
    "Never fabricate values or dates. Never provide a diagnosis.",
    "This is not medical advice."
  );

  return lines.join("\n");
}

// ── Deterministic fallback (no API key) ──────────────────────────────────────

function answerFromStore(q: string, store: PatientStore): string {
  const t = q.toLowerCase();

  if (/(med|medication|prescript|pill|dose)/i.test(t)) {
    if (!store.meds.length) return "I don't see any medications stored yet. Upload a prescription PDF first.";
    const list = store.meds.slice(0, 12).map((m) => {
      const bits = [m.name, m.dose, m.frequency].filter(Boolean);
      return `• ${bits.join(" — ")}`;
    });
    return `Here are your current stored medications:\n${list.join("\n")}`;
  }

  if (/(lab|result|hba1c|ldl|hdl|cholesterol|glucose|cbc|wbc|rbc|plate)/i.test(t)) {
    if (!store.labs.length) return "I don't see lab results stored yet. Upload a lab report PDF first.";
    const key = /(hba1c|ldl|hdl|glucose|cholesterol|triglycerides)/i.exec(t)?.[1];
    const labs = key
      ? store.labs.filter((l) => l.name.toLowerCase().includes(key.toLowerCase()))
      : store.labs;
    if (!labs.length) return `I don't see any stored lab entries matching "${key}".`;
    const recent = [...labs]
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 10)
      .map((l) => `• ${l.name}: ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.date ? ` (${l.date})` : ""}`);
    return `Here are the most recent stored lab results:\n${recent.join("\n")}`;
  }

  if (/(doc|report|timeline|history|visit|imaging|bill|invoice|provider|date)/i.test(t)) {
    if (!store.docs.length) return "No documents stored yet. Upload a PDF to start building your timeline.";
    const recent = store.docs.slice(0, 8).map((d) => `• ${d.type}: ${d.title}${d.dateISO ? ` — ${d.dateISO}` : ""}`);
    return `Here are your most recent stored documents:\n${recent.join("\n")}`;
  }

  if (/(allerg)/i.test(t)) {
    if (!store.profile?.allergies?.length) return "I don't see any allergies recorded yet.";
    return `Allergies on file:\n${store.profile.allergies.map((a) => `• ${a}`).join("\n")}`;
  }
  if (/(condition|diagnos)/i.test(t)) {
    if (!store.profile?.conditions?.length) return "I don't see any conditions recorded yet.";
    return `Conditions on file:\n${store.profile.conditions.map((c) => `• ${c}`).join("\n")}`;
  }

  return "I can answer questions about your stored documents, medications, and lab results. Try asking about your meds, lab trends, or uploaded documents.";
}

// ── LLM call (Claude preferred, OpenAI fallback) ─────────────────────────────

async function answerWithLLM(question: string, store: PatientStore): Promise<string> {
  const systemPrompt = buildSystemPrompt(store);

  // Try Claude (Anthropic) first
  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    });
    const block = msg.content[0];
    if (block.type === "text") return block.text;
    throw new Error("Unexpected Claude response type");
  }

  // Fallback: OpenAI
  if (process.env.OPENAI_API_KEY) {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    });
    return completion.choices[0]?.message?.content ?? "I couldn't generate a response.";
  }

  throw new Error("no_llm");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const question = body.question.trim();
    const store = body.store as PatientStore;

    try {
      const answer = await answerWithLLM(question, store);
      return NextResponse.json({ ok: true, answer });
    } catch (err: any) {
      if (err?.message !== "no_llm") {
        // LLM key exists but call failed — surface the error
        return NextResponse.json(
          { ok: false, answer: "I had trouble reaching my AI service. Please try again in a moment." }
        );
      }
      // No LLM key — use keyword fallback
      const answer = answerFromStore(question, store);
      return NextResponse.json({ ok: true, answer });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Chat error" }, { status: 400 });
  }
}
