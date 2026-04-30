# Ship notes — Tidy v2 (real LLM, real modal) + empty-list dashboard polish

Three things in this drop:

## 1. Tidy now actually uses the LLM (and you can see it)

**Was wrong.** The v1 `/api/tidy` route asked Claude for free-form JSON in a markdown fence and parsed it with regex. Any deviation — extra whitespace, unfenced JSON, missing field — silently fell through to a regex-only heuristic labelled "LLM did not return parseable JSON". The user saw "AI-reviewed" suggestions that weren't actually from the AI.

**Now correct.** `/api/tidy` uses Anthropic tool-use with the same `propose_store_patch` schema as the chat intent classifier, so:
- The AI's output is a structured `StorePatch` with the same op vocabulary the chat agent already validates and applies.
- No JSON-fence parsing, no regex extraction. The Anthropic SDK gives us a typed `tool_use` block; we run it through Zod's `StorePatchSchema.safeParse` and either commit or fall through cleanly.
- The response carries `source: "llm" | "heuristic" | "heuristic_fallback"` and the UI surfaces it as a badge so you can tell at a glance which path ran.

The applier is the single shared `applyStorePatch` from `src/lib/intent/storePatch.ts`. Same code path as "I'm allergic to peanuts" in chat. So a remove proposed by Tidy and an `add_doctor` typed in chat go through the exact same case-insensitive matching, dedupe, and `*QuickPickHidden` writes — no parallel implementations to drift apart.

## 2. The modal no longer hides behind the navbar

**Was wrong.** `AppTopNav` uses `backdrop-blur` (`backdrop-filter` in CSS). That property creates a new containing block for any descendant with `position: fixed`. The Tidy modal was rendered inside the navbar component, so its `fixed inset-0` was positioned relative to the navbar, not the viewport — leaving the modal pinned under the header.

**Now correct.** The modal renders through `createPortal(node, document.body)`. The portal mounts the modal directly under `<body>`, escaping the navbar's containing block entirely. `fixed inset-0` now means "the whole viewport" again. There's also a tiny `mounted` flag so we don't try to read `document` during SSR.

The modal layout itself uses the proper sheet pattern — outer scrolls, inner is content-height — so even on a phone with a tall suggestion list the close button stays reachable.

## 3. Empty conditions / allergies pills no longer render on the dashboard

**Was wrong.** The "At a Glance" snapshot card always showed two pill buttons — one labelled "No conditions" and one labelled "No allergies" — even on a fresh account. Visual noise.

**Now correct.** Each pill is conditionally rendered. The pill only appears when there's something to show. The visit-summary PDF (further down the same file) deliberately keeps the "Allergies: None" line because that's a clinician handoff document where absence is meaningful — added a comment in the dashboard code so this distinction doesn't get lost.

## Files

```
src/app/api/tidy/route.ts             rewritten on top of Anthropic tool-use + StorePatch
src/components/nav/TidyButton.tsx     rewritten — portal, op-based UI, source badge
src/app/dashboard/page.tsx            empty conditions/allergies pills hidden
SHIP_NOTES_TIDY_V2.md
```

Type-check is clean for everything I touched (the lingering "thread/message/activeThreadId" warnings are stale-Prisma-client false positives that disappear once Vercel runs `prisma generate`, same as the previous drops).

## What you'll see in the UI

When you click **Tidy**:
- The modal opens centered on the viewport (not stuck behind the navbar).
- A header line includes a small badge: green "AI-reviewed" if Claude actually classified the lists, grey "Heuristic" if there's no API key, grey "Fallback" if the Claude call errored.
- Below the summary, every proposed change is one row with a green `+` or red `−` icon, a checkbox (default-checked), and a plain-English description (`Remove Zia Medical Centre from doctors`, `Add Dr. Iyer to doctors`, etc.).
- "Check all" / "Uncheck all" toggles every row at once.
- The footer shows `Apply 3` (or whatever count is checked); applying commits via `applyStorePatch` so the changes flow through the same pipeline chat does.

## Ship steps

```bash
cd ~/path/to/UMA
git add \
  src/app/api/tidy/route.ts \
  src/components/nav/TidyButton.tsx \
  src/app/dashboard/page.tsx \
  SHIP_NOTES_TIDY_V2.md

git commit -m "$(cat <<'EOF'
tidy v2: real LLM tool-use, portal modal, empty-list polish

Tidy
- /api/tidy rebuilt on Anthropic tool-use with the same
  propose_store_patch schema the chat intent classifier already uses.
  No more free-form JSON parsing; no more silent heuristic fallback
  pretending to be the LLM. Response carries an explicit `source`
  field surfaced in the UI as a badge.
- TidyButton modal renders through createPortal(node, document.body)
  so it escapes AppTopNav's backdrop-blur containing block. Previously
  the modal's fixed inset-0 was positioned relative to the navbar
  because backdrop-filter creates a new containing block for fixed
  descendants.
- Modal UI now lists every StorePatchOp as a checkbox with a green +
  or red − marker plus a human-readable description. Applies via the
  shared applyStorePatch so chat-driven and Tidy-driven changes go
  through the exact same case-insensitive matching and *QuickPickHidden
  writes — no risk of the two implementations drifting apart.

Dashboard
- Conditions and allergies pill buttons in the At-a-Glance card are
  now hidden when the lists are empty. The empty-state copy ("No
  conditions") was visual noise on fresh accounts. Visit-summary PDF
  (clinician handoff) still shows "None" because absence is meaningful
  there — preserved with an explanatory comment.

No new env vars required. ANTHROPIC_TIDY_MODEL is honored as before
and falls back to ANTHROPIC_MODEL → claude-haiku-4-5-20251001.
EOF
)"

git push origin main
```

Vercel auto-deploys.
