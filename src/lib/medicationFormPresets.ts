import type { MedicationFormKind } from "@/lib/types";

export const MEDICATION_FORM_OPTIONS: { value: MedicationFormKind; label: string }[] = [
  { value: "unspecified", label: "Not set" },
  { value: "pill", label: "Pill" },
  { value: "tablet", label: "Tablet" },
  { value: "capsule", label: "Capsule" },
  { value: "liquid", label: "Liquid / syrup" },
  { value: "injection", label: "Injection" },
  { value: "ointment", label: "Ointment" },
  { value: "cream", label: "Cream" },
  { value: "gel", label: "Gel" },
  { value: "patch", label: "Patch" },
  { value: "inhaler", label: "Inhaler" },
  { value: "spray", label: "Nasal / throat spray" },
  { value: "drops", label: "Drops (eye / ear)" },
  { value: "powder", label: "Powder" },
  { value: "suppository", label: "Suppository" },
  { value: "device", label: "Device (pen, pump, etc.)" },
  { value: "other", label: "Other" },
];

export function isMedicationFormKind(x: string): x is MedicationFormKind {
  return MEDICATION_FORM_OPTIONS.some((o) => o.value === x);
}

/** Short label for summaries; empty when unspecified. */
export function medicationFormLabel(form?: MedicationFormKind, other?: string): string {
  if (!form || form === "unspecified") return "";
  if (form === "other") {
    const t = (other ?? "").trim();
    return t ? t.slice(0, 48) : "Other";
  }
  return MEDICATION_FORM_OPTIONS.find((o) => o.value === form)?.label ?? "";
}
