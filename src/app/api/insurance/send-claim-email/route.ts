import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/server/authSession";
import { parsePatientStoreJson, patientStoreForApiPayload } from "@/lib/patientStoreApi";
import { randomUUID } from "crypto";
import type { ClaimCorrespondence, InsuranceClaim } from "@/lib/types";
import { Resend } from "resend";

export const runtime = "nodejs";

const SendSchema = z.object({
  claimId: z.string(),
  toEmail: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(30000),
  fromName: z.string().max(200).optional(),
  replyTo: z.string().email().optional(),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const parsed = SendSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { claimId, toEmail, subject, body, fromName, replyTo } = parsed.data;

  const row = await prisma.patientRecord.findUnique({ where: { userId } });
  const store = parsePatientStoreJson(row?.data ?? null);
  if (!store) return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });

  const claims: InsuranceClaim[] = store.insuranceClaims ?? [];
  const claimIdx = claims.findIndex((c) => c.id === claimId);
  if (claimIdx < 0) return NextResponse.json({ ok: false, error: "Claim not found." }, { status: 404 });

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.AUTH_EMAIL_FROM?.trim();
  let deliveryWarning: string | undefined;

  if (resendKey && fromAddress) {
    const resend = new Resend(resendKey);
    const displayFrom = fromName ? `${fromName} via UMA <${fromAddress}>` : fromAddress;
    try {
      const { error } = await resend.emails.send({
        from: displayFrom,
        to: toEmail,
        replyTo: replyTo,
        subject,
        text: body,
        html: body
          .split("\n\n")
          .map((para) => `<p style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;margin:0 0 12px">${
            para.replace(/\n/g, "<br>")
          }</p>`)
          .join(""),
      });
      if (error) {
        deliveryWarning = `Email could not be delivered: ${error.name}. The correspondence has been recorded.`;
      }
    } catch {
      deliveryWarning = "Email delivery failed due to a network error. The correspondence has been recorded.";
    }
  } else {
    deliveryWarning = "Email not sent (RESEND_API_KEY or AUTH_EMAIL_FROM not set). Correspondence recorded.";
  }

  const now = new Date().toISOString();
  const correspondence: ClaimCorrespondence = {
    id: randomUUID(),
    direction: "outgoing",
    subject,
    body,
    toEmail,
    sentAtISO: now,
  };

  const emailSucceeded = !deliveryWarning;
  const updatedClaim: InsuranceClaim = {
    ...claims[claimIdx]!,
    ...(emailSucceeded ? { status: "submitted", sentToEmail: toEmail, sentAtISO: now } : {}),
    correspondence: [...(claims[claimIdx]!.correspondence ?? []), correspondence],
    updatedAtISO: now,
  };
  claims[claimIdx] = updatedClaim;

  const updated = { ...store, insuranceClaims: claims, updatedAtISO: now };
  const payload = patientStoreForApiPayload(updated);
  await prisma.patientRecord.update({ where: { userId }, data: { data: payload as object } });

  return NextResponse.json({ ok: true, claim: updatedClaim, warning: deliveryWarning });
}
