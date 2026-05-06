/**
 * Returns true when the assistant's reply contains clinical/advisory language
 * that warrants the "Not medical advice" disclaimer.  Returns false for purely
 * factual lookups (stored values, names, dates, appointments).
 */
export function isClinicalResponse(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(dos(?:e|age|ing)|mg\b|mcg\b|tablet|capsule|inject|interaction|side[\s-]effect|symptom|diagnos|treat(?:ment|ing)|prescri|avoid\b|consult\b|risk\b|allerg|medication\s+change|adverse|contra[\s-]?indica|monitor\b|overdose|toxic|warning)\b/.test(t);
}
