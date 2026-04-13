import type { MedicationReminderEntry } from "@/lib/types";

function parseHHmm(s: string): { h: number; m: number } | null {
  const t = s.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/** Next moment this reminder should fire, or null if disabled / invalid / one-time already passed. */
export function nextReminderFireAt(entry: MedicationReminderEntry, now: Date = new Date()): Date | null {
  if (!entry.enabled) return null;

  if (!entry.repeatDaily) {
    const iso = entry.remindOnceAtISO?.trim();
    if (!iso) return null;
    const t = new Date(iso);
    if (Number.isNaN(t.getTime()) || t.getTime() <= now.getTime()) return null;
    return t;
  }

  const hm = parseHHmm(entry.timeLocalHHmm);
  if (!hm) return null;

  const next = new Date(now);
  next.setMilliseconds(0);
  next.setSeconds(0, 0);
  next.setHours(hm.h, hm.m, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function describeMedicationReminder(entry: MedicationReminderEntry): string {
  if (entry.repeatDaily) {
    const hm = parseHHmm(entry.timeLocalHHmm);
    if (!hm) return "Daily at chosen time";
    const probe = new Date();
    probe.setHours(hm.h, hm.m, 0, 0);
    const label = probe.toLocaleTimeString(undefined, { timeStyle: "short" });
    return `Every day at ${label}`;
  }
  const iso = entry.remindOnceAtISO?.trim();
  if (!iso) return "One-time reminder";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "One-time reminder";
  return `Once · ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}
