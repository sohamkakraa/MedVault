# Ship notes — three bug fixes

Three fixes for issues you spotted on the live site after the threads drop landed.

## Bug 1 — "My headache is gone" doesn't update Medical history & Symptoms

**Cause.** The new threaded `/api/threads/[id]/messages` route only forwarded text to the LLM; it had no equivalent of the WhatsApp processor's intent pre-passes. The LLM acknowledged the resolution conversationally but never mutated `profile.conditions` or `healthLogs.sideEffects`, so the profile page stayed stuck.

**Fix.** New `src/lib/whatsapp/conditionIntent.ts` (sibling of `reminderIntent.ts`):
- `parseConditionIntent(text)` recognises plain phrasings: *my headache is gone*, *the cough has cleared up*, *I no longer have back pain*, *fever broke*, *I don't feel nauseous anymore*, plus light onset patterns *I have a headache*, *I'm experiencing fatigue*.
- Conservative on purpose — false negatives are fine (the user can retry; profile X-button works), but a false positive would silently delete medical history. A stop-word list rejects "I have a question / meeting / appointment".
- `applyConditionIntent` removes the symptom from `profile.conditions` (case-insensitive, with light singular/plural tolerance — "Headaches" vs "Headache") **and** clears any `healthLogs.sideEffects` row whose description contains the same text.

**Wired into both surfaces.** The threaded chat route and the WhatsApp processor both run the parser before any LLM call, mutate the patient record via Prisma, and reply with a friendly confirmation. So *my headache is gone* on either surface produces the same result on the profile page.

## Bug 2 — Tidy doesn't actually remove hospitals from the doctor dropdown

**Cause.** The doctor dropdown is computed by `mergeDoctorQuickPick(profile, doctorNamesFromDocs(store.docs))` (`src/lib/providerQuickPick.ts:34`). It unions THREE sources:
1. `profile.doctorQuickPick` (manual)
2. `profile.primaryCareProvider`
3. `doctorNamesFromDocs(store.docs)` — every name found in `doc.doctors[]` or `doc.provider` on every uploaded report

The original `applyAccepted` only removed the entry from `doctorQuickPick`. As soon as React re-rendered, `doctorNamesFromDocs` re-injected "Zia Medical Centre" because some lab report listed it as the provider, and the merge helper happily put it back into the dropdown.

**Fix.** `mergeDoctorQuickPick` already has a suppression list — `profile.doctorQuickPickHidden` — and skips any name in it. Tidy now writes to it. Move/remove operations populate the right hidden list, "add" operations un-hide so a stale flag from a previous session can't override an explicit add. Same logic applied symmetrically for the facility list. See `src/components/nav/TidyButton.tsx` `applyAccepted`.

## Bug 3 — Tidy "Apply" modal has its top cropped

**Cause.** The modal used a flex container with `items-end sm:items-center` and `max-h-[90vh] overflow-y-auto` on the inner panel. On phones taller than the panel, `items-end` anchored the panel to the bottom of the viewport; the panel's own `max-h-[90vh]` capped its height, so the heading at the top of the panel was pushed above the visible area.

**Fix.** Standard sheet pattern: outer `fixed inset-0 overflow-y-auto`, inner is a `min-h-full flex items-center justify-center` wrapper, the panel itself is content-height with `p-5`. The whole viewport scrolls when the panel is taller than the screen, so the close button is always reachable.

## Files

```
src/lib/whatsapp/conditionIntent.ts          (new)
src/lib/whatsapp/processMessage.ts            (+ condition intent block)
src/app/api/threads/[id]/messages/route.ts    (+ reminder + condition pre-pass, + persistStore helper)
src/components/nav/TidyButton.tsx             (applyAccepted writes hidden lists; modal uses sheet pattern)
SHIP_NOTES_BUGFIX.md
```

Type-check is clean for everything I touched (the lingering "thread/message/activeThreadId" errors disappear once Prisma generates the client against the threaded-schema migration during the Vercel build — same as the previous drop).

## Ship steps

```bash
cd ~/path/to/UMA
git add \
  src/lib/whatsapp/conditionIntent.ts \
  src/lib/whatsapp/processMessage.ts \
  src/app/api/threads/[id]/messages/route.ts \
  src/components/nav/TidyButton.tsx \
  SHIP_NOTES_BUGFIX.md

git commit -m "$(cat <<'EOF'
fix: condition resolution intent, Tidy hidden-list, modal scroll

Bug 1 — "my headache is gone" wasn't reaching the patient store.
The threaded chat route had no equivalent of the WhatsApp processor's
intent pre-passes, so the LLM acknowledged but profile.conditions never
changed.

Adds src/lib/whatsapp/conditionIntent.ts, sibling to reminderIntent.ts.
parseConditionIntent recognises resolution and onset phrasings with a
conservative stop-word list (rejects "I have a question/meeting/
appointment"). applyConditionIntent removes the symptom from
profile.conditions (case-insensitive + light plural tolerance) and
clears any matching healthLogs.sideEffects entries.

Both /api/threads/[id]/messages and processIncomingMessage now run the
parser before the LLM call. Mutations persist to PatientRecord, so
the profile editor and the dashboard see the change immediately.

Bug 2 — Tidy left hospitals in the doctor dropdown.
mergeDoctorQuickPick unions doctorQuickPick + primaryCareProvider +
doctorNamesFromDocs(store.docs). Removing a name from doctorQuickPick
isn't enough; the same name is re-injected from doc.doctors[] /
doc.provider on the next render. The merge helpers already respect
doctorQuickPickHidden — Tidy now populates it for moves and removals
on both lists, and un-hides on explicit adds.

Bug 3 — Tidy modal top cropped on mobile.
Replaced items-end + max-h-[90vh] overflow-y-auto on the inner panel
with the sheet pattern: outer overflow-y-auto, inner min-h-full
centered, panel content-height. Close button is always reachable.
EOF
)"

git push origin main
```

Vercel auto-deploys on the push. No new env vars or migrations.
