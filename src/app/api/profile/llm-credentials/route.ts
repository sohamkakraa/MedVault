import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/server/authSession";
import { getCredentialMeta, deleteCredential } from "@/lib/server/llmCredentials";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const meta = await getCredentialMeta(userId);
  if (!meta) return NextResponse.json(null);
  return NextResponse.json(meta);
}

export async function DELETE(_req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await deleteCredential(userId);
  return NextResponse.json({ ok: true });
}
