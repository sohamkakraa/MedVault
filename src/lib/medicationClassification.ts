import type { ExtractedDoc, ExtractedMedication, MedicationProductCategory } from "@/lib/types";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s+-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Common OTC / pharmacy-only-without-Rx style names (English). Best-effort only. */
const OTC_PHRASES = [
  "paracetamol",
  "acetaminophen",
  "ibuprofen",
  "aspirin",
  "acetylsalicylic",
  "naproxen",
  "diclofenac gel",
  "diphenhydramine",
  "loratadine",
  "cetirizine",
  "fexofenadine",
  "pseudoephedrine",
  "phenylephrine",
  "dextromethorphan",
  "guaifenesin",
  "loperamide",
  "bismuth subsalicylate",
  "famotidine",
  "calcium carbonate",
  "antacid",
  "hydrocortisone cream",
  "benzoyl peroxide",
  "minoxidil",
  "nicotine patch",
  "melatonin",
];

const SUPPLEMENT_PHRASES = [
  "vitamin",
  "multivitamin",
  "fish oil",
  "omega",
  "omega-3",
  "omega 3",
  "probiotic",
  "prebiotic",
  "collagen",
  "coq10",
  "coenzyme q",
  "curcumin",
  "turmeric",
  "ashwagandha",
  "magnesium",
  "zinc",
  "iron supplement",
  "folate",
  "folic acid",
  "biotin",
  "electrolyte",
  "fiber supplement",
  "psyllium",
  "glucosamine",
  "chondroitin",
  "lutein",
  "cranberry",
  "milk thistle",
  "elderberry",
  "echinacea",
  "ginseng",
  "maca",
];

/**
 * Lightweight keyword match — not clinical coding. Prefer `supplement` when both could apply
 * (e.g. “vitamin C” is usually filed as a supplement).
 */
export function inferMedicationProductCategory(name: string): MedicationProductCategory {
  const n = norm(name);
  if (!n) return "unspecified";

  for (const p of SUPPLEMENT_PHRASES) {
    if (n.includes(p)) return "supplement";
  }
  for (const p of OTC_PHRASES) {
    if (n.includes(p)) return "over_the_counter";
  }
  return "unspecified";
}

export function mergeMedicationFromDocument(m: ExtractedMedication, doc: ExtractedDoc): ExtractedMedication {
  const medicationLineSource =
    doc.type === "Prescription" ? ("prescription_document" as const) : ("other_document" as const);
  const inferred = inferMedicationProductCategory(m.name);
  return {
    ...m,
    sourceDocId: doc.id,
    medicationLineSource,
    medicationProductCategory: inferred,
    medicationProductCategorySource: "auto",
  };
}

/** Manual add / row without `sourceDocId` after migration. */
export function applyManualMedicationDefaults(m: ExtractedMedication): ExtractedMedication {
  const inferred = inferMedicationProductCategory(m.name);
  if (m.medicationProductCategorySource === "user") {
    return {
      ...m,
      medicationLineSource: "manual_entry",
      medicationProductCategory: m.medicationProductCategory,
      medicationProductCategorySource: "user",
    };
  }
  return {
    ...m,
    medicationLineSource: "manual_entry",
    medicationProductCategory: inferred,
    medicationProductCategorySource: "auto",
  };
}

/** Short tag for UI chips (dashboard, lists). */
export function medicationProductCategoryLabel(cat?: MedicationProductCategory): string {
  if (cat === "over_the_counter") return "OTC";
  if (cat === "supplement") return "Supplement";
  return "";
}
