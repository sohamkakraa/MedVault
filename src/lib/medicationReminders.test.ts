import { describe, expect, it } from "vitest";
import type { MedicationReminderEntry } from "@/lib/types";
import { nextReminderFireAt } from "@/lib/medicationReminders";

function base(overrides: Partial<MedicationReminderEntry>): MedicationReminderEntry {
  return {
    id: "r1",
    medicationName: "Vitamin D",
    timeLocalHHmm: "09:00",
    repeatDaily: true,
    enabled: true,
    createdAtISO: "2026-04-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("nextReminderFireAt", () => {
  it("returns null when disabled", () => {
    const now = new Date(2026, 3, 12, 8, 0, 0);
    expect(nextReminderFireAt(base({ enabled: false }), now)).toBeNull();
  });

  it("schedules later today when daily time is still ahead", () => {
    const now = new Date(2026, 3, 12, 8, 0, 0);
    const next = nextReminderFireAt(base({ timeLocalHHmm: "10:30" }), now);
    const expected = new Date(2026, 3, 12, 10, 30, 0);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(expected.getTime());
  });

  it("rolls to tomorrow when daily time already passed", () => {
    const now = new Date(2026, 3, 12, 11, 0, 0);
    const next = nextReminderFireAt(base({ timeLocalHHmm: "09:00" }), now);
    const expected = new Date(2026, 3, 13, 9, 0, 0);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(expected.getTime());
  });

  it("returns one-shot instant when in the future", () => {
    const now = new Date(2026, 3, 12, 10, 0, 0);
    const once = new Date(2026, 3, 12, 15, 0, 0).toISOString();
    const next = nextReminderFireAt(
      base({
        repeatDaily: false,
        remindOnceAtISO: once,
        timeLocalHHmm: "00:00",
      }),
      now
    );
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(new Date(once).getTime());
  });

  it("returns null for one-shot in the past", () => {
    const now = new Date(2026, 3, 12, 18, 0, 0);
    expect(
      nextReminderFireAt(
        base({
          repeatDaily: false,
          remindOnceAtISO: new Date(2026, 3, 12, 8, 0, 0).toISOString(),
        }),
        now
      )
    ).toBeNull();
  });
});
