/**
 * Daily WhatsApp check-in cron endpoint.
 *
 * Designed to be called by Vercel Cron once daily (Hobby plan: "0 4 * * *" = 4:00 UTC).
 * Sends a gentle wellness check-in message to all users with check-ins enabled
 * who haven't received one in the last 20 hours.
 *
 * On Pro plan, switch to every-15-min schedule and re-enable per-user time-window logic.
 *
 * Security: protected by CRON_SECRET header (Vercel sets this automatically for cron jobs).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendText, isWhatsAppConfigured } from "@/lib/whatsapp/client";
import { parsePatientStoreJson } from "@/lib/patientStoreApi";
import type { MedicationReminderEntry } from "@/lib/types";
import { getOrCreateActiveThread, appendMessage } from "@/lib/server/threads";

export const runtime = "nodejs";
export const maxDuration = 60; // allow up to 60s for processing multiple users

const CHECKIN_MESSAGES = [
  "Good morning! ☀️ How are you feeling today? Just a quick check-in from UMA.",
  "Hey! 👋 Time for your daily check-in. How's your mood and energy today?",
  "Hi there! 🌿 UMA here for your wellness check. How are you doing today?",
  "Good day! 💙 Just checking in — how are you feeling? Any symptoms or anything on your mind?",
  "Hello! 🌸 Daily wellness check — how's your mood today? And did you take your medications?",
];

function getRandomCheckinMessage(): string {
  return CHECKIN_MESSAGES[Math.floor(Math.random() * CHECKIN_MESSAGES.length)];
}

/**
 * On the Vercel Hobby plan, cron runs once daily (0 4 * * * = 4:00 UTC).
 * We skip the time-of-day check and simply send to all users who have
 * check-ins enabled and haven't received one in the last 20 hours.
 * The lastCheckinSentAt guard prevents duplicate sends.
 *
 * On Pro plan, switch schedule to every-15-min cron and re-enable the
 * time-window check below for per-user preferred times.
 */
// function isWithinCheckinWindow(checkinTime: string, timezone: string): boolean { ... }

export async function GET(req: NextRequest) {
  // VULN-007 fix: Always require auth — fail closed if CRON_SECRET is not set.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[WhatsApp Cron] CRON_SECRET not set — rejecting request for security.");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ error: "WhatsApp not configured" }, { status: 503 });
  }

  // Find all users with check-ins enabled
  const eligibleUsers = await prisma.whatsAppPreferences.findMany({
    where: {
      checkinEnabled: true,
      checkinTime: { not: null },
    },
    include: {
      user: { select: { id: true, whatsappPhone: true, whatsappVerified: true } },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const pref of eligibleUsers) {
    const { user } = pref;
    if (!user.whatsappPhone || !user.whatsappVerified) {
      skipped++;
      continue;
    }

    // Check if we already sent a check-in today (20h dedup window)
    if (pref.lastCheckinSentAt) {
      const lastSent = new Date(pref.lastCheckinSentAt);
      const now = new Date();
      // If sent within the last 20 hours, skip (prevents duplicates)
      if (now.getTime() - lastSent.getTime() < 20 * 60 * 60 * 1000) {
        skipped++;
        continue;
      }
    }

    try {
      // Compose a single message that combines the wellness check-in with
      // today's reminder digest. On the Hobby plan this is the only outbound
      // we'll send today, so packing both signals into one message is the
      // honest UX choice — one notification, one read.
      const checkinPart = getRandomCheckinMessage();
      const reminderDigest = await buildReminderDigestForUser(user.id);
      const message = reminderDigest ? `${checkinPart}\n\n${reminderDigest}` : checkinPart;
      await sendText(user.whatsappPhone, message);

      // Log the check-in as an assistant message in the user's active thread
      // (cron-sourced, so source="system" — this lets the webapp UI render a
      // small "from UMA" chip distinct from a manual reply).
      const thread = await getOrCreateActiveThread(user.id, "WhatsApp");
      await appendMessage({
        userId: user.id,
        threadId: thread.id,
        role: "assistant",
        content: message,
        source: "system",
      });

      // Mark as sent
      await prisma.whatsAppPreferences.update({
        where: { userId: user.id },
        data: { lastCheckinSentAt: new Date() },
      });

      sent++;
    } catch (err) {
      console.error(`[WhatsApp Cron] Failed to send check-in to user ${user.id}:`, err instanceof Error ? err.message : "unknown");
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    total: eligibleUsers.length,
  });
}

/**
 * Build a one-line-per-reminder digest of every active medication reminder
 * the user has set, ordered by time-of-day. Returns null if the user has
 * none — caller decides whether to fall back to a pure check-in message.
 *
 * Vercel Hobby plan only allows once-daily cron, so we surface the user's
 * full schedule once per morning. Reminders set on WhatsApp via
 * `parseReminderIntent` and reminders set on the webapp both flow through
 * `PatientRecord.data.healthLogs.medicationReminders`, so this digest is
 * authoritative across both surfaces.
 */
async function buildReminderDigestForUser(userId: string): Promise<string | null> {
  const record = await prisma.patientRecord.findUnique({ where: { userId } });
  if (!record) return null;
  const store = parsePatientStoreJson(record.data);
  if (!store) return null;
  const reminders: MedicationReminderEntry[] = store.healthLogs?.medicationReminders ?? [];
  const active = reminders
    .filter((r) => r.enabled && r.repeatDaily && /^\d{2}:\d{2}$/.test(r.timeLocalHHmm))
    .sort((a, b) => a.timeLocalHHmm.localeCompare(b.timeLocalHHmm));
  if (active.length === 0) return null;
  const lines = active.map((r) => `• ${r.timeLocalHHmm} — ${r.medicationName}`);
  return `📋 Today's reminders:\n${lines.join("\n")}\n\nReply "taken metformin" or "skipped vitamin d" to log a dose.`;
}

