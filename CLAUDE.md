# UMA — CLAUDE.md

## Project Vision

UMA (Ur Medical Assistant) is a personal health companion that bridges the gap between raw medical data and human understanding. The core idea: connect to any hospital or clinic database the user has visited, pull their records into one place, and present everything in plain language that a non-medical person can actually understand and act on.

**Target persona: elderly / non-technical users.** Every UI decision must pass the test: "Can a 70-year-old with no medical training read this and know what to do next?" Use large touch targets, clear labels, no icon-only buttons for critical actions, and never rely on hover-only affordances.

There are two primary views:

---

### 1. Dashboard (Health Overview)

The dashboard is the user's health home base. It should feel like a calm, well-organised summary of their body over time — not a clinical records dump.

Key dashboard sections:
- **Health trends** — charts of key biomarkers (HbA1c, LDL, glucose, etc.) over time, auto-populated from uploaded documents
- **Latest reports** — most recent lab reports, imaging summaries, diagnoses, prescriptions shown in a timeline
- **Medication tracker** — active medications with dose, frequency, start/end dates, and adherence notes; includes scheduled injections (e.g. monthly B12, quarterly vaccinations)
- **Quick profile snapshot** — name, DOB, conditions, allergies, primary care provider, next visit date
- **Doctor visit summary export** — printable/PDF one-pager for clinician visits
- **Blood pressure log** — manual BP + pulse entries with date/time; shown in the Health Log bento widget
- **Side effects & symptoms log** — free-text symptom entries with severity and date

The dashboard language must be friendly and plain. Avoid raw clinical jargon without explanation. The goal is for a non-professional to look at it and say "I understand what is happening with my body."

---

### 2. Chat Interface (Health Companion)

A conversational AI agent the user can talk to about their health. It is NOT a diagnosis engine — it is a knowledgeable companion that helps the user understand and manage their health day-to-day.

Chat capabilities (to build toward):
- **Answer health questions** using the user's own stored records as context — "What was my last HbA1c?" "Am I still on Metformin?"
- **Book appointments** with doctors from any linked hospital or clinic
- **Recommend doctors** based on the user's conditions, location, and preferences when needed
- **Medication reminders** — proactively ask whether the user has taken their meds; track adherence conversationally
- **Wellness check-ins** — periodically ask how the user is feeling (mood, symptoms, energy) in a gentle, non-overwhelming way; one question at a time, not a form
- **Explain reports in plain English** — when a new document is uploaded, explain what it means without alarming language
- **Follow-up nudges** — remind about upcoming injections, scheduled visits, or pending referrals

Chat design principles:
- Never ask multiple questions at once — one question, wait for response
- Never be alarmist; frame everything supportively
- Never provide diagnosis or replace clinical advice — always note when the user should speak to a doctor
- Maintain context across the conversation (remember what the user said earlier in the session)

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **UI**: Tailwind CSS v4, custom CSS variables for theming (dark/light)
- **Components**: Custom component library in `src/components/ui/` (Button, Card, Badge, Input)
- **Charts**: Recharts (AreaChart for lab trends)
- **Icons**: Lucide React
- **PDF ingestion**: Two-stage pipeline — **LlamaParse** (free tier, 10k credits/month, 3 credits/page) extracts raw markdown via OCR; **Claude Haiku** structures the text. Falls back to Claude full PDF (`document` block) when LlamaParse credits are exhausted or `LLAMA_CLOUD_API_KEY` is absent.
- **AI extraction**: Anthropic API via `@anthropic-ai/sdk` — either text structuring (post-LlamaParse, cheaper) or PDF `document` block with **citations enabled**. Both paths use a free-form reply: small **`uma-meta` JSON fence** (metadata + patient names) plus **`markdownArtifact`** body (no API JSON Schema — avoids Anthropic union-type limits)
- **State / storage**: `localStorage` via `src/lib/store.ts` (`mv_patient_store_v1` key); no backend DB yet
- **Runtime**: Next.js API routes (`/api/extract`, `/api/chat`) running on Node.js

---

## Project Structure

```
src/
  app/
    page.tsx              # Landing / root redirect
    layout.tsx            # Root layout with ThemeInit and ChatDock
    dashboard/page.tsx    # Main health dashboard
    upload/page.tsx       # Redirects to /dashboard (upload is done inline)
    docs/[id]/page.tsx    # Individual document detail view
    profile/page.tsx      # User profile editor
    login/page.tsx        # Login screen
    api/
      extract/route.ts    # POST — PDF → ExtractedDoc via Claude
      chat/route.ts       # POST — question + store → answer
      auth/
        login/route.ts
        logout/route.ts
  components/
    ui/                   # Button, Card, Badge, Input, cn utility
    chat/ChatDock.tsx     # Floating chat widget used in root layout
    dashboard/
      BentoGrid.tsx       # Individual bento card wrapper (motion.div with inline grid spans)
      DashboardGrid.tsx   # Grid layout renderer (reads layout from store)
      DashboardEditToolbar.tsx  # Edit mode toolbar (DISABLED — editMode=false always)
    health/
      DashboardHealthLogSection.tsx  # Blood pressure + side effects cards (single-column layout)
      BmiCard.tsx
    notifications/
      NotificationCenter.tsx  # Bell icon + popover notification list
    nav/
      AppTopNav.tsx       # Sticky top nav with tabs + right-slot controls
      LandingHeader.tsx   # Public landing/login header
    theme/ThemeInit.tsx   # Applies theme from store on mount
    theme/ThemeToggle.tsx # Dark/light toggle
  lib/
    store.ts              # localStorage read/write, seed data, mergeExtractedDoc, removeDoc
    types.ts              # PatientStore, ExtractedDoc, ExtractedMedication, ExtractedLab, etc.
    dashboardLayout.ts    # Bento grid sizes, BENTO_COL_SPAN, BENTO_ROW_SPAN, DEFAULT_BENTO_SIZES
    bmi.ts                # BMI calculation helpers (parseNumber accepts string|number|undefined|null)
```

---

## Data Model

Defined in `src/lib/types.ts`. All state lives in `PatientStore` (stored in `localStorage`):

```ts
PatientStore {
  docs: ExtractedDoc[]        // All uploaded + extracted documents
  meds: ExtractedMedication[] // Merged active medication list
  labs: ExtractedLab[]        // All lab values (append-only, deduped)
  profile: {                  // User profile
    name, dob, sex, email, phone
    primaryCareProvider, nextVisitDate
    trends: string[]          // Which lab metrics to chart on dashboard
    allergies: string[]
    conditions: string[]
    notes?: string
    bodyMetrics?: { heightCm: number; weightKg: number; waistCm?: number }
  }
  preferences: { theme: "dark" | "light" }
  notifications: UmaNotification[]
  healthLogs: {
    bloodPressure: BloodPressureEntry[]
    sideEffects: SideEffectEntry[]
    medicationIntake: MedicationIntakeEntry[]
    medicationReminders: MedicationReminderEntry[]
  }
  updatedAtISO: string
}
```

`ExtractedDoc` carries: `id`, `type` (Lab report / Prescription / Bill / Imaging / Other), `title`, `dateISO`, `provider`, `summary`, `medications[]`, `labs[]`, `tags[]`, `allergies[]`, `conditions[]`, `sections[]`.

---

## Key Behaviours & Invariants

- **Store merge logic** (`store.ts → mergeExtractedDoc`): new docs prepend; meds dedupe by lowercase name (latest wins); labs append and dedupe by `name|date|value|unit` key; allergies/conditions union-merge into profile.
- **Lab normalisation** (`standardized.ts`): canonical names like HbA1c, LDL, HDL, TSH, etc. are enforced so chart lookups and markdown tables stay consistent.
- **LLM extraction** (`extract/route.ts` → `medicalPdfPipeline.ts`): requires `ANTHROPIC_API_KEY`. Two-stage when `LLAMA_CLOUD_API_KEY` is set: LlamaParse OCR → Claude Haiku text structuring. Falls back to Claude full PDF (`document` block, citations enabled) on 402/error. Both paths produce `uma-meta` JSON + markdown; then **`parseMarkdownArtifact.ts`** fills `doc.labs`, `medications`, `allergies`, `conditions`, `sections`, `doctors`, `facilityName` from pipe tables and bullet sections. **`mergeExtractedDoc`** runs **`enrichDocFromMarkdown`** again after lexicon patches so client-side merges stay in sync. `ExtractionCost` records tokens, USD, model, `extractorSource` ("llamaparse" | "claude_pdf"), and `llamaParseCredits`. Run **`npm test`** (Vitest) for parser coverage.
- **Chat route** (`api/chat/route.ts`): uses Claude when `ANTHROPIC_API_KEY` is set (store as system context), else OpenAI if `OPENAI_API_KEY` is set, else keyword fallback. Attaching a PDF in chat runs the same extraction pipeline in parallel when `ANTHROPIC_API_KEY` is set.
- **Theme**: CSS custom properties (`--accent`, `--bg`, `--panel`, `--border`, `--fg`, `--muted`, etc.) are set by `ThemeInit` on the `<html>` element. Always use these variables, never hardcode colours.
- **BMI**: `bmi.ts → parseNumber()` accepts `string | number | undefined | null` — pass `bodyMetrics.heightCm` (stored as number) directly without converting to string first.
- **No server-side persistence yet**: everything is `localStorage`. Future work will add a backend with proper auth and hospital API connectors.

---

## Bento Grid Architecture

The dashboard uses a CSS Grid ("bento grid") in `src/app/globals.css`:

- **Desktop** (≥1024px): `repeat(12, 1fr)`, `grid-auto-rows: auto` — cards are **content-height**, no fixed row heights
- **Tablet** (640–1023px): `repeat(6, 1fr)`, `grid-auto-rows: auto`
- **Mobile** (≤639px): `1fr`, `grid-auto-rows: auto`

Widget column spans are set as **inline styles** on `motion.div` in `BentoGrid.tsx`. Row spans are **not set** — all cards are content-height. `BENTO_ROW_SPAN` still exists in `dashboardLayout.ts` but is intentionally not applied to `ReadCell`.

**Current sizes (desktop 12-col):**

| Widget | Size | Col span | Notes |
|--------|------|----------|-------|
| snapshot (At a Glance) | hero | 12 | Full width — appointment + profile summary |
| documents | large | 6 | Shows 3 docs inline + "Show more" button |
| medications | large | 6 | Shows 3 meds inline + "Show more" button |
| bloodPressure | medium | 4 | Only visible when at least 1 reading exists |
| sideEffects | medium | 4 | Only visible when at least 1 entry exists |
| labs | large | 6 | GaugeCard per flagged lab; hidden if no flagged labs |
| healthTrends | hero | 12 | Full-width chart, forced to hero size in normalizeDashboardLayout |
| bmi | small | 4 | |

**Card height rule**: Cards must NOT have internal scroll. Show ≤3 items inline; add a "View all" / "Show more" button for additional items. The card height auto-adjusts to its content.

**Health trends**: `HealthTrendsSection` auto-adjusts chart height (capped at 320px) and always renders full-width. `normalizeDashboardLayout` forces `healthTrends = "hero"` regardless of stored size.

**Labs widget**: Renders `GaugeCard` (exported from `HealthTrendsSection.tsx`) for each flagged (out-of-range) lab, deduplicated by canonical name. Only visible when flagged labs exist.

**Mobile override**: `.bento-card { grid-column: 1/-1 !important; grid-row: auto !important }` forces all cards to full-width on mobile, overriding inline styles.

**Edit dashboard**: Currently DISABLED. `editMode` is always passed as `false` to `DashboardGrid`. The edit toolbar (`DashboardEditToolbar`) and the "Edit dashboard" button have been removed from the dashboard page. Do not re-add them without explicit instruction.

---

## Notification Center

Located at `src/components/notifications/NotificationCenter.tsx`.

**Design requirements (elderly-friendly):**
- Each notification row shows ONE dismiss button (`X`, always visible, 36×36px minimum tap target)
- The dismiss button has a clear `aria-label` and `title`
- No hover-only affordances — the dismiss button is always visible
- No "selection mode" or bulk actions (too complex for elderly persona)
- Text content uses `text-sm` (14px) minimum — never `text-xs` for the main body
- "Mark all read" button in the panel header shows text label + icon (not icon-only)
- Notifications auto-mark-as-read 600ms after the panel opens
- No duplicate X buttons: previously there were two X icons per notification (one for "mark as unread", one for "dismiss") — both were non-functional. This has been fixed to a single working dismiss button.

---

## UI/UX Rules

### Layout
- The snapshot (At a Glance) card always spans full width (`hero` size = 12 columns on desktop)
- Dashboard cards on mobile are always full-width — enforced via CSS `!important` on `.bento-card`
- Health log section (`DashboardHealthLogSection`) uses single-column layout (`grid` not `grid lg:grid-cols-2`) so BP and SE cards are always stacked vertically and never hidden in narrow containers
- The outer bento card has `overflow: hidden` for border-radius clipping; inner content uses `overflow-y-auto` to allow scrolling within the fixed card height

### Responsiveness tested viewports
- iPhone SE (375px): full-width single column, content-height cards
- iPhone base (393px): same
- Tablet (768px): 6-column grid, auto-height rows
- Desktop (1280px): 12-column grid, 96px fixed rows

### Tailwind v4 specificity note
`hidden sm:inline-flex` does NOT work in Tailwind v4 — the base class's `inline-flex` overrides the utility `hidden` (same specificity, later in cascade). Use `max-sm:hidden sm:inline-flex` instead (media-query rule has higher specificity).

### Date formatting
`DatePicker` uses 2-digit year (`"15 Jun 26"`) to prevent truncation at mobile widths.

### Dark mode
- `--panel: #19252f` — deliberately brighter than `--bg: #0b1114` for visible card separation
- `--panel-2: #141e28` — subtle step between panel and bg
- `--border: #2b3e4c`

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required for PDF upload extraction and for chat when using Claude. |
| `ANTHROPIC_MODEL` | Chat model (default: `claude-haiku-4-5-20251001`). |
| `ANTHROPIC_PDF_MODEL` | PDF extraction model used when Claude does full PDF vision (default: `claude-sonnet-4-5-20250929`). |
| `ANTHROPIC_STRUCTURE_MODEL` | Claude model used to structure LlamaParse text output (default: `claude-haiku-4-5-20251001`). Falls back to `ANTHROPIC_MODEL`. |
| `LLAMA_CLOUD_API_KEY` | Optional. When set, LlamaParse is used as primary PDF extractor (10k free credits/month, 3 credits/page). Falls back to Claude full PDF on HTTP 402 or errors. |
| `OPENAI_API_KEY` | Optional chat fallback if Anthropic is not configured. |
| `OPENAI_CHAT_MODEL` | OpenAI chat model when using the fallback (default: `gpt-4o-mini`). |

---

## Development Commands

```bash
npm run dev    # Start dev server (Next.js on port 3000)
npm run build  # Production build
npm run lint   # ESLint
npm test       # Vitest unit tests (parseMarkdownArtifact, store, bmi helpers)
```

---

## Planned / Future Work

In rough priority order:

1. **Backend persistence** — move from `localStorage` to a proper database with user auth, so data persists across devices and on mobile
2. **LLM-powered chat improvements** — richer context, follow-up suggestions, chart references
3. **Medication reminder system** — scheduled notifications asking "Did you take your Metformin this morning?"
4. **Injection / recurring treatment tracker** — separate tracker for periodic injections (B12, insulin, vaccinations) with countdown to next due date
5. **Appointment booking** — integrate with hospital/clinic scheduling APIs
6. **Doctor recommendation engine** — match user conditions and location to appropriate specialists
7. **Hospital database connectors** — FHIR-compliant API integrations to pull records directly from visited hospitals/clinics
8. **Wellness check-in loop** — gentle daily/weekly prompts in chat asking how the user feels
9. **Plain-language report explainer** — on document upload, auto-generate a "what this means for you" summary in the chat
10. **iOS native app** — see `/ios-app/` for the SwiftUI + Xcode 16 project (in progress)

---

## Coding Guidelines

### General
- Keep language plain and patient-friendly everywhere it surfaces in UI copy.
- Never display raw clinical codes, abbreviations, or flags without a plain-English label next to them.
- The disclaimer "Not medical advice" must appear wherever AI-generated content is shown to the user.
- Prefer editing existing files over creating new ones.
- Do not add speculative abstractions — build exactly what the current feature needs.
- Maintain the custom CSS variable system; do not introduce Tailwind colour utilities that bypass it.
- All API routes must validate input with Zod before processing.
- Patient data is sensitive — never log PII to the console.

### UI / Component rules
- **Never add hover-only affordances for critical actions** — buttons must be visible at rest for the elderly persona.
- **Minimum tap targets**: interactive elements must be at least 44×44px on mobile. Use `h-11` or `h-10 w-10` as minimums for icon buttons.
- **No duplicate icons** — if two buttons on the same row have the same icon, one of them is wrong. Differentiate with a label or use a different icon.
- **Text size**: never use `text-xs` (12px) for anything a user must read and act on. `text-sm` (14px) is the minimum for notification bodies, card subtitles, and badge text.
- **Card scrollability**: bento cards use `overflow: hidden` on the outer wrapper (for rounded corners). Any card whose content may exceed its allocated height MUST add `overflow-y-auto` to its inner content wrapper.
- **Single-column health log**: `DashboardHealthLogSection` uses `grid` (single column) — never `grid lg:grid-cols-2`. The medium bento card (4/12 columns = ~380px) is too narrow for a 2-column sub-layout.

### Before taking a screenshot or verifying UI
Always use Playwright from the project root (`node screenshot.js`) with:
1. Cookie: `mv_session` with the dev token
2. `localStorage.setItem('mv_patient_store_v1', ...)` with realistic data including `bodyMetrics: { heightCm: 178, weightKg: 82 }`
3. `page.reload()` after setting localStorage
4. `page.waitForTimeout(2000)` after reload
5. Set viewport height to `document.body.scrollHeight` before screenshotting to capture the full page
