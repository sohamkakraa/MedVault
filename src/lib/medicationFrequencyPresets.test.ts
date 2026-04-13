import { describe, expect, it } from "vitest";
import { frequencyFromPreset, matchStoredFrequencyToPreset } from "@/lib/medicationFrequencyPresets";

describe("frequencyFromPreset", () => {
  it("returns preset string for fixed options", () => {
    expect(frequencyFromPreset("twice_daily", "")).toBe("Twice daily");
    expect(frequencyFromPreset("q8h", "")).toBe("q8h");
  });

  it("returns trimmed other text for Other", () => {
    expect(frequencyFromPreset("other", "  With breakfast  ")).toBe("With breakfast");
    expect(frequencyFromPreset("other", "")).toBeUndefined();
  });
});

describe("matchStoredFrequencyToPreset", () => {
  it("matches common phrases", () => {
    expect(matchStoredFrequencyToPreset("BID").preset).toBe("twice_daily");
    expect(matchStoredFrequencyToPreset("Three times a day").preset).toBe("three_times");
    expect(matchStoredFrequencyToPreset("q12h").preset).toBe("q12h");
  });

  it("falls back to other", () => {
    const m = matchStoredFrequencyToPreset("Every morning with food");
    expect(m.preset).toBe("other");
    expect(m.other).toBe("Every morning with food");
  });
});
