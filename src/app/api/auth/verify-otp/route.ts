import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { verifyAndConsumeOtpDb } from "@/lib/auth/otpDb";
import { normalizeLoginIdentifier } from "@/lib/auth/identifiers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionSigningFailureHint,
  signSessionToken,
} from "@/lib/auth/sessionToken";
import { checkRateLimitDb } from "@/lib/auth/otpRateLimitDb";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Fixed VULN-005: rate-limit OTP verify attempts to prevent brute-force.
// A 6-digit OTP has only 1M combinations — without this, all can be tried
// within the 10-minute TTL window at modest request rates.
const VERIFY_RATE_KEY_PREFIX = "otp-verify:";

function clientIp(req: Request): string {
  const xf = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim() || "unknown";
  return "unknown";
}

const bodySchema = z.object({
  identifier: z.string().min(3).max(320),
  code: z.string().regex(/^\d{6}$/),
  phoneCountryCode: z.string().max(8).optional(),
  /** One-time token from `?wa=<token>` — binds the verified phone to a PendingLink. */
  waToken: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  // Fixed VULN-005 + VULN-007: DB-backed rate limit on verify (10 per 15 min per IP)
  const ip = clientIp(req);
  if (!(await checkRateLimitDb(`${VERIFY_RATE_KEY_PREFIX}${ip}`, 10, 15 * 60 * 1000))) {
    return NextResponse.json(
      { ok: false, error: "Too many verification attempts. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { identifier, code, phoneCountryCode, waToken } = parsed.data;
  const norm = normalizeLoginIdentifier(identifier, phoneCountryCode);
  if (!norm) {
    return NextResponse.json({ ok: false, error: "Invalid email address." }, { status: 400 });
  }

  let otpOk = false;
  try {
    otpOk = await verifyAndConsumeOtpDb(norm.key, code);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Sign-in service is unavailable. Check DATABASE_URL and migrations." },
      { status: 503 },
    );
  }
  if (!otpOk) {
    return NextResponse.json(
      {
        ok: false,
        error:
          norm.kind === "phone"
            ? "Incorrect or expired code. Check the latest WhatsApp message, or tap Send code to get a new one."
            : "Incorrect or expired code. Check the latest email we sent, or tap Send code to get a new one.",
      },
      { status: 401 },
    );
  }

  let user: { id: string; email: string | null; phoneE164: string | null };
  try {
    if (norm.kind === "phone") {
      // Find-or-create a user keyed by phone. Because the code was just
      // delivered via WhatsApp and successfully entered back, we also mark
      // the WhatsApp link as verified so inbound chat works immediately
      // (processMessage.ts looks up `whatsappPhone + whatsappVerified`).
      const whatsappDigits = norm.e164.replace(/\D/g, "");
      let u = await prisma.user.findUnique({ where: { phoneE164: norm.e164 } });
      if (!u) {
        u = await prisma.user.create({
          data: {
            phoneE164: norm.e164,
            whatsappPhone: whatsappDigits,
            whatsappVerified: true,
          },
        });
      } else if (!u.whatsappVerified || u.whatsappPhone !== whatsappDigits) {
        u = await prisma.user.update({
          where: { id: u.id },
          data: {
            whatsappPhone: whatsappDigits,
            whatsappVerified: true,
          },
        });
      }
      user = u;
    } else {
      let u = await prisma.user.findUnique({ where: { email: norm.display } });
      if (!u) u = await prisma.user.create({ data: { email: norm.display } });
      user = u;
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "That identifier is already linked. Try signing in with the other method." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: "Could not create account." }, { status: 503 });
  }

  // Consume a PendingLink token if provided (from ?wa= in the login URL).
  // Binds the verified phone number to this web account so inbound WhatsApp
  // messages from that number are recognised as this user.
  if (waToken) {
    try {
      const pending = await prisma.pendingLink.findUnique({ where: { token: waToken } });
      if (pending && pending.expiresAt > new Date()) {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: {
              whatsappPhone: pending.phoneE164.replace(/\D/g, ""),
              whatsappVerified: true,
            },
          }),
          prisma.pendingLink.delete({ where: { token: waToken } }),
        ]);
      }
    } catch {
      // Non-critical: session still proceeds even if PendingLink consumption fails
    }
  }

  const token = await signSessionToken({
    sub: user.id,
    email: user.email ?? undefined,
    phoneE164: user.phoneE164 ?? undefined,
  });
  if (!token) {
    return NextResponse.json({ ok: false, error: sessionSigningFailureHint() }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
