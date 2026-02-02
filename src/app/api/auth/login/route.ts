import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");

  // Prototype only: accept any non-empty email/password
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Missing email or password." }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("mv_auth", "1", { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
