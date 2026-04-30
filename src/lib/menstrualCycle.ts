/** Local calendar date YYYY-MM-DD (no time zone shift for "today"). */
export function localTodayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYMD(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) return null;
  return d;
}

export function daysBetweenUTC(a: Date, b: Date): number {
  const ms = 86400000;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((ub - ua) / ms);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

import type { MenstrualCyclePrefs } from "@/lib/types";

export type CyclePhase = "menstrual" | "follicular" | "ovulation" | "luteal";

export type CycleSummary = {
  /** Plain-language headline for dashboard */
  headline: string;
  /** Secondary line */
  detail: string;
  /** 1-based day within current cycle, if computable */
  dayOfCycle?: number;
  /** Approximate phase label (not clinical) */
  phaseLabel?: string;
  /** Phase identifier */
  phase?: CyclePhase;
  /** YYYY-MM-DD of estimated next period start */
  nextPeriodStartISO?: string;
  /** Days from today until next period (≥0) */
  daysUntilNextPeriod?: number;
  /** Estimated ovulation day of current cycle (1-based) */
  ovulationDayOfCycle?: number;
  /** YYYY-MM-DD of estimated ovulation */
  ovulationDateISO?: string;
  /** Days from today until estimated ovulation (negative = already passed this cycle) */
  daysUntilOvulation?: number;
  /** YYYY-MM-DD inclusive start of fertile window */
  fertileWindowStartISO?: string;
  /** YYYY-MM-DD inclusive end of fertile window */
  fertileWindowEndISO?: string;
  /** Whether today is within the fertile window */
  inFertileWindow?: boolean;
  /** Days until fertile window opens (if it hasn't started yet) */
  daysUntilFertileWindow?: number;
  /** True if today is in flowLogDates */
  flowLoggedToday: boolean;
  /** Estimated period length in days */
  periodLengthDays: number;
  /** Cycle length */
  cycleLengthDays: number;
};

/**
 * Correct, OB-GYN-aligned cycle phases:
 *
 * Key insight (matches Flo/Clue/Ovia): the luteal phase is relatively
 * fixed at ~14 days for most women. Therefore:
 *
 *   ovulation day = cycleLength − 14
 *   fertile window = ovulationDay − 5 to ovulationDay + 1  (6 days, sperm survive 5 days + egg viable ~1 day)
 *
 * Phase boundaries:
 *   Menstrual   → Day 1 to periodLength
 *   Follicular  → Day (periodLength+1) to (ovulationDay−1)   [overlaps day 1 too but display starts after bleed]
 *   Ovulation   → ovulationDay−1 to ovulationDay+1  (3-day window shown to user)
 *   Luteal      → ovulationDay+2 to cycleLength
 */
function computePhase(
  dayOfCycle: number,
  cycleLen: number,
  periodLen: number
): { phase: CyclePhase; label: string } {
  const ovDay = Math.max(cycleLen - 14, periodLen + 2);
  if (dayOfCycle <= periodLen) return { phase: "menstrual", label: "Period" };
  if (dayOfCycle < ovDay - 1) return { phase: "follicular", label: "Follicular phase" };
  if (dayOfCycle <= ovDay + 1) return { phase: "ovulation", label: "Ovulation window" };
  return { phase: "luteal", label: "Luteal phase" };
}

export function summarizeMenstrualCycle(
  mc: MenstrualCyclePrefs | undefined,
  todayYMD: string = localTodayYMD()
): CycleSummary {
  const flowDates = new Set((mc?.flowLogDates ?? []).map((s) => s.trim()).filter(Boolean));
  const flowLoggedToday = flowDates.has(todayYMD);

  const cycleLen = Math.min(45, Math.max(21, mc?.typicalCycleLengthDays ?? 28));
  const periodLen = Math.min(10, Math.max(1, mc?.periodLengthDays ?? 5));
  const last = mc?.lastPeriodStartISO?.trim();

  if (!last) {
    return {
      headline: "Period tracker",
      detail: flowLoggedToday ? "Flow logged · add your last period date to see predictions" : "Add last period date to get predictions",
      flowLoggedToday,
      periodLengthDays: periodLen,
      cycleLengthDays: cycleLen,
    };
  }

  const start = parseYMD(last);
  const today = parseYMD(todayYMD);
  if (!start || !today) {
    return {
      headline: "Period tracker",
      detail: "Invalid date — use YYYY-MM-DD format",
      flowLoggedToday,
      periodLengthDays: periodLen,
      cycleLengthDays: cycleLen,
    };
  }

  const diff = daysBetweenUTC(start, today);
  if (diff < 0) {
    return {
      headline: "Period tracker",
      detail: "Last period date is in the future — check the date",
      flowLoggedToday,
      periodLengthDays: periodLen,
      cycleLengthDays: cycleLen,
    };
  }

  const cyclesCompleted = Math.floor(diff / cycleLen);
  const dayOfCycle = (diff % cycleLen) + 1;

  // Next period
  const nextStart = addDays(start, (cyclesCompleted + 1) * cycleLen);
  const nextPeriodStartISO = toYMD(nextStart);
  const daysUntilNextPeriod = Math.max(0, daysBetweenUTC(today, nextStart));

  // Ovulation (luteal phase = 14 days, fixed)
  const ovulationDayOfCycle = Math.max(cycleLen - 14, periodLen + 2);
  const currentCycleStart = addDays(start, cyclesCompleted * cycleLen);
  const ovulationDate = addDays(currentCycleStart, ovulationDayOfCycle - 1);
  const ovulationDateISO = toYMD(ovulationDate);
  const daysUntilOvulation = daysBetweenUTC(today, ovulationDate);

  // Fertile window: 5 days before ovulation + ovulation day + 1 day after
  const fertileStart = addDays(ovulationDate, -5);
  const fertileEnd = addDays(ovulationDate, 1);
  const fertileWindowStartISO = toYMD(fertileStart);
  const fertileWindowEndISO = toYMD(fertileEnd);

  const fertileStartDay = daysBetweenUTC(today, fertileStart);
  const fertileEndDay = daysBetweenUTC(today, fertileEnd);
  const inFertileWindow = fertileStartDay <= 0 && fertileEndDay >= 0;
  const daysUntilFertileWindow = fertileStartDay > 0 ? fertileStartDay : undefined;

  const { phase, label: phaseLabel } = computePhase(dayOfCycle, cycleLen, periodLen);

  // Build headline
  let headline = `Day ${dayOfCycle}`;
  if (flowLoggedToday) headline = `Flow · Day ${dayOfCycle}`;

  // Build detail
  let detail: string;
  if (daysUntilNextPeriod === 0) {
    detail = "Next period ~ today";
  } else if (daysUntilNextPeriod === 1) {
    detail = "Next period tomorrow";
  } else if (daysUntilNextPeriod <= 7) {
    detail = `Next period in ${daysUntilNextPeriod} days`;
  } else {
    detail = `Next period ~ ${nextPeriodStartISO} (${daysUntilNextPeriod}d)`;
  }

  return {
    headline,
    detail,
    dayOfCycle,
    phaseLabel,
    phase,
    nextPeriodStartISO,
    daysUntilNextPeriod,
    ovulationDayOfCycle,
    ovulationDateISO,
    daysUntilOvulation,
    fertileWindowStartISO,
    fertileWindowEndISO,
    inFertileWindow,
    daysUntilFertileWindow,
    flowLoggedToday,
    periodLengthDays: periodLen,
    cycleLengthDays: cycleLen,
  };
}

/** BMI from metric inputs; returns null if invalid. */
export function bmiFromMetric(heightCm: number, weightKg: number): number | null {
  if (heightCm <= 0) return null;
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  if (!Number.isFinite(bmi)) return null;
  return Math.round(bmi * 10) / 10;
}
