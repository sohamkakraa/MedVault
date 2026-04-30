/**
 * PATCH  /api/threads/[id] — rename, set-active, or archive.
 * DELETE /api/threads/[id] — soft-archive (alias for PATCH archived=true).
 *
 * Setting `active=true` is the cross-channel sync hinge: the next inbound
 * WhatsApp message lands in the same thread the user is reading, and old
 * threads are reachable from the sidebar without WhatsApp ever knowing the
 * difference.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/server/authSession";
import { renameThread, setActiveThread, archiveThread } from "@/lib/server/threads";

export const runtime = "nodejs";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  active: z.literal(true).optional(),
  archived: z.literal(true).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Bad thread id." }, { status: 400 });
  }
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { title, active, archived } = parsed.data;
  try {
    if (title) {
      const t = await renameThread(userId, id, title);
      if (!t) return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
      return NextResponse.json({ ok: true, thread: t });
    }
    if (active) {
      const t = await setActiveThread(userId, id);
      if (!t) return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
      return NextResponse.json({ ok: true, thread: t });
    }
    if (archived) {
      const ok = await archiveThread(userId, id);
      if (!ok) return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to update thread." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Bad thread id." }, { status: 400 });
  }
  try {
    const ok = await archiveThread(userId, id);
    if (!ok) return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to delete." },
      { status: 500 },
    );
  }
}
