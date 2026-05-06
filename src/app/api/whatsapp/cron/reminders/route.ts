/**
 * Hourly interval-reminder cron.
 *
 * Called by Vercel Cron on "0 * * * *" (every hour, Pro plan).
 * For each verified WhatsApp user, fires any due reminder (interval,
 * daily, weekly, or one-time) and updates lastFiredAtISO in the store.
 *
 * Security: protected by CRON_SECRET header (Vercel sets it automatically).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendText, isWhatsAppConfigured } from "@/lib/whatsapp/client";
import { parsePatientStoreJson } from "@/lib/patientStoreApi";
import type { GeneralReminderEntry, IntervalReminderEntry } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function verifyCronSecret(req: NextRequest): { ok: boolean; missingSecret: boolean } {
  const secret = process.env.CRON_SECRET;
  // Fixed VULN-002: fail CLOSED when CRON_SECRET is not set.
  // Previously this returned true (allowing any unauthenticated request through).
  // Mirror the pattern in /api/whatsapp/cron/route.ts — reject with 503 if
  // the env var is absent so a misconfigured deployment is safe by default.
  if (!secret) return { ok: false, missingSecret: true };
  const auth = req.headers.get("authorization");
  return { ok: auth === `Bearer ${secret}`, missingSecret: false };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

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

function localDateISO(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Day-of-week in given timezone (0=Sun…6=Sat). */
function localDayOfWeek(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
      .format(new Date());
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts);
  } catch {
    return new Date().getDay();
  }
}

function inWindow(nowMin: number, startMin: number, endMin: number): boolean {
  return startMin <= endMin
    ? nowMin >= startMin && nowMin < endMin
    : nowMin >= startMin || nowMin < endMin;
}

function intervalShouldFire(r: IntervalReminderEntry, timezone: string): boolean {
  const nowHHmm = localHHmm(timezone);
  const nowMin = toMinutes(nowHHmm);
  if (!inWindow(nowMin, toMinutes(r.windowStartHHmm), toMinutes(r.windowEndHHmm))) return false;
  if (r.startingFromHHmm && r.createdAtISO.slice(0, 10) === localDateISO(timezone)) {
    if (nowMin < toMinutes(r.startingFromHHmm)) return false;
  }
  if (r.lastFiredAtISO) {
    const minSince = (Date.now() - new Date(r.lastFiredAtISO).getTime()) / 60000;
    if (minSince < r.intervalMinutes - 5) return false;
  }
  return true;
}

function generalShouldFire(r: GeneralReminderEntry, timezone: string): boolean {
  const nowHHmm = localHHmm(timezone);
  const nowMin = toMinutes(nowHHmm);
  const todayISO = localDateISO(timezone);

  switch (r.recurrence) {
    case "once": {
      if (!r.triggerAtISO) return false;
      const fireDate = r.triggerAtISO.slice(0, 10);
      const fireHHmm = r.triggerAtISO.slice(11, 16);
      if (fireDate !== todayISO) return false;
      if (r.lastFiredAtISO) return false; // already fired
      return nowMin >= toMinutes(fireHHmm);
    }
    case "daily": {
      if (!r.dailyTimeHHmm) return false;
      const target = toMinutes(r.dailyTimeHHmm);
      // Fire if we're within the same hour-slot as the target time
      if (nowMin < target || nowMin >= target + 60) return false;
      // Don't re-fire today
      if (r.lastFiredAtISO && r.lastFiredAtISO.slice(0, 10) === todayISO) return false;
      return true;
    }
    case "weekly": {
      if (!r.weekdays?.length || !r.weeklyTimeHHmm) return false;
      const dow = localDayOfWeek(timezone);
      if (!r.weekdays.includes(dow)) return false;
      const target = toMinutes(r.weeklyTimeHHmm);
      if (nowMin < target || nowMin >= target + 60) return false;
      if (r.lastFiredAtISO && r.lastFiredAtISO.slice(0, 10) === todayISO) return false;
      return true;
    }
    case "interval": {
      if (!r.intervalMinutes || !r.windowStartHHmm || !r.windowEndHHmm) return false;
      if (!inWindow(nowMin, toMinutes(r.windowStartHHmm), toMinutes(r.windowEndHHmm))) return false;
      if (r.startingFromHHmm && r.createdAtISO.slice(0, 10) === todayISO) {
        if (nowMin < toMinutes(r.startingFromHHmm)) return false;
      }
      if (r.lastFiredAtISO) {
        const minSince = (Date.now() - new Date(r.lastFiredAtISO).getTime()) / 60000;
        if (minSince < r.intervalMinutes - 5) return false;
      }
      return true;
    }
  }
}

function buildReminderMessage(r: GeneralReminderEntry): string {
  const base = `⏰ Reminder: *${r.label}*`;
  const extra = r.notes ? `\n${r.notes}` : "";
  const waterNote =
    r.amountMl
      ? `\n\nWhen done, reply _done_ and I'll log your ${r.amountMl}ml.`
      : "";
  return `${base}${extra}${waterNote}`;
}

export async function GET(req: NextRequest) {
  const cronCheck = verifyCronSecret(req);
  if (!cronCheck.ok) {
    if (cronCheck.missingSecret) {
      console.error("[reminders cron] CRON_SECRET not set — rejecting request for security.");
      return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ ok: false, error: "WhatsApp not configured" });
  }

  const users = await prisma.user.findMany({
    where: { whatsappVerified: true, whatsappPhone: { not: null } },
    select: { id: true, whatsappPhone: true },
  }) as { id: string; whatsappPhone: string }[];

  let fired = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const record = await prisma.patientRecord.findUnique({ where: { userId: user.id } });
      if (!record) continue;
      const store = parsePatientStoreJson(record.data);
      if (!store) continue;

      const hl = store.healthLogs as {
        intervalReminders?: IntervalReminderEntry[];
        generalReminders?: GeneralReminderEntry[];
      };
      const intervalReminders = (hl?.intervalReminders ?? []).filter((r) => r.enabled);
      const generalReminders = (hl?.generalReminders ?? []).filter((r) => r.enabled);

      if (intervalReminders.length === 0 && generalReminders.length === 0) continue;

      const prefs = await prisma.whatsAppPreferences.findUnique({ where: { userId: user.id } });
      const timezone = prefs?.timezone ?? "Asia/Kolkata";

      let storeChanged = false;

      // ── Legacy interval reminders ──
      for (const reminder of intervalReminders) {
        if (!intervalShouldFire(reminder, timezone)) continue;
        const bottleNote = reminder.bottleMl ? ` (${reminder.bottleMl}ml bottle)` : "";
        const msg = `💧 Reminder: *${reminder.label}*${bottleNote}\n\nHave your water and reply _done_ when you finish — I'll log it for you.`;
        try {
          await sendText(user.whatsappPhone, msg);
          reminder.lastFiredAtISO = new Date().toISOString();
          storeChanged = true;
          fired++;
        } catch (err) {
          console.error(`[reminders cron] interval fire failed for ${user.id}:`, err instanceof Error ? err.message : err);
          errors++;
        }
      }

      // ── General reminders ──
      for (const reminder of generalReminders) {
        if (!generalShouldFire(reminder, timezone)) continue;
        const msg = buildReminderMessage(reminder);
        try {
          await sendText(user.whatsappPhone, msg);
          reminder.lastFiredAtISO = new Date().toISOString();
          storeChanged = true;
          fired++;
        } catch (err) {
          console.error(`[reminders cron] general fire failed for ${user.id}:`, err instanceof Error ? err.message : err);
          errors++;
        }
      }

      if (storeChanged) {
        hl.intervalReminders = intervalReminders;
        hl.generalReminders = generalReminders;
        store.updatedAtISO = new Date().toISOString();
        await prisma.patientRecord.update({
          where: { userId: user.id },
          data: { data: store as unknown as object },
        });
      }
    } catch (err) {
      console.error(`[reminders cron] Error for user ${user.id}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return NextResponse.json({ ok: true, fired, errors, usersChecked: users.length });
}
