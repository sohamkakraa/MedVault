import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/server/authSession";
import { parsePatientStoreJson, patientStoreForApiPayload } from "@/lib/patientStoreApi";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { InsuranceClaim } from "@/lib/types";

export const runtime = "nodejs";

const DraftSchema = z.object({
  claimId: z.string().optional(),
  relatedDocIds: z.array(z.string()).min(1),
  planId: z.string().optional(),
  claimType: z.enum(["reimbursement", "cashless", "pre-auth", "top-up"]).default("reimbursement"),
  userContext: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const parsed = DraftSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI not configured." }, { status: 503 });

  const row = await prisma.patientRecord.findUnique({ where: { userId } });
  const store = parsePatientStoreJson(row?.data ?? null);
  if (!store) return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });

  const { relatedDocIds, planId, claimType, userContext, claimId } = parsed.data;

  const docs = store.docs.filter((d) => relatedDocIds.includes(d.id));
  if (docs.length === 0) return NextResponse.json({ ok: false, error: "No matching documents found." }, { status: 400 });

  const plan = store.insurancePlans?.find((p) => p.id === planId);
  const profile = store.profile;

  const docsContext = docs.map((doc) => {
    const lines: (string | null)[] = [
      `Document: ${doc.title} (${doc.type}, ${doc.dateISO ?? "date unknown"})`,
      doc.provider ? `Provider: ${doc.provider}` : null,
      doc.summary,
    ];
    if (doc.billTotalAmount != null) lines.push(`Bill Total: ${doc.billTotalAmount}`);
    if (doc.billInsurancePaidAmount != null) lines.push(`Insurance Paid: ${doc.billInsurancePaidAmount}`);
    if (doc.billPatientLiabilityAmount != null) lines.push(`Patient Liability: ${doc.billPatientLiabilityAmount}`);
    if (doc.billInsurerName) lines.push(`Insurer on Bill: ${doc.billInsurerName}`);
    return lines.filter(Boolean).join("\n");
  }).join("\n\n---\n\n");

  const systemPrompt = `You are an expert medical insurance claim specialist. Draft a professional, detailed, and compelling insurance ${claimType} claim email on behalf of the patient.

Requirements:
- Be specific — reference actual amounts, dates, provider names, and document details
- Include policy number and patient name prominently at the top
- Clearly state the claim amount and what it covers
- List all supporting documents being attached
- Be polite but assertive about the policy entitlement basis
- Request processing within a specific timeframe (e.g., 15 working days as per IRDAI guidelines)
- Include all required claim reference fields (date of admission, diagnosis, treating doctor if known)

Respond in JSON with exactly:
{
  "subject": "brief email subject line",
  "body": "full email body as plain text with normal paragraphs",
  "claimAmount": <number or null>,
  "providerName": "<hospital/clinic name or null>",
  "dateOfService": "<YYYY-MM-DD or null>"
}`;

  const userPrompt = `Draft a ${claimType} insurance claim email for:

Patient: ${[profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.name || "Patient"}
${plan ? `Insurance: ${plan.insurerName}\nPolicy No: ${plan.policyNumber}` : "Insurance: not specified"}
${plan?.tpaName ? `TPA: ${plan.tpaName}` : ""}
${plan?.claimEmailAddress ? `Claim Email: ${plan.claimEmailAddress}` : ""}

Documents:
${docsContext}
${userContext ? `\nAdditional context: ${userContext}` : ""}`;

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  let subject = "";
  let body = "";
  let claimAmount: number | undefined;
  let providerName: string | undefined;
  let dateOfServiceISO: string | undefined;

  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]) as {
        subject?: string; body?: string;
        claimAmount?: number | null; providerName?: string | null; dateOfService?: string | null;
      };
      subject = result.subject ?? "";
      body = result.body ?? "";
      if (result.claimAmount) claimAmount = result.claimAmount;
      if (result.providerName) providerName = result.providerName;
      if (result.dateOfService) dateOfServiceISO = result.dateOfService;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to generate draft." }, { status: 500 });
  }

  const now = new Date().toISOString();
  const claims = store.insuranceClaims ?? [];
  const existingIdx = claimId ? claims.findIndex((c) => c.id === claimId) : -1;
  const id = claimId ?? randomUUID();

  const claim: InsuranceClaim = {
    id,
    planId,
    status: "draft",
    type: claimType,
    relatedDocIds,
    providerName: providerName ?? docs[0]?.provider,
    dateOfServiceISO: dateOfServiceISO ?? docs[0]?.dateISO,
    amountClaimed: claimAmount,
    draftEmailSubject: subject,
    draftEmailBody: body,
    autoDetected: false,
    createdAtISO: existingIdx >= 0 ? claims[existingIdx]!.createdAtISO : now,
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

  return NextResponse.json({ ok: true, claim, draftEmailSubject: subject, draftEmailBody: body });
}
