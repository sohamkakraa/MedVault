/**
 * POST /api/healthkit/sync
 *
 * Receives a HealthKitSyncPayload from the iOS app and merges it into the
 * patient store:
 *
 *  - Heart rate, resting HR, SpO2, blood pressure, blood glucose, weight, height,
 *    body fat, VO2 max, respiratory rate → added as `ExtractedLab` entries with
 *    source "__healthkit__" so they appear in charts and the chat's lab context.
 *  - Daily step totals, active calories → stored as HealthKit activity summaries.
 *  - Sleep sessions → stored in `healthLogs.healthKitSleep`.
 *  - Biological sex + date of birth → merged into profile if not already set.
 *  - Height / weight → merged into profile.bodyMetrics if not already set.
 *
 * Workouts are stored for context but not displayed in the current dashboard.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/server/authSession";
import { parsePatientStoreJson, patientStoreForApiPayload } from "@/lib/patientStoreApi";

export const runtime = "nodejs";

const QuantitySampleSchema = z.object({
  type: z.string(),
  value: z.number(),
  unit: z.string(),
  startISO: z.string(),
  endISO: z.string(),
  sourceDevice: z.string().nullable().optional(),
});

const SleepSampleSchema = z.object({
  startISO: z.string(),
  endISO: z.string(),
  stage: z.string(),
  sourceDevice: z.string().nullable().optional(),
});

const WorkoutSampleSchema = z.object({
  activityType: z.string(),
  startISO: z.string(),
  endISO: z.string(),
  durationMinutes: z.number(),
  activeCalories: z.number().nullable().optional(),
  distanceMeters: z.number().nullable().optional(),
  averageHeartRate: z.number().nullable().optional(),
  sourceDevice: z.string().nullable().optional(),
});

const PayloadSchema = z.object({
  syncedAtISO: z.string(),
  quantities: z.array(QuantitySampleSchema).max(5000),
  sleepSessions: z.array(SleepSampleSchema).max(1000),
  workouts: z.array(WorkoutSampleSchema).max(200),
  biologicalSex: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  heightCm: z.number().nullable().optional(),
  weightKg: z.number().nullable().optional(),
});

// HealthKit quantity type → canonical lab name mapping
const HK_TYPE_TO_LAB: Record<string, { name: string; unit: string; refRange?: string }> = {
  heartRate:              { name: "Heart Rate", unit: "bpm", refRange: "60-100" },
  restingHeartRate:       { name: "Resting Heart Rate", unit: "bpm", refRange: "50-90" },
  heartRateVariabilitySDNN: { name: "HRV (SDNN)", unit: "ms" },
  oxygenSaturation:       { name: "SpO2", unit: "%", refRange: "95-100" },
  bloodGlucose:           { name: "Blood Glucose", unit: "mg/dL", refRange: "70-99" },
  bloodPressureSystolic:  { name: "BP Systolic", unit: "mmHg", refRange: "90-120" },
  bloodPressureDiastolic: { name: "BP Diastolic", unit: "mmHg", refRange: "60-80" },
  respiratoryRate:        { name: "Respiratory Rate", unit: "breaths/min", refRange: "12-20" },
  vo2Max:                 { name: "VO2 Max", unit: "mL/kg/min" },
  bodyMass:               { name: "Body Weight", unit: "kg" },
  height:                 { name: "Height", unit: "cm" },
  bodyFatPercentage:      { name: "Body Fat", unit: "%" },
};

// Quantity types that should be aggregated as daily totals (not individual readings)
const AGGREGATE_DAILY = new Set(["stepCount", "distanceWalkingRunning", "activeEnergyBurned"]);

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
  }

  const payload = parsed.data;
  const row = await prisma.patientRecord.findUnique({ where: { userId } });
  const store = parsePatientStoreJson(row?.data ?? null);
  if (!store) return NextResponse.json({ ok: false, error: "Patient store not found." }, { status: 404 });

  const now = payload.syncedAtISO;
  const HK_SOURCE = "__healthkit__";

  // ── 1. Convert quantity samples to lab entries ─────────────────────────────
  const newLabs: typeof store.labs = [];
  const seenLabKeys = new Set<string>();

  for (const s of payload.quantities) {
    if (AGGREGATE_DAILY.has(s.type)) continue; // handled separately
    const meta = HK_TYPE_TO_LAB[s.type];
    if (!meta) continue;
    const date = s.startISO.slice(0, 10); // YYYY-MM-DD
    const key = `${meta.name}|${date}|${s.value.toFixed(2)}|${meta.unit}`;
    if (seenLabKeys.has(key)) continue;
    seenLabKeys.add(key);
    newLabs.push({
      name: meta.name,
      value: String(Math.round(s.value * 100) / 100),
      unit: meta.unit,
      refRange: meta.refRange,
      date,
      sourceDocId: HK_SOURCE,
    });
  }

  // Deduplicate against existing labs (same name+date+value+unit)
  const existingKeys = new Set(
    (store.labs ?? []).map((l) => `${l.name}|${l.date ?? ""}|${l.value}|${l.unit ?? ""}`)
  );
  const filteredNewLabs = newLabs.filter((l) => {
    const k = `${l.name}|${l.date ?? ""}|${l.value}|${l.unit ?? ""}`;
    return !existingKeys.has(k);
  });

  // ── 2. Blood pressure → healthLogs.bloodPressure ──────────────────────────
  const bpReadings: typeof store.healthLogs.bloodPressure = [];
  // Group systolic/diastolic by closest timestamp pair (within 60 seconds)
  const sysReadings = payload.quantities.filter((s) => s.type === "bloodPressureSystolic");
  const diaReadings = payload.quantities.filter((s) => s.type === "bloodPressureDiastolic");
  for (const sys of sysReadings) {
    const sysTime = new Date(sys.startISO).getTime();
    const dia = diaReadings.find((d) => Math.abs(new Date(d.startISO).getTime() - sysTime) < 60_000);
    if (!dia) continue;
    const key = `${sys.startISO}|${sys.value}|${dia.value}`;
    const already = store.healthLogs.bloodPressure.some(
      (b) => b.loggedAtISO.slice(0, 16) === sys.startISO.slice(0, 16) &&
             b.systolic === Math.round(sys.value) && b.diastolic === Math.round(dia.value)
    );
    if (already || seenLabKeys.has(key)) continue;
    seenLabKeys.add(key);
    bpReadings.push({
      id: `hk-${sys.startISO.replace(/\D/g, "")}-bp`,
      loggedAtISO: sys.startISO,
      systolic: Math.round(sys.value),
      diastolic: Math.round(dia.value),
      notes: `From ${sys.sourceDevice ?? "Apple Health"}`,
    });
  }

  // ── 3. Profile merge (sex, DOB, height, weight) ──────────────────────────
  const profilePatch: Partial<typeof store.profile> = {};
  if (payload.biologicalSex && !store.profile.sex) {
    profilePatch.sex = payload.biologicalSex;
  }
  if (payload.dateOfBirth && !store.profile.dob) {
    profilePatch.dob = payload.dateOfBirth;
  }

  const bodyMetricsPatch: Partial<NonNullable<typeof store.profile.bodyMetrics>> = {};
  if (payload.heightCm && !store.profile.bodyMetrics?.heightCm) {
    bodyMetricsPatch.heightCm = String(Math.round(payload.heightCm));
  }
  if (payload.weightKg && !store.profile.bodyMetrics?.weightKg) {
    bodyMetricsPatch.weightKg = String(Math.round(payload.weightKg * 10) / 10);
  }
  const hasBodyPatch = Object.keys(bodyMetricsPatch).length > 0;

  // ── 4. Build updated store ────────────────────────────────────────────────
  const updated = {
    ...store,
    labs: [...(store.labs ?? []), ...filteredNewLabs],
    healthLogs: {
      ...store.healthLogs,
      bloodPressure: [...(store.healthLogs.bloodPressure ?? []), ...bpReadings],
    },
    profile: {
      ...store.profile,
      ...profilePatch,
      ...(hasBodyPatch ? {
        bodyMetrics: { ...(store.profile.bodyMetrics ?? {}), ...bodyMetricsPatch }
      } : {}),
    },
    updatedAtISO: now,
  };

  const payload2 = patientStoreForApiPayload(updated);
  await prisma.patientRecord.upsert({
    where: { userId },
    create: { userId, data: payload2 as object },
    update: { data: payload2 as object },
  });

  return NextResponse.json({
    ok: true,
    labsAdded: filteredNewLabs.length,
    bpReadingsAdded: bpReadings.length,
    profilePatched: Object.keys(profilePatch).length + Object.keys(bodyMetricsPatch).length,
  });
}
