/**
 * Link / unlink a WhatsApp phone number to the authenticated user.
 *
 * POST { phone } — sends a 6-digit OTP to the phone via WhatsApp, stores hash.
 * PUT  { phone, code } — verifies the OTP and marks whatsappVerified = true.
 * DELETE — unlinks WhatsApp from the account.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomInt, createHash } from "crypto";
import { requireUserId } from "@/lib/server/authSession";
import { prisma } from "@/lib/prisma";
import { sendOtpMessage, isWhatsAppConfigured } from "@/lib/whatsapp/client";
import { normalizeWhatsAppTo } from "@/lib/whatsapp/phone";
import { checkRateLimitDb } from "@/lib/auth/otpRateLimitDb";

export const runtime = "nodejs";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

const LinkSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(20)
    .transform((v) => v.replace(/[^0-9+]/g, "")),
});

const VerifySchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(20)
    .transform((v) => v.replace(/[^0-9+]/g, "")),
  code: z.string().length(6),
});

/** Step 1: Send OTP via WhatsApp. */
export async function POST(req: NextRequest) {
  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ error: "WhatsApp is not configured on this server." }, { status: 503 });
  }

  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // VULN-006: Rate limit OTP requests — 5 per hour per user
  const allowed = await checkRateLimitDb(`wa-otp-req:${userId}`, 5, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many OTP requests. Please try again later." }, { status: 429 });
  }

  const body = LinkSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
  }

  const { phone } = body.data;
  let normalized: string;
  try {
    normalized = normalizeWhatsAppTo(phone);
  } catch {
    return NextResponse.json({ error: "Invalid phone number (include country code, e.g. 91…)." }, { status: 400 });
  }

  const code = String(randomInt(100_000, 999_999));

  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappPhone: normalized,
      whatsappVerified: false,
    },
  });

  await prisma.otpChallenge.upsert({
    where: { lookupKey: `wa:${userId}` },
    update: { codeHash, expiresAt },
    create: { lookupKey: `wa:${userId}`, codeHash, expiresAt },
  });

  try {
    await sendOtpMessage(normalized, code);
  } catch (err) {
    // VULN-009/012: Log error message only (no stack traces or token details)
    console.error("[WhatsApp link] Failed to send OTP:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      {
        error:
          "Could not send WhatsApp verification. Please check that you entered a valid international phone number.",
        // VULN-012: Never expose internal error details to the client, even in dev
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, message: "Verification code sent via WhatsApp." });
}

/** Step 2: Verify OTP. */
export async function PUT(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // VULN-006: Rate limit OTP verification attempts — 10 per hour per user (prevents brute force)
  const allowed = await checkRateLimitDb(`wa-otp-verify:${userId}`, 10, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many verification attempts. Please request a new code." }, { status: 429 });
  }

  const body = VerifySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { phone, code } = body.data;
  let normalized: string;
  try {
    normalized = normalizeWhatsAppTo(phone);
  } catch {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
  }

  const challenge = await prisma.otpChallenge.findUnique({
    where: { lookupKey: `wa:${userId}` },
  });

  if (!challenge || challenge.expiresAt < new Date()) {
    return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 410 });
  }

  if (challenge.codeHash !== hashCode(code)) {
    return NextResponse.json({ error: "Incorrect code." }, { status: 403 });
  }

  await prisma.otpChallenge.delete({ where: { lookupKey: `wa:${userId}` } });

  await prisma.user.update({
    where: { id: userId },
    data: { whatsappPhone: normalized, whatsappVerified: true },
  });

  return NextResponse.json({ ok: true, message: "WhatsApp linked successfully!" });
}

/** Unlink WhatsApp. */
export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: userId },
    data: { whatsappPhone: null, whatsappVerified: false },
  });

  return NextResponse.json({ ok: true, message: "WhatsApp unlinked." });
}
