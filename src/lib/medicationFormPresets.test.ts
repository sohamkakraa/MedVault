import { describe, expect, it } from "vitest";
import { medicationFormLabel } from "@/lib/medicationFormPresets";

describe("medicationFormLabel", () => {
  it("returns empty for unspecified", () => {
    expect(medicationFormLabel("unspecified")).toBe("");
    expect(medicationFormLabel(undefined)).toBe("");
  });

  it("returns custom text for other", () => {
    expect(medicationFormLabel("other", "  Lozenge  ")).toBe("Lozenge");
  });

  it("returns label for capsule", () => {
    expect(medicationFormLabel("capsule")).toBe("Capsule");
  });
});
