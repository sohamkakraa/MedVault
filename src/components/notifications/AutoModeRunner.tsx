"use client";

/**
 * AutoModeRunner — background effect that runs once per calendar day on app open.
 * Responsibilities:
 *  1. Call autoLogTodayDoses() — for medications in auto-tracking mode, inserts a
 *     "taken" health-log entry for today if one doesn't already exist. Silent — no
 *     notification is fired for routine auto-logging (would be noisy).
 *  2. Push an actionable `next_visit` notification if an appointment is within 3 days.
 *  3. Push cycle notifications (period soon / fertile window) for female users.
 *
 * All logic is client-side localStorage only. Not a medical device.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { autoLogTodayDoses, getStore, pushNotification } from "@/lib/store";

const LAST_RUN_KEY = "mv_auto_mode_last_run_v1";

export function AutoModeRunner() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login") return;

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const lastRun = typeof window !== "undefined" ? (localStorage.getItem(LAST_RUN_KEY) ?? "") : "";

    if (lastRun === today) return; // Already ran today

    // Mark as run for today immediately to prevent double-fires on fast re-mounts
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_RUN_KEY, today);
    }

    const store = getStore();

    // 1. Auto-log today's doses for auto-mode meds (silent — no notification for routine auto-logging)
    const autoMeds = (store.meds ?? []).filter((m) => m.trackingMode === "auto");
    if (autoMeds.length > 0) {
      autoLogTodayDoses();
      // Intentionally no notification here: "X was auto-logged" is a noisy system event,
      // not something the user needs to act on. Missed-dose alerts are handled separately.
    }

    // 2. Upcoming visit reminder (within 3 days)
    const nextVisit = store.profile?.nextVisitDate;
    if (nextVisit) {
      const daysUntil = Math.ceil(
        (new Date(nextVisit).getTime() - Date.now()) / 86_400_000
      );
      if (daysUntil >= 0 && daysUntil <= 3) {
        pushNotification({
          kind: "next_visit",
          title: daysUntil === 0 ? "Your appointment is today" : `Appointment in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
          body: `Scheduled with ${store.profile.primaryCareProvider || "your care provider"} on ${nextVisit}. Print your visit summary from the Dashboard.`,
          actionHref: "/dashboard",
          actionLabel: "Open Dashboard",
        });
      }
    }

    // 3. Cycle notifications (female users only)
    if (store.profile?.sex === "Female") {
      const cycle = store.profile?.menstrualCycle;
      if (cycle?.lastPeriodStartISO && cycle?.typicalCycleLengthDays) {
        const lastStart = new Date(cycle.lastPeriodStartISO);
        const cycleLen = cycle.typicalCycleLengthDays ?? 28;
        const nextPeriod = new Date(lastStart.getTime() + cycleLen * 86_400_000);
        const daysUntilPeriod = Math.ceil((nextPeriod.getTime() - Date.now()) / 86_400_000);

        if (daysUntilPeriod >= 0 && daysUntilPeriod <= 2) {
          pushNotification({
            kind: "cycle_period_soon",
            title: daysUntilPeriod === 0 ? "Your period may start today" : `Period expected in ${daysUntilPeriod} day${daysUntilPeriod === 1 ? "" : "s"}`,
            body: "Based on your cycle history. Update your last period date on your Profile if this is off.",
            actionHref: "/profile",
            actionLabel: "Update Profile",
          });
        }

        // Fertile window notification
        const ovulationDay = cycleLen - 14;
        const fertileStart = new Date(lastStart.getTime() + (ovulationDay - 5) * 86_400_000);
        const fertileEnd = new Date(lastStart.getTime() + (ovulationDay + 1) * 86_400_000);
        const now = Date.now();
        if (now >= fertileStart.getTime() && now <= fertileEnd.getTime()) {
          pushNotification({
            kind: "cycle_fertile",
            title: "Fertile window",
            body: "You're in your estimated fertile window. Tap to see full cycle details on your Dashboard.",
            actionHref: "/dashboard",
            actionLabel: "View Dashboard",
          });
        }
      }
    }
  }, [pathname]);

  return null;
}
