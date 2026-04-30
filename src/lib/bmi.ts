/**
 * BMI helpers. Uses the standard WHO adult categories and tries to keep the
 * surfaced copy plain and supportive — never alarmist, never a diagnosis.
 *
 * Note: BMI ignores muscle mass, age, pregnancy, and ethnicity-specific cut-offs.
 * The UI that consumes these helpers always pairs the category with a
 * "Not medical advice" disclaimer.
 */

export type BmiCategory = "underweight" | "healthy" | "overweight" | "obese";

export type BmiInfo = {
  /** BMI value rounded to one decimal. */
  bmi: number;
  category: BmiCategory;
  /** Patient-friendly label, e.g. "Healthy weight". */
  label: string;
  /** One-line explanation paired with the label. */
  summary: string;
  /** 0–100 progress across the standard BMI range (15–35) for a progress bar. */
  progressPercent: number;
  /** Short, supportive, actionable tips (plain language, no jargon). */
  tips: string[];
};

function parseNumber(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Returns the BMI value (rounded to 1 decimal) from stored SI fields, or null. */
export function computeBmi(heightCm?: string | number, weightKg?: string | number): number | null {
  const h = parseNumber(heightCm);
  const w = parseNumber(weightKg);
  if (h === null || w === null) return null;
  if (h < 60 || h > 260) return null;
  if (w < 15 || w > 400) return null;
  const meters = h / 100;
  const bmi = w / (meters * meters);
  if (!Number.isFinite(bmi)) return null;
  return Math.round(bmi * 10) / 10;
}

/** Map a BMI value to the WHO adult category. */
export function categorizeBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "healthy";
  if (bmi < 30) return "overweight";
  return "obese";
}

const LABELS: Record<BmiCategory, string> = {
  underweight: "Underweight",
  healthy: "Healthy weight",
  overweight: "Slightly above healthy",
  obese: "Well above healthy",
};

const SUMMARIES: Record<BmiCategory, string> = {
  underweight: "Your BMI sits below the typical healthy range.",
  healthy: "Your BMI sits in the typical healthy range.",
  overweight: "Your BMI sits a little above the typical healthy range.",
  obese: "Your BMI sits well above the typical healthy range.",
};

const TIPS: Record<BmiCategory, string[]> = {
  underweight: [
    "Aim for three balanced meals plus a snack or two — protein and healthy fats help the most.",
    "Strength training 2–3 times a week helps add muscle rather than just calories.",
    "If weight loss has been unintentional, mention it to a doctor at your next visit.",
  ],
  healthy: [
    "Keep up the routine — regular movement and balanced meals are doing the work.",
    "Aim for 150 minutes of moderate activity a week to maintain this range.",
    "Check in every few months so a slow drift in either direction gets caught early.",
  ],
  overweight: [
    "Small, consistent changes work best — a 15–30 minute walk most days adds up.",
    "Swap sugary drinks for water, tea, or black coffee when you can.",
    "Fill half your plate with vegetables or salad before starches and meat.",
    "If you'd like support, your primary care doctor can help you set a realistic goal.",
  ],
  obese: [
    "A 5–10% weight drop over a few months already brings clear health benefits — start small.",
    "Pair daily walking with strength work 2 days a week — gentler on joints than running.",
    "Focus on whole foods: vegetables, fruits, lean protein, and legumes.",
    "Talk to your doctor — they can rule out thyroid or hormonal causes and tailor a plan.",
  ],
};

/** Full BMI summary for a given height/weight, or null when inputs are missing/invalid. */
export function getBmiInfo(heightCm?: string | number, weightKg?: string | number): BmiInfo | null {
  const bmi = computeBmi(heightCm, weightKg);
  if (bmi === null) return null;
  const category = categorizeBmi(bmi);
  // Map 15 → 0% and 35 → 100% so the bar highlights the 18.5–25 healthy window.
  const clamped = Math.max(15, Math.min(35, bmi));
  const progressPercent = Math.round(((clamped - 15) / (35 - 15)) * 100);
  return {
    bmi,
    category,
    label: LABELS[category],
    summary: SUMMARIES[category],
    progressPercent,
    tips: TIPS[category],
  };
}
