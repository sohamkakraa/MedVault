# Ship notes — Threaded chat, sidebar, cross-channel sync

This drop replaces the localStorage-backed chat page with a thread-aware chat that uses the same `messages` table the WhatsApp side now writes to. The user's `activeThreadId` is the single field that links both surfaces — switching threads in the webapp routes the next inbound WhatsApp message to that thread, and vice versa.

## What changed

| Layer | Files |
|---|---|
| Schema | `prisma/schema.prisma` — adds `Thread`, `Message`, `User.activeThreadId`. |
| Migration | `prisma/migrations/20260430210000_add_threads_and_messages/migration.sql` — creates the tables and back-fills every existing `whatsapp_messages` row into a per-user "WhatsApp" thread, then sets each user's `activeThreadId` to that thread. Legacy `whatsapp_messages` is left in place as a read-only audit copy. |
| Server library | `src/lib/server/threads.ts` — `getOrCreateActiveThread`, `listThreads`, `createThread`, `setActiveThread`, `renameThread`, `archiveThread`, `appendMessage`, `listMessages`. Single owner of `User.activeThreadId`. |
| API | `/api/threads` (GET/POST), `/api/threads/[id]` (PATCH/DELETE), `/api/threads/[id]/messages` (GET/POST). |
| WhatsApp | `src/lib/whatsapp/processMessage.ts` — every WhatsApp message is now appended to the user's active thread (`source: "whatsapp"`). The legacy `whatsAppMessage.create` calls are gone. |
| WA cron | `src/app/api/whatsapp/cron/route.ts` — daily check-in is now logged into the active thread with `source: "system"`, distinct from a user-initiated reply. |
| Web UI | `src/app/chat/page.tsx` — full rewrite around threads + sidebar; `src/components/chat/ThreadSidebar.tsx` is new. Polling every 6 s while the tab is visible surfaces messages typed on WhatsApp. |

## Ship steps

```bash
cd ~/path/to/UMA

# 1. Stage everything
git add \
  prisma/schema.prisma \
  prisma/migrations/20260430210000_add_threads_and_messages/migration.sql \
  src/lib/server/threads.ts \
  src/app/api/threads \
  src/lib/whatsapp/processMessage.ts \
  src/app/api/whatsapp/cron/route.ts \
  src/app/chat/page.tsx \
  src/components/chat/ThreadSidebar.tsx \
  SHIP_NOTES_THREADS.md

# 2. Commit
git commit -m "$(cat <<'EOF'
threaded chat with shared WA + web message store

Replaces the localStorage-only chat page and the parallel whatsapp_messages
table with a single threads/messages model both surfaces write through.

Schema
- Adds Thread { id, userId, title, archivedAt, lastMessageAt, createdAt }
  and Message { id, threadId, userId, role, content, source, waMessageId,
  createdAt }, plus User.activeThreadId.
- Migration backfills existing whatsapp_messages rows into one "WhatsApp"
  thread per user (id = "wa-<userId>") and points each user's
  activeThreadId at it. Legacy whatsapp_messages stays for audit.

Server library + API
- src/lib/server/threads.ts owns thread CRUD, active-thread routing, and
  appendMessage (which transactionally updates Thread.lastMessageAt and
  auto-seeds the title from the first user message).
- /api/threads (GET list, POST create), /api/threads/[id]
  (PATCH rename/active/archive, DELETE = archive),
  /api/threads/[id]/messages (GET log, POST append + LLM reply).

WhatsApp wiring
- processIncomingMessage now resolves getOrCreateActiveThread and writes
  every inbound + outbound message there as source="whatsapp". The reminder
  intent path and the daily cron use the same helper.
- The cron's check-in/digest message is logged with source="system" so the
  UI can show a "from UMA" chip distinct from a manual assistant reply.

Webapp chat
- Rewritten src/app/chat/page.tsx loads threads on mount, defaults to the
  first (= active = WhatsApp thread for users with WA history). Sidebar
  lists every non-archived thread; clicking another thread fires
  PATCH ?active=true so the next inbound WhatsApp message lands there.
- Polling every 6 s while the tab is visible surfaces WhatsApp-side
  messages without a manual refresh; pauses on document.hidden.
- PDF attachment + record-merge proposals stay on the dashboard's upload
  flow — keeping the chat page focused on conversation.
EOF
)"

# 3. Push (Vercel auto-deploys on push to main)
git push origin main
```

## What happens on Vercel

1. **`prisma migrate deploy` runs in `scripts/vercel-build.mjs`** (it already does — that's how prior migrations applied). The new migration creates the tables, backfills your existing WhatsApp messages into a "WhatsApp" thread for each user, and sets `User.activeThreadId` to that thread.
2. **`prisma generate`** regenerates the typed client. The TypeScript "Property 'thread' does not exist" errors you saw locally disappear because the new client knows about `Thread` and `Message`.
3. **Next.js builds.** The chat page hydrates against the deployed schema.

If the migration fails in production (rare, but possible if your Postgres has data shapes I didn't anticipate), Vercel rolls back the deploy and your live site keeps the previous chat page. The migration is idempotent — running it twice does the same thing as running it once.

## Manual smoke test after deploy

1. Sign in to the webapp. Open `/chat`.
2. You should see the sidebar populated with at least one thread named "WhatsApp" (assuming you have prior WA history). The most recent thread is selected by default and its messages render.
3. Type a message. Confirm: it appears immediately, gets a reply, and within ~10 s the same exchange shows up if you have the WhatsApp chat open on your phone (because the bot's reply landed in the active thread = same thread).
4. From your phone, send a WhatsApp message to the bot. Within ~6 s (one poll tick) it should appear in the open webapp thread with the green "from WhatsApp" chip.
5. Click "New" in the sidebar. A fresh thread is created and selected. Send it a message. Then text the bot from WhatsApp again — that new message should land in the new thread (because creating it set `activeThreadId`).
6. Switch back to the WhatsApp thread in the sidebar. Future WhatsApp messages should now go there.

## Known gaps left for a follow-up

- No live unread badge in the sidebar — messages list updates on poll, but the sidebar's last-message-time is only refreshed on send. A 6 s `GET /api/threads` poll is the simplest fix; held back to keep this drop tight.
- No thread search.
- No PDF attachment in the threaded composer. Use the dashboard upload widget; the extracted record is visible to UMA from the very next message you send in any thread.
- Realtime is polling, not SSE. Upgrading to SSE is straightforward (stream from `appendMessage` into a per-user channel) but adds connection-management code; polling is good enough for the volumes we expect.
