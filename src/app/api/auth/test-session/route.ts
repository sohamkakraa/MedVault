import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSessionToken,
} from "@/lib/auth/sessionToken";
import { ensureTestUser } from "@/lib/server/ensureTestUser";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    sub: z.string().min(1).max(64).optional(),
    email: z.string().email().optional(),
  })
  .optional();

/**
 * Development / automated-testing only — issues a signed mv_session cookie.
 * Disabled in production. Opt-in on preview via UMA_ENABLE_TEST_AUTH=1.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.UMA_ENABLE_TEST_AUTH !== "1") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: z.infer<typeof BodySchema> = undefined;
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (parsed.success) body = parsed.data;
  } catch {
    /* empty body */
  }

  const sub = body?.sub ?? "test-session";
  const email = body?.email ?? "test-agent@uma.local";

  try {
    await ensureTestUser(sub, { email });
  } catch {
    return NextResponse.json({ ok: false, error: "Database unavailable." }, { status: 503 });
  }

  const token = await signSessionToken({ sub, email });
  if (!token) {
    return NextResponse.json({ ok: false, error: "Session signing unavailable" }, { status: 503 });
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
