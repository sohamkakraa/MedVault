/**
 * Converts user-entered medication amounts into UMA’s standard units for display and storage.
 * Standard units: mass → mg, volume → mL, insulin-like → IU, counts → tablet/capsule/etc. (no conversion).
 * Not clinical dosing advice — user must follow their prescription.
 */

import type { MedDoseDimension } from "@/lib/types";

export type MedDoseUserUnit =
  | "mg"
  | "g"
  | "mcg"
  /** Micrograms; common on vitamin labels (same as mcg / µg). */
  | "ug"
  | "mL"
  | "L"
  | "IU"
  | "tablet"
  | "capsule"
  | "puff"
  | "patch"
  | "drop";

const UNIT_DIMENSION: Record<MedDoseUserUnit, MedDoseDimension> = {
  mg: "mass",
  g: "mass",
  mcg: "mass",
  ug: "mass",
  mL: "volume",
  L: "volume",
  IU: "iu",
  tablet: "count",
  capsule: "count",
  puff: "count",
  patch: "count",
  drop: "count",
};

/** Short label as entered (for “you entered …”). */
const USER_UNIT_SHORT: Record<MedDoseUserUnit, string> = {
  mg: "mg",
  g: "g",
  mcg: "mcg",
  ug: "ug",
  mL: "mL",
  L: "L",
  IU: "IU",
  tablet: "tablet",
  capsule: "capsule",
  puff: "puff",
  patch: "patch",
  drop: "drop",
};

export const MED_DOSE_USER_UNIT_OPTIONS: { value: MedDoseUserUnit; label: string }[] = [
  { value: "mg", label: "mg (milligrams)" },
  { value: "g", label: "g (grams)" },
  { value: "mcg", label: "mcg (micrograms)" },
  { value: "ug", label: "ug / µg (micrograms)" },
  { value: "mL", label: "mL (millilitres)" },
  { value: "L", label: "L (litres)" },
  { value: "IU", label: "IU (international units)" },
  { value: "tablet", label: "Tablet(s)" },
  { value: "capsule", label: "Capsule(s)" },
  { value: "puff", label: "Puff(s)" },
  { value: "patch", label: "Patch(es)" },
  { value: "drop", label: "Drop(s)" },
];

export function formatQtyClean(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  const rounded = Math.round(n * 1_000_000) / 1_000_000;
  let s = rounded.toFixed(6).replace(/\.?0+$/, "");
  if (s === "" || s === "-") s = "0";
  return s;
}

function pluralCount(unit: MedDoseUserUnit, n: number): string {
  const one = n === 1 || n === -1;
  switch (unit) {
    case "tablet":
      return one ? "tablet" : "tablets";
    case "capsule":
      return one ? "capsule" : "capsules";
    case "puff":
      return one ? "puff" : "puffs";
    case "patch":
      return one ? "patch" : "patches";
    case "drop":
      return one ? "drop" : "drops";
    default:
      return USER_UNIT_SHORT[unit];
  }
}

export type MedDoseStorePatch = {
  dose: string;
  doseAmountStandard: number;
  doseStandardUnit: string;
  doseDimension: MedDoseDimension;
  doseUserEnteredLabel: string;
};

/**
 * Build canonical `dose` text plus structured fields from a numeric amount and unit.
 * Returns `undefined` if amount is empty or not a valid non‑negative number.
 */
export function buildDoseFromUserInput(
  amountStr: string,
  userUnit: MedDoseUserUnit
): MedDoseStorePatch | undefined {
  const raw = amountStr.trim().replace(/,/g, ".");
  if (!raw) return undefined;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return undefined;

  const dim = UNIT_DIMENSION[userUnit];
  const short = USER_UNIT_SHORT[userUnit];
  const userLabel = `${formatQtyClean(amount)} ${short}`;

  if (dim === "mass") {
    let mg = amount;
    if (userUnit === "g") mg = amount * 1000;
    if (userUnit === "mcg" || userUnit === "ug") mg = amount / 1000;
    return {
      doseAmountStandard: mg,
      doseStandardUnit: "mg",
      doseDimension: "mass",
      doseUserEnteredLabel: userLabel,
      dose: `${formatQtyClean(mg)} mg`,
    };
  }

  if (dim === "volume") {
    let mL = amount;
    if (userUnit === "L") mL = amount * 1000;
    return {
      doseAmountStandard: mL,
      doseStandardUnit: "mL",
      doseDimension: "volume",
      doseUserEnteredLabel: userLabel,
      dose: `${formatQtyClean(mL)} mL`,
    };
  }

  if (dim === "iu") {
    return {
      doseAmountStandard: amount,
      doseStandardUnit: "IU",
      doseDimension: "iu",
      doseUserEnteredLabel: userLabel,
      dose: `${formatQtyClean(amount)} IU`,
    };
  }

  const word = pluralCount(userUnit, amount);
  return {
    doseAmountStandard: amount,
    doseStandardUnit: userUnit,
    doseDimension: "count",
    doseUserEnteredLabel: userLabel,
    dose: `${formatQtyClean(amount)} ${word}`,
  };
}

/** Primary line for lists (uses stored canonical dose, or recomputes from structured fields). */
export function medDosePrimaryLine(m: {
  dose?: string;
  doseAmountStandard?: number;
  doseStandardUnit?: string;
  doseDimension?: MedDoseDimension;
}): string {
  const d = (m.dose ?? "").trim();
  if (d) return d;
  if (m.doseAmountStandard != null && m.doseStandardUnit) {
    const countish =
      m.doseDimension === "count" ||
      (["tablet", "capsule", "puff", "patch", "drop"] as string[]).includes(m.doseStandardUnit);
    if (countish) {
      const u = m.doseStandardUnit as MedDoseUserUnit;
      return `${formatQtyClean(m.doseAmountStandard)} ${pluralCount(u, m.doseAmountStandard)}`;
    }
    return `${formatQtyClean(m.doseAmountStandard)} ${m.doseStandardUnit}`;
  }
  return "";
}

/** Map stored standard unit back to the dose picker (best-effort). */
export function standardUnitToEditorUnit(u: string | undefined): MedDoseUserUnit {
  if (!u?.trim()) return "mg";
  const t = u.trim().toLowerCase();
  const allowed: MedDoseUserUnit[] = [
    "mg",
    "g",
    "mcg",
    "ug",
    "mL",
    "L",
    "IU",
    "tablet",
    "capsule",
    "puff",
    "patch",
    "drop",
  ];
  const hit = allowed.find((x) => x.toLowerCase() === t);
  return hit ?? "mg";
}

/** Smaller “you entered …” line when it differs from the canonical dose. */
export function medDoseSecondaryLine(m: { dose?: string; doseUserEnteredLabel?: string }): string | undefined {
  const sub = (m.doseUserEnteredLabel ?? "").trim();
  if (!sub) return undefined;
  const primary = medDosePrimaryLine(m).replace(/\s+/g, " ").toLowerCase();
  const subN = sub.replace(/\s+/g, " ").toLowerCase();
  if (!primary || subN === primary) return undefined;
  return sub;
}
