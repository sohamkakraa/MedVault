import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("mv_auth", "0", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
