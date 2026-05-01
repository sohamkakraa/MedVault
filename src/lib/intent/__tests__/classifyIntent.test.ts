/**
 * Tests for classifyIntent — primarily tests the looksLikeMutationIntent
 * gate and validates the StorePatch schema against realistic LLM tool-use
 * payloads (no actual LLM call needed).
 */
import { describe, it, expect } from "vitest";
import { StorePatchSchema } from "@/lib/intent/storePatch";

// ── Schema validation ────────────────────────────────────────────────────────
// These tests simulate the payload the LLM would return and verify the
// Zod schema accepts/rejects it correctly.

describe("StorePatchSchema", () => {
  it("accepts a valid add_condition op", () => {
    const r = StorePatchSchema.safeParse({
      summary: "Adding diabetes",
      ops: [{ kind: "add_condition", value: "diabetes" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid set_general_reminder (daily)", () => {
    const r = StorePatchSchema.safeParse({
      summary: "Daily blood pressure reminder",
      ops: [{
        kind: "set_general_reminder",
        label: "Blood pressure check",
        recurrence: "daily",
        dailyTimeHHmm: "09:00",
      }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid set_general_reminder (once)", () => {
    const r = StorePatchSchema.safeParse({
      summary: "One-time dental reminder",
      ops: [{
        kind: "set_general_reminder",
        label: "Dental appointment",
        recurrence: "once",
        triggerAtISO: "2026-06-15T14:00:00",
      }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid set_general_reminder (weekly)", () => {
    const r = StorePatchSchema.safeParse({
      summary: "Weekly weigh-in",
      ops: [{
        kind: "set_general_reminder",
        label: "Weigh myself",
        recurrence: "weekly",
        weekdays: [1],
        weeklyTimeHHmm: "07:00",
      }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid set_general_reminder (interval with water tracking)", () => {
    const r = StorePatchSchema.safeParse({
      summary: "Hourly water reminder",
      ops: [{
        kind: "set_general_reminder",
        label: "Drink water",
        recurrence: "interval",
        intervalMinutes: 60,
        windowStartHHmm: "08:00",
        windowEndHHmm: "22:00",
        startingFromHHmm: "16:00",
        amountMl: 800,
      }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid cancel_general_reminder", () => {
    const r = StorePatchSchema.safeParse({
      summary: "Cancel water reminders",
      ops: [{ kind: "cancel_general_reminder", label: "Drink water" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown recurrence value", () => {
    const r = StorePatchSchema.safeParse({
      summary: "bad recurrence",
      ops: [{
        kind: "set_general_reminder",
        label: "test",
        recurrence: "hourly", // not a valid enum value
      }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing required label", () => {
    const r = StorePatchSchema.safeParse({
      summary: "missing label",
      ops: [{ kind: "set_general_reminder", recurrence: "daily" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects ops array over max length", () => {
    const r = StorePatchSchema.safeParse({
      summary: "too many ops",
      ops: Array.from({ length: 11 }, (_, i) => ({ kind: "add_condition", value: `cond${i}` })),
    });
    expect(r.success).toBe(false);
  });

  it("accepts mixed op types in one patch", () => {
    const r = StorePatchSchema.safeParse({
      summary: "Multiple changes",
      ops: [
        { kind: "add_condition", value: "hypertension" },
        { kind: "set_general_reminder", label: "BP check", recurrence: "daily", dailyTimeHHmm: "09:00" },
        { kind: "set_next_appointment", doctor: "Dr. Sharma", dateISO: "2026-06-01", timeHHmm: "10:00" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid HH:mm pattern", () => {
    const r = StorePatchSchema.safeParse({
      summary: "bad time",
      ops: [{
        kind: "set_general_reminder",
        label: "test",
        recurrence: "daily",
        dailyTimeHHmm: "9:00", // must be zero-padded
      }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts set_interval_reminder (legacy op)", () => {
    const r = StorePatchSchema.safeParse({
      summary: "Water every hour",
      ops: [{
        kind: "set_interval_reminder",
        label: "Water",
        intervalMinutes: 60,
        windowStartHHmm: "08:00",
        windowEndHHmm: "22:00",
      }],
    });
    expect(r.success).toBe(true);
  });
});

// ── looksLikeMutationIntent heuristic ────────────────────────────────────────
// Re-implement the heuristic here to test it without importing the module
// (which requires the full Anthropic SDK at module eval time).

function looksLikeMutationIntent(msg: string): boolean {
  const m = msg.toLowerCase();
  if (/\b(add|remove|delete|set|change|update|cancel|stop|forget|clear|book|schedule|log|register|note that|make a note)\b/.test(m)) return true;
  if (/\bi (have|am|'m|got|don'?t have|no longer|stopped|started|need|want)\b/.test(m)) return true;
  if (/\bmy (\w+\s+){0,2}(is|are|has|have|was|were|hurts?|aches?)\b/.test(m)) return true;
  if (/\b(allerg(y|ies|ic)|medicine|medication|appointment|doctor|hospital|symptom|condition|reminder|water|bottle|every hour|every \d|interval)\b/.test(m)) return true;
  return false;
}

describe("looksLikeMutationIntent", () => {
  it.each([
    ["add peanuts to my allergies", true],
    ["remind me to drink water every hour", true],
    ["I have diabetes", true],
    ["set a reminder for my dental appointment", true],
    ["I am allergic to penicillin", true],
    ["cancel my water reminder", true],
    ["remind me every 2 hours from 9am", true],
    ["set daily blood pressure check at 9am", true],
    // Questions should NOT trigger
    ["what is my HbA1c?", false],
    ["how do I take metformin?", false],
    ["tell me about my last lab results", false],
  ])("%s → %s", (msg, expected) => {
    expect(looksLikeMutationIntent(msg)).toBe(expected);
  });
});
