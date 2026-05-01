/**
 * Tests for water intake detection patterns used in processMessage.ts.
 * Extracted here as pure regex tests — no database or LLM needed.
 */
import { describe, it, expect } from "vitest";

// Mirror of the patterns from processMessage.ts
const WATER_DONE_RE =
  /^(done|finished|had it|had water|had my water|all done|drank it|drank my water|water done|bottle done)[\s.!]*$/i;
const WATER_PHRASE_RE =
  /\b(done|finished|had|drank|drunk|completed)\b.{0,30}\b(water|bottle|glass)\b|\b(water|bottle)\b.{0,15}\b(done|finished|had|drank|drunk)\b/i;

function isWaterIntake(text: string): boolean {
  return WATER_DONE_RE.test(text.trim()) || WATER_PHRASE_RE.test(text);
}

describe("water intake detection", () => {
  it.each([
    // Simple completions
    ["done", true],
    ["Done", true],
    ["DONE", true],
    ["finished", true],
    ["had water", true],
    ["Had Water", true],
    ["had my water", true],
    ["all done", true],
    ["drank it", true],
    ["drank my water", true],
    ["water done", true],
    ["bottle done", true],
    ["had it", true],
    // Phrase patterns
    ["just finished my water bottle", true],
    ["I had my glass of water", true],
    ["drank a glass of water", true],
    ["done with my water bottle", true],
    ["finished drinking water", true],
    ["completed my water bottle", true],
    // Should NOT match
    ["I had lunch", false],
    ["what should I do about my headache?", false],
    ["remind me to drink water", false],
    ["how much water should I drink?", false],
    ["good morning", false],
    ["my blood pressure is 120/80", false],
  ])("%s → %s", (msg, expected) => {
    expect(isWaterIntake(msg)).toBe(expected);
  });
});
