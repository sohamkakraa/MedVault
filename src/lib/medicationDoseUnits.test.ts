import { describe, expect, it } from "vitest";
import { buildDoseFromUserInput, medDosePrimaryLine, medDoseSecondaryLine } from "@/lib/medicationDoseUnits";

describe("buildDoseFromUserInput", () => {
  it("converts grams to mg", () => {
    const r = buildDoseFromUserInput("0.5", "g");
    expect(r?.dose).toBe("500 mg");
    expect(r?.doseAmountStandard).toBe(500);
    expect(r?.doseStandardUnit).toBe("mg");
    expect(r?.doseUserEnteredLabel).toBe("0.5 g");
  });

  it("converts micrograms to mg", () => {
    const r = buildDoseFromUserInput("500", "mcg");
    expect(r?.doseAmountStandard).toBe(0.5);
    expect(r?.doseStandardUnit).toBe("mg");
  });

  it("converts ug (vitamin-style micrograms) to mg like mcg", () => {
    const r = buildDoseFromUserInput("400", "ug");
    expect(r?.doseAmountStandard).toBe(0.4);
    expect(r?.doseStandardUnit).toBe("mg");
    expect(r?.doseUserEnteredLabel).toBe("400 ug");
  });

  it("converts litres to mL", () => {
    const r = buildDoseFromUserInput("0.25", "L");
    expect(r?.dose).toBe("250 mL");
    expect(r?.doseStandardUnit).toBe("mL");
  });

  it("keeps IU as IU", () => {
    const r = buildDoseFromUserInput("10", "IU");
    expect(r?.dose).toBe("10 IU");
    expect(r?.doseAmountStandard).toBe(10);
    expect(r?.doseDimension).toBe("iu");
  });

  it("returns undefined for empty amount", () => {
    expect(buildDoseFromUserInput("", "mg")).toBeUndefined();
    expect(buildDoseFromUserInput("   ", "mg")).toBeUndefined();
  });
});

describe("medDosePrimaryLine", () => {
  it("rebuilds count doses from structured fields", () => {
    expect(
      medDosePrimaryLine({
        doseAmountStandard: 2,
        doseStandardUnit: "tablet",
      })
    ).toBe("2 tablets");
  });
});

describe("medDoseSecondaryLine", () => {
  it("shows user label when it differs from canonical dose", () => {
    expect(
      medDoseSecondaryLine({
        dose: "500 mg",
        doseUserEnteredLabel: "0.5 g",
      })
    ).toBe("0.5 g");
  });

  it("hides when same as primary", () => {
    expect(
      medDoseSecondaryLine({
        dose: "500 mg",
        doseUserEnteredLabel: "500 mg",
      })
    ).toBeUndefined();
  });
});
