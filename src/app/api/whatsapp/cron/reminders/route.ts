/**
 * Hourly interval-reminder cron.
 *
 * Called by Vercel Cron on "0 * * * *" (every hour). For each user with
 * verified WhatsApp and at least one enabled interval reminder, checks
 * whether a reminder should fire this hour and sends it via WhatsApp.
 *
 * Fire logic:
 *   1. Current local time (in user's timezone) must be within the reminder's
 *      windowStartHHmm–windowEndHHmm.
 *   2. On the day the reminder was created, current local time must be >= startingFromHHmm.
 *   3. Either: reminder has never fired, OR >= intervalMinutes have elapsed since lastFiredAtISO.
 *
 * After sending, updates lastFiredAtISO in the PatientRecord JSON.
 *
 * Security: protected by x-vercel-signature or CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendText, isWhatsAppConfigured } from "@/lib/whatsapp/client";
import { parsePatientStoreJson } from "@/lib/patientStoreApi";
import type { IntervalReminderEntry } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev — no secret configured
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Convert HH:mm string to minutes-since-midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Get current HH:mm in a given IANA timezone (or UTC fallback). */
function localHHmm(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(new Date())
      .replace(",", "")
      .trim();
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(new Date())
      .trim();
  }
}

/** Get current date string (YYYY-MM-DD) in a given IANA timezone. */
function localDateISO(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone })
      .format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function shouldFire(reminder: IntervalReminderEntry, timezone: string): boolean {
  const nowHHmm = localHHmm(timezone);
  const nowMin = toMinutes(nowHHmm);
  const startMin = toMinutes(reminder.windowStartHHmm);
  const endMin = toMinutes(reminder.windowEndHHmm);

  // Must be within the window (handles midnight-spanning windows)
  const inWindow =
    startMin <= endMin
      ? nowMin >= startMin && nowMin < endMin
      : nowMin >= startMin || nowMin < endMin;

  if (!inWindow) return false;

  // On the creation day, enforce startingFromHHmm
  if (reminder.startingFromHHmm) {
    const creationDate = reminder.createdAtISO.slice(0, 10);
    const todayDate = localDateISO(timezone);
    if (creationDate === todayDate) {
      const startFromMin = toMinutes(reminder.startingFromHHmm);
      if (nowMin < startFromMin) return false;
    }
  }

  // Check interval gate
  if (reminder.lastFiredAtISO) {
    const msSinceFired = Date.now() - new Date(reminder.lastFiredAtISO).getTime();
    const minSinceFired = msSinceFired / 60000;
    if (minSinceFired < reminder.intervalMinutes - 5) return false; // 5min grace
  }

  return true;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ ok: false, error: "WhatsApp not configured" });
  }

  const users = await prisma.user.findMany({
    where: { whatsappVerified: true, whatsappPhone: { not: null } },
    select: { id: true, whatsappPhone: true },
  });

  let fired = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const record = await prisma.patientRecord.findUnique({ where: { userId: user.id } });
      if (!record) continue;
      const store = parsePatientStoreJson(record.data);
      if (!store) continue;

      const intervalReminders = (
        (store.healthLogs as { intervalReminders?: IntervalReminderEntry[] })?.intervalReminders ?? []
      ).filter((r) => r.enabled);

      if (intervalReminders.length === 0) continue;

      const prefs = await prisma.whatsAppPreferences.findUnique({ where: { userId: user.id } });
      const timezone = prefs?.timezone ?? "Asia/Kolkata";

      let storeChanged = false;

      for (const reminder of intervalReminders) {
        if (!shouldFire(reminder, timezone)) continue;

        const bottleNote =
          reminder.bottleMl
            ? ` (${reminder.bottleMl}ml bottle)`
            : "";
        const msg = `💧 Time for your water reminder! "${reminder.label}"${bottleNote}\n\nHave your water and reply _done_ when you finish — I'll log it for you.`;

        try {
          await sendText(user.whatsappPhone!, msg);
          reminder.lastFiredAtISO = new Date().toISOString();
          storeChanged = true;
          fired++;
        } catch (err) {
          console.error(`[reminders cron] sendText failed for user ${user.id}:`, err instanceof Error ? err.message : err);
          errors++;
        }
      }

      if (storeChanged) {
        (store.healthLogs as { intervalReminders?: IntervalReminderEntry[] }).intervalReminders =
          intervalReminders;
        store.updatedAtISO = new Date().toISOString();
        await prisma.patientRecord.update({
          where: { userId: user.id },
          data: { data: store as unknown as object },
        });
      }
    } catch (err) {
      console.error(`[reminders cron] Error processing user ${user.id}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return NextResponse.json({ ok: true, fired, errors, usersChecked: users.length });
}
