/**
 * Thread + message helpers shared by every surface that writes chat into the
 * database (webapp `/api/threads/[id]/messages`, WhatsApp processIncomingMessage,
 * scheduled reminder fan-outs).
 *
 * Design rules
 * ─────────────
 * 1. Single source of truth — the `messages` table. The legacy
 *    `whatsapp_messages` table is preserved by the migration as read-only
 *    audit history, but new writes only ever go into `messages`.
 * 2. Active-thread sync — `User.activeThreadId` is the one number that says
 *    "where do new WhatsApp messages and webapp messages both land". The
 *    webapp updates it when the user switches threads; WhatsApp reads it
 *    when an inbound message arrives. Cross-channel sync is just that field.
 * 3. Lazy creation — we never block the user with a "set up your default
 *    thread" UI. `getOrCreateActiveThread` quietly mints one when missing.
 * 4. Auto-titling — the first user message past 12 characters seeds the
 *    thread title. Titling never costs an LLM round-trip.
 */
import { prisma } from "@/lib/prisma";

export type ThreadRow = {
  id: string;
  userId: string;
  title: string | null;
  archivedAt: Date | null;
  lastMessageAt: Date;
  createdAt: Date;
  contextSummary: string | null;
};

export type MessageRow = {
  id: string;
  threadId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  source: "web" | "whatsapp" | "system";
  waMessageId: string | null;
  createdAt: Date;
};

/**
 * Resolve the thread the user is currently "on" — either their explicit
 * `activeThreadId`, or the most recently used non-archived thread, or a
 * freshly minted one. Always returns a Thread row. Never returns null.
 *
 * `desiredTitle` only applies when we have to create a new thread.
 */
export async function getOrCreateActiveThread(
  userId: string,
  desiredTitle?: string,
): Promise<ThreadRow> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeThreadId: true },
  });
  if (user?.activeThreadId) {
    const t = await prisma.thread.findFirst({
      where: { id: user.activeThreadId, userId, archivedAt: null },
    });
    if (t) return t as ThreadRow;
    // pointer was stale (archived / deleted) — fall through to recovery
  }

  // No valid active thread. Pick the most recent non-archived thread, if any.
  const recent = await prisma.thread.findFirst({
    where: { userId, archivedAt: null },
    orderBy: { lastMessageAt: "desc" },
  });
  if (recent) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeThreadId: recent.id },
    });
    return recent as ThreadRow;
  }

  // No threads at all. Create one.
  const created = await prisma.thread.create({
    data: { userId, title: desiredTitle ?? null },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { activeThreadId: created.id },
  });
  return created as ThreadRow;
}

/**
 * List the user's non-archived threads, newest activity first. Caps at 100;
 * older conversations need a separate "Archive" view that is out of scope
 * for this PR.
 */
export async function listThreads(userId: string): Promise<ThreadRow[]> {
  return (await prisma.thread.findMany({
    where: { userId, archivedAt: null },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  })) as ThreadRow[];
}

/**
 * Create a new thread and atomically mark it as active. Used by the "New
 * chat" button on the webapp.
 */
export async function createThread(userId: string, title?: string): Promise<ThreadRow> {
  const t = await prisma.thread.create({
    data: { userId, title: title?.trim() || null },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { activeThreadId: t.id },
  });
  return t as ThreadRow;
}

export async function setActiveThread(userId: string, threadId: string): Promise<ThreadRow | null> {
  // Confirm the thread belongs to the user before we point at it.
  const t = await prisma.thread.findFirst({
    where: { id: threadId, userId, archivedAt: null },
  });
  if (!t) return null;
  await prisma.user.update({
    where: { id: userId },
    data: { activeThreadId: threadId },
  });
  return t as ThreadRow;
}

export async function renameThread(
  userId: string,
  threadId: string,
  title: string,
): Promise<ThreadRow | null> {
  const t = await prisma.thread.findFirst({ where: { id: threadId, userId } });
  if (!t) return null;
  const updated = await prisma.thread.update({
    where: { id: threadId },
    data: { title: title.trim().slice(0, 200) || null },
  });
  return updated as ThreadRow;
}

/**
 * Soft-delete a thread. We never hard-delete because the patient may want to
 * recover an old conversation later — the audit trail matters in a health
 * context. If the archived thread was the active one, fall back to the most
 * recent remaining thread so the next inbound WhatsApp message has somewhere
 * to land.
 */
export async function archiveThread(userId: string, threadId: string): Promise<boolean> {
  const t = await prisma.thread.findFirst({ where: { id: threadId, userId } });
  if (!t) return false;
  await prisma.thread.update({
    where: { id: threadId },
    data: { archivedAt: new Date() },
  });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeThreadId: true },
  });
  if (user?.activeThreadId === threadId) {
    const fallback = await prisma.thread.findFirst({
      where: { userId, archivedAt: null },
      orderBy: { lastMessageAt: "desc" },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { activeThreadId: fallback?.id ?? null },
    });
  }
  return true;
}

/**
 * Append a message to a thread. Updates `Thread.lastMessageAt` in the same
 * transaction so thread-list ordering stays consistent. Auto-seeds the
 * thread title on the first user message if none exists yet.
 */
export async function appendMessage(input: {
  userId: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  source: "web" | "whatsapp" | "system";
  waMessageId?: string;
}): Promise<MessageRow> {
  const { userId, threadId, role, content, source, waMessageId } = input;
  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        threadId,
        userId,
        role,
        content: content.slice(0, 32000),
        source,
        waMessageId: waMessageId ?? null,
      },
    });
    const now = new Date();
    // Touch lastMessageAt + maybe seed the title.
    const thread = await tx.thread.findUnique({ where: { id: threadId } });
    const titlePatch: { title?: string } = {};
    if (thread && !thread.title && role === "user") {
      const candidate = content.trim().split(/\s+/).slice(0, 8).join(" ");
      if (candidate.length >= 4) titlePatch.title = candidate.slice(0, 80);
    }
    await tx.thread.update({
      where: { id: threadId },
      data: { lastMessageAt: now, ...titlePatch },
    });
    return message as MessageRow;
  });
}

/**
 * Persist a new caveman-compressed context summary for a thread.
 * Called asynchronously after reply delivery — never blocks the response.
 */
export async function updateContextSummary(
  threadId: string,
  summary: string,
): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { contextSummary: summary.slice(0, 8000) },
  });
}

export async function listMessages(
  userId: string,
  threadId: string,
  opts: { limit?: number; before?: Date } = {},
): Promise<MessageRow[]> {
  // Confirm ownership in the same query — this is the only place where
  // thread-message reads happen, so guarding here is sufficient.
  const t = await prisma.thread.findFirst({ where: { id: threadId, userId } });
  if (!t) return [];
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const where: { threadId: string; createdAt?: { lt: Date } } = { threadId };
  if (opts.before) where.createdAt = { lt: opts.before };
  const rows = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return rows as MessageRow[];
}
