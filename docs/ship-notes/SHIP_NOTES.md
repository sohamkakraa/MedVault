# Ship notes — perf + reminders + Tidy + WA profile

These changes are ready in your working tree. Cowork's sandbox can't write to `.git`, so commit + push from your terminal or GitHub Desktop.

## 1. Open a terminal in the repo and run

```bash
cd ~/path/to/UMA
git status                 # confirm the file list below
git add \
  src/lib/store.ts \
  src/app/dashboard/page.tsx \
  src/app/profile/page.tsx \
  src/lib/whatsapp/processMessage.ts \
  src/lib/whatsapp/reminderIntent.ts \
  src/app/api/whatsapp/cron/route.ts \
  src/app/api/tidy/route.ts \
  src/components/nav/AppTopNav.tsx \
  src/components/nav/TidyButton.tsx \
  scripts/set-wa-profile.mjs \
  scripts/WA_DISPLAY_NAME.md

git commit -m "$(cat <<'EOF'
perf, reminders sync, Tidy beta, WA profile setup

Performance — fix the dashboard render storm:
- saveStore/saveViewingStore now skip dispatch + remote-push when the
  serialized payload is byte-identical (modulo updatedAtISO). Adds an
  optional {silent: true} for derived-state writes.
- rebuildLabsAndMedsFromDocuments short-circuits via a content fingerprint
  (doc ids + lab/med counts + lexicon length); skipping repeat O(N×M)
  work on focus/storage/custom events.
- Dashboard listener no longer ping-pongs through mv-store-update. Drops
  the redundant focus listener (storage covers cross-tab); rebuild now
  runs once at mount and writes back silently.
- Profile page drops its duplicate focus listener for the same reason.

Reminders WA ↔ webapp:
- New reminderIntent.ts: deterministic pre-pass on every WhatsApp message
  for set/cancel/list reminder intents. Saves the LLM round-trip for the
  structured request and gives the user an immediate confirmation.
- processIncomingMessage now applies the parsed intent to the patient
  record before falling through to the LLM.
- Daily WA cron now appends a "today's reminders" digest (sorted by
  time-of-day) to the morning check-in, drawn from the same
  PatientRecord.healthLogs.medicationReminders the webapp reads from.

Tidy (beta):
- New /api/tidy route: zod-validated, auth-gated, calls Anthropic
  (model env: ANTHROPIC_TIDY_MODEL → ANTHROPIC_MODEL → haiku-4-5) to
  classify mis-categorised entries (e.g. "Zia Medical Centre" in the
  doctors list), suggest dedupes, and surface doctor names from
  uploaded reports that aren't yet in the dropdown. Heuristic fallback
  when no API key is configured.
- New TidyButton component in the top nav (sm:hidden + mobile-menu
  parity), opens a modal with toggleable suggestions; commits via
  saveStore so all subscribers refresh.

WhatsApp Business profile:
- scripts/set-wa-profile.mjs — sets About/description/vertical/email/
  websites and uploads public/uma-logo-square.png as profile photo via
  the Cloud API resumable-upload flow. --dry-run supported.
- scripts/WA_DISPLAY_NAME.md — manual steps for the "UMA: UrMedicalAssistant"
  display-name change (Meta Business Manager review, 1–7 days).
EOF
)"

git push origin main
```

## 2. Vercel auto-deploys from `main`

The push to `main` triggers your existing Vercel deployment (no manual `vercel` command needed; `.vercel/project.json` is already linked). Watch the dashboard at https://vercel.com/sohamkakraa/uma/deployments — the build should complete in ~3 min. If it fails, check the build log; the most likely cause will be a missing env var, which you can set in **Project → Settings → Environment Variables**.

New env var introduced (optional): `ANTHROPIC_TIDY_MODEL` — falls back to `ANTHROPIC_MODEL` then `claude-haiku-4-5-20251001`.

## 3. Run the WhatsApp profile script (after deploy lands)

```bash
# in the repo, with .env loaded
export $(grep -v '^#' .env | xargs)
node scripts/set-wa-profile.mjs --dry-run     # see what'll be sent
node scripts/set-wa-profile.mjs               # actually do it
```

Drop your 640×640 logo at `public/uma-logo-square.png` first. Display name still has to go through Meta Business Manager — see `scripts/WA_DISPLAY_NAME.md`.

## What's NOT in this drop (needs separate sessions)

- **Threaded chat history with sidebar + WA-as-default-view** (your asks #2 and #3): requires a new Prisma `Thread` model, server-side message storage in the webapp's chat (currently client-only), thread switcher UI, and a chat-page rewrite to merge WA messages into the same thread store. Roughly a day of focused work; I'd want to scope it cleanly before touching `src/app/chat/page.tsx`.
- **Fully automated re-intelligence** (the auto-running version of Tidy): the manual button shipped here is the beta. Auto-running it on every change requires (a) a debounced server-side trigger, (b) a confidence threshold so we never auto-apply low-confidence suggestions, (c) a notification surface for "I cleaned 3 things while you were away". Worth doing after we see how the manual version behaves with real data.
