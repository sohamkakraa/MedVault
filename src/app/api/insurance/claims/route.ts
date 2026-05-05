import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/server/authSession";
import { parsePatientStoreJson, patientStoreForApiPayload } from "@/lib/patientStoreApi";
import { randomUUID } from "crypto";
import type { InsuranceClaim } from "@/lib/types";

export const runtime = "nodejs";

const ClaimSchema = z.object({
  id: z.string().optional(),
  planId: z.string().optional(),
  claimNumber: z.string().max(100).optional(),
  status: z.enum(["draft", "submitted", "pending_documents", "under_review", "approved", "partially_approved", "rejected", "appeal", "settled", "withdrawn"]),
  type: z.enum(["reimbursement", "cashless", "pre-auth", "top-up"]),
  relatedDocIds: z.array(z.string()).optional(),
  providerName: z.string().max(300).optional(),
  dateOfServiceISO: z.string().max(30).optional(),
  dateSubmittedISO: z.string().max(30).optional(),
  dateSettledISO: z.string().max(30).optional(),
  amountClaimed: z.number().nonnegative().optional(),
  amountApproved: z.number().nonnegative().optional(),
  rejectionReason: z.string().max(2000).optional(),
  draftEmailSubject: z.string().max(500).optional(),
  draftEmailBody: z.string().max(20000).optional(),
  sentToEmail: z.string().email().optional().or(z.literal("")),
  sentAtISO: z.string().max(30).optional(),
  notes: z.string().max(5000).optional(),
  autoDetected: z.boolean().optional(),
});

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const row = await prisma.patientRecord.findUnique({ where: { userId } });
  if (!row) return NextResponse.json({ ok: true, claims: [] });
  const store = parsePatientStoreJson(row.data);
  return NextResponse.json({ ok: true, claims: store?.insuranceClaims ?? [] });
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const parsed = ClaimSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid claim data." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const row = await prisma.patientRecord.findUnique({ where: { userId } });
  const store = parsePatientStoreJson(row?.data ?? null) ?? {
    docs: [], meds: [], labs: [], healthLogs: { bloodPressure: [], medicationIntake: [], sideEffects: [], medicationReminders: [] },
    profile: { name: "", allergies: [], conditions: [] }, preferences: { theme: "system" as const }, updatedAtISO: now,
  };

  const claims: InsuranceClaim[] = store.insuranceClaims ?? [];
  const id = parsed.data.id ?? randomUUID();
  const existingIdx = claims.findIndex((c) => c.id === id);
  const claim: InsuranceClaim = {
    ...parsed.data,
    id,
    status: parsed.data.status,
    type: parsed.data.type,
    createdAtISO: existingIdx >= 0 ? (claims[existingIdx]!.createdAtISO) : now,
    updatedAtISO: now,
    correspondence: existingIdx >= 0 ? claims[existingIdx]!.correspondence : undefined,
  };

  if (existingIdx >= 0) {
    claims[existingIdx] = claim;
  } else {
    claims.unshift(claim);
  }

  const updated = { ...store, insuranceClaims: claims, updatedAtISO: now };
  const payload = patientStoreForApiPayload(updated);
  await prisma.patientRecord.upsert({
    where: { userId },
    create: { userId, data: payload as object },
    update: { data: payload as object },
  });

  return NextResponse.json({ ok: true, claim });
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
  const updated = { ...store, insuranceClaims: (store.insuranceClaims ?? []).filter((c) => c.id !== id), updatedAtISO: now };
  const payload = patientStoreForApiPayload(updated);
  await prisma.patientRecord.update({ where: { userId }, data: { data: payload as object } });

  return NextResponse.json({ ok: true });
}
