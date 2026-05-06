import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/server/authSession";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const thread = await prisma.thread.findUnique({ where: { id } });
  if (!thread || thread.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.thread.update({
    where: { id },
    data: { archivedAt: null },
  });

  return NextResponse.json({ ok: true });
}
