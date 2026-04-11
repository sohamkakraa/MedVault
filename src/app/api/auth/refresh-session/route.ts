import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { cookies } from "next/headers";
import { normalizePhoneE164 } from "@/lib/auth/identifiers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionSigningFailureHint,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth/sessionToken";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email().max(320).optional(),
  phoneCountryCode: z.string().max(8).optional(),
  phoneNational: z.string().max(32).optional(),
});

export async function POST(req: Request) {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  const cur = await verifySessionToken(raw);
  if (!cur?.sub) {
    return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { email, phoneCountryCode, phoneNational } = parsed.data;

  let nextEmail = cur.email ?? undefined;
  let nextPhone = cur.phoneE164 ?? undefined;

  if (email !== undefined) nextEmail = email.trim().toLowerCase();

  if (phoneNational !== undefined && phoneNational.trim()) {
    const dial = phoneCountryCode ?? "+1";
    const e164 = normalizePhoneE164(dial, phoneNational);
    if (!e164) {
      return NextResponse.json({ ok: false, error: "Invalid phone number." }, { status: 400 });
    }
    nextPhone = e164;
  }

  if (!nextEmail && !nextPhone) {
    return NextResponse.json(
      { ok: false, error: "Provide at least an email or a complete phone number." },
      { status: 400 },
    );
  }

  try {
    await prisma.user.update({
      where: { id: cur.sub },
      data: {
        email: nextEmail ?? null,
        phoneE164: nextPhone ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "That email or phone is already linked to another account." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: "Could not update profile." }, { status: 503 });
  }

  const user = await prisma.user.findUnique({ where: { id: cur.sub } });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
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
