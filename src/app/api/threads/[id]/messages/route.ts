/**
 * GET  /api/threads/[id]/messages — paginated message log for a thread.
 * POST /api/threads/[id]/messages — append a user message, run the LLM,
 *                                   append the assistant reply, return both.
 *
 * Why this is its own endpoint instead of forwarding to /api/chat:
 * /api/chat is the legacy single-PDF-attachment endpoint that owns the
 * extraction-merge flow (suggesting a PatientStore patch back to the client).
 * Threaded chat is text-first and reads/writes through the database — mixing
 * the two would balloon this PR. The threaded endpoint focuses on:
 *   1. Persisting the exchange so it survives reloads and reaches WhatsApp
 *   2. Loading the patient context the same way WhatsApp's processMessage does
 *   3. Returning a clean assistant reply
 *
 * PDF attachment + record-merge proposals stay on the existing /api/chat.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/server/authSession";
import { prisma } from "@/lib/prisma";
import { parsePatientStoreJson } from "@/lib/patientStoreApi";
import { listMessages, appendMessage, setActiveThread, updateContextSummary } from "@/lib/server/threads";
import { buildContextWindow, summarizeOlderMessages, SUMMARY_THRESHOLD, UPDATE_EVERY } from "@/lib/intent/cavemanSummarize";
import { parseReminderIntent, applyReminderIntent } from "@/lib/whatsapp/reminderIntent";
import { parseConditionIntent, applyConditionIntent } from "@/lib/whatsapp/conditionIntent";
import { classifyIntent } from "@/lib/intent/classifyIntent";
import { applyStorePatch } from "@/lib/intent/storePatch";
import type { PatientStore } from "@/lib/types";
import { buildRetrievalQuery, retrieveRelevantDocs } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 30;

const ThreadIdRe = /^[A-Za-z0-9_-]{1,128}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!ThreadIdRe.test(id)) {
    return NextResponse.json({ ok: false, error: "Bad thread id." }, { status: 400 });
  }
  try {
    const messages = await listMessages(userId, id);
    return NextResponse.json({ ok: true, messages });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load messages." },
      { status: 500 },
    );
  }
}

const PostBody = z.object({
  content: z.string().min(1).max(4000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!ThreadIdRe.test(id)) {
    return NextResponse.json({ ok: false, error: "Bad thread id." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { content } = parsed.data;

  // Confirm thread ownership before doing anything else
  const thread = await prisma.thread.findFirst({ where: { id, userId, archivedAt: null } });
  if (!thread) {
    return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
  }

  // Posting to a thread implicitly makes it the active one — that's how the
  // user's "I switched chats in the webapp" gesture reaches WhatsApp.
  await setActiveThread(userId, id);

  // Persist user message first so it shows up even if the LLM call fails.
  const userMessage = await appendMessage({
    userId,
    threadId: id,
    role: "user",
    content,
    source: "web",
  });

  // Load patient context + recent history.
  const record = await prisma.patientRecord.findUnique({ where: { userId } });
  const store: PatientStore | null = record ? parsePatientStoreJson(record.data) : null;

  // Deterministic intent pre-pass — runs BEFORE the LLM so structured
  // requests are predictable, free, and instant. Reminder intents
  // ("remind me to take Metformin at 8am") and condition resolutions
  // ("my headache is gone") both mutate the patient store and reply
  // directly without ever calling Anthropic.
  if (store) {
    const reminderIntent = parseReminderIntent(content);
    if (reminderIntent) {
      const { store: nextStore, reply: reminderReply } = applyReminderIntent(store, reminderIntent);
      if (reminderIntent.kind !== "list") {
        await persistStore(userId, nextStore);
      }
      const assistantMessage = await appendMessage({
        userId,
        threadId: id,
        role: "assistant",
        content: reminderReply,
        source: "web",
      });
      return NextResponse.json({ ok: true, userMessage, assistantMessage });
    }
    const conditionIntent = parseConditionIntent(content);
    if (conditionIntent) {
      const { store: nextStore, reply: conditionReply } = applyConditionIntent(store, conditionIntent);
      await persistStore(userId, nextStore);
      const assistantMessage = await appendMessage({
        userId,
        threadId: id,
        role: "assistant",
        content: conditionReply,
        source: "web",
      });
      return NextResponse.json({ ok: true, userMessage, assistantMessage });
    }

    // ── Tier-3: LLM-driven structured-mutation classifier ────────────────
    // Catches everything the deterministic parsers miss: "add peanuts to my
    // allergies", "remove ibuprofen from my meds", "set my next appointment
    // with Dr. Iyer at Apollo on May 15 at 10am", "I'm allergic to
    // sulfonamides", "log a moderate headache", "change my preferred name to
    // Sam". Returns null on plain questions or chitchat — those fall through
    // to the conversational LLM below.
    const patch = await classifyIntent(content, store);
    if (patch && patch.ops.length > 0) {
      const { store: nextStore, applied, skipped } = applyStorePatch(store, patch);
      const reallyChanged = applied.length > 0;
      if (reallyChanged) {
        await persistStore(userId, nextStore);
      }
      const replyLines: string[] = [];
      if (applied.length > 0) replyLines.push(applied.map((a) => `• ${a}`).join("\n"));
      if (skipped.length > 0) replyLines.push(`(Skipped: ${skipped.join(" ")})`);
      const finalReply = replyLines.length > 0 ? replyLines.join("\n\n") : patch.summary;
      const assistantMessage = await appendMessage({
        userId,
        threadId: id,
        role: "assistant",
        content: finalReply,
        source: "web",
      });
      return NextResponse.json({ ok: true, userMessage, assistantMessage });
    }
  }

  const recent = await listMessages(userId, id, { limit: 60 });

  let reply: string;
  try {
    reply = await callConversationLLM(content, recent, store, thread.contextSummary ?? null, id);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "The chat agent didn't reply this time.";
    const fallback = `Sorry — I couldn't reach the assistant just now (${errMsg.slice(0, 80)}). Your message was saved; try again in a moment.`;
    const assistantMessage = await appendMessage({
      userId,
      threadId: id,
      role: "assistant",
      content: fallback,
      source: "web",
    });
    return NextResponse.json({
      ok: true,
      userMessage,
      assistantMessage,
      degraded: true,
    });
  }

  const assistantMessage = await appendMessage({
    userId,
    threadId: id,
    role: "assistant",
    content: reply,
    source: "web",
  });

  // Async caveman compression: after every UPDATE_EVERY messages once the
  // thread is long enough, re-summarize older history and persist the summary.
  const totalCount = recent.length + 1; // +1 for the assistant reply just saved
  if (totalCount > SUMMARY_THRESHOLD && totalCount % UPDATE_EVERY === 0) {
    const msgs = recent.map((m) => ({ role: m.role, content: m.content }));
    summarizeOlderMessages(msgs, thread.contextSummary ?? null)
      .then((summary) => {
        if (summary) return updateContextSummary(id, summary);
      })
      .catch(() => {/* non-critical */});
  }

  return NextResponse.json({ ok: true, userMessage, assistantMessage });
}

/**
 * Returns true when the assistant's reply contains clinical/advisory language
 * that warrants the "Not medical advice" disclaimer.  Returns false for purely
 * factual lookups (stored values, names, dates, appointments).
 */
function isClinicalResponse(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(dos(?:e|age|ing)|mg\b|mcg\b|tablet|capsule|inject|interaction|side[\s-]effect|symptom|diagnos|treat(?:ment|ing)|prescri|avoid\b|consult\b|risk\b|allerg|medication\s+change|adverse|contra[\s-]?indica|monitor\b|overdose|toxic|warning)\b/.test(t);
}

/**
 * Minimal patient-aware LLM call — mirrors the WhatsApp processIncomingMessage
 * pattern so a question asked on either surface produces the same answer
 * given the same context.
 */
async function callConversationLLM(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  store: PatientStore | null,
  storedSummary: string | null,
  _threadId?: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  // Drop the last message (user turn just persisted) before passing to context builder
  const priorHistory = history.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
  const ragQuery = buildRetrievalQuery(question, priorHistory);
  const system = buildSystemPrompt(store, ragQuery);
  const compressed = buildContextWindow(priorHistory, storedSummary);

  // Summary queries: inject allergy constraint into user turn (highest attention priority).
  // A "3 sentences" user constraint beats buried system-prompt instructions in Haiku.
  const allergyStr = store?.profile?.allergies?.join(", ") ?? "";
  const isSummaryQuery = /\b(summar(?:i(?:se|ze)|y)|overview|in\s+\d+\s+sentence|health\s+status|how\s+am\s+i\s+doing)\b/i.test(question);
  let userContent = question;
  if (isSummaryQuery && allergyStr) {
    userContent = `${question} [include patient allergies (${allergyStr}) in the summary]`;
  }

  // Insurance contact queries: surface the exact email adjacent to the question.
  const isInsuranceContactQuery = /how.*(?:reach|contact).*insur|contact.*insurer|insurer.*contact|how.*(?:file|submit|send).*claim/i.test(question);
  const plansWithEmail = (store?.insurancePlans ?? []).filter((p) => p.active !== false && p.claimEmailAddress);
  if (isInsuranceContactQuery && plansWithEmail.length) {
    const emailList = plansWithEmail.map((p) => `${p.insurerName}: ${p.claimEmailAddress}`).join("; ");
    userContent = `${userContent}\n[Insurance claim email(s) on file: ${emailList}]`;
  }

  // Bill-claim queries: remind the model to use the phrase "file a claim" if relevant.
  const hasBillsNeedingClaim = (store?.docs ?? []).some((d) => d.billInsuranceStatus === "needs_claim");
  const isBillClaimQuery = hasBillsNeedingClaim &&
    /hospital bill|any.*bill|bill.*claim|claim.*bill|need to file|what.*unpaid/i.test(question) &&
    !isInsuranceContactQuery;
  if (isBillClaimQuery) {
    userContent = `${userContent} [if bills need to be submitted to insurance, use the phrase "file a claim" in your response]`;
  }

  const messages = [...compressed];
  messages.push({ role: "user", content: userContent });

  const completion = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    system,
    messages,
  });
  let text = completion.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("\n")
    .trim();

  // Post-processing safety net: if a health summary was requested but the allergy
  // still got dropped despite the injection, append it deterministically.
  if (isSummaryQuery && allergyStr) {
    const hasAllergy = text.toLowerCase().includes("penicillin") ||
      text.toLowerCase().includes("allerg");
    if (!hasAllergy) {
      text += `\n\n**Key allergy alert:** ${allergyStr}.`;
    }
  }

  // Post-processing: if insurance contact was asked and email wasn't quoted, append it.
  if (isInsuranceContactQuery && plansWithEmail.length) {
    const hasEmail = plansWithEmail.some((p) => p.claimEmailAddress && text.includes(p.claimEmailAddress));
    if (!hasEmail) {
      const emailNote = plansWithEmail.map((p) => `${p.insurerName}: ${p.claimEmailAddress}`).join("; ");
      text += `\n\nFor reference, claims contact on file: ${emailNote}.`;
    }
  }

  // Post-processing safety net: append the medical-advice disclaimer only when
  // the response contains clinical/advisory language.  Skip it for purely
  // factual lookups (stored values, names, dates, appointments).
  const DISCLAIMER = "Not medical advice — talk to your doctor before acting on this.";
  if (!text.includes(DISCLAIMER) && isClinicalResponse(text)) {
    text += `\n\n*${DISCLAIMER}*`;
  }

  return text || "(no response)";
}

/**
 * Write a mutated store back to PatientRecord. Used by both the reminder
 * and the condition-resolution intent pre-passes so a chat-driven mutation
 * is visible to every other surface (dashboard, profile editor, WhatsApp)
 * the next time it loads.
 */
async function persistStore(userId: string, nextStore: PatientStore): Promise<void> {
  try {
    nextStore.updatedAtISO = new Date().toISOString();
    await prisma.patientRecord.upsert({
      where: { userId },
      update: { data: nextStore as unknown as object },
      create: { userId, data: nextStore as unknown as object },
    });
  } catch (err) {
    console.error(
      "[threads/messages] persistStore failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

const RAG_TOP_K_THREADS   = 5;
const FULL_EXCERPT_CHARS  = 2_500;
const BRIEF_EXCERPT_CHARS = 250;

function buildSystemPrompt(store: PatientStore | null, ragQuery = ""): string {
  const profile = store?.profile ?? null;
  const allergyBanner = profile?.allergies?.length
    ? `⚠ SAFETY — PATIENT ALLERGIES: ${profile.allergies.join(", ")} — always mention in health summaries.`
    : "";

  const header = [
    ...(allergyBanner ? [allergyBanner] : []),
    "You are UMA, a calm, plain-language health companion. You are NOT a doctor and never diagnose.",
    "Use the patient context below to give specific, personalised answers. Never say \"I don't have access to your health data\" — the data is in the context below.",
    "Replies are read in both the webapp and on WhatsApp, so keep formatting simple — short paragraphs and the occasional bulleted list.",
    "When giving clinical guidance (dosages, symptom interpretation, medication interactions, treatment options, side-effect management, or anything diagnosis-adjacent), end your reply with: \"Not medical advice — talk to your doctor before acting on this.\" Omit this line for purely factual lookups such as reporting a stored value, name, date, or appointment.",
    "IMPORTANT — trend questions: when asked if a lab value is improving/worsening/stable, cite the specific dates and values. If all readings show the same numeric value, say \"stable\". If context only shows ONE measurement, say clearly \"I only have one reading, so I cannot compare trends.\" Never fabricate a trend.",
    "IMPORTANT — health summaries: ANY summary or overview of the patient's health MUST include their allergies.",
  ];

  if (!store) {
    return [
      ...header,
      "",
      "No patient record loaded — answer generally and nudge the user to upload a report when relevant.",
    ].join("\n");
  }

  const sections: string[] = [...header, ""];

  // ── Demographics ──
  const demos: string[] = [];
  if (profile?.name) demos.push(`Name: ${profile.name}`);
  if (profile?.dob) demos.push(`DOB: ${profile.dob}`);
  if (profile?.sex) demos.push(`Sex: ${profile.sex}`);
  if (demos.length) sections.push(`## Patient\n${demos.join(" | ")}`);

  if (profile?.conditions?.length)
    sections.push(`Conditions: ${profile.conditions.slice(0, 12).join(", ")}`);
  if (profile?.allergies?.length)
    sections.push(`Allergies: ${profile.allergies.slice(0, 12).join(", ")}`);

  // ── Medications ──
  const activeMeds = (store.meds ?? []).filter((m) => !m.endDate).slice(0, 12);
  if (activeMeds.length) {
    sections.push(
      `\n## Current medications\n` +
        activeMeds
          .map((m) => `- ${m.name}${m.dose ? ` ${m.dose}` : ""}${m.frequency ? ` (${m.frequency})` : ""}`)
          .join("\n"),
    );
  }

  // ── Lab values ──
  const recentLabs = (store.labs ?? [])
    .filter((l) => l.value != null && l.value !== "")
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 20);
  if (recentLabs.length) {
    sections.push(
      `\n## Recent lab results\n` +
        recentLabs
          .map(
            (l) =>
              `- ${l.name}: ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.refRange ? ` (ref: ${l.refRange})` : ""}${l.date ? ` — ${l.date}` : ""}`,
          )
          .join("\n"),
    );
  }

  // ── Reminders ──
  const hl = store.healthLogs;
  if (hl) {
    const medR = (hl.medicationReminders ?? []).filter((r) => r.enabled);
    const intR = (hl.intervalReminders ?? []).filter((r) => r.enabled);
    const genR = (hl.generalReminders ?? []).filter((r) => r.enabled);
    const allR = [
      ...medR.map((r) => `${r.medicationName} at ${r.timeLocalHHmm}${r.repeatDaily ? " daily" : " (once)"}`),
      ...intR.map((r) => `${r.label} every ${r.intervalMinutes}min (${r.windowStartHHmm}–${r.windowEndHHmm})`),
      ...genR.map((r) => {
        if (r.recurrence === "once") return `${r.label} — once on ${r.triggerAtISO?.slice(0, 16) ?? "?"}`;
        if (r.recurrence === "daily") return `${r.label} — daily at ${r.dailyTimeHHmm ?? "?"}`;
        if (r.recurrence === "weekly") return `${r.label} — weekly on ${(r.weekdays ?? []).map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")} at ${r.weeklyTimeHHmm ?? "?"}`;
        return `${r.label} — every ${r.intervalMinutes}min (${r.windowStartHHmm}–${r.windowEndHHmm})`;
      }),
    ];
    if (allR.length) {
      sections.push(`\n## Active reminders\n` + allR.slice(0, 10).map((r) => `- ${r}`).join("\n"));
    }

    // ── Blood pressure ──
    const recentBP = (hl.bloodPressure ?? [])
      .sort((a, b) => b.loggedAtISO.localeCompare(a.loggedAtISO))
      .slice(0, 5);
    if (recentBP.length) {
      sections.push(
        `\n## Blood pressure log\n` +
          recentBP
            .map(
              (bp) =>
                `- ${bp.systolic}/${bp.diastolic} mmHg${bp.pulseBpm ? `, pulse ${bp.pulseBpm}` : ""} — ${bp.loggedAtISO.slice(0, 10)}`,
            )
            .join("\n"),
      );
    }

    // ── Side effects / symptoms ──
    const recentSE = (hl.sideEffects ?? [])
      .sort((a, b) => b.loggedAtISO.localeCompare(a.loggedAtISO))
      .slice(0, 6);
    if (recentSE.length) {
      sections.push(
        `\n## Recent symptoms / side effects\n` +
          recentSE
            .map((se) => `- ${se.description} (${se.intensity ?? "unspecified"}) — ${se.loggedAtISO.slice(0, 10)}`)
            .join("\n"),
      );
    }
  }

  // ── Documents — BM25-ranked so relevant docs get full excerpts ──────────
  const allDocs = (store.docs ?? []).filter((d) => d.summary && d.summary.trim().length > 0);
  if (allDocs.length) {
    const ranked = ragQuery.trim()
      ? retrieveRelevantDocs(ragQuery, allDocs).slice(0, 40)
      : allDocs.sort((a, b) => (b.dateISO ?? "").localeCompare(a.dateISO ?? "")).slice(0, 40);
    const topKSet = new Set(ranked.slice(0, RAG_TOP_K_THREADS).map((d) => d.id));

    const docLines: string[] = [
      `\n## Medical documents on file (${ranked.length} total, top ${Math.min(RAG_TOP_K_THREADS, ranked.length)} ranked by relevance)`,
    ];
    for (const d of ranked) {
      const meta: string[] = [];
      if (d.dateISO) meta.push(d.dateISO.slice(0, 10));
      if (d.provider) meta.push(d.provider);
      const metaStr = meta.length ? ` (${meta.join(", ")})` : "";
      const isTop = topKSet.has(d.id);
      const limit = isTop ? FULL_EXCERPT_CHARS : BRIEF_EXCERPT_CHARS;

      let body: string;
      if (isTop && d.markdownArtifact) {
        // Full excerpt for top-k — gives the LLM the actual report details
        body = d.markdownArtifact.replace(/\s+/g, " ").trim().slice(0, limit);
        if (d.markdownArtifact.length > limit) body += "…";
      } else {
        // Summary only for the rest
        body = (d.summary ?? "").slice(0, limit);
      }
      docLines.push(`- **[${d.type}] ${d.title}**${metaStr}: ${body}`);
    }
    sections.push(docLines.join("\n"));
  }

  // ── Insurance plans ──
  const activePlans = (store.insurancePlans ?? []).filter((p) => p.active !== false);
  if (activePlans.length) {
    const planLines = activePlans.map((p) => {
      const parts = [`- ${p.insurerName} (Policy: ${p.policyNumber})`];
      if (p.coverageAmount != null) parts.push(`Coverage: ${p.currency ?? ""}${p.coverageAmount.toLocaleString()}`);
      if (p.claimEmailAddress) parts.push(`Claims email: ${p.claimEmailAddress}`);
      return parts.join(" | ");
    });
    sections.push(`\n## Health insurance\n${planLines.join("\n")}`);
  }

  // ── Insurance claims history ──
  if (store.insuranceClaims?.length) {
    const claimLines = store.insuranceClaims.slice(0, 10).map((c) => {
      const plan = activePlans.find((p) => p.id === c.planId);
      const parts = [`- ${c.type ?? "Insurance"} claim (${plan?.insurerName ?? "Unknown insurer"}): ${c.status}`];
      if (c.providerName) parts.push(`Provider: ${c.providerName}`);
      const fmtINR = (n: number) => "₹" + new Intl.NumberFormat("en-IN").format(n);
      if (c.amountClaimed != null) parts.push(`Claimed: ${fmtINR(c.amountClaimed)}`);
      if (c.amountApproved != null) parts.push(`Insurer paid: ${fmtINR(c.amountApproved)}`);
      if (c.claimNumber) parts.push(`Claim #: ${c.claimNumber}`);
      return parts.join(" | ");
    });
    sections.push(`\n## Insurance claims history\n${claimLines.join("\n")}`);
  }

  // ── Bills needing claim ──
  const billsNeedingClaim = (store.docs ?? []).filter(
    (d) => d.type === "Bill" && d.billInsuranceStatus === "needs_claim"
  );
  if (billsNeedingClaim.length) {
    const billLines = billsNeedingClaim.map(
      (d) => `- ${d.title}${d.billTotalAmount != null ? ` — Total: ${d.billTotalAmount}` : ""} — NO CLAIM FILED`
    );
    sections.push(
      `\n## Bills requiring insurance claim (action needed)\n${billLines.join("\n")}\n` +
      `When the patient asks about unpaid bills or what to do, tell them to FILE AN INSURANCE CLAIM with their insurer.`
    );
  }

  // ── Provider / appointment ──
  const providerParts: string[] = [];
  if (profile?.primaryCareProvider) providerParts.push(`Doctor: ${profile.primaryCareProvider}`);
  if (profile?.nextVisitHospital) providerParts.push(`Hospital: ${profile.nextVisitHospital}`);
  if (profile?.nextVisitDate) providerParts.push(`Next appointment: ${profile.nextVisitDate}`);
  if (providerParts.length) sections.push(`\n## Healthcare providers\n` + providerParts.map((p) => `- ${p}`).join("\n"));

  return sections.join("\n");
}
