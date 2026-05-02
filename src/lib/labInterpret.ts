import type { ExtractedLab, StandardLexiconEntry } from "@/lib/types";
import { normalizeLabUnitString } from "@/lib/labUnits";
import { resolveCanonicalLabName } from "@/lib/standardized";

export type LabFlag = "low" | "high" | "in_range" | "unknown";

export type LabInterpretation = {
  canonicalName: string;
  displayName: string;
  displayUnit: string;
  displayValue: string;
  numericValue: number | null;
  flag: LabFlag;
  shortLabel: string;
  meaning: string;
  typicalRangeDisplay: string;
  disclaimer: string;
};

type RefRow = {
  low?: number;
  high?: number;
  unit: string;
  shortLabel: string;
  meaning: string;
  /** Human-readable typical adult range for tooltips */
  typical: string;
};

/**
 * Typical adult reference intervals for education only. Labs and populations differ — always confirm with your clinician.
 */
const REF_BY_CANONICAL: Record<string, RefRow> = {
  HbA1c: {
    low: 4,
    high: 5.6,
    unit: "%",
    shortLabel: "HbA1c",
    meaning: "Average blood sugar over roughly the past three months.",
    typical: "Many labs use about 4.0–5.6% as a non-diabetes range; targets differ if you have diabetes.",
  },
  LDL: {
    low: 50,
    high: 129,
    unit: "mg/dL",
    shortLabel: "LDL cholesterol",
    meaning: "“Bad” cholesterol; often tracked for heart risk.",
    typical: "Common reference bands are roughly 50–129 mg/dL; your goal may be lower if you have heart disease.",
  },
  HDL: {
    low: 40,
    high: 999,
    unit: "mg/dL",
    shortLabel: "HDL cholesterol",
    meaning: "“Good” cholesterol; higher is often better.",
    typical: "Often about 40 mg/dL or higher for men and 50 mg/dL or higher for women (lab-specific).",
  },
  Triglycerides: {
    low: 0,
    high: 149,
    unit: "mg/dL",
    shortLabel: "Triglycerides",
    meaning: "Blood fats used for energy; often checked with a lipid panel.",
    typical: "Many labs flag fasting levels above about 150 mg/dL.",
  },
  "Total Cholesterol": {
    low: 125,
    high: 199,
    unit: "mg/dL",
    shortLabel: "Total cholesterol",
    meaning: "Sum of cholesterol carried in blood; interpreted with HDL, LDL, and triglycerides.",
    typical: "Rough guide often cited around 125–199 mg/dL — interpretation is personal.",
  },
  Glucose: {
    low: 70,
    high: 99,
    unit: "mg/dL",
    shortLabel: "Blood glucose",
    meaning: "Sugar in the blood; often fasting unless the report says otherwise.",
    typical: "Fasting values are often compared to about 70–99 mg/dL in US units.",
  },
  RBC: {
    low: 4.1,
    high: 5.5,
    unit: "M/µL",
    shortLabel: "Red blood cell count",
    meaning: "Number of red blood cells — carry oxygen.",
    typical: "Often about 4.1–5.5 million cells per microliter (M/µL) for many adults; sex and lab vary.",
  },
  WBC: {
    low: 4.5,
    high: 11,
    unit: "K/µL",
    shortLabel: "White blood cell count",
    meaning: "Immune cells; helps detect infection or inflammation.",
    typical: "Often about 4.5–11.0 thousand per microliter (K/µL).",
  },
  Hemoglobin: {
    low: 12,
    high: 17.5,
    unit: "g/dL",
    shortLabel: "Hemoglobin",
    meaning: "Oxygen-carrying protein in red blood cells.",
    typical: "Rough adult bands ~12–17.5 g/dL depending on sex and lab.",
  },
  Hematocrit: {
    low: 36,
    high: 50,
    unit: "%",
    shortLabel: "Hematocrit",
    meaning: "Percent of blood volume that is red cells.",
    typical: "Often about 36–50% for many adults (sex and altitude matter).",
  },
  Platelets: {
    low: 150,
    high: 400,
    unit: "K/µL",
    shortLabel: "Platelets",
    meaning: "Cell fragments that help blood clot.",
    typical: "Often about 150–400 thousand per microliter (K/µL).",
  },
  MCV: {
    low: 80,
    high: 100,
    unit: "fL",
    shortLabel: "MCV",
    meaning: "Average red blood cell size.",
    typical: "Often about 80–100 fL.",
  },
  Neutrophils: {
    low: 1.8,
    high: 7.7,
    unit: "K/µL",
    shortLabel: "Neutrophils",
    meaning: "White blood cells that fight bacterial infections. High levels can signal infection or inflammation.",
    typical: "Typical adult range about 1.8–7.7 K/µL (absolute).",
  },
  Lymphocytes: {
    low: 1.0,
    high: 4.8,
    unit: "K/µL",
    shortLabel: "Lymphocytes",
    meaning: "Immune cells that fight viruses and help form antibodies.",
    typical: "Typical adult range about 1.0–4.8 K/µL (absolute).",
  },
  Eosinophils: {
    low: 0,
    high: 0.5,
    unit: "K/µL",
    shortLabel: "Eosinophils",
    meaning: "White blood cells linked to allergies and parasitic infections.",
    typical: "Typical adult range about 0–0.5 K/µL.",
  },
  Creatinine: {
    low: 0.6,
    high: 1.3,
    unit: "mg/dL",
    shortLabel: "Creatinine",
    meaning: "Waste from muscle; used to gauge kidney filtration.",
    typical: "Rough adult serum range often ~0.6–1.3 mg/dL; muscle mass and age change interpretation.",
  },
  Sodium: {
    low: 136,
    high: 145,
    unit: "mEq/L",
    shortLabel: "Sodium",
    meaning: "Electrolyte for fluid balance and nerves.",
    typical: "Often about 136–145 mEq/L.",
  },
  Potassium: {
    low: 3.5,
    high: 5.1,
    unit: "mEq/L",
    shortLabel: "Potassium",
    meaning: "Electrolyte important for heart and muscles.",
    typical: "Often about 3.5–5.1 mEq/L.",
  },
  Chloride: {
    low: 98,
    high: 107,
    unit: "mEq/L",
    shortLabel: "Chloride",
    meaning: "Electrolyte that pairs with sodium.",
    typical: "Often about 98–107 mEq/L.",
  },
  TSH: {
    low: 0.4,
    high: 4.0,
    unit: "mIU/L",
    shortLabel: "TSH",
    meaning: "Pituitary signal that tells the thyroid how hard to work.",
    typical: "Many labs use about 0.4–4.0 mIU/L for adults; pregnancy and symptoms change meaning.",
  },
  AST: {
    low: 10,
    high: 40,
    unit: "IU/L",
    shortLabel: "AST",
    meaning: "Liver and muscle enzyme.",
    typical: "Upper limits often near 30–40 IU/L depending on the lab.",
  },
  ALT: {
    low: 7,
    high: 56,
    unit: "IU/L",
    shortLabel: "ALT",
    meaning: "Liver enzyme; often rises with liver stress.",
    typical: "Upper limits often near 40–56 IU/L depending on the lab.",
  },
  BUN: {
    low: 7,
    high: 20,
    unit: "mg/dL",
    shortLabel: "BUN",
    meaning: "Blood urea nitrogen; related to kidney function and protein.",
    typical: "Often about 7–20 mg/dL (hydration and diet affect it).",
  },
  Calcium: {
    low: 8.5,
    high: 10.5,
    unit: "mg/dL",
    shortLabel: "Calcium",
    meaning: "Mineral for bones, nerves, and muscles.",
    typical: "Total calcium often about 8.5–10.5 mg/dL (albumin affects interpretation).",
  },
};

const DISCLAIMER =
  "Typical ranges are for learning only. Your lab’s reference interval and your clinician’s judgment matter.";

/**
 * Returns the built-in typical reference range for a canonical lab name so chart
 * components can normalise values without re-importing the private REF_BY_CANONICAL table.
 * Returns null when the metric is unknown or has a one-sided range (high > 500).
 * In that case a display cap of low × 3 is used so the range is still usable.
 */
export function getCanonicalRefRange(
  canonical: string
): { low: number; high: number; unit: string } | null {
  const ref = REF_BY_CANONICAL[canonical];
  if (!ref) return null;
  const low = ref.low ?? 0;
  let high = ref.high;
  if (high === undefined) return null;
  // Sentinel value used for "no upper limit" metrics like HDL (high = 999).
  // Replace with a reasonable display cap so normalisation still works.
  if (high > 500 && low > 0) high = low * 3;
  return { low, high, unit: ref.unit };
}

/** Remove markdown emphasis markers from model-sourced lab names (e.g. **Glucose**). */
export function stripLabDisplayMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\*\*/g, "");
}

/** Pull first plausible number from a result string (e.g. ">240", "5.2", "Negative" → null). */
export function parseLabNumeric(valueRaw: string): number | null {
  const s = valueRaw.replace(/,/g, ".").trim();
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Try to read low–high from a free-text reference (e.g. "4.5-5.5", "12 - 15"). */
export function parseReferenceSpan(refRaw: string | undefined): { low: number; high: number } | null {
  if (!refRaw?.trim()) return null;
  const nums = refRaw.match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const a = Number(nums[0]);
  const b = Number(nums[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { low: Math.min(a, b), high: Math.max(a, b) };
}

function unitsComparable(unitNorm: string, refUnit: string): boolean {
  const a = squashUnit(unitNorm);
  const b = squashUnit(refUnit);
  if (a === b) return true;
  if ((a.includes("mg/dl") || a === "mg/dl") && (b.includes("mg/dl") || b === "mg/dl")) return true;
  if ((a.includes("m/ul") || a.includes("10^6")) && (b.includes("m/ul") || b.includes("10^6"))) return true;
  if ((a.includes("k/ul") || a.includes("10^3")) && (b.includes("k/ul") || b.includes("10^3"))) return true;
  return false;
}

function squashUnit(u: string): string {
  return u
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/µ/g, "u")
    .replace(/μ/g, "u")
    .replace(/\^/g, "^");
}

/** Convert numeric value toward the built-in ref unit when obvious (glucose mmol/L → mg/dL). */
function toRefUnitNumeric(canonical: string, n: number, displayUnitNorm: string, refUnit: string): number | null {
  const du = squashUnit(displayUnitNorm);
  const ru = squashUnit(refUnit);

  if (canonical === "Glucose" && du.includes("mmol/l") && ru.includes("mg/dl")) {
    return n * 18.0182;
  }
  if (canonical === "Creatinine" && du.includes("umol/l") && ru.includes("mg/dl")) {
    return n / 88.42;
  }

  if (unitsComparable(displayUnitNorm, refUnit)) return n;
  return null;
}

export function interpretLab(lab: ExtractedLab, extensions?: StandardLexiconEntry[]): LabInterpretation {
  const canonical = resolveCanonicalLabName(lab.name, extensions);
  const displayUnit = normalizeLabUnitString(lab.unit) || lab.unit?.trim() || "";
  const displayValue = String(lab.value ?? "").trim();
  const numeric = parseLabNumeric(displayValue);
  const ref = REF_BY_CANONICAL[canonical];
  const reportSpan = parseReferenceSpan(lab.refRange);

  let flag: LabFlag = "unknown";
  let typicalRangeDisplay = ref?.typical ?? "No built-in reference for this test in UMA — use your lab report and clinician.";

  if (numeric != null && reportSpan) {
    if (numeric < reportSpan.low) flag = "low";
    else if (numeric > reportSpan.high) flag = "high";
    else flag = "in_range";
    typicalRangeDisplay = `On your report: about ${reportSpan.low}–${reportSpan.high}${lab.unit ? ` ${lab.unit}` : ""}.`;
  } else if (numeric != null && ref) {
    const comparable = toRefUnitNumeric(canonical, numeric, displayUnit, ref.unit);
    if (comparable != null && ref.low != null && ref.high != null) {
      if (canonical === "HDL") {
        if (comparable < ref.low) flag = "low";
        else flag = "in_range";
      } else {
        if (comparable < ref.low) flag = "low";
        else if (comparable > ref.high) flag = "high";
        else flag = "in_range";
      }
    }
  }

  const shortLabel = ref?.shortLabel ?? canonical;
  const meaning =
    ref?.meaning ??
    "This is a lab result from your records. Ask your care team what it means for you.";

  const rawName = lab.name.trim() || canonical;
  return {
    canonicalName: canonical,
    displayName: stripLabDisplayMarkdown(rawName),
    displayUnit,
    displayValue,
    numericValue: numeric,
    flag,
    shortLabel,
    meaning,
    typicalRangeDisplay,
    disclaimer: DISCLAIMER,
  };
}
