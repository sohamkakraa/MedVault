# UMA — Prompts / Change Requests

> Working list of changes Soham wants made to the UMA app. Latest batch only — older prompts are cleared each time a new batch is added.

---

## ⚠️ MANDATORY: Documentation rule for the implementer (Claude / Claude Code)

You have been making code changes without updating `CLAUDE.md`, `UMA_Architecture.md`, or any skill files. **STOP.** From this batch forward, every change must be recorded so future sessions of you (and me) can understand what was done and why.

For every item in this batch, before considering the work "done":

1. **Update `CLAUDE.md`** in any section that becomes stale because of your change (data model, structure, key behaviours, UI rules, planned work, env vars).
2. **Update `UMA_Architecture.md`** if the change touches the agent layer, data model, or external dependencies. The architecture doc is the source of truth for "what's actually happening behind the scenes" — keep it true.
3. **Create or update a skill file** under `.claude/skills/uma/` (create the folder if it doesn't exist) describing the *component / pattern / convention* you established. Each skill should answer: when to use this, when not to, and the gotchas.
4. **Update `CODE_REPO.md`** for every file added / removed / renamed / significantly edited (see item 10 below).
5. **Add a one-line entry** to `CHANGELOG.md` at the project root for each item touched — date, item number from this file, summary.

If you finish coding without doing all five, the work is not done. Re-open the task.

---

## Design language reference (use this — do NOT introduce new tokens, libraries, or fonts)

The codebase already has a coherent design system. Every change in this batch must use it as-is. Do not introduce shadcn/ui, MUI, Chakra, Mantine, daisyUI, or any other component library — UMA already has its own primitives.

### CSS variables (set in `src/app/globals.css` — never hardcode colours)

| Token | Light value | Dark value | Use for |
|---|---|---|---|
| `--bg` | `#f6f2ea` (cream) | `#0b1114` | Page background |
| `--fg` | `#151515` | `#edf1f3` | Primary text |
| `--panel` | `#ffffff` | `#19252f` | Card surface |
| `--panel-2` | `#f2ece2` | `#141e28` | Recessed / selected row tint |
| `--muted` | `#6e6a63` | `#9aa4ac` | Secondary text |
| `--border` | `#e2dccf` | `#2b3e4c` | Card / divider |
| `--accent` | `#137a66` (deep green) | `#22c55e` | Primary action / focus |
| `--accent-contrast` | `#f8faf9` | `#0b1114` | Text on accent backgrounds |
| `--accent-2` | `#c6711e` (warm orange) | `#f59e0b` | Secondary / warning accent |
| `--ring` | `rgba(19,122,102,0.25)` | `rgba(34,197,94,0.24)` | Focus ring |
| `--shadow` | `0 18px 50px rgba(18,24,24,0.12)` | `0 4px 24px rgba(0,0,0,0.5)` | Card shadow |

### Typography

- **Body / UI:** `Space Grotesk` (already loaded). Use as-is via the inherited `body` font-family — no new `<link>` or font import.
- **Headings (titled cards, page H1):** `Fraunces` via the `.mv-title` class. Use it for: section headings ≥ 18 px, dashboard widget titles, modal titles. Do NOT use Fraunces for body, labels, or chips.
- **Sizes:** never `text-xs` (12 px) for anything a user has to read or act on. `text-sm` (14 px) is the floor. Numbers in gauges: `text-3xl font-semibold`.

### Card conventions

- Outer wrapper: `<div className="mv-card rounded-3xl p-5 sm:p-6">…</div>` — uses `var(--panel)`, `var(--border)`, `var(--shadow)`.
- Recessed / informational tile inside a card: `mv-card-muted rounded-2xl p-4`.
- Subtle background sheen (used for the "At a glance" hero only): add `mv-surface` *after* `mv-card`.

### Icons

- **Lucide React** (`lucide-react@^0.563`). All icons are Lucide. Do not introduce another icon library.
- Sizing: `h-5 w-5` inside `h-11 w-11` tap targets, `h-4 w-4` for inline label glyphs.
- Always pair an icon with a visible text label OR an `aria-label` + Tooltip — never icon-only without screen-reader support.

### Tap targets

- Mobile minimum: 44 × 44 px (`h-11 w-11`).
- Inline buttons in dense rows: 36 × 36 px (`h-9 w-9`) acceptable only when row has full text label.

### Active / selected state pattern (matches `AppSideNav` rounded-2xl tile)

```
className={cn(
  "border transition-colors",
  active
    ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]"
    : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--panel-2)] hover:text-[var(--fg)]"
)}
```

### Animations (Framer Motion already installed at `framer-motion@^12`)

- Fade + 4 px upward slide on mount: `initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}`.
- Layout transitions (cards re-flowing): `layout` prop with `transition={{ duration: 0.2 }}`.
- Avoid spring physics for utility UI — they look toy-ish on health content. Linear/easeOut only.
- Respect `prefers-reduced-motion`: gate any non-trivial animation on `useReducedMotion()` from framer-motion.

### Existing UI primitives — use these instead of building new ones

`src/components/ui/`: `Badge`, `Button`, `Card`, `Combobox`, `DatePicker`, `DateTimePicker`, `Dialog`, `DropdownMenu`, `Footer`, `Input`, `Popover`, `RecordNoticeToast`, `Select`, `Sheet`, `TimePicker`, `Tooltip`, `chart`, `cn`, plus `GlobalUploadBadge` and `UploadProgressSheet`.

If you reach for a new primitive, **stop**. Either extend one of these or, if it really must be new, add a skill file documenting why.

---

## Carryovers from previous batches — STILL OUTSTANDING

- **OpenClaw pilot** — investigation done, pilot not started.
- **SSO / Passkey** — backend persistence is now in place (Postgres via Prisma). No longer blocked. Carry forward; not in this batch.

---

## Batch — 2026-05-07c (replaces previous batch with sharper specs)

### 1. Caveman ecosystem — investigation complete, no runtime work needed

See `UMA_Architecture.md` §9. Conclusion: skip the third-party caveman / cavemem / cavekit ecosystem for the UMA runtime. The bigger lever is Anthropic prompt caching (item 2). Mark the `cavemanSummarize.ts` file's leading docstring with a note that it's UMA's own implementation, unrelated to the JuliusBrussee ecosystem, to stop future Claudes from "fixing" the imports.

---

### 2. Anthropic prompt caching for the chat system prompt

**Goal:** cut input-token cost on subsequent chat turns by ≤90% within a 5-minute window.

**Files to edit:** `src/app/api/chat/route.ts`, `src/app/api/threads/[id]/messages/route.ts`. (Do NOT touch `src/lib/server/medicalPdfPipeline.ts` — caching the PDF document block is a separate, lower-priority pass.)

**Exact change to the Anthropic SDK call:**

```ts
const msg = await client.messages.create({
  model: chatModel,
  max_tokens: 900,
  system: [
    // STATIC, CACHEABLE PREFIX — patient profile + meds + labs + insurance + RAG docs
    {
      type: "text",
      text: cacheablePrefix,                       // built by buildRetrievalContext, sliced
      cache_control: { type: "ephemeral" },
    },
    // DYNAMIC SUFFIX — must NOT be cached (per-turn diary augment, family viewing label)
    { type: "text", text: dynamicSuffix },
  ],
  messages: [...trimmedHistory, { role: "user", content: userContent }],
});
```

**What goes in `cacheablePrefix` (large, identical across turns):**
- Allergy banner
- "You are the conversation agent…" framing block
- `=== PATIENT PROFILE ===`
- `=== MEDICATIONS ===`
- `=== LAB VALUES ===`
- `=== SAVED DOCUMENTS ===` (the BM25-ranked docs and excerpts)
- `=== CUSTOM LAB LABELS ===`
- `=== INSURANCE PLANS ===`
- `=== INSURANCE CLAIMS HISTORY ===`

**What stays in `dynamicSuffix` (small, per-turn):**
- `viewingLabel` (changes when user switches family member)
- `diaryAugment` (reminder chip context)
- The summary-query allergy injection
- The bill-claim phrasing nudge

**Wiring:**
1. Refactor `buildRetrievalContext` to return `{ cacheablePrefix, dynamicSuffix }` instead of a single string.
2. Plumb both into `conversationAgentLLM` and `conversationAgentLLMStream`.
3. The OpenAI fallback path **does not** support cache_control — concatenate prefix + suffix for that path. Mark with `// OpenAI: caching n/a`.

**Telemetry:**
- Anthropic returns `usage.cache_creation_input_tokens` (write) and `usage.cache_read_input_tokens` (read). Add both fields to the `ChatUsage` type in `src/lib/types.ts`.
- Plumb them through the SSE `usage` event.
- Update the cost computation: cache writes cost 1.25× normal input; cache reads cost 0.1× normal input. See:

```ts
function computeChatCost(model, input, output, cacheRead, cacheWrite) {
  const p = CHAT_MODEL_PRICING[…] ?? CHAT_DEFAULT_PRICING;
  const M = 1_000_000;
  return (
    (input    / M) * p.inputPerMTok +
    (cacheRead  / M) * p.inputPerMTok * 0.10 +
    (cacheWrite / M) * p.inputPerMTok * 1.25 +
    (output   / M) * p.outputPerMTok
  );
}
```

**Acceptance test:** send 4 chat messages in a thread within 60 s. Message 1 reports `cache_creation_input_tokens > 0` and `cache_read_input_tokens === 0`. Messages 2–4 report `cache_creation_input_tokens === 0` and `cache_read_input_tokens > 0`. Total cost across the 4 messages is < 30 % of the same flow without caching.

**Skill file:** `.claude/skills/uma/prompt-caching.md` — lists exactly what's cached, what isn't, the cache-invalidation behaviour (any character change in the prefix breaks the cache; that's why the dynamic suffix is split out), and what to do when the patient store changes mid-conversation (the prefix naturally changes → cache miss on next turn → expected; do NOT try to be clever about partial invalidation).

**Doc updates:** `UMA_Architecture.md` §8 with the new cached-vs-uncached numbers from real measurement.

---

### 3. Profile page — Bring-Your-Own-Key (BYOK)

**Goal:** let the user supply their own provider + API key. UMA-the-product stops paying for inference for that user; the user's costs go to the provider.

#### 3a. Provider registry — single source of truth

Create **`src/lib/providers/registry.ts`** (NEW). Shape:

```ts
export type ProviderId =
  | "default"
  | "anthropic"
  | "openai"
  | "perplexity"
  | "google"           // Gemini
  | "moonshot"         // Kimi
  | "deepseek"
  | "huggingface";

export type ProviderModel = {
  id: string;          // e.g. "claude-haiku-4-5-20251001"
  label: string;       // human label, e.g. "Claude Haiku 4.5"
  contextWindow: number;
  inputPerMTok: number;  // USD
  outputPerMTok: number; // USD
  supportsTools: boolean;
  supportsVision: boolean;
};

export type ProviderSpec = {
  id: ProviderId;
  label: string;             // e.g. "Anthropic"
  docsUrl: string;
  consoleUrl: string;        // where the user gets a key
  apiKeyPattern?: RegExp;    // optional sanity check
  curatedModels: ProviderModel[];
  // Optional: function to fetch live models from /v1/models when a key is present
  listModelsFromApi?: (key: string) => Promise<ProviderModel[]>;
  // Verification — sends a 1-token "ping" with the user's key + chosen model
  verify: (key: string, modelId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = { … };
```

Curated model lists (minimum each provider needs):
- **Anthropic:** `claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929`, `claude-opus-4-6`.
- **OpenAI:** `gpt-4o-mini`, `gpt-4o`, `gpt-4.1`, `o3-mini`.
- **Google (Gemini):** `gemini-2.5-flash`, `gemini-2.5-pro`.
- **DeepSeek:** `deepseek-chat`, `deepseek-reasoner`.
- **Moonshot (Kimi):** `moonshot-v1-32k`, `kimi-k2`.
- **Perplexity:** `sonar`, `sonar-pro`, `sonar-reasoning`.
- **HuggingFace:** require the user to type the model ID; provide 3 popular defaults (`meta-llama/Meta-Llama-3-70B-Instruct`, `Qwen/Qwen2.5-72B-Instruct`, `mistralai/Mistral-Nemo-Instruct-2407`).
- **Default:** single entry whose model is "(server-managed)".

Do NOT call any provider's `/models` endpoint inside React; only in server-side code. The dropdown can lazy-merge live results when the key is present and verified.

#### 3b. Database — encrypted storage

Add a Prisma migration:

```prisma
model UserLlmCredential {
  userId        String   @id @map("user_id")
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider      String                          // ProviderId string
  modelId       String   @map("model_id")
  // pgcrypto-encrypted blob; never returned to the client in plaintext
  apiKeyCipher  Bytes    @map("api_key_cipher")
  apiKeyLastFour String  @map("api_key_last_four")  // for display
  verifiedAt    DateTime? @map("verified_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  @@map("user_llm_credentials")
}
```

Encryption: use `pgcrypto`'s `pgp_sym_encrypt` keyed by `LLM_CRED_MASTER_SECRET` (new env var). Encrypt/decrypt only inside `src/lib/server/llmCredentials.ts`. Never `console.log` the key. Never include the key or cipher in any API response.

#### 3c. The single client factory — replaces all `process.env.ANTHROPIC_API_KEY` reads in agent code

Create **`src/lib/server/llmClient.ts`**:

```ts
export type LlmClient = {
  provider: ProviderId;
  modelId: string;
  // Returns a Claude/OpenAI-style chat completion result with normalised usage.
  chat(opts: ChatOpts): Promise<ChatResult>;
  // Optional: tool-use call (only Anthropic + OpenAI today; throws "tool_use_unsupported" otherwise)
  toolUse(opts: ToolUseOpts): Promise<ToolUseResult>;
  // Optional: PDF document block (only Anthropic full-PDF model)
  pdfDocument(opts: PdfDocOpts): Promise<ChatResult>;
};
export async function getLlmClient(userId: string, role: "chat" | "extract" | "intent" | "tidy" | "structure"): Promise<LlmClient>;
```

`getLlmClient` resolution order:
1. Look up `UserLlmCredential` for `userId`. If present and verified, build a client for that provider.
2. Otherwise, fall back to the server's `ANTHROPIC_API_KEY` (existing behaviour).
3. Provider clients live under `src/lib/server/llmProviders/{anthropic,openai,gemini,…}.ts` — one file per provider, all implementing the same `LlmClient` interface.

**Refactor:** every `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` in `src/app/api/chat/route.ts`, `src/app/api/extract/route.ts`, `src/app/api/tidy/route.ts`, `src/app/api/threads/[id]/messages/route.ts`, `src/lib/server/medicalPdfPipeline.ts`, `src/lib/intent/classifyIntent.ts`, `src/lib/intent/cavemanSummarize.ts` becomes a `getLlmClient(userId, role)` call. **No exceptions.** A grep for `process.env.ANTHROPIC_API_KEY` after this lands should match only `src/lib/server/llmProviders/anthropic.ts`.

#### 3d. The Profile UI — exact composition

In **`src/app/profile/page.tsx`**, add a new section under the existing profile cards:

```
<section className="mv-card rounded-3xl p-5 sm:p-6">
  <header className="mb-4 flex items-start justify-between">
    <div>
      <h2 className="mv-title text-xl">AI provider</h2>
      <p className="mv-muted text-sm">
        UMA uses Claude by default. Plug in your own key to use a different provider — your costs go to the provider, not us.
      </p>
    </div>
    <Badge variant={hasUserKey ? "success" : "muted"}>
      {hasUserKey ? "Using your key" : "Using UMA's default"}
    </Badge>
  </header>
  …
</section>
```

Inside the section, three rows in a `space-y-4`:

1. **Provider row:** label `Provider`, value: existing `Select` primitive (`src/components/ui/Select.tsx`). Width: `w-full sm:w-72`. Trigger height `h-11`. Include a small `<Tooltip>` "Where do I get a key?" link → opens the provider's `consoleUrl` in a new tab.
2. **Model row:** label `Model`. Same `Select`. Disabled when provider is "Default". Options come from `PROVIDERS[provider].curatedModels`. If the user has already verified a key for this provider, fire `listModelsFromApi(key)` once and merge the live list (deduped by `id`); show a tiny "Live" tooltip on live entries.
3. **Key row:** label `API key`. `Input type="password"` with a right-side `Show` toggle (eye icon → `Eye` / `EyeOff` from Lucide). When a key is already saved, show the redacted form `sk-...••••${apiKeyLastFour}` in muted text and a `Replace` button instead of the input.

**Save flow (state machine — implement with `useState<"idle" | "verifying" | "ok" | "bad">`):**
- User edits → state `idle`.
- User taps `Save & verify` → state `verifying`. Button disabled, shows `<Loader2 className="animate-spin" />`. Send `POST /api/profile/llm-credentials/verify` with `{ provider, modelId, apiKey }`.
  - Server hits the provider's `verify(key, modelId)` (1-token ping).
  - If ok → server encrypts and persists → returns `{ ok: true, lastFour }`.
  - If not → returns `{ ok: false, reason: "..." }` and **does not** save anything.
- On `ok`: state `ok`, toast `RecordNoticeToast` "Provider verified — UMA will now use ${ProviderLabel} ${modelId} for your messages." Replace the input with the redacted view.
- On `bad`: state `bad`, inline error in `text-[var(--accent-2)]` below the input: e.g. "That key didn't work for ${ModelLabel}: ${reason}. Try a different model, or check the key." Do not clear the input — let the user fix it.

**Reset to default:** small `Use UMA's default again` text-button (`text-sm text-[var(--muted)] underline`). On click: open a `Dialog` confirming "Switch back to UMA's default Claude? Your saved key will be deleted." On confirm: `DELETE /api/profile/llm-credentials` and toast.

**Privacy footnote line below the section:** small italic, `text-sm mv-muted`:
> *When you provide your own key, your messages go directly from UMA's server to your chosen provider using your key. Your costs are billed by that provider.*

#### 3e. API routes (NEW)

- `POST /api/profile/llm-credentials/verify` — validates Zod body, runs `PROVIDERS[provider].verify`, encrypts + upserts on success.
- `GET /api/profile/llm-credentials` — returns `{ provider, modelId, lastFour, verifiedAt } | null`. Never the cipher or plaintext key.
- `DELETE /api/profile/llm-credentials` — deletes the row.

All three: `requireUserId()` chokepoint, Zod validation, no PII in logs.

#### 3f. Skill + docs

- `.claude/skills/uma/byok.md` — what BYOK is, where the registry lives, how to add a new provider, the encryption invariant, the chokepoint.
- `UMA_Architecture.md` §4 → every agent now reads from `getLlmClient` instead of env directly.
- `CLAUDE.md` env-var table: add `LLM_CRED_MASTER_SECRET` (required when BYOK is enabled).

---

### 4. Dropdown selection UX — kill the checkmark column, allow inline edit

**Bug:** in the doctor / hospital dropdowns (`profile` page and the dashboard At-a-Glance section), the selected item's name is pushed right by ~24 px to make space for a checkmark — long names truncate.

**Files to edit:** every consumer of `src/components/ui/DropdownMenu.tsx` and `src/components/ui/Select.tsx` that renders a "selected" checkmark. The two dropdown primitives themselves keep their generic API; the change is at the call site.

**Visual change (selected row):**

```tsx
<DropdownMenu.Item
  className={cn(
    "flex h-10 items-center gap-2 rounded-xl px-3 text-sm transition-colors",
    "outline-none focus:bg-[var(--panel-2)]",
    isSelected
      ? "bg-[var(--accent)]/12 font-semibold text-[var(--accent)]"     // highlight only
      : "text-[var(--fg)] hover:bg-[var(--panel-2)]"
  )}
>
  {/* No leading <Check /> — name sits flush left */}
  <span className="truncate">{item.name}</span>
  <span className="ml-auto flex items-center gap-1">
    {isSelected && (
      <Tooltip><TooltipTrigger asChild>
        <button onClick={enterEdit} className="h-7 w-7 rounded-lg hover:bg-[var(--accent)]/20" aria-label={`Edit ${item.name}`}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger><TooltipContent>Rename</TooltipContent></Tooltip>
    )}
  </span>
</DropdownMenu.Item>
```

**Inline edit mode (in-place — no modal):**

When the user clicks the pencil OR clicks the highlighted name, the row swaps to an `Input` with the current value selected:

```tsx
<form onSubmit={save} className="flex h-10 items-center gap-2 rounded-xl bg-[var(--panel-2)] px-3">
  <Input ref={inputRef} className="h-7 flex-1 border-0 bg-transparent p-0 text-sm focus:ring-0" defaultValue={item.name} />
  <Button size="sm" variant="ghost" type="button" onClick={cancel}>Cancel</Button>
  <Button size="sm" variant="solid" type="submit">Save</Button>
</form>
```

**Behaviour:**
- `Enter` → save. `Escape` → cancel. Click outside → save (debounced 200 ms to avoid accidental re-clicks).
- Empty value → reject + shake animation (`animate={{ x: [0, -4, 4, -2, 2, 0] }} transition={{ duration: 0.25 }}`).
- Save calls `PATCH /api/profile` (existing endpoint) with `{ doctorQuickPick: [...rewritten] }` or `facilityQuickPick: [...rewritten]`.
- Toast on success.

**Apply same pattern to:** primary care provider picker, next-visit hospital picker, family-member picker, allergy/condition combo where the user picks from existing entries.

**Skill file:** `.claude/skills/uma/dropdowns.md` — the selection + edit pattern, the icon + tap-target rules, the keyboard interactions.

---

### 5. Tidy beta — debug / inspection panel

**Goal:** I should be able to see at a glance whether Tidy is (a) not pulling the right data, (b) computing the wrong diff, or (c) computing it correctly but failing to write back.

**Reach:** `src/components/nav/TidyButton.tsx` (the existing "Tidy ✨ Beta" button) and create **`src/components/tidy/TidyDebugSheet.tsx`** (NEW).

**Trigger:** add a small `Bug` (Lucide) toggle inline with the "Beta" pill. Visible only when `?debug=1` is present OR `localStorage.uma_debug === "1"` OR a new profile-page setting `Show developer surfaces` is on.

**Layout:** open as a `Sheet` (existing `src/components/ui/Sheet.tsx`) sliding from the right at `w-[480px]` desktop, `w-screen` mobile. Header: `Tidy debug — last run`. Subtitle: timestamp + `source` (`llm` | `heuristic` | `heuristic_fallback`).

**Body — four collapsible sections (use Radix Accordion via Popover or build with details/summary):**

1. **Input** — what was sent.
   - 2-column key/value list inside a `mv-card-muted rounded-2xl p-4`:
     - Doctors list (count + first 5 names, expandable)
     - Hospitals/clinics list
     - docDoctorMentions (auto-collected from documents)
     - Conditions / allergies / medications counts
   - All copy-able via a `Copy JSON` button (uses `Clipboard` icon).

2. **Retrieved** — what the LLM saw.
   - Render the literal `system` prompt + `user` message that went to Anthropic.
   - Use a `<pre>` with `font-mono text-xs whitespace-pre-wrap break-all`, capped at `max-h-64 overflow-auto`. (text-xs is fine here — debug surface, not user-facing.)

3. **Proposed changes** — the parsed `ops[]`.
   - Each op renders as a row: `Pencil` icon + `<kind>` badge + a one-line plain-English description (`add Dr. Asha Iyer to doctors`, `move "City Imaging" from doctors → hospitals`).
   - `Pending` / `Approved` / `Rejected` chip per op (drives the user-facing accept flow).
   - Strikethrough rejected ops; `--accent` border on approved ones.

4. **Applied changes** — what made it to the store after user accept.
   - Show before / after diff using a 2-column layout: left "Was", right "Now".
   - Use `text-[var(--accent-2)]` for removals and `text-[var(--accent)]` for additions.

5. **Errors / warnings** — schema mismatches, dropped ops, fallbacks.
   - Each entry: timestamp + level (`warn` / `error`) + message + raw payload (collapsible).

**State source:** the route at `src/app/api/tidy/route.ts` already returns `{ source, ops, summary, note }`. Extend the response with a debug envelope that the client only renders when the toggle is on:

```ts
type TidyDebugEnvelope = {
  inputSnapshot: { /* the Input section data */ };
  promptText: string;
  rawToolUseInput: unknown;
  schemaErrors: { path: string; message: string }[];
  appliedOps: StorePatchOp[];
  rejectedOps: { op: StorePatchOp; reason: string }[];
};
```

**Storage:** keep the last 5 debug envelopes in `localStorage.uma_tidy_debug_runs` so the user can compare runs.

**Doc updates:** `UMA_Architecture.md` §4.4. Skill file: `.claude/skills/uma/tidy-debug.md`.

---

### 6. Dashboard — verify "Concerning items" section + BMI merge + full width

**Files:** `src/app/dashboard/page.tsx`, `src/components/dashboard/BentoGrid.tsx`, `src/components/dashboard/DashboardGrid.tsx`. Plus the BMI card (`src/components/health/BmiCard.tsx`) and the gauge cards exported from `HealthTrendsSection`.

**Required end state — verified at iPhone SE / base / tablet / desktop:**

#### 6a. Section heading

- New string: **"Concerning items"** (plain). Use `.mv-title text-xl`.
- Subtitle in `text-sm mv-muted`: *"Flagged labs and metrics worth discussing with your doctor."*
- The `--accent-2` (warm orange) is reserved for genuinely flagged items. The section title itself stays `--fg`.

#### 6b. Layout

- Section width: full row (`hero` size, 12 cols on desktop). Force-set in `normalizeDashboardLayout` the same way `healthTrends` is forced.
- Position: directly **below** the `healthTrends` row.
- Inner grid:
  - Desktop ≥1024: `grid-cols-3` (3 tiles per row).
  - Tablet 640–1023: `grid-cols-2`.
  - Mobile ≤639: `grid-cols-1`.
  - Gap: `gap-4` desktop, `gap-3` mobile.
- Each tile: a `mv-card-muted rounded-2xl p-4` (recessed inside the section card). Min height `min-h-[160px]` so all tiles align even with short content.

#### 6c. What goes in the section

Three tile types, all rendered through one `<ConcerningTile>` component:

1. **Flagged lab** (out-of-range): `Heart` (or canonical-icon-from-`labMeta.ts`) + label + value + status badge + `range bar`. Status colour rule:
   - `status="below"` → `text-[var(--accent-2)]`, badge `Below range`.
   - `status="above"` → `text-[var(--accent-2)]`, badge `Above range`.
   - `status="in"` → `text-[var(--accent)]`, badge `In range`.
2. **BMI**: `Scale` (Lucide) icon + value + a healthy-range bar mirroring the lab gauge style. Status badge: `Healthy weight` (green) for 18.5–24.9, `Underweight` (orange), `Overweight` (orange), `Obese class I/II/III` (orange). **Healthy BMI MUST render with green chip + green value text — never as a warning.**
3. **Empty fallback** (only when zero items): single tile spanning all columns with calm copy: *"Nothing in your records is currently flagged. Keep your reports up-to-date and UMA will tell you if anything changes."* Use `--muted` text. Do NOT show a sad state or red iconography.

#### 6d. Component prop signature

```ts
type ConcerningTileProps = {
  kind: "lab" | "bmi" | "empty";
  icon: LucideIcon;
  label: string;
  value: string;          // e.g. "324 mg/dL", "22.9 kg/m²"
  date?: string;          // "Mar 2026"
  status: "above" | "below" | "in" | "neutral";
  rangeBar?: { min: number; max: number; current: number; lowLabel: string; midLabel: string; highLabel: string };
};
```

The tile is layout-neutral — no internal scroll, content sets the height (`min-h-[160px]`). All text wraps; never use `truncate` on the label.

#### 6e. Acceptance

- Run `npm run dev` → visit `/dashboard` at 375 / 393 / 768 / 1280 px.
- Section is full-width at every viewport.
- Tiles never clip the value or the badge.
- Healthy BMI tile is green + says "Healthy weight".
- Removing all flagged labs and resetting BMI to healthy → renders the calm empty fallback (not a red banner).

**Skill file:** `.claude/skills/uma/concerning-items.md`. **`CLAUDE.md` "Bento Grid Architecture" table:** add the `concerningItems` widget at hero size.

---

### 7. Murphy — visual / UX regression with `ProsusAI/Murphy`

**Repo:** `https://github.com/ProsusAI/Murphy`. Already installed on the dev machine. **Step zero: `git -C path/to/Murphy pull origin main`** before any run.

**Add to `package.json`:**

```jsonc
{
  "scripts": {
    "murphy": "uv run murphy --url http://localhost:3000",
    "murphy:auth": "uv run murphy --url http://localhost:3000 --auth",
    "murphy:goal": "uv run murphy --url http://localhost:3000 --goal",
    "murphy:open": "uv run murphy --open"
  }
}
```

**Per-PR usage convention:**
- For UI items: run a goal-directed Murphy session whose `--goal` matches the spec line. e.g. `uv run murphy --url http://localhost:3000 --goal "verify the Concerning Items section spans full width and shows BMI as healthy at viewport widths 375/393/768/1280"`.
- Reuse personas — generate once, commit to `murphy/output/personas.json`, then always `--personas`.
- Output dir: `murphy/output/<batch>/<itemN>/`. Commit summary; `.gitignore` the raw screenshot frames.

**CI (separate hook, NOT blocking on first roll-out):**
- Add `.github/workflows/murphy.yml` that runs Murphy against a Vercel preview deployment URL on every PR with the `ui` label.
- Mark non-blocking for the first 2 weeks; flip to required after we have a baseline.

**Note for the implementer:** I tried to clone Murphy from this Cowork sandbox and got a 403 from the proxy — the repo isn't reachable from here. You will need to ensure the local checkout is at the project root or in an adjacent folder before running the script. If `murphy` isn't on `$PATH`, `uv` will resolve it from the local `pyproject.toml`.

**Skill file:** `.claude/skills/uma/murphy.md` — usage, persona-file conventions, output layout, how to interpret a failed run.

---

### 8. Chat page — bug fixes that didn't actually land

**Files:** `src/app/chat/page.tsx`, `src/components/chat/ThreadSidebar.tsx`, `src/components/nav/AppSideNav.tsx`, `src/app/api/threads/route.ts`, `src/lib/server/threads.ts`.

#### 8a. Dashboard icon belongs on the side rail, not the chat panel header

`AppSideNav` (`src/components/nav/AppSideNav.tsx`) already includes Dashboard, Profile, Upload, Chat. **The bug is that `src/app/chat/page.tsx` renders a duplicate dashboard icon inside its own panel header.** Delete that duplicate. Confirm by reading `page.tsx` and `ChatPanel`-equivalent components for any `LayoutDashboard` import that isn't `AppSideNav.tsx`.

Acceptance: visit `/chat`. Only one dashboard icon visible — on the left rail. Tooltip on hover reads "Dashboard".

#### 8b. Archived chats — retrievable

Server side already exposes `GET /api/threads?archived=true` (`listArchivedThreads` in `lib/server/threads.ts` — capped at 50). Client side hasn't wired it.

In **`src/components/chat/ThreadSidebar.tsx`**, add a `Tabs` row at the top of the chat list with two tabs: `Active` (default) and `Archived`. Use Radix Tabs primitive (already available via `@radix-ui/react-*` — wrap in a thin component if it isn't yet, naming it `Tabs` and keeping it in `src/components/ui/Tabs.tsx`).

Tab styling matches the active/inactive pattern from `AppSideNav`:

```tsx
<Tabs.Root defaultValue="active">
  <Tabs.List className="flex gap-1 p-1 rounded-2xl bg-[var(--panel-2)] mb-3">
    <Tabs.Trigger
      value="active"
      className="flex-1 h-9 rounded-xl text-sm transition-colors data-[state=active]:bg-[var(--panel)] data-[state=active]:text-[var(--accent)] data-[state=active]:shadow-sm"
    >Active <span className="ml-1 mv-muted">{activeCount}</span></Tabs.Trigger>
    <Tabs.Trigger value="archived" className="…">Archived <span className="ml-1 mv-muted">{archivedCount}</span></Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="active">…</Tabs.Content>
  <Tabs.Content value="archived">…</Tabs.Content>
</Tabs.Root>
```

Each archived row exposes an "Unarchive" action on the right (`ArchiveRestore` Lucide icon, tooltip "Move back to active"). Action calls a NEW `POST /api/threads/[id]/unarchive` route — implement by clearing `archivedAt` on `Thread`.

Sort archived threads by `archivedAt` desc.

#### 8c. "Select all" — across pagination

Today the `PATCH /api/threads` bulk endpoint accepts up to 100 IDs. The client only knows about the rows it's rendered. Fix:

- When the user enters multi-select mode, fetch the full ID list eagerly: `GET /api/threads?idsOnly=true&archived=<current tab>`. Implement that query param as an `else` branch in the route returning `{ ids: string[] }` only — no message bodies.
- Hold the full set in state. Render checkboxes only for visible rows; "Select all" toggles the entire set.
- Show a counter pill: `Selected 47 of 124`. Use `--accent` chip.
- Action bar (sticky bottom of the sidebar): `Archive` (default), `Delete` (destructive — opens a `Dialog` with a 3-second hold-to-confirm button before calling).

#### 8d. Auto-rename threads on context update

Today, `appendMessage` seeds the title from the first user message and never refreshes. Hook it:

- In `src/app/api/threads/[id]/messages/route.ts`, after `updateContextSummary` (which already runs every `UPDATE_EVERY` messages past `SUMMARY_THRESHOLD`), call a new helper `proposeThreadTitleFromSummary(threadId, summary)`.
- The helper makes a single Haiku call (`max_tokens: 24`, prompt: *"Summarize the thread in 4–6 words for a chat-list label. Plain text. No quotes. Title-case."*).
- Persist via `renameThread`. Debounce: only rename if the new title is meaningfully different (`Levenshtein > 6` OR length differs by > 3 chars).
- Cost guard: skip the rename call when the user has set a custom title (track a `titleIsManual: boolean` column on `Thread`; default `false`, flip to `true` when the user renames manually via the existing rename UI).

**Skill file:** `.claude/skills/uma/chat-naming.md`. **Architecture doc:** `UMA_Architecture.md` §4.5 + §6.

---

### 9. UX-grade eval tests

**Replace** `eval-runs/` JSON snapshots with end-to-end Playwright tests under **`tests/e2e/`** (NEW directory). Existing Vitest unit tests stay where they are.

**Stack (already installed — use these):**
- `playwright@^1.59.1` (already in `devDependencies`)
- `@axe-core/playwright` for accessibility (NEW devDependency).
- Persona simulation via Playwright `emulateMedia` + custom font-scale CSS injection.

**File layout:**

```
tests/e2e/
  fixtures/
    auth.ts              # uses /api/auth/login dev token
    seed-store.ts        # writes a known PatientStore fixture
    personas/
      elderly.ts         # 200% text, 3G slow, prefers-reduced-motion=reduce
      young-fast.ts      # baseline
  flows/
    dashboard.spec.ts    # Concerning items, Health trends, BMI tile
    chat.spec.ts         # archived retrieval, select-all-across-pages, auto-rename
    upload.spec.ts       # PDF extract → mergeProposal flow
    profile.spec.ts      # BYOK provider/model/key verify flow
    notifications.spec.ts
  visual/
    dashboard.spec.ts    # golden screenshots at 375/393/768/1280
    chat.spec.ts
    profile.spec.ts
  a11y/
    full-page.spec.ts    # axe scan on every primary route
  playwright.config.ts
```

**`package.json` scripts:**

```jsonc
{
  "scripts": {
    "eval": "playwright test --project=elderly --project=young-fast",
    "eval:visual": "playwright test tests/e2e/visual",
    "eval:a11y": "playwright test tests/e2e/a11y",
    "eval:update-snapshots": "playwright test --update-snapshots"
  }
}
```

**Persona spec — elderly:**

```ts
// fixtures/personas/elderly.ts
export const elderly = {
  viewport: { width: 393, height: 852 },
  userAgent: "...",
  // Slow 3G
  offline: false,
  contextOptions: { reducedMotion: "reduce" },
  // Override font scale
  initScript: () => { document.documentElement.style.fontSize = "32px"; }, // 200% from 16
};
```

**Per-batch-item assertions — at minimum:**
- `dashboard.spec.ts`: opens `/dashboard`, assert "Concerning items" heading is visible, BMI tile shows green "Healthy weight" badge for stored value 22.9, every gauge tile has full-width content (no `clip` ellipsis), full-width section across all four viewports.
- `chat.spec.ts`: archives a thread → switches to Archived tab → unarchives → returns to Active. Selects all across "Load more" → counter shows full count → archives all → list empties.
- `profile.spec.ts`: picks Anthropic + claude-haiku-4-5-20251001 + a fake key → `Save & verify` → expects inline error "That key didn't work". Mocks `verify` to succeed → expects success toast and redacted key view.

**Visual regression:** Playwright's built-in screenshot comparison with `maxDiffPixelRatio: 0.005`. Snapshots commit to `tests/e2e/__screenshots__/`. Update via `npm run eval:update-snapshots`.

**Accessibility:** `axe.scan(page)` on every primary route; assert zero violations of `wcag21aa` rules. Allow a curated rule allowlist in `tests/e2e/a11y/allowlist.json` for known-acceptable cases (must include a comment per rule).

**CI:** `.github/workflows/e2e.yml` running `npm run eval` on every PR after `npm run build`. Cache the Playwright browsers.

**Skill file:** `.claude/skills/uma/eval-tests.md`.

---

### 10. Codebase cleanup + self-updating `CODE_REPO.md`

#### 10a. Cleanup pass — concrete targets

Verify each file's status (`grep -r` for imports / referenced in `package.json`) before deleting:

- **Project root:**
  - `debug_dashboard.js` — likely a one-off dev helper. Verify orphaned, then delete.
  - `screenshot_verify.js` — same.
  - `run-family-tests.mjs` — if unused by `package.json` scripts/CI, delete; otherwise move to `scripts/`.
  - `tsconfig.tsbuildinfo` — build artefact; add to `.gitignore` if missing, remove from git history.
  - `SHIP_NOTES.md`, `SHIP_NOTES_BUGFIX.md`, `SHIP_NOTES_INTENT.md`, `SHIP_NOTES_THREADS.md`, `SHIP_NOTES_TIDY_V2.md` — historical PR notes. Move to `docs/ship-notes/` (preserving filenames + dates) AND consolidate the cross-cutting bullets into `CHANGELOG.md`.
  - `UMA_Architecture.html` — superseded by `UMA_Architecture.md`. Delete.
- **`.claude/worktrees/`** — Cowork session artefact. Confirm not referenced by any tool config, then delete.
- **Unused exports:** run `npx ts-prune --project tsconfig.json` (one-shot, do NOT add as a permanent dep). Delete dead exports flagged by ts-prune that have zero references; preserve any export with a single test reference (Vitest-discovered).
- **Unused dependencies:** run `npx depcheck` once. Remove any package not referenced by source. Confirm by `npm run build` after.

**Hard "do not touch":** `src/lib/server/`, `src/lib/intent/`, `src/lib/auth/`, `src/lib/whatsapp/`, `prisma/`, every `route.ts` under `src/app/api/`. Do NOT delete or rewrite anything in those directories without an explicit prompt from me.

For every change in 10a, add a `CHANGELOG.md` line of the form `removed <path>` or `moved <old> → <new>`.

#### 10b. `CODE_REPO.md` — living registry

**Create `CODE_REPO.md` at the project root** with this exact opening:

```markdown
# UMA — Code Repo Registry

> **READ THIS FIRST.** Before opening source files, read this index. Use `Glob` / `Grep` only when this file points you to the right area but doesn't tell you enough. If you make a code change, you must update the matching row in this file in the same commit.

## How to read this file
- **Folder header** = what lives there at a high level.
- **File rows** = filename · line count · one-line purpose · key exports · dependents.
- When in doubt, the source wins; correct this file in the same PR.
```

Then sections in this order, populated from the actual codebase: `/`, `/prisma`, `/scripts`, `/src/app`, `/src/app/api/...` (every route group), `/src/components/{ui,dashboard,chat,nav,health,insurance,family,wearables,notifications,theme}`, `/src/lib/{server,intent,auth,whatsapp,wearables}`, `/public`, `/mobile`, `/ios-app`, `/tests`, `/docs`.

**Row template:**

```markdown
- `path/to/file.ts` · 247 lines · One-line purpose · exports: `foo`, `bar` · used by: `path/a.ts`, `path/b.ts`
```

For directories with > 30 files, group sub-folders and link to a sub-registry (`CODE_REPO.<folder>.md`) instead of inlining everything.

#### 10c. Bootstrap — generation script

Create **`scripts/bootstrap-code-repo.mjs`** (one-time generator):

- Walks the source tree, ignoring `node_modules`, `.next`, `tsconfig.tsbuildinfo`, `.git`, `dist`, `coverage`, `tests/e2e/__screenshots__`.
- For each TS / TSX / Prisma / md file: count lines, parse top-level exports via `@swc/core` or simple regex (`^export (default |async )?function|const|class|type|interface`).
- For each file: best-effort `grep -r "from \"./<basename>\""` to populate dependents.
- Writes a fresh `CODE_REPO.md`. Run **once** to bootstrap; do not run on every commit.

#### 10d. Pre-commit enforcement

Create **`scripts/check-code-repo-sync.mjs`**:

- Diffs the staged file list (`git diff --cached --name-only`) against the rows in `CODE_REPO.md`.
- For each staged file: assert its path appears in `CODE_REPO.md`.
- For brand-new files: append a stub row with `· TODO: describe ·` so the dev sees the gap before pushing. Stage the auto-edit so the commit completes — the dev fills in the description later (we'll surface the TODO in CI).
- For deleted files: assert the row was removed from `CODE_REPO.md` in the same commit.

**Wire into the existing chain:** check `package.json` for a current `lint-staged` or `husky` setup. If present, append the script to that chain. If neither is present, add `simple-git-hooks` (lighter than husky) as a devDependency and configure a `pre-commit` hook in `package.json`. Do NOT introduce a heavyweight framework.

#### 10e. CI guard

Add a CI job `code-repo-check` that fails when `CODE_REPO.md` contains any line with `TODO: describe`. This forces undescribed files to be filled in before merge.

#### 10f. Read-this-first protocol

- The first paragraph of `CODE_REPO.md` says: **"READ THIS FIRST. Before opening source files, read this index."** (already in 10b above.)
- Add the same line to **`CLAUDE.md`** under a new top section called **"Where to look first"**.
- Add the same line to every existing skill under `.claude/skills/uma/`.

#### 10g. Skill + docs

- `.claude/skills/uma/code-repo.md` — when to read it, when to update it, the pre-commit contract, the bootstrap script, the CI guard.
- `UMA_Architecture.md` §11 (file map) gets a one-liner at the top: *"For per-file details, see `CODE_REPO.md`. This section is the architectural overview only."*

---

### 11. Modularity audit + master skill index (carryover)

After items 3 (BYOK chokepoint), 6 (concerning-items widget), 8 (chat sidebar), 10 (cleanup) land, run a final pass:

- Each bento widget = one self-contained component with a clear props contract. Audit `src/components/dashboard/` and `src/components/health/`. Co-locate per-widget hooks under the widget file (`*.hooks.ts`) or in `src/lib/<domain>.ts` — never inline component logic into the page.
- Shared primitives in `src/components/ui/` only. If you find a `Button`-or-`Input`-shaped component anywhere else, move it.
- Store mutations only via `src/lib/store.ts` exports — no direct `localStorage.setItem("mv_patient_store_v1", …)` from components.
- Extraction pipeline accessed via the single `extractMedicalPdfFromBuffer` function — already enforced; just confirm.
- LLM access via `getLlmClient(userId, role)` from item 3 — no scattered `process.env.ANTHROPIC_API_KEY` reads anywhere except `src/lib/server/llmProviders/anthropic.ts`.

**Master skill index:** `.claude/skills/uma/component-map.md` listing every reusable component with filename, purpose, props summary, when-to-use, when-NOT-to-use, gotchas. Read first whenever a UI change is requested.

**Skill file:** `.claude/skills/uma/modularity.md` — rules above, codified.

---

## Definition of done (for every item in this batch)

- [ ] Code change works at iPhone SE (375), iPhone base (393), tablet (768), desktop (1280).
- [ ] Persona test passes (a 70-year-old can read and act on it).
- [ ] All UI uses existing CSS variables, the existing Radix-based primitives in `src/components/ui/`, Lucide icons, Space Grotesk + Fraunces fonts. No new component libraries.
- [ ] No new `text-xs` on user-facing copy. No icon-only critical actions. Tap targets ≥ 44 × 44 px.
- [ ] `CLAUDE.md` updated where stale.
- [ ] `UMA_Architecture.md` updated where the change crosses an architecture boundary (agent layer, data model, external services, env vars).
- [ ] `CODE_REPO.md` updated for every file added / removed / renamed / significantly edited (item 10 enforces this).
- [ ] Skill file under `.claude/skills/uma/` created or updated.
- [ ] `CHANGELOG.md` entry added.
- [ ] `npm run lint` clean.
- [ ] `npm test` clean.
- [ ] `npm run eval` clean (after item 9 lands).
- [ ] Murphy run for the touched surface clean (after item 7 lands).
- [ ] Screenshots saved to `screenshots/<batch>/<itemN>/` at all four widths.

If any of these are skipped, the item rolls back to in-progress. The implementer's job is not done at "code ships" — it's done at "future-Claude can find this and continue without me re-explaining."
