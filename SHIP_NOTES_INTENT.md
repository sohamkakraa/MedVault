# Ship notes — generalized add/remove/set intent

## What this is

A single intent system that handles every add/remove/update the user can ask for in chat — across both the webapp and WhatsApp. Replaces the "write a regex per intent" pattern with one LLM tool-call that returns a structured patch over a finite, validated op vocabulary.

## How it routes a message

```
incoming user message
        │
        ▼
 reminderIntent (regex)        ──►  set/cancel/list reminders
        │
        ▼
 conditionIntent (regex)       ──►  resolve/onset for symptoms
        │
        ▼
 classifyIntent (LLM tool-use) ──►  StorePatch over any field
        │
        ▼
 conversational LLM            ──►  plain chat reply, no mutation
```

Tier 1 (regex) handles the two most common requests for free with zero latency. Tier 2 (LLM) catches everything else. Tier 3 is the existing chat agent for questions and conversation.

The router lives in two places and behaves identically: `src/app/api/threads/[id]/messages/route.ts` for the webapp, `src/lib/whatsapp/processMessage.ts` for WhatsApp.

## What ops are supported

Every op is one entry in a discriminated-union schema (`src/lib/intent/storePatch.ts`):

| Op | What it does |
|---|---|
| `add_condition` / `remove_condition` | Medical history list |
| `add_allergy` / `remove_allergy` | Allergies list |
| `add_medication` / `remove_medication` | Medicine list (name + optional dose, frequency, usual time) |
| `add_doctor` / `remove_doctor` | Doctor dropdown — `remove_doctor` also writes to `doctorQuickPickHidden` so doc-derived names disappear |
| `add_hospital` / `remove_hospital` | Hospital dropdown — same `*Hidden` semantics |
| `set_next_appointment` | doctor / clinic / dateISO / timeHHmm — all optional, applied piecewise |
| `clear_next_appointment` | Wipes the appointment slot |
| `log_side_effect` | New entry in symptoms log (description + intensity) |
| `clear_side_effects_matching` | Bulk-remove symptoms by substring |
| `set_reminder` / `cancel_reminder` | Medication reminder (sibling of the regex parser) |
| `set_profile_field` | Whitelisted scalar fields only: name, preferredName, dob, sex, primaryCareProvider, nextVisitHospital, phone, email |

The whitelist on `set_profile_field` is deliberate. The LLM cannot reshape arbitrary parts of the store — only the eight scalar fields the UI exposes for direct editing.

## Safety properties

1. **Strict schema both sides.** Anthropic tool-use returns the LLM's proposal; the result is parsed through Zod (`StorePatchSchema.safeParse`) before any mutation. Schema mismatch → null → fall through.
2. **Pure applier.** `applyStorePatch` deep-clones the store and returns a new copy. One bad op never aborts the rest — each op is wrapped in a try/catch and reported in `applied` or `skipped` lines.
3. **No silent invents.** The system prompt forbids creating data the user didn't ask for. Removals must match an existing entry; if the LLM proposes "remove X" but X isn't in the record, the op is skipped (with an honest "X wasn't in your allergies" line) rather than swallowed.
4. **Never overwrites without a match.** Loose-match on remove tolerates singular/plural and case ("Headaches" cancels "Headache") but never matches across categories ("Apollo" in doctors won't match a hospital).
5. **Cheap prefilter.** `looksLikeMutationIntent` (regex) gates the LLM call so plain questions like "what was my last HbA1c?" never burn an intent classification round-trip.
6. **Deterministic confirmation.** The reply text is built from the applier's `applied`/`skipped` lines, not from a second LLM call. Predictable, auditable, no hallucination.
7. **Soft fail.** Any error in the classifier (network, schema mismatch, malformed tool input, missing API key) returns `null` and the message falls through to the conversational LLM. No mutation ever happens on a degraded path.

## Examples that now work

| User says | Op chosen | Result |
|---|---|---|
| "I'm allergic to peanuts" | `add_allergy("peanuts")` | Peanuts appears under Allergies on profile |
| "Remove ibuprofen from my meds" | `remove_medication("ibuprofen")` | Drops from medicine list |
| "Add Dr. Iyer to my doctors" | `add_doctor("Dr. Iyer")` | Visible in doctor dropdown |
| "Stop reminding me about Vitamin D" | `cancel_reminder("Vitamin D")` | Reminder disabled |
| "I have an appointment with Dr. Patel at Apollo on May 15 at 10am" | `set_next_appointment(...)` | Appointment widget populated |
| "My preferred name is Sam" | `set_profile_field("preferredName","Sam")` | Profile updated |
| "Log a moderate headache" | `log_side_effect(...)` | Entry in symptoms log |
| "What was my last HbA1c?" | (none — question) | Routed to conversational LLM |
| "Tell me about diabetes" | (none — informational) | Routed to conversational LLM |

## Files

```
src/lib/intent/storePatch.ts                  (new — type, Zod schema, applier)
src/lib/intent/classifyIntent.ts              (new — Anthropic tool-use call + prefilter)
src/app/api/threads/[id]/messages/route.ts    (+ classifyIntent → applyStorePatch tier)
src/lib/whatsapp/processMessage.ts            (+ same tier on WhatsApp)
SHIP_NOTES_INTENT.md
```

## Env

Optional new var: `ANTHROPIC_INTENT_MODEL` — defaults to `ANTHROPIC_MODEL` then `claude-haiku-4-5-20251001`. Use this if you want a different (cheaper) model for the classifier than the one driving conversational replies.

## Type-check

`tsc --noEmit` is clean for everything I touched. The remaining stale-Prisma-client errors (`Property 'thread' / 'message' / 'activeThreadId' does not exist`) are the same false positives from the threads drop and disappear when Vercel runs `prisma generate` during build.

## Ship steps

```bash
cd ~/path/to/UMA
git add \
  src/lib/intent/storePatch.ts \
  src/lib/intent/classifyIntent.ts \
  src/app/api/threads/[id]/messages/route.ts \
  src/lib/whatsapp/processMessage.ts \
  SHIP_NOTES_INTENT.md

git commit -m "$(cat <<'EOF'
intent: generalized add/remove/set for chat across web + WhatsApp

Replaces the "regex per intent" pattern with one LLM tool-call that
returns a structured StorePatch. Three-tier router on every chat
message:
  1. Deterministic reminderIntent  — fast path for set/cancel/list
  2. Deterministic conditionIntent — resolve/onset for symptoms
  3. classifyIntent (Anthropic tool-use) — anything else
  4. Plain conversational LLM — questions, chitchat, no mutation

The op vocabulary covers conditions, allergies, medications, doctors,
hospitals, appointments, side effects, reminders, and a whitelisted
set of scalar profile fields. Strict Zod validation on both the tool
schema and the LLM's proposed payload — schema mismatch returns null
and the message falls through to the conversational agent.

applyStorePatch is pure: deep-clones the store, wraps each op in try/
catch, returns lists of applied/skipped operations. The chat reply is
built from those lines, not a second LLM call, so confirmations are
deterministic and auditable.

A regex prefilter (looksLikeMutationIntent) gates the tool-use call so
plain questions ("what was my last HbA1c?") never burn cost.

remove_doctor / remove_hospital write to *QuickPickHidden, the same
suppression list that mergeDoctorQuickPick / mergeFacilityQuickPick
respect — so removals via chat survive the doc-derived re-injection
that was breaking Tidy.

set_profile_field is whitelisted to eight scalar fields the UI already
exposes; the LLM cannot reshape arbitrary parts of the store.

Optional env: ANTHROPIC_INTENT_MODEL (defaults to ANTHROPIC_MODEL).
EOF
)"

git push origin main
```

Vercel auto-deploys on push. No migration, no new required env vars.
