/**
 * GET   /api/threads            — list user's non-archived threads, newest activity first.
 *                                  ?archived=true lists archived threads.
 * POST  /api/threads            — create a new thread; sets it as the user's active thread.
 * PATCH /api/threads            — bulk operation on multiple threads.
 *                                  { action: "archive"|"delete", ids: string[] }
 *
 * Activity ordering is computed in the database — `lastMessageAt` is
 * denormalized on every Message append (see lib/server/threads.ts), so this
 * endpoint is a single indexed SELECT.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/server/authSession";
import {
  listThreads,
  listArchivedThreads,
  createThread,
  archiveThread,
} from "@/lib/server/threads";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const archived = searchParams.get("archived") === "true";
  try {
    if (archived) {
      const threads = await listArchivedThreads(userId);
      return NextResponse.json({ ok: true, threads });
    }
    const threads = await listThreads(userId);
    return NextResponse.json({ ok: true, threads });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load threads." },
      { status: 500 },
    );
  }
}

const BulkBody = z.object({
  action: z.enum(["archive", "delete"]),
  ids: z.array(z.string().min(1).max(128)).min(1).max(100),
});

export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BulkBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { action, ids } = parsed.data;
  try {
    if (action === "archive") {
      await Promise.all(ids.map((id) => archiveThread(userId, id)));
      return NextResponse.json({ ok: true });
    }
    if (action === "delete") {
      // Confirm ownership before hard-deleting messages + thread
      const owned = await prisma.thread.findMany({
        where: { id: { in: ids }, userId },
        select: { id: true },
      });
      const ownedIds = owned.map((t) => t.id);
      if (ownedIds.length > 0) {
        await prisma.message.deleteMany({ where: { threadId: { in: ownedIds } } });
        await prisma.thread.deleteMany({ where: { id: { in: ownedIds }, userId } });
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Bulk operation failed." },
      { status: 500 },
    );
  }
}

const CreateBody = z.object({ title: z.string().max(200).optional() });

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  try {
    const thread = await createThread(userId, parsed.data.title);
    return NextResponse.json({ ok: true, thread });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to create thread." },
      { status: 500 },
    );
  }
}
