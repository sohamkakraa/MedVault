# UMA — Architecture & What's Actually Happening Behind the Scenes

> Code-grounded snapshot as of 2026-05-06. Built by reading the actual source — not the original CLAUDE.md (which is partially out of date).
>
> If anything in this document conflicts with the code, **the code wins**. Update this doc rather than letting drift accumulate.

---

## 1. The 30-second picture

UMA is a Next.js 16 (App Router) web app with a Postgres backing store (Prisma) plus a parallel WhatsApp delivery surface. The interesting part is the **agent system**: five distinct LLM-driven roles that compose into the user-facing experience.

```
                      ┌──────────────────────────────────┐
                      │           USER SURFACES          │
                      │  Web (dashboard, chat, profile)  │
                      │   WhatsApp (Meta Cloud API)      │
                      └───────────────┬──────────────────┘
                                      │
                                      ▼
                      ┌──────────────────────────────────┐
                      │       Next.js API ROUTES         │
                      │  /api/chat  /api/threads/[id]/…  │
                      │  /api/extract  /api/tidy         │
                      │  /api/whatsapp/webhook           │
                      │  /api/patient-store  /api/auth/* │
                      └───────────────┬──────────────────┘
                                      │
              ┌───────────────────────┼─────────────────────────┐
              ▼                       ▼                         ▼
     ┌──────────────────┐  ┌──────────────────┐    ┌──────────────────────┐
     │   AGENT LAYER    │  │   STORE LAYER    │    │  EXTERNAL SERVICES   │
     │  5 roles below   │  │  Postgres / RAG  │    │  Claude · LlamaParse │
     │                  │  │  /  PatientStore │    │  OpenAI · WA Cloud   │
     └──────────────────┘  └──────────────────┘    └──────────────────────┘
```

The system is **not** a single chatbot. It's a tiered pipeline where deterministic parsers and a cheap intent classifier intercept structured requests *before* the conversation LLM ever sees them — that's how the cost and latency stay reasonable.

---

## 2. Tech stack (real, from `package.json`)

| Layer | Tech |
|---|---|
| Framework | Next.js **16.2.4** (App Router) |
| Language | TypeScript 5 |
| UI | React 19.2.3 + Tailwind v4 + Radix UI primitives + Framer Motion + Recharts + Lucide icons |
| Validation | Zod 4 |
| LLMs | Anthropic Claude (`@anthropic-ai/sdk` 0.82) — primary; OpenAI 6.17 — fallback |
| PDF OCR | LlamaParse (cost-effective tier, 3 credits/page) |
| Database | PostgreSQL via Prisma 6.19 |
| Email | Resend |
| WhatsApp | Meta Cloud API + ngrok dev tunneling |
| Tests | Vitest, Playwright, jsdom, testing-library |
| Build | Custom Prisma generate/migrate scripts in `scripts/` |

---

## 3. Data model — two parallel stores

### 3.1 Postgres (Prisma — `prisma/schema.prisma`)

13 models. The ones that matter:

- **`User`** — auth identity (email, phone, googleId), with one critical pointer field: `activeThreadId`. That field is the single value that keeps web and WhatsApp on the same conversation.
- **`PatientRecord`** — `{ userId, data: Json }`. The entire patient store (docs, meds, labs, profile, healthLogs, insurance) lives here as a single JSON column. Server-of-record.
- **`Thread`** — chat conversation rows. `archivedAt` is a soft-delete; `lastMessageAt` is denormalised on every append for fast list ordering. Stores `contextSummary` — the caveman-summariser output (see §4.5).
- **`Message`** — append-only chat log. `source` is `"web" | "whatsapp" | "system"`. Cap at 32 KB per row.
- **`WhatsAppPreferences`** — per-user comm style, check-in time, timezone, language level.
- **`WhatsAppMessage`** — legacy audit table (read-only by design; new writes go to `Message`).
- **`WellnessLog`** — daily mood/energy/symptoms one-per-day rollup populated from WA check-ins.
- **`OtpChallenge`** + **`RateLimit`** — email/SMS one-time-password sign-in.
- **`PendingLink`** — WhatsApp account-linking flow.
- **`Comment`** — comment threads (separate sub-feature).
- **`WaterLog`** — water intake tracker.

### 3.2 LocalStorage (`src/lib/store.ts`, ~1,400 lines)

Same `PatientStore` shape as the JSON in Postgres, cached client-side under `mv_patient_store_v1`. The web app reads from localStorage for snappy UI, then syncs through `/api/patient-store` (REST + SSE stream).

**Important security fix recorded in code:** `/api/chat` and `/api/tidy` no longer trust the `store` field from the client — they always reload from `prisma.patientRecord.findUnique` using the authenticated `userId`. (Comments in the routes call this out as VULN-001 / VULN-002 / VULN-003 fixes.)

### 3.3 The `PatientStore` shape (canonical)

Defined in `src/lib/types.ts`. Contains: `docs[]`, `meds[]`, `labs[]`, `profile{}`, `preferences{}`, `notifications[]`, `healthLogs{ bloodPressure, sideEffects, medicationIntake, medicationReminders }`, `insurancePlans[]`, `insuranceClaims[]`, `standardLexicon[]`, `updatedAtISO`.

`profile` is rich: name, DOB, sex, allergies, conditions, doctorQuickPick, facilityQuickPick, primaryCareProvider, nextVisitDate, trends, bodyMetrics.

---

## 4. The agent system — five distinct roles

Naming each agent and what it actually calls.

### 4.1 Conversation agent — chat reply generator
- **Lives in:** `src/app/api/chat/route.ts` (~810 lines) and `src/app/api/threads/[id]/messages/route.ts`
- **Model:** Claude Haiku 4.5 by default (`ANTHROPIC_MODEL`); falls back to OpenAI `gpt-4o-mini` if no Anthropic key.
- **Input:** user question + recent history + a heavy system prompt assembled by `buildRetrievalContext()` containing profile, medications, lab timeline, top-K docs (BM25 ranked), insurance plans, claims history, bills needing claim filing.
- **Output:** streamed text via SSE; `done` event carries final answer + structured side-effects (mergeProposal, medicationAddProposal, quickReplies).
- **Persona behaviours baked into the prompt:** never diagnose; always echo allergies in any health summary; never claim to have set a reminder (only the UI can); proactive "next steps" closer.
- **Smart disclaimer:** appends "Not medical advice — talk to your doctor before acting on this." **only** when `isClinicalResponse(text)` returns true. Trivial factual lookups stay disclaimer-free.
- **Per-call cost tracking:** `computeChatCost(model, in, out)` returns USD; Haiku is ~$1/M in, $5/M out.

### 4.2 Records agent — PDF → structured ExtractedDoc
- **Lives in:** `src/lib/server/medicalPdfPipeline.ts` (~750 lines), exposed via `src/app/api/extract/route.ts` and as a parallel branch inside `/api/chat` when a PDF attachment is present.
- **Two-stage pipeline (when `LLAMA_CLOUD_API_KEY` is set):**
  1. **LlamaParse** uploads PDF → polls job (45s budget, 1s tick) → returns raw markdown + page count. Cost: 3 credits/page × 10k free credits/month.
  2. **Claude Haiku text-structuring** (`extractStructureFromText`) takes that markdown, returns an `uma-meta` JSON fence + structured markdown body.
- **Fallback chain:**
  - LlamaParse 402 (credits exhausted) → log warning → Claude full-PDF path
  - LlamaParse error → log warning → Claude full-PDF path
  - No `LLAMA_CLOUD_API_KEY` → Claude full-PDF path immediately
- **Claude full-PDF path (`extractWithAnthropicFromPdf`):** uses Claude Sonnet 4.5 (`ANTHROPIC_PDF_MODEL`) with `document` content block + `citations.enabled`. ~14× more expensive per page than the LlamaParse path.
- **Output post-processing:** `parseStructuredFromMarkdown` walks the markdown, extracts pipe-table labs, prescription tables, allergy bullets, condition bullets, imaging diagnoses. `proposeLexiconPatches` proposes synonyms for canonical lab names.
- **Safety gates:**
  - PDF magic bytes check (`%PDF-`) regardless of Content-Type
  - 50 MB upload cap
  - `contentHash` dedupe (SHA over PDF bytes)
  - `is_medical_document` boolean gate — non-medical PDFs are rejected with code `not_medical_document`
  - Patient-name verification — if the name on the PDF doesn't match the user's profile, returns `patient_name_mismatch` with the doc + lexicon patches; the client can re-submit with `skipPatientNameCheck: true` after explicit user consent.
- **Cost tracking:** `extractionCost` field on every successful doc records `inputTokens`, `outputTokens`, `totalUSD`, `model`, `extractorSource` (`"llamaparse" | "claude_pdf"`), `llamaParseCredits`.

### 4.3 Intent classifier — chat-driven store mutations
- **Lives in:** `src/lib/intent/classifyIntent.ts` (~320 lines) + `src/lib/intent/storePatch.ts` (~600 lines).
- **Why a separate agent:** the chat reply is free-form; mutations have to be schema-strict. Mixing them muddies both. Ran **before** the conversation agent.
- **Pre-filters before the LLM ever fires:**
  1. `looksLikeMutationIntent` regex — kills questions like "what was my last HbA1c?" cheaply.
  2. Deterministic parsers run first: `parseReminderIntent`, `parseConditionIntent`. Both are free, instant.
- **Model:** Claude Haiku 4.5 (`ANTHROPIC_INTENT_MODEL` overrides) with a single tool: `propose_store_patch`.
- **Tool schema:** discriminated union of 21 op kinds — `add_condition`, `remove_medication`, `set_general_reminder`, `set_profile_field`, etc. Validated with `StorePatchOpSchema` (Zod) on the way in *and* out — the LLM's output is double-checked against Zod before any mutation.
- **Failure mode:** any LLM error or schema mismatch → return `null` → user message falls through to the conversation agent. Never silently mutate on a degraded response.
- **Post-application reply:** when a patch fires, the user gets a **deterministic** confirmation generated from `applied`/`skipped` lines — no second LLM call.

### 4.4 Tidy agent — data-hygiene pass
- **Lives in:** `src/app/api/tidy/route.ts` (~350 lines).
- **Trigger:** the "Tidy ✨" button (currently labelled "Beta" — see prompts batch 2026-05-07 item 2 for the upcoming debug surface).
- **Model:** Claude Haiku 4.5 (`ANTHROPIC_TIDY_MODEL` overrides).
- **Tool:** same `propose_store_patch` family but **scoped down** to add/remove conditions, allergies, medications, doctors, hospitals (no reminders, no profile fields, no appointments). The system prompt is the safety belt — it spells out hard rules: doctors-list-is-people, hospitals-list-is-facilities, never invent names, never auto-correct spelling.
- **Heuristic fallback:** when Anthropic key is missing OR the LLM returns garbage, falls back to a regex-based `heuristicOps` (matches FACILITY tokens like "hospital", "clinic", "diagnostic" inside the doctors list and proposes a remove+add move). User sees a `heuristic_fallback` source label.
- **No autonomy:** never applies patches itself. Always returns suggestions for the user to review and accept.

### 4.5 Caveman context-window summariser — long-thread memory
- **Lives in:** `src/lib/intent/cavemanSummarize.ts` (~85 lines). **This is UMA's own implementation, NOT the JuliusBrussee/caveman Claude Code skill.**
- **Constants:** `KEEP_LAST = 8`, `SUMMARY_THRESHOLD = 15`, `UPDATE_EVERY = 5`.
- **What it does:**
  - On every threaded chat call: `buildContextWindow(messages, storedSummary)` returns either the last 16 messages (no summary needed yet) or `[summary-as-pseudo-user-turn] + [last 8 verbatim]`.
  - **Async after delivery** (never blocks user response): `summarizeOlderMessages` calls Haiku with `max_tokens: 320` to compress everything older than the verbatim window into terse bullets (under 200 words). Stored in `Thread.contextSummary`.
- **Tradeoff:** loses verbatim detail past message 8, but the summary holds health facts, decisions, conditions, medications. Empirically fine for a health-companion thread; would be wrong for, say, code review.
- **Failure mode:** any LLM error → keep the previous summary unchanged. Never lose state.

---

## 5. RAG — keyword (BM25) over the patient's own docs

Defined in `src/lib/rag.ts`. Decisions:

- **No embeddings, no vector DB.** BM25 is deterministic, < 1 ms for 100 docs, zero new infra. Medical queries are keyword-rich ("HbA1c", "Telmisartan") — exact-match recall matters more than semantic fuzziness here.
- **Top-K detail:** in the chat system prompt, top 5 docs (by BM25) get up to 3,000 chars of `markdownArtifact`; the rest get 350 chars. Keeps total doc section roughly token-neutral while concentrating detail on relevant docs.
- **Query construction:** `buildRetrievalQuery` joins the last 3 user messages + current message. That handles "what did it say?" follow-ups.
- **Tiebreak:** BM25 score, then recency (`dateISO` desc).
- **Scope:** `MAX_DOCS_IN_CONTEXT = 30` — anything past 30 docs gets dropped from the context window entirely.
- **Note in code:** "Can be replaced by pgvector embeddings later without changing the interface." Right call.

---

## 6. The two delivery surfaces — webapp and WhatsApp

The non-obvious part of UMA is that **WhatsApp is a peer to the webapp, not a notification channel**.

`User.activeThreadId` is the single field that keeps the two in sync:
- Web user switches chat thread → `setActiveThread(userId, threadId)` → next inbound WA message lands in that same thread.
- Inbound WA message → `getOrCreateActiveThread` → message is appended to the user's active thread → web user reloads and sees it.
- Threads are append-only with `archivedAt` soft-delete. Bulk archive/delete via `PATCH /api/threads`.

WhatsApp specifics (`/api/whatsapp/webhook` and `lib/whatsapp/`):
- Inbound message goes through `processIncomingMessage` which: persists user message → runs the same intent pipeline (deterministic → classifier → conversation) as the web → persists assistant reply → sends WA reply via Meta Cloud API.
- Daily check-ins via cron (`/api/whatsapp/cron`) per `WhatsAppPreferences.checkinTime` and `timezone` (default `Asia/Kolkata`).
- Personality mirroring: `WhatsAppPreferences.communicationStyle` and `languageLevel` shape the chat prompt for that user.

---

## 7. Auth & session

- **Sign-in surfaces:** Google OAuth, email OTP, phone (SMS) OTP, WhatsApp link.
- **Session token:** signed cookie (`mv_session`) — see `src/lib/auth/sessionToken.ts`.
- **Server-side gate:** every API route calls `requireUserId()`. No userId → 401. This is the single chokepoint.
- **Rate limiting:** `OtpChallenge` + `RateLimit` Postgres tables back the OTP flow (in-memory fallback in `otpMemory.ts`).
- **Beta demo accounts:** `lib/auth/betaDemo.ts` — short-lived demo IDs for non-signed-up evaluators.

---

## 8. Cost & performance — what a typical month actually looks like

Approximate numbers. Replace with real telemetry once it's wired into a metrics tab.

**Per-document extraction:**
- LlamaParse path (preferred): 3 credits/page × ~5 pages = 15 credits = $0 (within the 10k free credits) + Haiku text-structuring ~3k input + 1.5k output = ~**$0.011 / doc**.
- Claude full-PDF fallback (Sonnet): ~5 pages × ~1.5k tokens vision input + 8k output = ~**$0.16 / doc** (≈14× the LlamaParse path).
- Free LlamaParse credits cover 3,333 pages/month → roughly 666 average reports.

**Per-chat-message:**
- System prompt with full RAG context: ~3–6k input tokens (depends on number of docs).
- Output: 200–700 tokens.
- Haiku: roughly **$0.005–$0.015 / message**.

**Caveman summariser (per thread, occasionally):**
- Once every 5 new messages past threshold: ~1k input + 200 output Haiku = **$0.002 per refresh**.

**Tidy run:** Haiku tool call ~1.5k in + 500 out = **$0.005 / run**.

**Average user, conservative monthly estimate:**
- 3 PDFs/month = $0.03 (LlamaParse path) or $0.48 (Claude path)
- 60 chat messages = $0.30–$0.90
- 5 caveman refreshes = $0.01
- 4 tidy runs = $0.02
- **Total: $0.35–$1.45 per user per month** in LLM spend, dominated by chat.

LlamaParse free tier holds for the first ~166 users uploading 4 docs/month each. Past that, either pay LlamaParse or fall through to Claude.

---

## 9. Caveman / cavemem / cavekit — what they are and where they fit

(Investigation requested in `UMA_prompts.md` carryover item 4.)

The Caveman ecosystem (JuliusBrussee) is **three things that compose**:

| Tool | What it does | Where it lives |
|---|---|---|
| **caveman** | Output compression — strips filler, articles, hedging from agent responses. Claims 65% output token reduction; real-world ~4–10% session savings. | Claude Code skill / Codex plugin |
| **cavemem** | Persistent memory across coding sessions — observations stored compressed in local SQLite, served via MCP. | Claude Code MCP |
| **cavekit** | Build-loop orchestration — turns prose specs into structured plans, executed against using caveman internally. | Claude Code workflow layer |

### The honest evaluation

These are **developer-facing tools**. They run inside Claude Code (or a similar coding agent) on the engineer's laptop. They are **not runtime libraries** that get bundled into UMA.

That has two implications:

1. **For the UMA runtime (what users see):** caveman is the wrong shape. The token wins claimed (~65%) are output-only and apply to discursive replies. UMA's chat outputs are already short (~700 tokens cap). Real session savings would be 4–10% — not nothing, but not material on Haiku at $5/M output. *Skip.*
2. **For the team building UMA:** caveman + cavemem could be useful in Claude Code dev sessions. Output compression buys a small token savings; cavemem could maintain context across "I worked on UMA last Tuesday" sessions. Modest win, low risk to try. *Pilot — not a project blocker.*

### Independent / parallel work in `wilpel/caveman-compression`

A separate project (William Peltomäki) under the same name does **input** compression (LLM-based, NLP-based, MLM-based, 15–30% reduction). This one *could* plausibly be wrapped around UMA's `buildRetrievalContext` to compress the system prompt before sending. Worth a one-day spike if/when token cost becomes a real lever.

### What UMA already calls "caveman"

Confusingly, UMA already has its own file at `src/lib/intent/cavemanSummarize.ts`. It's a hand-rolled context-window summariser — *not* a wrapper around the third-party project. Naming was inspired by the same compression idea. This is UMA's only real "caveman-style" optimisation today, and it's working as intended.

### Proven alternatives

- **Anthropic prompt caching** (built into the SDK, free to use) — the system prompt for the chat agent is largely static; turning on `cache_control: ephemeral` blocks for the patient profile + RAG context can cut input cost by **up to 90%** on subsequent turns within a 5-minute window. **This is the bigger lever and we're not using it yet.** Recommend doing this first.
- **`gpt-4o-mini` / `claude-haiku-4-5`** — already used. Cheapest tier of frontier models.
- **Quantised local models** for the structuring step (Llama 3 8B FP8 on a small GPU) — too high-touch for a current-state product, but a future option if scale demands it.

### Verdict

- Skip caveman/cavemem/cavekit for the UMA runtime. They're solving a different problem.
- Optionally pilot in Claude Code dev sessions.
- **Adopt Anthropic prompt caching first** — bigger return for less effort.

---

## 10. Known gaps — what isn't done yet

These are surfaces the code makes obvious need work:

- **No prompt caching.** `cache_control` blocks aren't used anywhere. Likely the largest cheap-wins lever (see §9).
- **No vector embeddings.** BM25 is fine today; will hit a ceiling when docs have synonyms BM25 can't bridge ("kidney" vs "renal").
- **No structured eval harness for chat quality.** `eval-runs/` exists but contains JSON snapshots, not assertions. The new prompts batch 2026-05-07 item 6 spec'd this out.
- **No caching of LlamaParse results for re-extraction.** Every retry costs credits.
- **No telemetry dashboard for `extractionCost`/`chatUsage`.** The data is collected but never visualised. A `/admin/cost` page would be a half-day build.
- **No support for user-supplied API keys.** Currently the server's `ANTHROPIC_API_KEY` is the only path. New prompts batch 2026-05-07 spec'd a profile-page provider/model selector.
- **No backend persistence for passkeys / WebAuthn.** Carryover item from previous prompts batch.
- **Tidy is opaque.** No way to see what it pulled, what it proposed, or why a proposed op was dropped. Spec'd in new prompts batch as item 2.

---

## 11. File map (the parts that matter)

```
src/
├── app/
│   ├── api/
│   │   ├── auth/{google,login,logout,refresh-session,request-otp,session,verify-otp}/route.ts
│   │   ├── chat/route.ts                ← Conversation agent + parallel records agent (~810 lines)
│   │   ├── extract/route.ts             ← Standalone PDF upload entry point
│   │   ├── healthkit/sync/route.ts      ← iOS HealthKit ingestion
│   │   ├── insurance/{plans,claims,draft-claim,send-claim-email}/route.ts
│   │   ├── patient-store/{route.ts,stream/}
│   │   ├── threads/{route.ts,[id]/{route.ts,messages/route.ts}}
│   │   ├── tidy/route.ts                ← Tidy data-hygiene agent
│   │   ├── trackers/fitbit/             ← Fitbit OAuth + sync
│   │   └── whatsapp/{cron,link,webhook}/route.ts
│   ├── dashboard/page.tsx               ← Bento grid (Health Trends, Concerning Items, Meds, Docs)
│   ├── chat/page.tsx                    ← Threaded chat surface
│   ├── profile/page.tsx                 ← User profile editor (target for the API-key feature)
│   ├── docs/[id]/page.tsx               ← Per-document detail
│   └── …
├── components/
│   ├── ui/                              ← Button, Card, Badge, Input
│   ├── dashboard/{BentoGrid,DashboardGrid,DashboardEditToolbar}.tsx
│   ├── chat/{ThreadSidebar,ChatMarkdown,UmaCharacter}.tsx
│   ├── nav/{AppShell,AppSideNav,AppTopNav,LandingHeader,TidyButton}.tsx
│   ├── notifications/                   ← NotificationCenter + bell
│   ├── health/                          ← BMI, BP log, side effects
│   ├── insurance/                       ← Plans, claims, drafting
│   ├── family/                          ← Family member switcher
│   ├── wearables/                       ← Fitbit / HealthKit visuals
│   └── theme/{ThemeInit,ThemeToggle}.tsx
├── lib/
│   ├── server/
│   │   ├── medicalPdfPipeline.ts        ← LlamaParse → Claude Haiku OR Claude Sonnet (~750 lines)
│   │   ├── threads.ts                   ← getOrCreateActiveThread, append, archive, summary
│   │   ├── intentBus.ts                 ← In-process event bus for cross-channel intents
│   │   ├── patientStoreServer.ts        ← Server-side store load/parse
│   │   └── authSession.ts               ← requireUserId()
│   ├── intent/
│   │   ├── classifyIntent.ts            ← LLM-driven mutation classifier
│   │   ├── storePatch.ts                ← Discriminated-union op schema + applier (~600 lines)
│   │   └── cavemanSummarize.ts          ← Long-thread context compressor (UMA's own caveman)
│   ├── auth/
│   │   ├── sessionToken.ts, googleOAuth.ts, otpDb.ts, otpMemory.ts, otpRateLimit.ts,
│   │   │ sendSignInOtp.ts, betaDemo.ts, identifiers.ts
│   ├── whatsapp/                        ← reminderIntent, conditionIntent, processIncomingMessage…
│   ├── wearables/                       ← Fitbit / HealthKit sync helpers
│   ├── store.ts                         ← localStorage + mergeExtractedDoc (~1,400 lines)
│   ├── rag.ts                           ← BM25 over docs
│   ├── parseMarkdownArtifact.ts         ← Pulls structured fields out of LLM markdown
│   ├── standardized.ts                  ← Canonical lab names + lexicon patches
│   ├── labInterpret.ts, labMeta.ts, labUnits.ts
│   ├── medication{Classification,DoseUnits,FormPresets,FrequencyPresets,Reminders}.ts
│   ├── familyConnections.ts, familyRiskEngine.ts, hereditaryConditions.ts
│   ├── menstrualCycle.ts, healthLogs.ts, bmi.ts
│   ├── isClinicalResponse.ts            ← Heuristic for the smart-disclaimer rule
│   └── types.ts                         ← All shared types
└── proxy.ts                             ← Edge proxy (auth + cookie forwarding)
```

---

## 12. Reading order if you're new

1. `prisma/schema.prisma` — data model in 250 lines.
2. `src/lib/types.ts` — every TS type.
3. `src/app/api/chat/route.ts` — see how a chat request becomes a streamed reply.
4. `src/lib/server/medicalPdfPipeline.ts` — see how a PDF becomes structured records.
5. `src/lib/intent/classifyIntent.ts` + `storePatch.ts` — see how a sentence becomes a store mutation.
6. `src/lib/intent/cavemanSummarize.ts` — see why long threads stay cheap.
7. `src/app/api/threads/[id]/messages/route.ts` — see how the threaded chat ties everything together with WhatsApp.

That ordering takes you from data → ingestion → conversation → structured action → cross-channel sync. Each step is < 1 hour to read.
