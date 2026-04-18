/**
 * Daily WhatsApp check-in cron endpoint.
 *
 * Designed to be called by Vercel Cron (or any external scheduler) every 15 minutes.
 * For each user whose preferred check-in time falls within the current window,
 * sends a gentle wellness check-in message via WhatsApp.
 *
 * Vercel Cron config (vercel.json):
 *   { "crons": [{ "path": "/api/whatsapp/cron", "schedule": "*/15 * * * *" }] }
 *
 * Security: protected by CRON_SECRET header (Vercel sets this automatically for cron jobs).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendText, isWhatsAppConfigured } from "@/lib/whatsapp/client";

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
 * Check if the current time (in the user's timezone) is within the check-in window.
 * We use a 15-minute window since the cron runs every 15 minutes.
 */
function isWithinCheckinWindow(checkinTime: string, timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const localTime = formatter.format(now); // "HH:mm"

    const [targetH, targetM] = checkinTime.split(":").map(Number);
    const [nowH, nowM] = localTime.split(":").map(Number);

    const targetMinutes = targetH * 60 + targetM;
    const nowMinutes = nowH * 60 + nowM;

    // Within a 15-minute window
    const diff = nowMinutes - targetMinutes;
    return diff >= 0 && diff < 15;
  } catch {
    return false;
  }
}

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

    const tz = pref.timezone || "Asia/Kolkata";
    if (!isWithinCheckinWindow(pref.checkinTime!, tz)) {
      skipped++;
      continue;
    }

    // Check if we already sent a check-in today
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
      const message = getRandomCheckinMessage();
      await sendText(user.whatsappPhone, message);

      // Log the check-in as an assistant message
      await prisma.whatsAppMessage.create({
        data: {
          userId: user.id,
          waId: user.whatsappPhone,
          role: "assistant",
          content: message,
        },
      });

      // Mark as sent
      await prisma.whatsAppPreferences.update({
        where: { userId: user.id },
        data: { lastCheckinSentAt: new Date() },
      });

      sent++;
    } catch (err) {
      console.error(`[WhatsApp Cron] Failed to send check-in to user ${user.id}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    total: eligibleUsers.length,
  });
}
