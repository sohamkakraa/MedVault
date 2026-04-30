/**
 * Processes an incoming WhatsApp message: loads patient context,
 * calls the LLM, persists the exchange, and replies.
 */

import { prisma } from "@/lib/prisma";
import { parsePatientStoreJson } from "@/lib/patientStoreApi";
import type { PatientStore } from "@/lib/types";
import { sendText, markRead } from "./client";
import { parseReminderIntent, applyReminderIntent } from "./reminderIntent";
import { getOrCreateActiveThread, appendMessage, listMessages } from "@/lib/server/threads";

/** Server-safe blank store — avoids importing the "use client" store.ts module. */
function blankStore(): PatientStore {
  return {
    docs: [],
    meds: [],
    labs: [],
    healthLogs: { bloodPressure: [], medicationIntake: [], sideEffects: [], medicationReminders: [] },
    profile: {
      name: "",
      firstName: "",
      lastName: "",
      allergies: [],
      conditions: [],
      trends: [],
      internalId: "",
      countryCode: "",
    },
    preferences: { theme: "system" as const, onboarding: { lastStepReached: 1 as const } },
    standardLexicon: [],
    updatedAtISO: new Date().toISOString(),
  } as PatientStore;
}

const MAX_HISTORY = 20;

/**
 * Convert markdown formatting to WhatsApp-compatible formatting.
 * WhatsApp uses: *bold*, _italic_, ~strikethrough~, ```monospace```
 */
function markdownToWhatsApp(text: string): string {
  let result = text;

  // **bold** or __bold__ → *bold*
  result = result.replace(/\*\*(.+?)\*\*/g, "*$1*");
  result = result.replace(/__(.+?)__/g, "*$1*");

  // Markdown headers (### Header) → *Header* with newline
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Markdown links [text](url) → text (url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  // Markdown images ![alt](url) → just drop them
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // Horizontal rules (---, ***, ___) → simple line
  result = result.replace(/^[-*_]{3,}$/gm, "———");

  // Clean up any triple+ asterisks that might remain from nested bold
  result = result.replace(/\*{3,}(.+?)\*{3,}/g, "*$1*");

  return result.trim();
}

interface UserPrefs {
  communicationStyle?: string;
  languageLevel?: string;
  checkinTime?: string;
  checkinEnabled?: boolean;
  timezone?: string;
  preferredName?: string;
}

// VULN-003 fix: Allowlists for values interpolated into the system prompt.
// Prevents prompt injection via user-controlled preference fields.
const ALLOWED_COMM_STYLES = new Set([
  "casual and brief with emojis",
  "brief and direct",
  "conversational",
  "detailed and thorough",
]);
const ALLOWED_LANG_LEVELS = new Set(["simple", "moderate", "technical"]);

/** VULN-003: Sanitize a string before interpolating into the system prompt. */
function sanitizeForPrompt(value: string, maxLen = 30): string {
  // Strip newlines, control chars, and prompt-injection markers
  return value.replace(/[\n\r\t]/g, " ").replace(/[#\[\]{}]/g, "").slice(0, maxLen).trim();
}

function buildRetrievalContext(store: PatientStore, prefs?: UserPrefs): string {
  const p = store.profile;
  // VULN-003: Sanitize user-controlled name before injecting into system prompt
  const rawName = prefs?.preferredName || p.name?.split(" ")[0] || "there";
  const userName = sanitizeForPrompt(rawName, 20);

  const lines: string[] = [
    "You are UMA (Ur Medical Assistant), a warm and caring health companion on WhatsApp.",
    "",
    "## Your personality",
    `- Address the user as "${userName}".`,
    "- You are like a knowledgeable, supportive friend — not a clinical system.",
    "- Speak in simple, everyday language. Assume the user has NO medical background.",
    "- When mentioning ANY medical term, lab name, or condition, ALWAYS explain what it means in plain words.",
    '  Example: "Your HbA1c is 6.8% — this is a measure of your average blood sugar over the past 3 months. A normal range is below 5.7%, so yours is a bit elevated."',
    "- Be encouraging and supportive, never alarming. Frame things positively.",
    '  Instead of: "Your cholesterol is dangerously high"',
    '  Say: "Your cholesterol is higher than the ideal range. The good news is that diet and exercise can make a real difference here."',
    "- Ask ONE follow-up question at a time if you need more info. Never bombard with multiple questions.",
    "- When explaining a report or diagnosis, break it down step by step — what was tested, what the result means, what is normal, and what (if anything) they should do next.",
    "- End medical explanations with a gentle nudge to discuss with their doctor for personalised advice.",
    "",
    "## Formatting rules",
    "- Use WhatsApp formatting ONLY: *bold* (single asterisks), _italic_ (single underscores), ~strikethrough~.",
    "- Do NOT use markdown: no **, no ##, no []() links, no ```code blocks```.",
    "- Keep messages short and scannable. Use line breaks between ideas.",
    "- Use bullet points with simple dashes (- item) when listing things.",
    "- Emojis are welcome but use them sparingly (1-2 per message max).",
    "",
    "## Wellness check-ins",
    "- If the user seems to be responding to a daily check-in, gently ask about: mood (how are you feeling today?), energy level, any symptoms, and whether they took their medications.",
    "- Ask only ONE thing at a time. Wait for their response before asking the next.",
    "- If they mention a mood or symptom, acknowledge it warmly before moving on.",
    "- Track patterns: if they mention the same symptom multiple times, note that it has been recurring.",
    "",
    "## Important boundaries",
    "- You are NOT a doctor. Never diagnose. Never prescribe.",
    "- Always include 'Not medical advice' when giving health-related information.",
    "- If something sounds urgent (chest pain, difficulty breathing, sudden severe symptoms), tell them to contact emergency services or their doctor immediately.",
  ];

  // VULN-003: Inject user communication preferences using allowlisted/sanitized values only
  if (prefs?.communicationStyle || prefs?.languageLevel) {
    lines.push("", "## User communication preferences");
    if (prefs.communicationStyle && ALLOWED_COMM_STYLES.has(prefs.communicationStyle)) {
      lines.push(`- Communication style: ${prefs.communicationStyle}`);
    }
    if (prefs.languageLevel && ALLOWED_LANG_LEVELS.has(prefs.languageLevel)) {
      lines.push(`- Language level: ${prefs.languageLevel}`);
    }
    lines.push("- Mirror the user's tone and style. If they use short casual messages, keep your replies casual too. If they write in detail, you can be more thorough.");
  }

  lines.push(
    "",
    "## Patient context",
    `Name: ${p.name || "Unknown"}`,
    `DOB: ${p.dob || "Unknown"}, Sex: ${p.sex || "Unknown"}`,
  );

  if (p.conditions?.length) lines.push(`Conditions: ${p.conditions.join(", ")}`);
  if (p.allergies?.length) lines.push(`Allergies: ${p.allergies.join(", ")}`);

  const activeMeds = (store.meds ?? []).filter((m) => !m.endDate).slice(0, 20);
  if (activeMeds.length) {
    lines.push("", "## Active medications");
    for (const m of activeMeds) {
      lines.push(`- ${m.name}${m.dose ? ` ${m.dose}` : ""}${m.frequency ? ` · ${m.frequency}` : ""}`);
    }
  }

  const recentLabs = (store.labs ?? [])
    .filter((l) => l.value !== undefined && l.value !== null)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 30);
  if (recentLabs.length) {
    lines.push("", "## Recent lab values");
    for (const l of recentLabs) {
      lines.push(`- ${l.name}: ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.date ? ` (${l.date})` : ""}`);
    }
  }

  return lines.join("\n");
}

async function callLLM(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

    const messages = [
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: userMessage },
    ];

    const res = await client.messages.create({
      model,
      max_tokens: 400,
      system: systemPrompt,
      messages,
    });

    return res.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? (b as { text: string }).text : ""))
      .join("");
  }

  if (process.env.OPENAI_API_KEY) {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

    const res = await client.chat.completions.create({
      model,
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: userMessage },
      ],
    });

    return res.choices[0]?.message?.content ?? "I could not generate a response.";
  }

  return "UMA is not fully configured yet. Please ask the admin to set up the AI keys.";
}

// ─── Preference detection ───────────────────────────────────────────────────

const CHECKIN_TIME_RE = /(?:check.?in|remind|message)\s+(?:me\s+)?(?:at|around)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
const CHECKIN_ENABLE_RE = /(?:daily\s+check.?in|check\s+on\s+me|wellness\s+check|daily\s+reminder)/i;
const CHECKIN_DISABLE_RE = /(?:stop|disable|cancel|no more)\s+(?:daily\s+)?(?:check.?in|reminder)/i;
const CALL_ME_RE = /(?:call\s+me|my\s+name\s+is|i(?:'?m| am))\s+(\w+)/i;

function parseTimeString(raw: string): string | null {
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Detect if the user is setting preferences in their message.
 * Returns a partial update object (or null if no preferences detected).
 */
function detectPreferenceChanges(text: string): Partial<{
  checkinTime: string;
  checkinEnabled: boolean;
  preferredName: string;
}> | null {
  const updates: Record<string, unknown> = {};

  const timeMatch = text.match(CHECKIN_TIME_RE);
  if (timeMatch) {
    const parsed = parseTimeString(timeMatch[1]);
    if (parsed) {
      updates.checkinTime = parsed;
      updates.checkinEnabled = true;
    }
  } else if (CHECKIN_ENABLE_RE.test(text)) {
    updates.checkinEnabled = true;
  }

  if (CHECKIN_DISABLE_RE.test(text)) {
    updates.checkinEnabled = false;
  }

  const nameMatch = text.match(CALL_ME_RE);
  if (nameMatch) {
    const name = nameMatch[1];
    // Avoid catching common false positives
    if (name.length > 1 && !["fine", "good", "okay", "ok", "well", "sick", "tired", "here"].includes(name.toLowerCase())) {
      updates.preferredName = name;
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

/**
 * Infer communication style from message patterns over time.
 */
function inferCommunicationStyle(messages: Array<{ role: string; content: string }>): string | null {
  const userMsgs = messages.filter((m) => m.role === "user");
  if (userMsgs.length < 3) return null;

  const avgLen = userMsgs.reduce((sum, m) => sum + m.content.length, 0) / userMsgs.length;
  const usesEmoji = userMsgs.some((m) => /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/u.test(m.content));

  if (avgLen < 20) return usesEmoji ? "casual and brief with emojis" : "brief and direct";
  if (avgLen < 80) return "conversational";
  return "detailed and thorough";
}

// ─── Wellness extraction (LLM-based) ───────────────────────────────────────

// Keyword gate — only call the wellness extraction LLM when the message
// likely contains mood/health/symptom info. Saves ~$0.001 per non-wellness message.
const WELLNESS_KEYWORDS = /\b(feel|mood|energy|tired|exhaust|headache|pain|ache|nausea|sick|better|worse|symptom|medication|meds|took|pill|sleep|slept|stress|anxious|depress|happy|sad|okay|fine|great|terrible|awful|rough|good morning|check.?in|how am i)\b/i;

/**
 * Lightweight regex-based wellness extraction — no LLM call needed.
 * Returns structured data only when the message clearly contains wellness info.
 */
function extractWellnessLocal(userMessage: string): {
  mood?: number;
  energy?: number;
  symptoms?: string;
  medsTaken?: boolean;
  notes?: string;
  isWellnessResponse: boolean;
} | null {
  if (!WELLNESS_KEYWORDS.test(userMessage)) return null;

  const lower = userMessage.toLowerCase();
  const result: {
    mood?: number;
    energy?: number;
    symptoms?: string;
    medsTaken?: boolean;
    notes?: string;
    isWellnessResponse: boolean;
  } = { isWellnessResponse: true };

  // Mood detection
  if (/\b(great|amazing|wonderful|fantastic|excellent)\b/.test(lower)) result.mood = 5;
  else if (/\b(good|happy|fine|well|better)\b/.test(lower)) result.mood = 4;
  else if (/\b(okay|ok|alright|so.?so|meh)\b/.test(lower)) result.mood = 3;
  else if (/\b(bad|rough|not great|not good|down|low)\b/.test(lower)) result.mood = 2;
  else if (/\b(terrible|awful|horrible|worst|miserable)\b/.test(lower)) result.mood = 1;

  // Energy detection
  if (/\b(energetic|energized|full of energy)\b/.test(lower)) result.energy = 5;
  else if (/\b(tired|exhausted|fatigued|drained|no energy|sleepy)\b/.test(lower)) result.energy = 2;

  // Medication adherence
  if (/\b(took|taken|had)\b.*\b(med|pill|tablet|medicine|medication)\b/.test(lower)) result.medsTaken = true;
  else if (/\b(forgot|missed|skip|didn'?t take)\b.*\b(med|pill|tablet|medicine|medication)\b/.test(lower)) result.medsTaken = false;

  // Symptom extraction — grab the whole message as symptom notes if it mentions symptoms
  if (/\b(headache|pain|ache|nausea|dizzy|cough|fever|cramp|sore|itch|rash|vomit|fatigue|insomnia)\b/.test(lower)) {
    result.symptoms = userMessage.slice(0, 500);
  }

  // Only return if we actually extracted something useful
  if (result.mood != null || result.energy != null || result.medsTaken != null || result.symptoms) {
    return result;
  }

  return null;
}

// ─── Main message handler ───────────────────────────────────────────────────

export async function processIncomingMessage(
  waId: string,
  senderPhone: string,
  messageId: string,
  text: string,
) {
  try {
    await markRead(messageId);
  } catch {
    // non-critical
  }

  const user = await prisma.user.findFirst({
    where: { whatsappPhone: senderPhone, whatsappVerified: true },
  });

  if (!user) {
    // Create a one-time token so the unknown sender can complete sign-up via the web.
    const { randomBytes } = await import("crypto");
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const phoneE164 = senderPhone.startsWith("+") ? senderPhone : `+${senderPhone}`;
    try {
      await prisma.pendingLink.create({ data: { token, phoneE164, expiresAt } });
    } catch {
      // Best-effort — still send the reply even if the DB write fails
    }
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://uma.sohamkakra.com";
    const link = `${baseUrl}/login?wa=${token}`;
    await sendText(
      senderPhone,
      `Hi! 👋 I don't recognise this number yet.\n\nOpen the link below to sign up or link your account, then come back here to chat:\n${link}`,
    );
    return;
  }

  // ── Load patient data ──
  let store: PatientStore = blankStore();
  const record = await prisma.patientRecord.findUnique({ where: { userId: user.id } });
  if (record) {
    store = parsePatientStoreJson(record.data) ?? store;
  }

  // ── Load or create preferences ──
  let prefsRow = await prisma.whatsAppPreferences.findUnique({ where: { userId: user.id } });
  if (!prefsRow) {
    prefsRow = await prisma.whatsAppPreferences.create({
      data: { userId: user.id, languageLevel: "simple" },
    });
  }

  // ── Resolve the user's active thread ──
  // Cross-channel sync: every WhatsApp message lands in whichever thread the
  // user last picked in the webapp (via `User.activeThreadId`). If they have
  // never used the webapp, `getOrCreateActiveThread` mints a thread on the
  // fly so this code path stays single-track.
  const activeThread = await getOrCreateActiveThread(user.id, "WhatsApp");

  // ── Load conversation history from the unified messages table ──
  const recentMessages = await listMessages(user.id, activeThread.id, { limit: MAX_HISTORY });
  const history = recentMessages.map((m) => ({ role: m.role, content: m.content }));

  // ── Detect preference changes in user message ──
  const prefChanges = detectPreferenceChanges(text);
  if (prefChanges) {
    await prisma.whatsAppPreferences.update({
      where: { userId: user.id },
      data: prefChanges,
    });
    // Refresh for the system prompt
    prefsRow = { ...prefsRow, ...prefChanges };
  }

  // ── Infer communication style from history ──
  const allUserMsgs = [...history, { role: "user", content: text }];
  const inferredStyle = inferCommunicationStyle(allUserMsgs);
  if (inferredStyle && inferredStyle !== prefsRow.communicationStyle) {
    await prisma.whatsAppPreferences.update({
      where: { userId: user.id },
      data: { communicationStyle: inferredStyle },
    });
    prefsRow = { ...prefsRow, communicationStyle: inferredStyle };
  }

  // ── Save user message into the active thread ──
  // (legacy `whatsapp_messages` table is no longer written to; the migration
  // backfilled prior rows into `messages`.)
  await appendMessage({
    userId: user.id,
    threadId: activeThread.id,
    role: "user",
    content: text,
    source: "whatsapp",
    waMessageId: messageId,
  });

  // ── Reminder intent pre-pass ────────────────────────────────────────
  // Before paying for an LLM call, check whether the user is plainly asking
  // to set, cancel, or list reminders. If so, mutate the patient store and
  // reply directly. The webapp picks this up the next time it loads its
  // patient-store snapshot, so reminders set on WhatsApp appear in the
  // dashboard's Medication reminders list automatically.
  const reminderIntent = parseReminderIntent(text);
  if (reminderIntent) {
    const { store: nextStore, reply: reminderReply } = applyReminderIntent(store, reminderIntent);
    if (reminderIntent.kind !== "list") {
      // Persist the mutation server-side so the webapp sees it on next load.
      try {
        nextStore.updatedAtISO = new Date().toISOString();
        await prisma.patientRecord.upsert({
          where: { userId: user.id },
          update: { data: nextStore as unknown as object },
          create: { userId: user.id, data: nextStore as unknown as object },
        });
      } catch (err) {
        console.error("[WhatsApp] Failed to persist reminder change:", err instanceof Error ? err.message : err);
      }
    }
    await sendText(senderPhone, reminderReply);
    await appendMessage({
      userId: user.id,
      threadId: activeThread.id,
      role: "assistant",
      content: reminderReply,
      source: "whatsapp",
    });
    return;
  }

  // ── Build system prompt with preferences and call LLM ──
  const prefs: UserPrefs = {
    communicationStyle: prefsRow.communicationStyle ?? undefined,
    languageLevel: prefsRow.languageLevel ?? undefined,
    checkinTime: prefsRow.checkinTime ?? undefined,
    checkinEnabled: prefsRow.checkinEnabled,
    timezone: prefsRow.timezone ?? undefined,
    preferredName: prefsRow.preferredName ?? undefined,
  };

  const systemPrompt = buildRetrievalContext(store, prefs);

  const rawReply = await callLLM(systemPrompt, history, text);
  const reply = markdownToWhatsApp(rawReply);

  // ── Save assistant reply ──
  await appendMessage({
    userId: user.id,
    threadId: activeThread.id,
    role: "assistant",
    content: reply,
    source: "whatsapp",
  });

  // ── Extract and log wellness data (local regex, no extra LLM call) ──
  const wellness = extractWellnessLocal(text);
  if (wellness?.isWellnessResponse) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.wellnessLog.upsert({
        where: { userId_logDate: { userId: user.id, logDate: today } },
        update: {
          ...(wellness.mood != null ? { mood: wellness.mood } : {}),
          ...(wellness.energy != null ? { energy: wellness.energy } : {}),
          ...(wellness.symptoms ? { symptoms: wellness.symptoms } : {}),
          ...(wellness.medsTaken != null ? { medsTaken: wellness.medsTaken } : {}),
          ...(wellness.notes ? { notes: wellness.notes } : {}),
          rawMessage: text,
        },
        create: {
          userId: user.id,
          logDate: today,
          mood: wellness.mood ?? null,
          energy: wellness.energy ?? null,
          symptoms: wellness.symptoms ?? null,
          medsTaken: wellness.medsTaken ?? null,
          notes: wellness.notes ?? null,
          rawMessage: text,
        },
      });
    } catch (err) {
      // VULN-009: Don't log full error (may contain user health data)
      console.error("[WhatsApp] Wellness log save failed:", err instanceof Error ? err.message : "unknown");
    }
  }

  await sendText(senderPhone, reply);
}
