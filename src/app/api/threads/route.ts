/**
 * GET  /api/threads — list user's non-archived threads, newest activity first.
 * POST /api/threads — create a new thread; sets it as the user's active thread.
 *
 * Activity ordering is computed in the database — `lastMessageAt` is
 * denormalized on every Message append (see lib/server/threads.ts), so this
 * endpoint is a single indexed SELECT.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/server/authSession";
import { listThreads, createThread } from "@/lib/server/threads";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  try {
    const threads = await listThreads(userId);
    return NextResponse.json({ ok: true, threads });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load threads." },
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
