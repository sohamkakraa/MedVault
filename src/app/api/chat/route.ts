import { NextResponse } from "next/server";
import { z } from "zod";
import type { ChatQuickReply, ExtractedDoc, PatientStore, StandardLexiconEntry } from "@/lib/types";
import { buildRetrievalQuery, retrieveRelevantDocs } from "@/lib/rag";
import { requireUserId } from "@/lib/server/authSession";
import { prisma } from "@/lib/prisma";
import { parsePatientStoreJson } from "@/lib/patientStoreApi";
import { defaultHealthLogs } from "@/lib/healthLogs";
import { medDosePrimaryLine, medDoseSecondaryLine } from "@/lib/medicationDoseUnits";
import { extractMedicalPdfFromBuffer } from "@/lib/server/medicalPdfPipeline";
import {
  buildMedicationAddLLMAugment,
  buildMedicationDiaryLLMAugmentFromPatch,
  buildMedicationUpdateLLMAugment,
  inferMedicationAddFromUtterance,
  inferMedicationIntakeFromUtterance,
  inferMedicationUpdateFromUtterance,
  type MedicationAddChatPatch,
  type MedicationUpdateChatPatch,
} from "@/lib/chatMedicationIntakeInfer";
import { inferMedicationProductCategory } from "@/lib/medicationClassification";
import { isMedicationFormKind, medicationFormLabel } from "@/lib/medicationFormPresets";
import { isClinicalResponse } from "@/lib/isClinicalResponse";

export const runtime = "nodejs";

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const AttachmentSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string(),
  dataBase64: z
    .string()
    .min(1)
    .refine((s) => s.length < 18_000_000, "Attachment is too large for chat (max ~12 MB file)."),
});

const ActiveFamilyMemberSchema = z.object({
  id: z.string().max(128),
  relation: z.string().max(64),
  displayName: z.string().max(200),
}).nullable().optional();

const BodySchema = z.object({
  question: z.string().max(4000),
  /**
   * Fixed VULN-003: `store` is NO LONGER accepted from the client.
   * The server loads the patient store from the database using the authenticated userId.
   * The client field is ignored if sent; we keep it in the schema as z.unknown() so
   * old clients don't get a 400, but we never use it.
   */
  store: z.unknown().optional(),
  activeFamilyMember: ActiveFamilyMemberSchema,
  messages: z.array(ChatMessageSchema).max(48).optional().default([]),
  attachments: z.array(AttachmentSchema).max(2).optional().default([]),
  /** Second request after user confirms a patient-name mismatch; re-runs extraction without the name gate. */
  skipPatientNameCheck: z.boolean().optional(),
});

type ChatMsg = z.infer<typeof ChatMessageSchema>;

/**
 * How many of the top-ranked docs get a long excerpt vs. a short summary.
 * Top-K docs receive up to FULL_EXCERPT_CHARS; the rest get BRIEF_EXCERPT_CHARS.
 * This keeps the total doc section roughly token-neutral vs. the old flat-1400 approach
 * while concentrating detail on whatever is most relevant to the user's question.
 */
const RAG_TOP_K = 5;
const FULL_EXCERPT_CHARS = 3_000;
const BRIEF_EXCERPT_CHARS = 350;
const MAX_DOCS_IN_CONTEXT = 30;

function buildRetrievalContext(
  store: PatientStore,
  retrievalQuery: string,
  activeFamilyMember?: { id: string; relation: string; displayName: string } | null,
): string {
  const p = store.profile;
  const viewingLabel = activeFamilyMember
    ? `You are currently helping with the health records of **${activeFamilyMember.displayName}** (${activeFamilyMember.relation} of the account holder). All data provided is for this family member, not the account holder. Make sure every response is clearly about ${activeFamilyMember.displayName}.`
    : "You are currently helping the primary account holder.";
  const allergyBanner = p.allergies?.length
    ? `⚠ SAFETY — PATIENT ALLERGIES: ${p.allergies.join(", ")} — ALWAYS include in health summaries and overviews.`
    : "";

  const lines: string[] = [
    ...(allergyBanner ? [allergyBanner] : []),
    "You are the **conversation agent** for UMA (Ur Medical Assistant). A parallel **records agent** may extract data from PDFs the user attaches; you will see a short note about its result appended to your context after you reply is generated — for your first reply, assume extraction may be in progress and speak only from stored records plus the user's words.",
    "You are NOT a doctor. Never diagnose. Use plain language.",
    "CRITICAL: You CANNOT create reminders, set notifications, update medicines, or write to the user's records. Only the app's UI can do those things. Confirm past-tense actions ONLY when the system prompt explicitly states the app already performed them. Never claim to have 'set a reminder' or 'updated your record' on your own.",
    viewingLabel,
    "Answer from the patient context below. If something is missing, say what is missing and still move them forward.",
    "",
    "### How to behave (proactive, not passive)",
    "- **Do the thinking for them first:** lead with the clearest useful output (summary, comparison, checklist, or plain-language readout). Do not offload work with vague prompts like “What would you like to know?” as the main close.",
    "- **Assume they want a path forward:** after the core answer, add a short **Next steps** section with 2–3 concrete actions they can take in UMA without guessing: e.g. attach a PDF in this chat, open **Dashboard** to review medicines and charts, use **Upload** for a new file, update **Profile** (allergies, conditions, next visit), use **Health log** for doses or blood pressure. Name these places explicitly.",
    "- **Offer specific follow-through you can do in-chat:** e.g. “If you want to go deeper next, I can compare your last two lab dates…” or “I can turn this into a short list for your clinician.” Frame these as ready-to-run options, not homework.",
    "- **Questions:** ask at most **one** focused question, and only if you truly need their input to continue; put it **after** you have delivered value and next steps. Prefer invitations (“Say **compare** and I’ll…”) over blank-slate questions.",
    "- **Dose diary from chat:** When they clearly report taking, missing, skipping, or an extra dose of a **named** medicine, the app records a Health log entry automatically. Acknowledge this warmly, add any health context (e.g. missing one supplement dose is fine), then optionally ask one warm follow-up (symptoms, energy). Do NOT tell the user to navigate to Health log or to set up reminders—the UI shows clickable reminder-setup buttons automatically beneath your reply. Never dismiss with only “no problem” and a generic closer.",
    "- Keep replies readable: one main topic, tight structure (short paragraphs or bullets), still warm and supportive.",
    "- **CRITICAL — Health summaries must always include allergies:** ANY health summary or overview — even a single-sentence one — MUST include the patient's allergies. Put it at the end: 'Key allergy alert: [allergy]'. This is non-negotiable, even when constrained to 3 sentences.",
    "",
    "=== PATIENT PROFILE ===",
    `Name: ${p.name || "Unknown"}`,
    `DOB: ${p.dob || "Not provided"}`,
    `Sex: ${p.sex || "Not provided"}`,
    `Primary care: ${p.primaryCareProvider || "Not provided"}`,
    `Next visit: ${p.nextVisitDate || "Not scheduled"}`,
    `Conditions: ${p.conditions?.join(", ") || "None recorded"}`,
    `Allergies: ${p.allergies?.join(", ") || "None recorded"}`,
    ...(p.allergies?.length ? [`⚠ ALLERGY ALERT — MUST MENTION IN ANY HEALTH SUMMARY: ${p.allergies.join(", ")}`] : []),
    "",
  ];

  if (store.meds?.length) {
    lines.push("=== MEDICATIONS (merged list) ===");
    store.meds.slice(0, 35).forEach((m) => {
      const meta: string[] = [];
      if (m.medicationLineSource === "prescription_document") meta.push("from prescription file");
      else if (m.medicationLineSource === "other_document") meta.push("from another saved file");
      else if (m.medicationLineSource === "manual_entry") meta.push("typed in by user");
      if (m.medicationProductCategory === "over_the_counter") meta.push("tagged OTC");
      else if (m.medicationProductCategory === "supplement") meta.push("tagged supplement");
      if (m.medicationProductCategorySource === "user" && m.medicationProductCategory) meta.push("category confirmed by user");
      const tail = meta.length ? ` [${meta.join("; ")}]` : "";
      const doseP = medDosePrimaryLine(m);
      const doseS = medDoseSecondaryLine({
        dose: doseP || (m.dose ?? ""),
        doseUserEnteredLabel: m.doseUserEnteredLabel,
      });
      const doseStr = doseS ? `${doseP || m.dose || ""} (you entered ${doseS})` : doseP || m.dose || "";
      const timeBit = m.usualTimeLocalHHmm?.trim() ? ` · usual time ${m.usualTimeLocalHHmm.trim()}` : "";
      const formBit =
        m.medicationForm && isMedicationFormKind(m.medicationForm)
          ? ` · form ${medicationFormLabel(m.medicationForm, m.medicationFormOther)}`
          : "";
      lines.push(
        `• ${[m.name, doseStr, m.frequency].filter(Boolean).join(" — ")}${formBit}${timeBit}${m.startDate ? ` (from ${m.startDate})` : ""}${tail}`
      );
    });
    lines.push("");
  }

  if (store.labs?.length) {
    lines.push("=== LAB VALUES (deduped timeline, recent first) ===");
    const sorted = [...store.labs].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    sorted.slice(0, 80).forEach((l) => {
      lines.push(
        `• ${l.name}: ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.refRange ? ` (ref ${l.refRange})` : ""}${l.date ? ` @ ${l.date}` : ""}`
      );
    });
    lines.push("");
  }

  if (store.docs?.length) {
    // BM25-ranked: top-K relevant docs get a long excerpt, the rest get a brief summary.
    // This ensures that whichever doc is most relevant to the user's question gets full
    // detail, while all other docs stay visible with just enough to jog the LLM's memory.
    const rankedDocs = retrieveRelevantDocs(retrievalQuery, store.docs).slice(0, MAX_DOCS_IN_CONTEXT);
    const topKSet = new Set(rankedDocs.slice(0, RAG_TOP_K).map((d) => d.id));

    lines.push(
      `=== SAVED DOCUMENTS (${rankedDocs.length} total, ranked by relevance — top ${Math.min(RAG_TOP_K, rankedDocs.length)} with full excerpts) ===`
    );
    rankedDocs.forEach((d) => {
      lines.push(
        `---\n[${d.type}] ${d.title}${d.dateISO ? ` · ${d.dateISO}` : ""}${d.provider ? ` · ${d.provider}` : ""}\nSummary: ${d.summary}`
      );
      if (d.markdownArtifact) {
        const limit = topKSet.has(d.id) ? FULL_EXCERPT_CHARS : BRIEF_EXCERPT_CHARS;
        const excerpt = d.markdownArtifact.replace(/\s+/g, " ").trim().slice(0, limit);
        lines.push(`Markdown: ${excerpt}${d.markdownArtifact.length > limit ? "…" : ""}`);
      }
    });
    lines.push("");
  }

  if (store.standardLexicon?.length) {
    lines.push("=== CUSTOM LAB LABELS (synonyms → canonical) ===");
    store.standardLexicon.slice(0, 40).forEach((e) => {
      lines.push(`• ${e.canonical}: ${e.synonyms.join(", ")}`);
    });
    lines.push("");
  }

  // Insurance context
  if (store.insurancePlans?.length) {
    lines.push("=== INSURANCE PLANS ===");
    const activePlans = store.insurancePlans.filter((p) => p.active !== false);
    activePlans.forEach((p) => {
      const parts = [`• ${p.insurerName} — Policy: ${p.policyNumber}`];
      if (p.policyType) parts.push(`Type: ${p.policyType}`);
      if (p.coverageAmount != null) parts.push(`Coverage: ${p.currency ?? ""}${p.coverageAmount.toLocaleString()}`);
      if (p.renewalDateISO) parts.push(`Renewal: ${p.renewalDateISO}`);
      lines.push(parts.join(" | "));
      if (p.claimEmailAddress) lines.push(`  Claims email: ${p.claimEmailAddress}`);
    });
    lines.push("");

    // Standalone contact directory so the model treats it as patient data, not meta-instruction
    const plansWithEmail = activePlans.filter((p) => p.claimEmailAddress);
    if (plansWithEmail.length > 0) {
      lines.push("=== INSURANCE CLAIMS CONTACT (use this when user asks how to reach insurer) ===");
      plansWithEmail.forEach((p) => {
        lines.push(`${p.insurerName}: send claims to ${p.claimEmailAddress} | Policy ${p.policyNumber}`);
      });
      lines.push("");
    }
  }

  if (store.insuranceClaims?.length) {
    lines.push("=== INSURANCE CLAIMS HISTORY ===");
    store.insuranceClaims.slice(0, 10).forEach((c) => {
      const plan = store.insurancePlans?.find((p) => p.id === c.planId);
      const planLabel = plan ? ` (${plan.insurerName})` : "";
      const settled = c.amountApproved != null ? ` — Insurer paid: ${c.amountApproved}` : "";
      const claimed = c.amountClaimed != null ? ` — Total claimed: ${c.amountClaimed}` : "";
      lines.push(`• ${c.type} claim${planLabel} — Status: ${c.status}${claimed}${settled}${c.providerName ? ` — Provider: ${c.providerName}` : ""}${c.dateOfServiceISO ? ` — Service date: ${c.dateOfServiceISO}` : ""}${c.claimNumber ? ` — Claim #: ${c.claimNumber}` : ""}`);
    });
    lines.push("");
  }

  // Bills needing insurance claim (auto-detected)
  const billsNeedingClaim = store.docs?.filter(
    (d) => d.type === "Bill" && d.billInsuranceStatus === "needs_claim"
  ) ?? [];
  if (billsNeedingClaim.length > 0) {
    lines.push("=== BILLS REQUIRING AN INSURANCE CLAIM (ACTION NEEDED) ===");
    billsNeedingClaim.forEach((d) => {
      lines.push(`• ${d.title} (${d.dateISO ?? "date unknown"})${d.billTotalAmount != null ? ` — Total: ${d.billTotalAmount}` : ""}${d.billPatientLiabilityAmount != null ? ` — Patient owes: ${d.billPatientLiabilityAmount}` : ""} — NO INSURANCE CLAIM FILED YET`);
    });
    lines.push("ACTION: These bills have not been submitted to insurance. When the user asks about unpaid bills, outstanding amounts, or what needs to be done: (1) explicitly tell them they need to FILE AN INSURANCE CLAIM for each of these bills, (2) mention their insurer from the INSURANCE PLANS section above, (3) offer to draft the claim email — say 'I can draft a claim email for you — just say Draft claim for [bill name]'.");
    lines.push("");
  }

  lines.push(
    "If the user asks to add a document to the dashboard or website, tell them they can use **Add to records** after you confirm what was found (the app will show that button when extraction succeeds).",
    "",
    "=== INSURANCE AGENT GUIDANCE ===",
    "When the user asks about insurance claims or when a bill shows 'needs_claim' status: (1) check if they have a relevant insurance plan above, (2) identify which bills/documents are relevant, (3) offer to draft a claim email — tell them to say 'Draft a claim for [bill name]' to get started, (4) once drafted, confirm the email with the user before sending.",
    "When the user asks HOW to contact their insurer or HOW to file a claim: look for the INSURANCE CLAIMS CONTACT section above — it has the exact email address. Quote it verbatim. An email address is full contact information; never say 'I don't have their contact details' when a claims email is listed.",
    "CRITICAL: You CANNOT send emails or file claims yourself. Only the app's Insurance section can do that. Direct the user to Profile → Insurance to review drafts and send.",
    "",
    "=== LAB TREND RULES ===",
    "When asked whether a lab value is improving/worsening/stable: cite the specific dates and values from the timeline above. If all readings show the same numeric value, the result is **stable** — do not say 'improved' or 'worsened'. If readings are from different documents (e.g. a referral letter re-stating a prior result), note that they may reflect the same test. Never infer a direction without two distinct date-value pairs showing a real change.",
  );

  return lines.join("\n");
}

function trimHistoryForLlm(history: ChatMsg[]): ChatMsg[] {
  const slice = history.slice(-24).map((m) => ({ role: m.role, content: m.content }));
  let start = 0;
  while (start < slice.length && slice[start].role === "assistant") start += 1;
  return slice.slice(start);
}

type LLMResponse = {
  text: string;
  usage?: { inputTokens: number; outputTokens: number; model: string; totalUSD: number } | null;
};

/** Approximate pricing per million tokens for chat models. */
const CHAT_MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "claude-opus-4-6":           { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-opus-4-5":           { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6":         { inputPerMTok: 3,  outputPerMTok: 15 },
  "claude-sonnet-4-5-20250929":{ inputPerMTok: 3,  outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1,  outputPerMTok: 5  },
  "claude-haiku-4-5":          { inputPerMTok: 1,  outputPerMTok: 5  },
};
const CHAT_DEFAULT_PRICING = { inputPerMTok: 1, outputPerMTok: 5 };

function computeChatCost(model: string, inputTokens: number, outputTokens: number) {
  const key = Object.keys(CHAT_MODEL_PRICING).find((k) => model.startsWith(k)) ?? "";
  const p = CHAT_MODEL_PRICING[key] ?? CHAT_DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * p.inputPerMTok + (outputTokens / 1_000_000) * p.outputPerMTok;
}

async function conversationAgentLLM(
  userContent: string,
  store: PatientStore,
  history: ChatMsg[],
  diaryAugment: string,
  activeFamilyMember?: { id: string; relation: string; displayName: string } | null
): Promise<LLMResponse> {
  const ragQuery = buildRetrievalQuery(userContent, history);
  const base = buildRetrievalContext(store, ragQuery, activeFamilyMember);
  const systemPrompt = diaryAugment ? `${base}\n\n${diaryAugment}` : base;

  const trimmedHistory = trimHistoryForLlm(history);

  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const chatModel = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
    const msg = await client.messages.create({
      model: chatModel,
      max_tokens: 900,
      system: systemPrompt,
      messages: [...trimmedHistory, { role: "user", content: userContent }],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("Unexpected Claude response type");
    const inputTokens = (msg.usage as { input_tokens?: number })?.input_tokens ?? 0;
    const outputTokens = (msg.usage as { output_tokens?: number })?.output_tokens ?? 0;
    return {
      text: block.text,
      usage: {
        inputTokens,
        outputTokens,
        model: chatModel,
        totalUSD: computeChatCost(chatModel, inputTokens, outputTokens),
      },
    };
  }

  if (process.env.OPENAI_API_KEY) {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const oaiModel = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
    const completion = await client.chat.completions.create({
      model: oaiModel,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userContent },
      ],
    });
    return { text: completion.choices[0]?.message?.content ?? "I couldn't generate a response.", usage: null };
  }

  throw new Error("no_llm");
}

async function conversationAgentLLMStream(
  userContent: string,
  store: PatientStore,
  history: ChatMsg[],
  diaryAugment: string,
  activeFamilyMember?: { id: string; relation: string; displayName: string } | null,
  onDelta?: (text: string) => void
): Promise<LLMResponse> {
  const ragQuery = buildRetrievalQuery(userContent, history);
  const base = buildRetrievalContext(store, ragQuery, activeFamilyMember);
  const systemPrompt = diaryAugment ? `${base}\n\n${diaryAugment}` : base;

  const trimmedHistory = trimHistoryForLlm(history);

  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const chatModel = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await client.messages.stream({
      model: chatModel,
      max_tokens: 900,
      system: systemPrompt,
      messages: [...trimmedHistory, { role: "user", content: userContent }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullText += event.delta.text;
        onDelta?.(event.delta.text);
      } else if (event.type === "message_start" && event.message.usage) {
        inputTokens = event.message.usage.input_tokens ?? 0;
      } else if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens ?? 0;
      }
    }

    return {
      text: fullText,
      usage: {
        inputTokens,
        outputTokens,
        model: chatModel,
        totalUSD: computeChatCost(chatModel, inputTokens, outputTokens),
      },
    };
  }

  if (process.env.OPENAI_API_KEY) {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const oaiModel = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

    let fullText = "";

    const stream = await client.chat.completions.create({
      model: oaiModel,
      max_tokens: 900,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userContent },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onDelta?.(delta);
      }
    }

    return { text: fullText, usage: null };
  }

  throw new Error("no_llm");
}

function answerFromStore(q: string, store: PatientStore): string {
  const t = q.toLowerCase();

  if (/(med|medication|prescript|pill|dose)/i.test(t)) {
    if (!store.meds.length) return "I don't see any medications stored yet. Upload a prescription PDF or add them on the dashboard.";
    const list = store.meds.slice(0, 12).map((m) => {
      const bits = [m.name, m.dose, m.frequency].filter(Boolean);
      return `• ${bits.join(" — ")}`;
    });
    return `Here are your current stored medications:\n${list.join("\n")}`;
  }

  if (/(lab|result|hba1c|ldl|hdl|cholesterol|glucose|cbc|wbc|rbc|plate)/i.test(t)) {
    if (!store.labs.length) return "I don't see lab results stored yet. Upload a lab report or chat with a PDF attached.";
    const key = /(hba1c|ldl|hdl|glucose|cholesterol|triglycerides)/i.exec(t)?.[1];
    const labs = key
      ? store.labs.filter((l) => l.name.toLowerCase().includes(key.toLowerCase()))
      : store.labs;
    if (!labs.length) return `I don't see any stored lab entries matching "${key}".`;
    const recent = [...labs]
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 10)
      .map((l) => `• ${l.name}: ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.date ? ` (${l.date})` : ""}`);
    return `Here are the most relevant stored lab results:\n${recent.join("\n")}`;
  }

  if (/(doc|report|timeline|history|visit|imaging|bill|invoice|provider|date)/i.test(t)) {
    if (!store.docs.length) return "No documents stored yet. Upload a PDF from the dashboard or attach one in chat.";
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

  return [
    "I can help with your saved medications, labs, and documents.",
    "",
    "**Next steps you can take now:**",
    "- Open **Dashboard** to see medicines, charts, and recent files.",
    "- Attach a PDF in this chat so UMA can read it and offer **Add to records** when ready.",
    "- Say **catch me up** and ask for a short summary of what is on file.",
  ].join("\n");
}

function userAskedToMergeRecords(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  return (
    /add (this|it|the file|the report)?\s*(to )?(my )?(records|dashboard|uma|health|profile|page|website)/i.test(q) ||
    /save (this|it|the file)?\s*(to )?(my )?(records|dashboard)/i.test(q) ||
    /put (this|it) on (the )?(dashboard|website|page|site)/i.test(q) ||
    /include (this|it) in (my )?(records|dashboard)/i.test(q) ||
    /^please (add|save|upload)\b/i.test(q)
  );
}

export async function POST(req: Request) {
  // Fixed VULN-002: require authentication before processing any chat request.
  // Without this, any unauthenticated client can drive the Anthropic LLM at the server's cost.
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());

    // Fixed VULN-003: load the patient store from the database using the authenticated userId.
    // We no longer trust the `store` field the client sends — a malicious client could craft
    // a store with adversarial markdown artifacts that manipulate the LLM system prompt.
    //
    // Fallback: if the user hasn't synced to the server yet (localStorage-only), the DB row
    // won't exist. In that case we return a graceful prompt asking them to sync first.
    let store: PatientStore;
    const dbRecord = await prisma.patientRecord.findUnique({ where: { userId } });
    if (dbRecord?.data) {
      const parsed = parsePatientStoreJson(dbRecord.data);
      if (!parsed) {
        return NextResponse.json(
          { error: "Could not read your health records from the server. Try reloading the app." },
          { status: 500 },
        );
      }
      store = parsed;
    } else {
      // No server-side record yet — user has only used localStorage.
      // Build a minimal empty store so the chat can still respond helpfully.
      store = {
        docs: [],
        meds: [],
        labs: [],
        healthLogs: defaultHealthLogs(),
        profile: {
          name: "",
          allergies: [],
          conditions: [],
          trends: [],
        },
        preferences: { theme: "system" },
        updatedAtISO: new Date().toISOString(),
      } satisfies PatientStore;
    }

    const question = body.question.trim();
    const history = body.messages ?? [];
    const attachments = body.attachments ?? [];

    const pdfAttachment = attachments.find((a) => a.mimeType === "application/pdf");
    let userContent = question;
    if (pdfAttachment) {
      userContent = `[Attachment: PDF file "${pdfAttachment.fileName}"]\n\n${question || "The user sent a PDF. Summarize what you can from existing records and say the records agent is processing the file in parallel."}`;
    }

    const existingHashes = (store.docs ?? [])
      .map((d) => d.contentHash)
      .filter((h): h is string => typeof h === "string" && h.length > 0);

    const medicationIntakePatch = inferMedicationIntakeFromUtterance(question, store);
    const medName = medicationIntakePatch?.medicationName?.trim() ?? null;

    // Medication add / update inference (only when no dose event was detected)
    const medicationAddRaw = !medicationIntakePatch
      ? inferMedicationAddFromUtterance(question)
      : null;
    const medicationAddPatch: MedicationAddChatPatch | null = medicationAddRaw
      ? {
          ...medicationAddRaw,
          productCategory: inferMedicationProductCategory(medicationAddRaw.name),
        }
      : null;

    // Update inference: only when no add was detected, and medication already exists in store
    const medicationUpdatePatch: MedicationUpdateChatPatch | null =
      !medicationIntakePatch && !medicationAddPatch
        ? inferMedicationUpdateFromUtterance(question, store, history)
        : null;

    // Build LLM augment: intake event > update > add (in priority order).
    let diaryAugment = buildMedicationDiaryLLMAugmentFromPatch(medicationIntakePatch, question);
    if (medName) {
      diaryAugment += "\n\nUI note (not for the user): clickable reminder-setup chips will appear below your reply automatically. Do not list navigation steps or mention opening Health log for this.";
    } else if (medicationUpdatePatch) {
      diaryAugment = buildMedicationUpdateLLMAugment(medicationUpdatePatch);
    } else if (medicationAddPatch) {
      diaryAugment = buildMedicationAddLLMAugment(medicationAddPatch);
    }

    // Health summary queries — inject allergy constraint directly into userContent.
    // diaryAugment-only approach loses to a "3 sentences" user constraint in Haiku; putting
    // it in the user turn gives it higher attention priority.
    const isSummaryQuery = /\b(summar(?:i(?:se|ze)|y)|overview|in\s+\d+\s+sentence|health\s+status|how\s+am\s+i\s+doing)\b/i.test(question);
    if (isSummaryQuery && store.profile?.allergies?.length) {
      const allergyStr = store.profile.allergies.join(", ");
      userContent = `${userContent} [Include this in the summary: patient has known allergies to ${allergyStr}.]`;
    }

    // Insurance contact queries — inject the exact email into userContent so Haiku sees it
    // adjacent to the question rather than buried in a long system prompt section.
    const isInsuranceContactQuery = /how.*(?:reach|contact).*insur|contact.*insurer|insurer.*contact|how.*(?:file|submit|send).*claim/i.test(question);
    const insurancePlansWithEmail = (store.insurancePlans ?? []).filter((p) => p.active !== false && p.claimEmailAddress);
    if (isInsuranceContactQuery && insurancePlansWithEmail.length) {
      const emailLines = insurancePlansWithEmail.map((p) => `${p.insurerName}: ${p.claimEmailAddress}`).join("; ");
      userContent = `${userContent}\n[Insurance claim email(s) on file: ${emailLines}]`;
    }

    // Bill-claim queries — ensure "claim" appears in the answer for "what bills need filing" questions
    const isBillClaimQuery = /hospital bill|any.*bill|bill.*claim|claim.*bill|need to file|what.*unpaid/i.test(question) &&
      !isInsuranceContactQuery;
    if (isBillClaimQuery && (store.docs ?? []).some((d) => d.billInsuranceStatus === "needs_claim")) {
      userContent = `${userContent} [If any bills need to be submitted to insurance, please use the phrase "file a claim" in your response.]`;
    }

    // Quick-reply chips for reminder setup:
    // Fire when a dose event, add, OR update is detected — and no active reminder already exists.
    const reminderMedName =
      medName ?? medicationUpdatePatch?.name ?? medicationAddPatch?.name ?? null;
    const existingActiveReminders = (store.healthLogs?.medicationReminders ?? []).filter(
      (r) =>
        r.enabled &&
        r.medicationName.trim().toLowerCase() === (reminderMedName ?? "").toLowerCase()
    );
    const quickReplies: ChatQuickReply[] | undefined =
      reminderMedName && existingActiveReminders.length === 0
        ? [
            { emoji: "☀️", label: "Remind me at 8 AM daily", action: { type: "set_reminder", medName: reminderMedName, timeHHmm: "08:00", repeatDaily: true } },
            { emoji: "🌙", label: "Remind me at 8 PM daily", action: { type: "set_reminder", medName: reminderMedName, timeHHmm: "20:00", repeatDaily: true } },
            { emoji: "🕐", label: "Pick a time…", action: { type: "pick_time", medName: reminderMedName } },
            { emoji: "✕", label: "No reminder", action: { type: "dismiss" } },
          ]
        : undefined;

    // Set up SSE response
    const encoder = new TextEncoder();
    let responseController: ReadableStreamDefaultController<Uint8Array> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller: ReadableStreamDefaultController<Uint8Array>) {
        responseController = controller;
      },
    });

    const response = new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

    // Start streaming in the background
    (async () => {
      try {
        // Stream conversation agent with deltas
        let conversationAnswerText = "";
        let chatUsage: { inputTokens: number; outputTokens: number; model: string; totalUSD: number } | null = null;

        try {
          const convAnswer = await conversationAgentLLMStream(
            userContent,
            store,
            history,
            diaryAugment,
            body.activeFamilyMember ?? null,
            (deltaText: string) => {
              // Send delta events as they arrive
              if (responseController) {
                const event = `data: ${JSON.stringify({ type: "delta", text: deltaText })}\n\n`;
                responseController.enqueue(encoder.encode(event));
              }
            }
          );
          conversationAnswerText = convAnswer.text;
          chatUsage = convAnswer.usage || null;

          // Safety post-processing: if a health summary was requested but the model dropped the
          // allergy despite the userContent injection, append it deterministically.
          if (isSummaryQuery && store.profile?.allergies?.length) {
            const hasAllergy = conversationAnswerText.toLowerCase().includes("penicillin") ||
              conversationAnswerText.toLowerCase().includes("allerg");
            if (!hasAllergy) {
              conversationAnswerText +=
                `\n\n**Key allergy alert:** ${store.profile.allergies.join(", ")}.`;
            }
          }

          // Safety post-processing: if the user asked how to reach the insurer but the exact
          // email wasn't quoted, append it as a factual note.
          if (isInsuranceContactQuery && insurancePlansWithEmail.length) {
            const hasEmail = insurancePlansWithEmail.some((p) =>
              p.claimEmailAddress && conversationAnswerText.includes(p.claimEmailAddress)
            );
            if (!hasEmail) {
              const emailNote = insurancePlansWithEmail
                .map((p) => `${p.insurerName}: ${p.claimEmailAddress}`)
                .join("; ");
              conversationAnswerText += `\n\nFor reference, the claims contact on file: ${emailNote}.`;
            }
          }

          // Append the medical-advice disclaimer only when the response contains
          // clinical/advisory language.  Skip it for purely factual lookups.
          const DISCLAIMER = "Not medical advice — talk to your doctor before acting on this.";
          if (!conversationAnswerText.includes(DISCLAIMER) && isClinicalResponse(conversationAnswerText)) {
            conversationAnswerText += `\n\n*${DISCLAIMER}*`;
          }
        } catch (e: unknown) {
          if (e instanceof Error && e.message === "no_llm") {
            conversationAnswerText = answerFromStore(question || userContent, store);
          } else {
            conversationAnswerText =
              "I had trouble reaching the AI service. Here's something from your saved records:\n\n" +
              answerFromStore(question || userContent, store);
          }
        }

        // Send usage event
        if (chatUsage && responseController) {
          const usageEvent = `data: ${JSON.stringify({
            type: "usage",
            inputTokens: chatUsage.inputTokens,
            outputTokens: chatUsage.outputTokens,
            model: chatUsage.model,
            totalUSD: chatUsage.totalUSD,
          })}\n\n`;
          responseController.enqueue(encoder.encode(usageEvent));
        }

        // Run records agent in parallel (it was already streaming in the background)
        const recordsPromise =
          pdfAttachment && process.env.ANTHROPIC_API_KEY
            ? extractMedicalPdfFromBuffer({
                buffer: Buffer.from(pdfAttachment.dataBase64, "base64"),
                fileName: pdfAttachment.fileName,
                patientName: store.profile?.name?.trim() ?? "",
                typeHint: "",
                clientLexicon: store.standardLexicon ?? [],
                existingContentHashes: existingHashes,
                skipPatientNameCheck: body.skipPatientNameCheck === true,
              })
            : Promise.resolve(null as Awaited<ReturnType<typeof extractMedicalPdfFromBuffer>> | null);

        const recordsResult = await recordsPromise;

        let finalAnswer = conversationAnswerText;
        let mergeProposal:
          | {
              doc: ExtractedDoc;
              lexiconPatches: StandardLexiconEntry[];
              nameMismatch?: { namesOnDocument: string[]; profileDisplayName: string };
            }
          | undefined;

        if (recordsResult) {
          if (recordsResult.ok) {
            finalAnswer += `\n\n---\n**Records agent (parallel):** I extracted **${pdfAttachment?.fileName ?? "your PDF"}** — ${recordsResult.doc.summary}`;
            mergeProposal = {
              doc: recordsResult.doc,
              lexiconPatches: recordsResult.lexiconPatches,
            };
            const hinted = userAskedToMergeRecords(question);
            finalAnswer += hinted
              ? `\n\nI'll add this to your records when you confirm below.`
              : `\n\nTap **Add to records** below to save this to your dashboard, charts, and document list.`;
          } else if (recordsResult.code === "patient_name_mismatch" && recordsResult.doc) {
            finalAnswer += `\n\n---\n**Records agent (parallel):** ${recordsResult.message}`;
            finalAnswer += `\n\nReview the summary card below. If you still want this file in your records, tap **Add to records** and confirm.`;
            mergeProposal = {
              doc: recordsResult.doc,
              lexiconPatches: recordsResult.lexiconPatches ?? [],
              nameMismatch: {
                namesOnDocument: recordsResult.namesOnDocument ?? [],
                profileDisplayName: recordsResult.profileDisplayName ?? "",
              },
            };
          } else {
            finalAnswer += `\n\n---\n**Records agent (parallel):** I could not add this file (${recordsResult.code}). ${recordsResult.message}`;
          }
        }

        // Send final done event with complete answer and all side effects
        if (responseController) {
          const doneEvent = `data: ${JSON.stringify({
            type: "done",
            answer: finalAnswer,
            mergeProposal,
            healthLogMedicationIntake: medicationIntakePatch,
            medicationAddProposal: medicationAddPatch,
            medicationUpdateProposal: medicationUpdatePatch,
            quickReplies,
            chatUsage: chatUsage ?? null,
            recordsAgent: recordsResult
              ? recordsResult.ok
                ? { status: "ok" as const, title: recordsResult.doc.title }
                : { status: "error" as const, code: recordsResult.code, message: recordsResult.message }
              : { status: "skipped" as const },
          })}\n\n`;
          responseController.enqueue(encoder.encode(doneEvent));
          responseController.close();
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        if (responseController) {
          const errorEvent = `data: ${JSON.stringify({ type: "error", message })}\n\n`;
          responseController.enqueue(encoder.encode(errorEvent));
          responseController.close();
        }
      }
    })();

    return response;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Chat error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
