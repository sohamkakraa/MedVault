import { describe, expect, it } from "vitest";
import type { ExtractedDoc } from "@/lib/types";
import { inferMedicationProductCategory, mergeMedicationFromDocument } from "@/lib/medicationClassification";

describe("inferMedicationProductCategory", () => {
  it("detects common OTC pain relievers", () => {
    expect(inferMedicationProductCategory("Paracetamol 500mg")).toBe("over_the_counter");
    expect(inferMedicationProductCategory("acetaminophen")).toBe("over_the_counter");
    expect(inferMedicationProductCategory("IBUPROFEN")).toBe("over_the_counter");
  });

  it("detects vitamins and supplements before generic OTC", () => {
    expect(inferMedicationProductCategory("Vitamin D3 1000 IU")).toBe("supplement");
    expect(inferMedicationProductCategory("Fish oil")).toBe("supplement");
    expect(inferMedicationProductCategory("Omega-3")).toBe("supplement");
  });

  it("returns unspecified when there is no clear match", () => {
    expect(inferMedicationProductCategory("Losartan")).toBe("unspecified");
    expect(inferMedicationProductCategory("")).toBe("unspecified");
  });
});

describe("mergeMedicationFromDocument", () => {
  const baseDoc = (type: ExtractedDoc["type"]): ExtractedDoc => ({
    id: "d1",
    type,
    title: "T",
    summary: "s",
  });

  it("sets prescription line source for prescription uploads", () => {
    const m = mergeMedicationFromDocument({ name: "Atorvastatin" }, baseDoc("Prescription"));
    expect(m.medicationLineSource).toBe("prescription_document");
    expect(m.sourceDocId).toBe("d1");
  });

  it("sets other-document line source for non-prescription files", () => {
    const m = mergeMedicationFromDocument({ name: "Aspirin" }, baseDoc("Lab report"));
    expect(m.medicationLineSource).toBe("other_document");
    expect(m.medicationProductCategory).toBe("over_the_counter");
  });
});
