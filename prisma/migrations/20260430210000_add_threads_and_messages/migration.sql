-- AlterTable
ALTER TABLE "users" ADD COLUMN "active_thread_id" TEXT;

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "archived_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "wa_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "threads_user_id_archived_at_last_message_at_idx" ON "threads"("user_id", "archived_at", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_user_id_created_at_idx" ON "messages"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────────────
-- Backfill: bring existing `whatsapp_messages` into the new threads/messages
-- model. We keep `whatsapp_messages` around as a read-only audit copy so a
-- bad migration doesn't lose data — the application code will only write to
-- the new `messages` table going forward.
--
-- One thread per user, titled "WhatsApp", containing all of that user's
-- legacy WhatsApp messages in chronological order. We then point
-- `users.active_thread_id` at the new thread so the webapp opens it by
-- default on the user's next visit.
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Create a thread row for every user that has at least one whatsapp message.
--    cuid() is generated app-side, so we use a deterministic-feeling id here:
--    "wa-<userId>" is unique per user and easy to spot in audit queries.
INSERT INTO "threads" ("id", "user_id", "title", "last_message_at", "created_at")
SELECT
  'wa-' || u.id,
  u.id,
  'WhatsApp',
  COALESCE(MAX(m.created_at), NOW()),
  COALESCE(MIN(m.created_at), NOW())
FROM "users" u
JOIN "whatsapp_messages" m ON m.user_id = u.id
GROUP BY u.id
ON CONFLICT ("id") DO NOTHING;

-- 2. Copy every legacy whatsapp_messages row into messages, keyed to the
--    corresponding thread.
INSERT INTO "messages" ("id", "thread_id", "user_id", "role", "content", "source", "created_at")
SELECT
  m.id,
  'wa-' || m.user_id,
  m.user_id,
  m.role,
  m.content,
  'whatsapp',
  m.created_at
FROM "whatsapp_messages" m
WHERE EXISTS (SELECT 1 FROM "threads" t WHERE t.id = 'wa-' || m.user_id)
ON CONFLICT ("id") DO NOTHING;

-- 3. Default each user's active thread to their WhatsApp thread (if any).
UPDATE "users" u
SET "active_thread_id" = 'wa-' || u.id
WHERE u."active_thread_id" IS NULL
  AND EXISTS (SELECT 1 FROM "threads" t WHERE t.id = 'wa-' || u.id);

