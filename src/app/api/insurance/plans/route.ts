import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/server/authSession";
import { parsePatientStoreJson, patientStoreForApiPayload } from "@/lib/patientStoreApi";
import { randomUUID } from "crypto";
import type { InsurancePlan } from "@/lib/types";

export const runtime = "nodejs";

const PlanSchema = z.object({
  id: z.string().optional(),
  insurerName: z.string().min(1).max(200),
  policyNumber: z.string().min(1).max(100),
  policyType: z.enum(["individual", "family", "group", "senior_citizen", "other"]).optional(),
  holderName: z.string().max(200).optional(),
  coverageAmount: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  premiumAmount: z.number().nonnegative().optional(),
  premiumFrequency: z.enum(["monthly", "quarterly", "half-yearly", "annually", "one-time"]).optional(),
  startDateISO: z.string().max(30).optional(),
  endDateISO: z.string().max(30).optional(),
  renewalDateISO: z.string().max(30).optional(),
  claimEmailAddress: z.string().email().optional().or(z.literal("")),
  tpaName: z.string().max(200).optional(),
  coverageNotes: z.string().max(2000).optional(),
  agentName: z.string().max(200).optional(),
  agentPhone: z.string().max(30).optional(),
  documentId: z.string().max(100).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const row = await prisma.patientRecord.findUnique({ where: { userId } });
  if (!row) return NextResponse.json({ ok: true, plans: [] });
  const store = parsePatientStoreJson(row.data);
  return NextResponse.json({ ok: true, plans: store?.insurancePlans ?? [] });
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const parsed = PlanSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid plan data." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const row = await prisma.patientRecord.findUnique({ where: { userId } });
  const store = parsePatientStoreJson(row?.data ?? null) ?? {
    docs: [], meds: [], labs: [], healthLogs: { bloodPressure: [], medicationIntake: [], sideEffects: [], medicationReminders: [] },
    profile: { name: "", allergies: [], conditions: [] }, preferences: { theme: "system" as const }, updatedAtISO: now,
  };

  const plans: InsurancePlan[] = store.insurancePlans ?? [];
  const id = parsed.data.id ?? randomUUID();
  const existingIdx = plans.findIndex((p) => p.id === id);
  const plan: InsurancePlan = {
    ...parsed.data,
    id,
    insurerName: parsed.data.insurerName,
    policyNumber: parsed.data.policyNumber,
    createdAtISO: existingIdx >= 0 ? (plans[existingIdx]!.createdAtISO) : now,
    updatedAtISO: now,
    active: parsed.data.active ?? true,
  };

  if (existingIdx >= 0) {
    plans[existingIdx] = plan;
  } else {
    plans.unshift(plan);
  }

  const updated = { ...store, insurancePlans: plans, updatedAtISO: now };
  const payload = patientStoreForApiPayload(updated);
  await prisma.patientRecord.upsert({
    where: { userId },
    create: { userId, data: payload as object },
    update: { data: payload as object },
  });

  return NextResponse.json({ ok: true, plan });
}

export async function DELETE(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });

  const row = await prisma.patientRecord.findUnique({ where: { userId } });
  if (!row) return NextResponse.json({ ok: true });
  const store = parsePatientStoreJson(row.data);
  if (!store) return NextResponse.json({ ok: true });

  const now = new Date().toISOString();
  const updated = { ...store, insurancePlans: (store.insurancePlans ?? []).filter((p) => p.id !== id), updatedAtISO: now };
  const payload = patientStoreForApiPayload(updated);
  await prisma.patientRecord.update({ where: { userId }, data: { data: payload as object } });

  return NextResponse.json({ ok: true });
}
