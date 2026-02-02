import { NextResponse } from "next/server";
import { z } from "zod";
import type { PatientStore } from "@/lib/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  question: z.string().min(1),
  store: z.any(),
});

function isMedicalHistoryQuestion(q: string) {
  const t = q.toLowerCase();
  // “medical history only” gate: allow meds/labs/diagnoses/docs/visits/provider dates etc.
  return /(med|medication|dose|prescript|lab|result|hba1c|ldl|hdl|cholesterol|glucose|report|document|visit|history|timeline|imaging|bill|invoice|allergy|condition|diagnos|date|provider)/i.test(
    t
  );
}

function answerFromStore(q: string, store: PatientStore): string {
  const t = q.toLowerCase();

  // Medications
  if (/(med|medication|prescript|pill|dose)/i.test(t)) {
    if (!store.meds.length) return "I don’t see any medications stored yet. Upload a prescription PDF first.";
    const list = store.meds.slice(0, 12).map((m) => {
      const bits = [m.name];
      if (m.dose) bits.push(m.dose);
      if (m.frequency) bits.push(m.frequency);
      return `• ${bits.join(" — ")}`;
    });
    return `Here are your current stored medications (from uploaded records):\n${list.join("\n")}`;
  }

  // Labs
  if (/(lab|result|hba1c|ldl|hdl|cholesterol|glucose|cbc|wbc|rbc|plate)/i.test(t)) {
    if (!store.labs.length) return "I don’t see lab results stored yet. Upload a lab report PDF first.";
    const key = /(hba1c|ldl|hdl|glucose|cholesterol|triglycerides)/i.exec(t)?.[1];
    const labs = key
      ? store.labs.filter((l) => l.name.toLowerCase().includes(key.toLowerCase()))
      : store.labs;

    if (!labs.length) return `I don’t see any stored lab entries matching “${key}”.`;

    const recent = labs
      .slice()
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 10)
      .map((l) => `• ${l.name}: ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.date ? ` (${l.date})` : ""}`);

    return `Here are the most recent stored lab results I found:\n${recent.join("\n")}`;
  }

  // Documents / timeline
  if (/(doc|report|timeline|history|visit|imaging|bill|invoice|provider|date)/i.test(t)) {
    if (!store.docs.length) return "No documents stored yet. Upload a PDF to start building your timeline.";
    const recent = store.docs.slice(0, 8).map((d) => {
      const when = d.dateISO ? ` — ${d.dateISO}` : "";
      return `• ${d.type}: ${d.title}${when}`;
    });
    return `Here are your most recent stored documents:\n${recent.join("\n")}`;
  }

  // Allergies / conditions
  if (/(allerg|allergy)/i.test(t)) {
    if (!store.profile?.allergies?.length) return "I don’t see any allergies recorded yet.";
    return `Here are the allergies on file:\n${store.profile.allergies.map((a) => `• ${a}`).join("\n")}`;
  }
  if (/(condition|diagnos)/i.test(t)) {
    if (!store.profile?.conditions?.length) return "I don’t see any conditions recorded yet.";
    return `Here are the conditions on file:\n${store.profile.conditions.map((c) => `• ${c}`).join("\n")}`;
  }

  // Fallback: summarize scope
  return "I can answer questions about your stored documents, medications, and lab results. Try asking about meds, lab trends, or what documents you uploaded.";
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const question = body.question.trim();
    const store = body.store as PatientStore;

    if (!isMedicalHistoryQuestion(question)) {
      return NextResponse.json({
        answer:
          "I can only answer questions about your medical history stored in this app (documents, medications, labs). Please ask something related to your records.",
      });
    }

    // Prototype: deterministic answer from local store.
    // Later: you can route this to an LLM with strict system rules + store context.
    const answer = answerFromStore(question, store);

    return NextResponse.json({ ok: true, answer });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Chat error" }, { status: 400 });
  }
}
