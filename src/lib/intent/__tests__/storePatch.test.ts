/**
 * Tests for the StorePatch applier — every op kind, edge cases,
 * and the new GeneralReminder ops.
 */
import { describe, it, expect } from "vitest";
import { applyStorePatch, type StorePatch } from "@/lib/intent/storePatch";
import type { PatientStore } from "@/lib/types";

function baseStore(overrides: Partial<PatientStore> = {}): PatientStore {
  return {
    docs: [],
    meds: [],
    labs: [],
    healthLogs: {
      bloodPressure: [],
      medicationIntake: [],
      sideEffects: [],
      medicationReminders: [],
      intervalReminders: [],
      generalReminders: [],
    },
    profile: {
      name: "Test User",
      firstName: "Test",
      lastName: "User",
      allergies: [],
      conditions: [],
      trends: [],
      internalId: "",
      countryCode: "",
    },
    preferences: { theme: "system" as const, onboarding: { lastStepReached: 1 as const } },
    standardLexicon: [],
    updatedAtISO: new Date().toISOString(),
    ...overrides,
  } as PatientStore;
}

function patch(ops: StorePatch["ops"]): StorePatch {
  return { ops, summary: "test" };
}

// ── Conditions ─────────────────────────────────────────────────────────────

describe("add_condition", () => {
  it("adds to empty list", () => {
    const { store, applied } = applyStorePatch(baseStore(), patch([{ kind: "add_condition", value: "diabetes" }]));
    expect(store.profile.conditions).toContain("Diabetes");
    expect(applied[0]).toMatch(/diabetes/i);
  });

  it("deduplicates case-insensitively", () => {
    const s = baseStore();
    s.profile.conditions = ["Diabetes"];
    const { store, skipped } = applyStorePatch(s, patch([{ kind: "add_condition", value: "DIABETES" }]));
    expect(store.profile.conditions).toHaveLength(1);
    expect(skipped[0]).toMatch(/already/i);
  });
});

describe("remove_condition", () => {
  it("removes by exact name", () => {
    const s = baseStore();
    s.profile.conditions = ["Diabetes", "Hypertension"];
    const { store } = applyStorePatch(s, patch([{ kind: "remove_condition", value: "Diabetes" }]));
    expect(store.profile.conditions).toEqual(["Hypertension"]);
  });

  it("skips if not present", () => {
    const s = baseStore();
    s.profile.conditions = ["Hypertension"];
    const { skipped } = applyStorePatch(s, patch([{ kind: "remove_condition", value: "Asthma" }]));
    expect(skipped).toHaveLength(1);
  });

  it("matches plural/singular", () => {
    const s = baseStore();
    s.profile.conditions = ["Headache"];
    const { store } = applyStorePatch(s, patch([{ kind: "remove_condition", value: "Headaches" }]));
    expect(store.profile.conditions).toHaveLength(0);
  });
});

// ── Allergies ───────────────────────────────────────────────────────────────

describe("add_allergy / remove_allergy", () => {
  it("adds and deduplicates", () => {
    const s = baseStore();
    const r1 = applyStorePatch(s, patch([{ kind: "add_allergy", value: "peanuts" }]));
    expect(r1.store.profile.allergies).toContain("Peanuts");
    const r2 = applyStorePatch(r1.store, patch([{ kind: "add_allergy", value: "Peanuts" }]));
    expect(r2.store.profile.allergies).toHaveLength(1);
    expect(r2.skipped).toHaveLength(1);
  });

  it("removes existing", () => {
    const s = baseStore();
    s.profile.allergies = ["Peanuts", "Shellfish"];
    const { store } = applyStorePatch(s, patch([{ kind: "remove_allergy", value: "peanuts" }]));
    expect(store.profile.allergies).toEqual(["Shellfish"]);
  });
});

// ── Medications ─────────────────────────────────────────────────────────────

describe("add_medication / remove_medication", () => {
  it("adds with dose", () => {
    const { store } = applyStorePatch(
      baseStore(),
      patch([{ kind: "add_medication", name: "metformin", dose: "500mg", frequency: "twice daily" }]),
    );
    expect(store.meds[0].name).toBe("Metformin");
    expect(store.meds[0].dose).toBe("500mg");
  });

  it("deduplicates by name", () => {
    const s = baseStore();
    s.meds = [{ name: "Metformin", dose: "500mg", frequency: "" }];
    const { skipped } = applyStorePatch(s, patch([{ kind: "add_medication", name: "metformin" }]));
    expect(skipped).toHaveLength(1);
  });

  it("removes by name", () => {
    const s = baseStore();
    s.meds = [{ name: "Metformin", dose: "500mg", frequency: "" }, { name: "Atorvastatin", dose: "10mg", frequency: "" }];
    const { store } = applyStorePatch(s, patch([{ kind: "remove_medication", name: "Metformin" }]));
    expect(store.meds).toHaveLength(1);
    expect(store.meds[0].name).toBe("Atorvastatin");
  });
});

// ── Appointment ─────────────────────────────────────────────────────────────

describe("set_next_appointment", () => {
  it("sets all fields", () => {
    const { store } = applyStorePatch(
      baseStore(),
      patch([{ kind: "set_next_appointment", doctor: "Dr. Iyer", clinic: "Apollo", dateISO: "2026-06-01", timeHHmm: "10:00" }]),
    );
    expect(store.profile.primaryCareProvider).toBe("Dr. Iyer");
    expect(store.profile.nextVisitHospital).toBe("Apollo");
    expect(store.profile.nextVisitDate).toBe("2026-06-01T10:00:00");
  });

  it("skips when no fields given", () => {
    const { skipped } = applyStorePatch(baseStore(), patch([{ kind: "set_next_appointment" }]));
    expect(skipped).toHaveLength(1);
  });
});

// ── Side effects ────────────────────────────────────────────────────────────

describe("log_side_effect", () => {
  it("logs an entry", () => {
    const { store } = applyStorePatch(
      baseStore(),
      patch([{ kind: "log_side_effect", description: "headache after lunch", intensity: "mild" }]),
    );
    expect(store.healthLogs!.sideEffects).toHaveLength(1);
    expect(store.healthLogs!.sideEffects[0].intensity).toBe("mild");
  });
});

describe("clear_side_effects_matching", () => {
  it("clears matching entries", () => {
    const s = baseStore();
    s.healthLogs!.sideEffects = [
      { id: "a", loggedAtISO: "", description: "headache after lunch", intensity: "mild" },
      { id: "b", loggedAtISO: "", description: "nausea in morning", intensity: "moderate" },
    ];
    const { store } = applyStorePatch(s, patch([{ kind: "clear_side_effects_matching", query: "headache" }]));
    expect(store.healthLogs!.sideEffects).toHaveLength(1);
  });

  it("skips when no match", () => {
    const s = baseStore();
    s.healthLogs!.sideEffects = [{ id: "a", loggedAtISO: "", description: "nausea", intensity: "mild" }];
    const { skipped } = applyStorePatch(s, patch([{ kind: "clear_side_effects_matching", query: "fever" }]));
    expect(skipped).toHaveLength(1);
  });
});

// ── Reminders ───────────────────────────────────────────────────────────────

describe("set_reminder / cancel_reminder", () => {
  it("sets a daily medication reminder", () => {
    const { store } = applyStorePatch(
      baseStore(),
      patch([{ kind: "set_reminder", medicationName: "Metformin", timeLocalHHmm: "08:00", repeatDaily: true }]),
    );
    const r = store.healthLogs!.medicationReminders[0];
    expect(r.medicationName).toBe("Metformin");
    expect(r.timeLocalHHmm).toBe("08:00");
    expect(r.enabled).toBe(true);
  });

  it("replaces existing reminder for same medication", () => {
    const s = baseStore();
    applyStorePatch(s, patch([{ kind: "set_reminder", medicationName: "Metformin", timeLocalHHmm: "08:00", repeatDaily: true }]));
    const s2 = applyStorePatch(s, patch([{ kind: "set_reminder", medicationName: "Metformin", timeLocalHHmm: "08:00", repeatDaily: true }])).store;
    const s3 = applyStorePatch(s2, patch([{ kind: "set_reminder", medicationName: "Metformin", timeLocalHHmm: "20:00", repeatDaily: true }])).store;
    const active = s3.healthLogs!.medicationReminders.filter((r) => r.enabled);
    expect(active).toHaveLength(1);
    expect(active[0].timeLocalHHmm).toBe("20:00");
  });

  it("cancels an existing reminder", () => {
    const s = baseStore();
    const s2 = applyStorePatch(s, patch([{ kind: "set_reminder", medicationName: "Metformin", timeLocalHHmm: "08:00", repeatDaily: true }])).store;
    const { store, applied } = applyStorePatch(s2, patch([{ kind: "cancel_reminder", medicationName: "Metformin" }]));
    expect(store.healthLogs!.medicationReminders[0].enabled).toBe(false);
    expect(applied[0]).toMatch(/stopped/i);
  });

  it("skips cancel if nothing to cancel", () => {
    const { skipped } = applyStorePatch(baseStore(), patch([{ kind: "cancel_reminder", medicationName: "Metformin" }]));
    expect(skipped).toHaveLength(1);
  });
});

// ── General reminders ────────────────────────────────────────────────────────

describe("set_general_reminder", () => {
  it("sets a daily reminder", () => {
    const { store, applied } = applyStorePatch(
      baseStore(),
      patch([{ kind: "set_general_reminder", label: "Blood pressure check", recurrence: "daily", dailyTimeHHmm: "09:00" }]),
    );
    const r = (store.healthLogs as { generalReminders: { label: string; recurrence: string; dailyTimeHHmm?: string; enabled: boolean }[] }).generalReminders[0];
    expect(r.label).toBe("Blood pressure check");
    expect(r.recurrence).toBe("daily");
    expect(r.dailyTimeHHmm).toBe("09:00");
    expect(r.enabled).toBe(true);
    expect(applied[0]).toMatch(/daily at 09:00/i);
  });

  it("sets a one-time reminder", () => {
    const { store } = applyStorePatch(
      baseStore(),
      patch([{ kind: "set_general_reminder", label: "Dental appointment", recurrence: "once", triggerAtISO: "2026-06-15T14:00:00" }]),
    );
    const hl = store.healthLogs as { generalReminders: { label: string; recurrence: string; triggerAtISO?: string }[] };
    expect(hl.generalReminders[0].triggerAtISO).toBe("2026-06-15T14:00:00");
  });

  it("sets a weekly reminder", () => {
    const { store, applied } = applyStorePatch(
      baseStore(),
      patch([{ kind: "set_general_reminder", label: "Weigh myself", recurrence: "weekly", weekdays: [1], weeklyTimeHHmm: "07:00" }]),
    );
    const hl = store.healthLogs as { generalReminders: { label: string; weekdays?: number[] }[] };
    expect(hl.generalReminders[0].weekdays).toEqual([1]);
    expect(applied[0]).toMatch(/Mon/);
  });

  it("sets an interval reminder", () => {
    const { store, applied } = applyStorePatch(
      baseStore(),
      patch([{
        kind: "set_general_reminder",
        label: "Drink water",
        recurrence: "interval",
        intervalMinutes: 60,
        windowStartHHmm: "08:00",
        windowEndHHmm: "22:00",
        startingFromHHmm: "16:00",
        amountMl: 800,
      }]),
    );
    const hl = store.healthLogs as { generalReminders: { intervalMinutes?: number; amountMl?: number }[] };
    expect(hl.generalReminders[0].intervalMinutes).toBe(60);
    expect(hl.generalReminders[0].amountMl).toBe(800);
    expect(applied[0]).toMatch(/every 1h/i);
  });

  it("disables existing reminder with same label (replace semantics)", () => {
    const s = baseStore();
    const s2 = applyStorePatch(s, patch([{ kind: "set_general_reminder", label: "Water", recurrence: "daily", dailyTimeHHmm: "09:00" }])).store;
    const s3 = applyStorePatch(s2, patch([{ kind: "set_general_reminder", label: "Water", recurrence: "daily", dailyTimeHHmm: "10:00" }])).store;
    const hl = s3.healthLogs as { generalReminders: { label: string; enabled: boolean; dailyTimeHHmm?: string }[] };
    const active = hl.generalReminders.filter((r) => r.enabled);
    expect(active).toHaveLength(1);
    expect(active[0].dailyTimeHHmm).toBe("10:00");
  });
});

describe("cancel_general_reminder", () => {
  it("disables matching reminder", () => {
    const s = baseStore();
    const s2 = applyStorePatch(s, patch([{ kind: "set_general_reminder", label: "Water", recurrence: "daily", dailyTimeHHmm: "09:00" }])).store;
    const { store, applied } = applyStorePatch(s2, patch([{ kind: "cancel_general_reminder", label: "Water" }]));
    const hl = store.healthLogs as { generalReminders: { enabled: boolean }[] };
    expect(hl.generalReminders[0].enabled).toBe(false);
    expect(applied[0]).toMatch(/stopped/i);
  });

  it("skips when no active reminder matches", () => {
    const { skipped } = applyStorePatch(baseStore(), patch([{ kind: "cancel_general_reminder", label: "Stretch" }]));
    expect(skipped).toHaveLength(1);
  });
});

// ── Profile field ────────────────────────────────────────────────────────────

describe("set_profile_field", () => {
  it("updates a known profile field", () => {
    const { store } = applyStorePatch(
      baseStore(),
      patch([{ kind: "set_profile_field", field: "name", value: "Soham" }]),
    );
    expect(store.profile.name).toBe("Soham");
  });
});

// ── Multi-op batching ────────────────────────────────────────────────────────

describe("multi-op patch", () => {
  it("applies all ops in order", () => {
    const { store, applied } = applyStorePatch(
      baseStore(),
      patch([
        { kind: "add_condition", value: "diabetes" },
        { kind: "add_allergy", value: "penicillin" },
        { kind: "set_general_reminder", label: "Morning walk", recurrence: "daily", dailyTimeHHmm: "07:00" },
      ]),
    );
    expect(store.profile.conditions).toHaveLength(1);
    expect(store.profile.allergies).toHaveLength(1);
    const hl = store.healthLogs as { generalReminders: unknown[] };
    expect(hl.generalReminders).toHaveLength(1);
    expect(applied).toHaveLength(3);
  });

  it("continues after a skipped op", () => {
    const s = baseStore();
    s.profile.conditions = ["Diabetes"];
    const { store, applied, skipped } = applyStorePatch(
      s,
      patch([
        { kind: "add_condition", value: "Diabetes" }, // will be skipped
        { kind: "add_allergy", value: "peanuts" },    // will be applied
      ]),
    );
    expect(applied).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(store.profile.allergies).toHaveLength(1);
  });
});
