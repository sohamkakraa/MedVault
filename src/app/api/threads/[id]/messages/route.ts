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
    reply = await callConversationLLM(content, recent, store, thread.contextSummary ?? null);
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
 * Minimal patient-aware LLM call — mirrors the WhatsApp processIncomingMessage
 * pattern so a question asked on either surface produces the same answer
 * given the same context.
 */
async function callConversationLLM(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  store: PatientStore | null,
  storedSummary: string | null,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  const system = buildSystemPrompt(store);
  // Drop the last message (it's the user message we just persisted — passed as question)
  const priorHistory = history.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
  const compressed = buildContextWindow(priorHistory, storedSummary);
  const messages = [...compressed];
  messages.push({ role: "user", content: question });

  const completion = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    system,
    messages,
  });
  const text = completion.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("\n")
    .trim();
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

function buildSystemPrompt(store: PatientStore | null): string {
  const header = [
    "You are UMA, a calm, plain-language health companion. You are NOT a doctor and never diagnose.",
    "Use the patient context below to give specific, personalised answers. Never say \"I don't have access to your health data\" — the data is in the context below.",
    "Replies are read in both the webapp and on WhatsApp, so keep formatting simple — short paragraphs and the occasional bulleted list.",
    "Always end with: \"Not medical advice — talk to your doctor before acting on this.\"",
  ];

  if (!store) {
    return [
      ...header,
      "",
      "No patient record loaded — answer generally and nudge the user to upload a report when relevant.",
    ].join("\n");
  }

  const sections: string[] = [...header, ""];
  const profile = store.profile;

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

  // ── Documents / reports (imaging, vaccines, bills, prescriptions) ──
  const allDocs = (store.docs ?? [])
    .filter((d) => d.summary && d.summary.trim().length > 0)
    .sort((a, b) => (b.dateISO ?? "").localeCompare(a.dateISO ?? ""))
    .slice(0, 30);
  if (allDocs.length) {
    sections.push(
      `\n## Medical documents on file\n` +
        allDocs
          .map((d) => {
            const parts: string[] = [];
            if (d.dateISO) parts.push(d.dateISO.slice(0, 10));
            if (d.provider) parts.push(d.provider);
            const meta = parts.length ? ` (${parts.join(", ")})` : "";
            return `- **${d.title}**${meta}: ${d.summary!.slice(0, 200)}`;
          })
          .join("\n"),
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
