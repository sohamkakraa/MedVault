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
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  identifier: z.string().min(3).max(320),
  code: z.string().regex(/^\d{6}$/),
  phoneCountryCode: z.string().max(8).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { identifier, code, phoneCountryCode } = parsed.data;
  const norm = normalizeLoginIdentifier(identifier, phoneCountryCode);
  if (!norm) {
    return NextResponse.json({ ok: false, error: "Invalid email address." }, { status: 400 });
  }

  if (norm.kind === "phone") {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign-in with phone is not available yet. Please use your email address.",
      },
      { status: 400 },
    );
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
          "Incorrect or expired code. Check the latest email we sent, or tap Send code to get a new one.",
      },
      { status: 401 },
    );
  }

  let user: { id: string; email: string | null; phoneE164: string | null };
  try {
    let u = await prisma.user.findUnique({ where: { email: norm.display } });
    if (!u) u = await prisma.user.create({ data: { email: norm.display } });
    user = u;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "That identifier is already linked. Try signing in with the other method." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: "Could not create account." }, { status: 503 });
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
