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
import { listMessages, appendMessage, setActiveThread } from "@/lib/server/threads";
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

  const recent = await listMessages(userId, id, { limit: 30 });

  let reply: string;
  try {
    reply = await callConversationLLM(content, recent, store);
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
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  const system = buildSystemPrompt(store);
  // Drop the message we just persisted (it'll appear as the user prompt)
  const trimmed = history.slice(0, -1).slice(-20);
  const messages = trimmed.map((m) => ({ role: m.role, content: m.content }));
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
  const lines: string[] = [
    "You are UMA, a calm, plain-language health companion. You are NOT a doctor and never diagnose.",
    "Use the patient context below. If a fact is missing, say so plainly and move forward.",
    "Replies are read in both the webapp and on WhatsApp, so keep formatting simple — short paragraphs and the occasional bulleted list.",
  ];
  if (store) {
    const profile = store.profile;
    if (profile?.name) lines.push(`Patient: ${profile.name}.`);
    if (profile?.conditions?.length) lines.push(`Conditions: ${profile.conditions.slice(0, 8).join(", ")}.`);
    if (profile?.allergies?.length) lines.push(`Allergies: ${profile.allergies.slice(0, 8).join(", ")}.`);
    if (store.meds?.length) {
      const m = store.meds.slice(0, 6).map((med) => `${med.name}${med.dose ? ` (${med.dose})` : ""}`);
      lines.push(`Current medications: ${m.join("; ")}.`);
    }
    if (store.labs?.length) {
      lines.push(`Recent lab values on file: ${store.labs.length} total.`);
    }
  } else {
    lines.push("No patient record loaded — answer generally and nudge the user to upload a report when relevant.");
  }
  lines.push("Always end with: \"Not medical advice — talk to your doctor before acting on this.\"");
  return lines.join("\n");
}
