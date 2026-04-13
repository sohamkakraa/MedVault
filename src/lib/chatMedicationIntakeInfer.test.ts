import { describe, expect, it } from "vitest";
import type { PatientStore } from "@/lib/types";
import { defaultHealthLogs } from "@/lib/healthLogs";
import { inferMedicationIntakeFromUtterance, utteranceMentionsDoseEvent } from "@/lib/chatMedicationIntakeInfer";

function storeWithMeds(names: string[]): PatientStore {
  return {
    docs: [],
    meds: names.map((name) => ({ name })),
    labs: [],
    healthLogs: defaultHealthLogs(),
    profile: { name: "", allergies: [], conditions: [] },
    preferences: { theme: "system" },
    updatedAtISO: new Date().toISOString(),
  } as PatientStore;
}

describe("inferMedicationIntakeFromUtterance", () => {
  it("detects missed omega 3 when on med list", () => {
    const s = storeWithMeds(["Omega 3", "Vitamin D3"]);
    const p = inferMedicationIntakeFromUtterance("I missed my omega 3 med today", s);
    expect(p).not.toBeNull();
    expect(p!.action).toBe("missed");
    expect(p!.medicationName).toBe("Omega 3");
  });

  it("detects forgot to take using free phrase without store match", () => {
    const s = storeWithMeds([]);
    const p = inferMedicationIntakeFromUtterance("I forgot to take my iron supplement today", s);
    expect(p).not.toBeNull();
    expect(p!.action).toBe("missed");
    expect(p!.medicationName.toLowerCase()).toContain("iron");
  });

  it("returns null when dose event unclear", () => {
    const s = storeWithMeds(["Metformin"]);
    expect(inferMedicationIntakeFromUtterance("What is metformin?", s)).toBeNull();
  });

  it("detects missed omega 3 from shorthand without store match", () => {
    const s = storeWithMeds([]);
    const p = inferMedicationIntakeFromUtterance("I missed omega 3 today", s);
    expect(p).not.toBeNull();
    expect(p!.action).toBe("missed");
    expect(p!.medicationName).toMatch(/omega/i);
  });

  it("detects taken when phrased with my + med", () => {
    const s = storeWithMeds(["Vitamin B6"]);
    const p = inferMedicationIntakeFromUtterance("I just took my vitamin B6 tablet", s);
    expect(p).not.toBeNull();
    expect(p!.action).toBe("taken");
    expect(p!.medicationName).toBe("Vitamin B6");
  });
});

describe("utteranceMentionsDoseEvent", () => {
  it("is true for missed med phrasing", () => {
    expect(utteranceMentionsDoseEvent("I missed my morning dose")).toBe(true);
  });
});
