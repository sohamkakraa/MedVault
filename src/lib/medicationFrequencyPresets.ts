/**
 * Plain-language schedule strings for medicines. Values are chosen so dashboard
 * helpers (`parseDailyDose`, `nextDoseWindow`) still recognise them where possible.
 */

export type MedFrequencyPresetId =
  | "once_daily"
  | "twice_daily"
  | "three_times"
  | "four_times"
  | "at_night"
  | "weekly"
  | "monthly"
  | "q6h"
  | "q8h"
  | "q12h"
  | "as_needed"
  | "other";

export const MED_FREQUENCY_PRESETS: { id: MedFrequencyPresetId; label: string; frequency: string }[] = [
  { id: "once_daily", label: "Once a day", frequency: "Once a day" },
  { id: "twice_daily", label: "Twice a day", frequency: "Twice daily" },
  { id: "three_times", label: "Three times a day", frequency: "Three times a day" },
  { id: "four_times", label: "Four times a day", frequency: "Four times a day" },
  { id: "at_night", label: "At night only", frequency: "At night" },
  { id: "weekly", label: "Once a week", frequency: "Once weekly" },
  { id: "monthly", label: "Once a month", frequency: "Once monthly" },
  { id: "q6h", label: "Every 6 hours", frequency: "q6h" },
  { id: "q8h", label: "Every 8 hours", frequency: "q8h" },
  { id: "q12h", label: "Every 12 hours", frequency: "q12h" },
  { id: "as_needed", label: "Only when needed", frequency: "As needed" },
  { id: "other", label: "Other (type below)", frequency: "" },
];

export function frequencyFromPreset(preset: MedFrequencyPresetId, otherTrimmed: string): string | undefined {
  if (preset === "other") {
    const o = otherTrimmed.trim();
    return o.length ? o : undefined;
  }
  const row = MED_FREQUENCY_PRESETS.find((x) => x.id === preset);
  const f = row?.frequency?.trim();
  return f?.length ? f : undefined;
}

/** Best-effort: map an existing free-text frequency (e.g. from a PDF) to a preset or Other. */
export function matchStoredFrequencyToPreset(stored?: string): { preset: MedFrequencyPresetId; other: string } {
  const raw = (stored ?? "").trim();
  if (!raw) return { preset: "once_daily", other: "" };

  const t = raw.toLowerCase();

  for (const p of MED_FREQUENCY_PRESETS) {
    if (p.id === "other" || !p.frequency) continue;
    if (t === p.frequency.toLowerCase()) return { preset: p.id, other: "" };
  }

  if (/\bq\s*6\s*h\b/i.test(raw) || t.includes("every 6 hour")) return { preset: "q6h", other: "" };
  if (/\bq\s*8\s*h\b/i.test(raw) || t.includes("every 8 hour")) return { preset: "q8h", other: "" };
  if (/\bq\s*12\s*h\b/i.test(raw) || t.includes("every 12 hour")) return { preset: "q12h", other: "" };
  if (t.includes("four") || t.includes("qid")) return { preset: "four_times", other: "" };
  if (t.includes("tid") || (t.includes("three") && t.includes("time"))) return { preset: "three_times", other: "" };
  if (t.includes("bid") || t.includes("twice")) return { preset: "twice_daily", other: "" };
  if (t.includes("week")) return { preset: "weekly", other: "" };
  if (t.includes("month")) return { preset: "monthly", other: "" };
  if (t.includes("night") || t.includes("bedtime") || t.includes("hs")) return { preset: "at_night", other: "" };
  if (t.includes("prn") || t.includes("as needed") || t.includes("when needed")) return { preset: "as_needed", other: "" };
  if (t.includes("once") && (t.includes("day") || t.includes("daily"))) return { preset: "once_daily", other: "" };

  return { preset: "other", other: raw };
}
