"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getStore } from "@/lib/store";
import { nextReminderFireAt } from "@/lib/medicationReminders";
import type { MedicationReminderEntry } from "@/lib/types";

function fireNotification(entry: MedicationReminderEntry) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const name = entry.medicationName.trim() || "your medicine";
    new Notification("Medication reminder", {
      body: `Time to take ${name}.`,
      tag: `uma-med-reminder-${entry.id}`,
    });
  } catch {
    /* Notification constructor can throw in locked-down contexts */
  }
}

/**
 * Schedules browser notifications for enabled medication reminders while UMA is open.
 * Not a medical device; requires notification permission and an active browser session.
 */
export function MedicationReminderRunner() {
  const pathname = usePathname();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (pathname === "/login") {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
      return;
    }

    function clearAll() {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    }

    function scheduleAll() {
      clearAll();
      const list = getStore().healthLogs?.medicationReminders ?? [];
      const now = new Date();

      for (const entry of list) {
        const fireAt = nextReminderFireAt(entry, now);
        if (!fireAt) continue;
        const delay = Math.max(0, fireAt.getTime() - now.getTime());
        const id = entry.id;
        const t = setTimeout(() => {
          fireNotification(entry);
          window.dispatchEvent(new CustomEvent("uma-med-reminder-fired"));
        }, delay);
        timersRef.current.set(id, t);
      }
    }

    scheduleAll();
    const on = () => scheduleAll();
    window.addEventListener("mv-store-update", on);
    window.addEventListener("focus", on);
    window.addEventListener("uma-med-reminder-fired", on);
    return () => {
      window.removeEventListener("mv-store-update", on);
      window.removeEventListener("focus", on);
      window.removeEventListener("uma-med-reminder-fired", on);
      clearAll();
    };
  }, [pathname]);

  return null;
}
