# UMA — Claude Code Prompt Pack

A self-contained set of prompts you can paste into Claude Code, one at a time, to fix every issue surfaced by Murphy's evaluation, satisfy the new product requirements, and ship the SwiftUI rewrite. Each prompt is independent, declares its own context, and avoids restating things prompts before it have already covered.

---

## 0 — How to read Murphy's report (do this first, before fixing anything)

The headline `0/7 tests passed` is misleading. Every single failure has the same shape:

```
Test crashed: ModelProviderError: 5 validation errors for JudgeVerdict
trait_evaluations.technical_literacy
  Input should be a valid string [type=string_type,
    input_value={'score': 'partial', 'note': '…'}, input_type=dict]
```

That is a **Pydantic schema mismatch in Murphy's own judge model** — the judge returned `{score, note}` objects but `JudgeVerdict.trait_evaluations.<trait>` was typed as `str`. None of the seven tests reached a verdict, so they were classified `Test Limitation`, not `Website Issue`. **Murphy did not actually find any failing flows on the deployed site.**

That said, the embedded `note`/`reason` strings inside those dict payloads (visible in the raw report) carry real signal that is worth treating as informal feedback, even though the judge couldn't formally grade it:

| Persona | Genuine signal worth acting on | Non-issue |
|---|---|---|
| Confused novice | "Received zero signals" after submitting empty BP form. **Confirmed** in code: `addBloodPressure` early-returns silently when systolic/diastolic are blank. | — |
| Impatient user | "May not detect or prevent" rapid resubmits. No `isSubmitting` lock on the BP `<form>`. | — |
| Happy path | "Newly uploaded document" follow-up navigation never reached. | Pipeline itself works (LlamaParse + Claude). |
| Adversarial XSS | All traits `pass` — sanitization holds. | Nothing to fix. |
| Edge case (huge name + emoji) | All `pass`. | Nothing to fix. |
| Explorer (family switch) | All `pass`. | Nothing to fix. |
| Angry user (invalid IDs) | All `pass`. | Nothing to fix. |

Two real UX gaps, one navigation polish item — everything else from this report is noise from a broken evaluator. Prompt 1 fixes the two real gaps. Prompts 2–6 cover the new product requirements you specified.

Also: ask Murphy's maintainers to make `JudgeVerdict.trait_evaluations.*` a `Union[str, dict]` or a structured submodel. That is what is actually broken.

---

## Prompt 1 — Form validation, optimistic-state, and submit-locking across all dashboard logging widgets

```
You are working in the UMA repository (Next.js 16 App Router, TypeScript, Tailwind v4,
Zod, Vitest). UMA is a consumer digital-health dashboard for adults aged 18–80 used at
1280×800+ on desktop and 390×844 on iPhone. The two interaction targets are: a confused
first-time user who clicks "Save" on an empty form, and an impatient user who double-
or triple-clicks "Add new" / submit before the previous save commits.

Industry: consumer health-records management (non-clinical companion app). Tone of
copy must be supportive and plain-English — never alarmist.

The bug, confirmed at src/components/health/DashboardHealthLogSection.tsx lines 72–98:
addBloodPressure does `if (!Number.isFinite(systolic) || ... ) return;` — silently. No
error appears, no field is highlighted, the form just sits there. Same silent-return
pattern exists in addSideEffect (line 100) and the medicine-edit form in
src/components/health/MedicineList.tsx (find it via grep `addMedicine\|saveMedicine`).

What to change

1. Replace every silent early-return with a typed Zod schema and a render of inline
   field errors:

   - At the top of DashboardHealthLogSection.tsx import `z` and define
     BloodPressureInputSchema with: systolic (int 40–260), diastolic (int 20–160),
     pulseBpm optional (int 30–220), notes optional (string ≤ 2000), loggedAtISO
     (datetime). Use `.refine` to assert systolic > diastolic.
   - Define SideEffectInputSchema similarly (description min 1, max 4000).
   - Run safeParse on submit. On failure, set a per-field errors map in component
     state and render the message under each Input as <p role="alert"> with the
     existing mv-muted/--accent-2 token for color, never red on red. Aria-describedby
     each Input to its error <p>.

2. Add an `isSubmitting` boolean per form. While true:
   - disable submit button (visually use the existing Button `disabled` styles —
     do not invent new tokens),
   - swap label to "Saving…" with an inline 12px spinner,
   - block re-entry of the handler with a guard `if (isSubmitting) return;`.

   Wrap the commit() call in a microtask + setTimeout(0) so the disabled state
   actually paints before any sync work. Re-enable in a `finally` block.

3. Idempotency for spam-clicks: generate the entry id at form-open time, not at
   submit time. If the same id is already present in healthLogs.bloodPressure,
   noop. This protects against the "clicked save 4× before the first commit
   landed" scenario described in the impatient persona.

4. After successful commit, focus the next sensible target: the "Add new" trigger
   if the form auto-closes, or the new row's first cell if it stays open. Use a
   ref + requestAnimationFrame.

5. Apply the exact same pattern to src/components/health/MedicineList.tsx for
   add/edit/delete and to src/app/upload/page.tsx for the PDF upload form.

6. UI copy (use these strings verbatim — they have been written for the
   confused-novice persona):
   - Empty systolic: "Enter the top number from your reading (for example, 120)."
   - Empty diastolic: "Enter the bottom number (for example, 80)."
   - systolic ≤ diastolic: "Top number is usually larger than the bottom number — please double-check."
   - Empty side-effect description: "Tell UMA in a few words what you noticed."

7. Post-save confirmation feedback (added after re-reading Murphy's impatient-user
   trait notes — "what to expect as confirmation" was the missing signal). On every
   successful commit:
   - Render a non-blocking toast via a new `<Toaster />` mounted in
     src/app/layout.tsx, plus an `aria-live="polite" role="status"` div whose text
     is replaced for ~5 s with the same message ("Saved your blood pressure
     reading", "Saved <medicine name>", "Logged side effect"). Build the toast as a
     35-line in-house component in src/components/ui/Toast.tsx — do not pull in
     react-hot-toast or sonner.
   - The aria-live region exists even when the toast is visually suppressed by
     prefers-reduced-motion, so screen-reader users always get the confirmation.
   - The toast pauses on hover, dismisses on click, auto-dismisses after 5 s, and
     stacks newest-on-top capped at 3.

8. Tests
   - Add tests under src/components/health/__tests__/DashboardHealthLogSection.test.tsx
     using Vitest + @testing-library/react covering: empty submit shows the four
     error strings, successful save clears state, double-submit produces exactly one
     row, the aria-live region announces the success copy.
   - Run `npm test` and `npm run lint` and resolve everything. No --no-verify.

Constraints
   - Do NOT comment out existing logic. Delete code that becomes unused.
   - Do NOT hardcode colors. Use --accent / --accent-2 / --border / --panel CSS vars.
   - Honor CLAUDE.md: plain language, "Not medical advice" stays where present, no PII
     in console.logs.

When done, summarize the diff in 6 bullets and list the new files.
```

---

## Prompt 2 — Persistent sign-in across browser quits + auto-redirect "/" → "/dashboard"

```
Repository: UMA (Next.js 16 App Router, edge + node runtimes, Prisma + Postgres).
Viewport context: same desktop/mobile breakpoints as UMA today; this change is purely
behavioral, no visual work. Industry: digital health, so the cookie must be HttpOnly
and Secure regardless of NODE_ENV; survival across browser quits is a usability ask,
not an excuse to weaken auth.

Current state
   - Session cookie name: SESSION_COOKIE = "mv_session" (src/lib/auth/sessionToken.ts).
   - Issued in src/app/api/auth/verify-otp/route.ts, refresh-session/route.ts,
     google/callback/route.ts using { httpOnly, sameSite: "lax", path: "/", maxAge:
     SESSION_MAX_AGE = 14 days } but no `secure` flag and no explicit `expires`.
   - There is no Next.js middleware. The landing page src/app/page.tsx renders
     unconditionally even when the user is signed in.

Goal
   1. A signed-in user landing on https://uma.sohamkakra.com/ is redirected
      server-side (HTTP 307) to /dashboard.
   2. To see the marketing landing page, the user must explicitly click "Sign out".
      After sign-out they land on /.
   3. Sessions survive closing and reopening the browser, on every modern browser,
      for the full 14-day life of the cookie.

Implementation

A. src/lib/auth/sessionToken.ts
   - Export a helper `sessionCookieOptions()` returning:
       {
         httpOnly: true,
         sameSite: "lax",
         path: "/",
         secure: process.env.NODE_ENV === "production",
         maxAge: SESSION_MAX_AGE,
         expires: new Date(Date.now() + SESSION_MAX_AGE * 1000),
       }
     The dual `maxAge` + `expires` is what guarantees Safari + older Chromium
     persist beyond the session. Replace every res.cookies.set(SESSION_COOKIE, …)
     call site (verify-otp, refresh-session, google/callback) to spread this.

B. New src/middleware.ts (Edge runtime)
   import { NextRequest, NextResponse } from "next/server";
   import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/sessionToken";
   - matcher: ["/", "/login"]
   - Read request.cookies.get(SESSION_COOKIE)?.value, await verifySessionToken.
   - If valid: NextResponse.redirect(new URL("/dashboard", request.url), 307).
   - If invalid: NextResponse.next() — no cookie clearing here, that is the
     refresh-session route's job.
   - Note: middleware on the Edge cannot import Prisma. Verifying the JWT is
     fine because verifySessionToken uses Web Crypto only.

C. src/app/api/auth/logout/route.ts
   - After clearing both mv_session and mv_auth, append `Location: /` and return a
     303 if called via form action; the existing JSON response stays for fetch
     callers. Confirm callers in src/components/nav/.

D. Touch-up
   - Remove the mv_auth legacy cookie if it has no remaining readers (grep first).
     If still used, leave alone.
   - Add a Vitest unit test for sessionCookieOptions that asserts secure=true in
     production and exp/maxAge are aligned to the second.

Acceptance
   - Quit browser, reopen 12 hours later → uma.sohamkakra.com lands on /dashboard.
   - 15 days later → land on / with a Sign-in CTA.
   - Sign out → land on /, then visiting /dashboard manually 302s to /login.
   - Lighthouse "Best Practices: Cookies" stays green.

Do not introduce new dependencies. No --no-verify. Run npm run build and resolve any
type errors before finishing.
```

---

## Prompt 3 — WhatsApp two-way sync: durable, idempotent, and reflected in the webapp without refresh

```
Repository: UMA (Next.js 16 App Router, Prisma + Postgres, Anthropic SDK, Twilio-
agnostic Meta WhatsApp Cloud API). Files of interest:
   - src/app/api/whatsapp/webhook/route.ts (Meta GET handshake + POST handler)
   - src/lib/whatsapp/processMessage.ts (LLM dispatch + intent → store mutation)
   - src/lib/whatsapp/client.ts (graph.facebook.com sender)
   - src/lib/store.ts (browser localStorage) and src/lib/server/* (server-side store
     mirror — open and confirm the actual filename; if absent, you will create it)

Viewport / context: desktop dashboard tab kept open while the user texts UMA from a
phone. WhatsApp is the flagship channel — anything the user does in WhatsApp must
appear in the dashboard within ~3 seconds without a page reload.

Industry: digital health. Per HIPAA-adjacent expectations, log no PHI to the console
and persist nothing in plaintext outside the database.

Hard requirements

1. Idempotency. Meta retries webhooks aggressively. Add a Prisma model
   WhatsAppDelivery { messageId String @id; receivedAt DateTime @default(now()) }
   and short-circuit POST if messageId is already present. Wrap the
   processIncomingMessage call in a transaction that creates the delivery row first.

2. Server-of-record durability. Today the LLM intents (add medicine, log dose, save
   BP, etc.) only touch the browser-local store. Move every writeable side-effect
   through src/lib/server/patientStoreServer.ts (create if missing). Schema:
       PatientStore { userId String @id, blob Json, updatedAt DateTime }
   Use Prisma upsert with optimistic-concurrency on updatedAt. Re-enrich the same
   blob via mergeExtractedDoc + enrichDocFromMarkdown rules so the parsing path stays
   identical to PDF uploads.

3. Realtime → webapp. Add `src/app/api/patient-store/stream/route.ts` exporting GET
   as a Server-Sent Events stream:
       const encoder = new TextEncoder();
       return new Response(new ReadableStream({...}), {
         headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
                    "Connection": "keep-alive" }
       });
   Backed by Postgres LISTEN/NOTIFY: in patientStoreServer.ts after a successful
   upsert, `await prisma.$executeRawUnsafe(\`NOTIFY patient_store_changed, '$\{userId\}'\`)`.
   The SSE handler holds a pg.Client subscribed to the channel and forwards events
   filtered by the authenticated userId.

   Wire the dashboard hook src/lib/store.ts → expose useLivePatientStore() that on
   mount opens an EventSource('/api/patient-store/stream'), revalidates on each
   ping by calling a small REST GET /api/patient-store, and falls back to a 30 s
   poll if EventSource fails. Connection lifecycle: close on unmount, reconnect with
   exponential backoff on error (start 1 s, cap 30 s, jitter ±20 %).

4. Linking and identity. In src/app/api/whatsapp/link/route.ts add support for the
   reverse direction: WA → webapp first-touch. If the sender's phoneE164 has no
   linked user, persist a PendingLink (token, phoneE164, expiresAt 10 min) and reply
   with "Tap https://uma.sohamkakra.com/login?wa=<token> to claim this number on UMA."
   Login flow consumes ?wa= and binds the phone number after OTP verification.

5. Outbound parity. Anything the user does in the webapp that affects medication
   schedule or labs and would normally surface a chat update should also fire a
   WhatsApp Cloud API send. Add an `intentBus` event emitter in
   src/lib/server/intentBus.ts. Webapp mutators emit; processMessage and a new
   "fan out to WhatsApp" subscriber consume. Keep this opt-in via
   profile.whatsappNotifications boolean (already in PatientStore.profile? confirm
   first).

6. Tests. Add Vitest coverage for: idempotency (replay the same payload twice → one
   row), SSE handler (fake client, expect "data: <userId>\n\n"), reconnection
   backoff. Add a Playwright e2e if Playwright is already installed; otherwise skip.

7. Observability. Use the existing logger pattern (no new deps). Log only message
   IDs, not bodies.

Failure modes to cover
   - Meta sends a status update (delivered/read/failed) — handle gracefully, do not
     mutate the store.
   - Sender's phone is unrecognized after PendingLink expires — reply with friendly
     re-link instruction, no stack trace.
   - Postgres LISTEN/NOTIFY connection drops — SSE handler reconnects, frontend hook
     falls back to polling without a perceptible gap.

Constraints
   - Do not regress signature verification (already present in webhook, lines 24–46).
   - Do not log message bodies, sender names, or any health content.
   - No --no-verify. Run `npm test`, `npm run lint`, and a manual `npm run build`.

Deliverable: PR-style summary listing every file touched, the new Prisma migration
name, and the manual smoke-test steps.
```

---

## Prompt 4 — Bento-grid dashboard redesign with elder-friendly light mode

```
Repository: UMA web app (Next.js 16 App Router, Tailwind v4, Recharts 2, Framer Motion
12, Lucide). The page being redesigned is src/app/dashboard/page.tsx and the widgets
under src/components/health, src/components/dashboard, src/components/labs.

Viewport spec
   - Desktop primary: 1440×900, fluid down to 1024.
   - Tablet: 834×1112 portrait.
   - Mobile: 390×844, single column.
   - Largest supported: 2560×1440 — bento should scale, never letterbox.

Industry: SaaS-style consumer health, but two distinct user cohorts share the screen.
   - Cohort A: 25–55-year-old self-trackers comfortable with a dense, dark-mode bento.
   - Cohort B: 60+ caregivers. They will use light mode. Minimum body type 16 px,
     line-height ≥ 1.55, contrast ratio ≥ 7:1 for text on background, no thin
     gradients as the only conveyor of meaning.

Design rules — bento-grid

1. Grid system. CSS Grid (12 col desktop, 6 col tablet, 1 col mobile), gap 16 px.
   Card sizes are constrained to a small palette to avoid the "every widget is
   different" feel:
      - hero (8×4) — At-a-glance summary
      - large (6×3) — Lab trends, Medication list
      - medium (4×3) — Next appointment, Body map
      - small (4×2) — Notifications count, Streak, BP latest, Side-effects count
      - micro (2×2) — single KPI tiles
   Persist layout per user in profile.dashboardLayout (already exists per
   src/lib/dashboardLayout.ts — extend it with a `size` enum, do not create a parallel
   model).

2. Hierarchy and dedupe. Do an audit pass across every dashboard widget. If a metric
   is a hero in card A it cannot also appear as a small KPI tile in card B. Build a
   `DashboardKpiRegistry` in src/lib/dashboardKpiRegistry.ts and have each card
   declare what it owns. Reject duplicate registration in dev with a console.error.

3. Whitespace. 32 px outer page padding desktop, 24 px gutter inside cards, never
   put two text blocks closer than 12 px vertically. Cards have 2xl (24 px) radius.

4. Border treatment.
   - Dark mode: 1 px solid var(--border) plus a `::before` overlay with
     `linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 35%,
      rgba(255,255,255,0.04) 65%, transparent 100%)` masked to a hairline, applied
     only at >=1280px to avoid FPS hits on mid-range mobile.
   - Light mode: drop the gradient overlay entirely. Use a flat `var(--border)`
     2 px ring on focus (cohort B navigates with the keyboard more than you'd
     expect). Background is var(--panel) with var(--panel-2) on hover, no shadows.

5. Motion. Cards animate in with a single 240 ms ease-out fade + 4 px translateY,
   staggered 30 ms each. Respect prefers-reduced-motion. Drag-to-rearrange uses
   Framer Motion `Reorder.Group`.

6. Charts. Recharts `<AreaChart>` for trends. In light mode, line stroke must be at
   least 2.5 px and use direct value labels at the line endpoints rather than
   relying on color alone (cohort B is more likely to be color-impaired).

7. Typography. `clamp(15px, 0.95vw, 17px)` for body in dark mode; `clamp(17px,
   1.1vw, 20px)` in light mode. Keep the existing `mv-title` / `mv-muted` utilities;
   override the resolved values in src/app/globals.css under the .light selector.

8. Card content rules
   - Hero (At a Glance): 1 sentence summary, max 3 inline pill-shaped flags. No
     bullet lists. Tap reveals the full summary in a Sheet.
   - Lab trends large card: top 3 pinned trends as 96 px-tall sparklines side by
     side, with a sticky "Manage" affordance.
   - Medication list large card: virtualised with @tanstack/react-virtual when
     count > 12. Per-row left-swipe (touch) reveals "Mark missed", right-swipe
     reveals "Logged". Mouse equivalents: kebab menu.
   - Notifications small card: count + the single most recent line. No nested
     scroll.
   - Body map medium card: SVG inherits currentColor; in light mode use --fg at
     65 % opacity to soften the silhouette so labels stay legible.

Interactions
   - "Edit dashboard" toggle reveals 8 px dashed outline on each card, drag handles
     in the upper-left corner, and a per-card size selector (hero/large/medium/
     small/micro). Done button persists via PATCH /api/patient-store.
   - Keyboard: each card is a landmark (role="region", aria-labelledby). Tab order
     follows visual reading order, not DOM order — use tabIndex thoughtfully.
   - All KPI tiles are <button> when they navigate, not <div onClick>.

Tech stack constraint set
   - No new CSS framework, no shadcn pull, no MUI. Stick with Tailwind v4 + the
     existing `tool-tile`, `mv-card-muted`, `mv-surface` utility classes —
     extend them in src/app/globals.css if needed.
   - No bundle bloat: budget the new code at +35 KB gzipped.

Acceptance
   - Lighthouse: Performance ≥ 92 mobile, Accessibility = 100, Best Practices = 100.
   - axe-core run via `@axe-core/playwright` reports 0 critical violations.
   - prefers-reduced-motion screenshots match the still-shot baselines.
   - Resize from 2560 → 360 produces no horizontal scroll at any width.

Deliverables
   - Updated dashboard page + extracted <BentoGrid /> primitive in
     src/components/dashboard/BentoGrid.tsx.
   - Storybook stories not required (we don't run Storybook); a single
     /dashboard?demo=1 query that loads a deterministic seed for screenshot diffs is.
   - 5-bullet diff summary at the end of the run.
```

---

## Prompt 5 — Native SwiftUI iOS app (Live Activity, Dynamic Island, customizable widgets)

```
You are creating a NEW Xcode project that replaces /mobile (Expo + React Native). The
final repo layout you must produce:

   /ios-app/
     UMA.xcodeproj
     UMA/                  ← main iOS app target (SwiftUI)
     UMAWidgets/           ← WidgetKit extension
     UMALiveActivity/      ← ActivityKit Live Activity (separate widget extension)
     UMAShared/            ← Swift package, shared models + networking
     Tests/
     README.md
   /mobile/  ← keep for now; mark DEPRECATED in mobile/README.md, do not delete

Tooling
   - Xcode 16 / iOS 18 minimum deployment target.
   - Swift 6 strict concurrency on, Swift Testing (XCTest only for UI tests).
   - SwiftUI as the only view layer. UIKit only via UIViewRepresentable when
     unavoidable (e.g., PHPickerViewController).
   - Swift Package Manager for dependencies. Add only:
       - swift-async-algorithms (Apple, for SSE)
       - KeychainAccess (jrendel/KeychainAccess)
       - Nothing else. No Alamofire, no SnapKit, no R.swift.

Industry context
   - Consumer digital-health companion for the same UMA backend you already ship.
     Network calls go to https://uma.sohamkakra.com/api/* — full parity, including
     POST /api/extract, GET /api/patient-store, the new SSE stream from Prompt 3,
     and the WhatsApp link flow.

Viewport & device matrix
   - iPhone SE (375 × 667), 15/16 base (393 × 852), Pro Max (440 × 956), iPad mini
     (744 × 1133) in compact-width.
   - Dynamic Type from xSmall to AX5; layout never clips at AX3.
   - Both .light and .dark, plus High Contrast variants.

Design language
   - Use Liquid Glass materials (introduced in iOS 18) where the device opts into
     them: `.glassEffect()` modifier on top of `Material.regular`. On older OS and
     when the user enables Reduce Transparency, fall back to `.regularMaterial`.
   - Typography: SF Pro for body, SF Pro Rounded for numerics in cards (heart-rate,
     BP, lab values), SF Mono only for raw numeric streams. Use Apple's
     dynamic-type text styles (`.title3`, `.body`, `.callout`) — never hardcoded
     point sizes.
   - Color: only system colors (`.primary`, `.secondary`, `.accentColor`,
     `Color(.systemGroupedBackground)`). The brand accent is set in
     Assets.xcassets/AccentColor with Any/Dark variants.
   - Haptics: UISelectionFeedbackGenerator for swipe-action arming,
     UINotificationFeedbackGenerator(.success) on dose-logged, .warning on save
     failures.

Information architecture (parity with the webapp dashboard)
   - TabView with 4 tabs: Today, Records, Chat, Profile.
   - Today is the bento equivalent — a vertically scrolling LazyVGrid with adaptive
     items min-width 168 pt, customizable order via long-press → drag. Persist
     layout in shared App Group UserDefaults so widgets read the same order.

Thumb-zone rules
   - Primary actions sit in the bottom third of the screen on every leaf view. Use
     `.safeAreaInset(edge: .bottom)` for sticky CTAs; never put a destructive action
     in the top bar.
   - Lists use `.swipeActions(edge: .leading) { Button("Add") {...} }` for "Mark as
     taken" and `.swipeActions(edge: .trailing, allowsFullSwipe: true) { Button(role:
     .destructive) {...} }` for delete. Buttons are 64 pt tall with SF Symbols 4
     icons, label below — fully reachable for one-handed iPhone Pro Max use.

Live Activity (UMALiveActivity target)
   - ActivityAttributes payload:
       struct DoseAttributes: ActivityAttributes {
         struct ContentState: Codable, Hashable {
           var medicationName: String
           var dueAt: Date
           var progress: Double  // 0.0 – 1.0 (time-since-due / window)
           var status: Status   // .pending / .takenEarly / .missed
         }
         let medicationId: String
         let scheduleId: String
       }
   - Lock-screen layout: high-contrast pure-black background in dark mode, white SF
     Rounded numerics, a 64 pt circular ProgressView styled
     `.progressViewStyle(.circular)` with stroke 6 pt and a subtle gradient using
     AngularGradient(.primary opacity 0.2 → 1.0). Light-mode variant: white BG, ink
     text, the same ring with green→amber→red tint based on status.
   - Dynamic Island: implement compactLeading (pill capsule of medication initial),
     compactTrailing (the ProgressView), minimal (just the ring), and expanded
     (medication name, "Take by HH:mm", "Logged" / "Missed" buttons that fire
     `LiveActivityIntent`s). Adapt only when truly required — do not force the
     expanded view; let the system pick.
   - Update cadence: app/server pushes via push tokens (BackgroundTasks +
     PushKit/APNs through your existing backend) at start, halfway, and on user
     action. End the activity automatically 30 min after dueAt.

Widgets (UMAWidgets target)
   - Three families: systemSmall, systemMedium, systemLarge — and accessoryCircular
     + accessoryRectangular for the lock screen / Smart Stack.
   - User-customisable content via WidgetConfigurationIntent (Apple Intents). Each
     family exposes a `Top Item` enum picker: Next dose / Latest BP / HbA1c trend /
     Step count today / Notification count. The user picks per-instance — that is
     the "most important stuff at the top" requirement.
   - All widgets use the same shared App Group (group.com.sohamkakra.uma) for the
     PatientStore snapshot. Refresh policy: TimelineReloadPolicy.after(.now +
     900 s) plus immediate reload triggered from the app whenever the SSE handler
     receives a state change.
   - Visuals: SF Pro Rounded for the headline numeric, the system background
     gradient for medium/large, ContainerBackground(for: .widget) so the OS chooses
     the appropriate material; do NOT hardcode any background color.

Networking
   - UMAShared/Networking/UMAClient.swift exposes async functions:
        func fetchStore() async throws -> PatientStore
        func streamStore() -> AsyncThrowingStream<PatientStore, Error>
        func uploadPDF(_ url: URL) async throws -> ExtractedDoc
        func sendChat(_ text: String, attachments: [URL]) async throws -> ChatReply
   - SSE built on URLSession.bytes with a custom AsyncSequence parser. Backoff: 1 s,
     2 s, 5 s, 10 s, 30 s; jitter ±25 %.
   - Auth: OTP login mirroring the webapp; the session token is stored in Keychain
     (kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly).

Accessibility
   - Every actionable view gets an explicit .accessibilityLabel and
     .accessibilityHint. Charts use .accessibilityRepresentation { ... } emitting an
     AudioGraph-friendly description. Test with VoiceOver on each tab in CI via
     fastlane scan + xcodebuild test-without-building.

Testing
   - Swift Testing for ViewModels and UMAClient.
   - XCUITest for: Today tab swipe-to-log, Live Activity ring update on dose log,
     Widget configuration round-trip, Liquid Glass fallback when Reduce Transparency
     is enabled.

Deliverables
   - The full Xcode project committed under /ios-app, building cleanly with
     `xcodebuild -workspace UMA.xcworkspace -scheme UMA -destination 'platform=iOS
     Simulator,name=iPhone 16'`.
   - README.md describing entitlements (App Groups, Push, ActivityKit) and the
     fastlane match steps for code-signing.
   - A migration note in /mobile/README.md pointing to /ios-app and stating the
     React Native target is in maintenance-only mode until parity is confirmed.

Constraints
   - Do not duplicate business logic from the webapp; mirror it through the API.
   - Do not introduce a database layer locally — Keychain for secrets, App Group
     UserDefaults for the cached store, Files API for PDF uploads. Nothing else.
   - Do not commit any secrets. .env-style values come from xcconfig referencing
     CI variables.
```

---

## Prompt 6 — Hardening pass: 404s, dead-code purge, and Zod-on-every-route

```
Repository: UMA. This is a sweep, not a feature. Purpose: close the long tail of
small issues so the next eval (Murphy v2 once Anthropic fixes the JudgeVerdict schema)
has nothing trivial to find.

Viewport / context: every Next.js route, both /pages-equivalent App Router segments
and /api endpoints. Industry: digital health — every error path must use plain
language, never expose internals.

Tasks

1. /documents/[id] never throws.
   - Inspect src/app/docs/[id]/page.tsx (note: route segment is `docs`, not
     `documents` — the marketing copy referencing /documents/[id] is wrong; pick one
     and redirect the other).
   - Decide on /docs/[id] as canonical. Add src/app/documents/[id]/page.tsx that
     does `redirect(\`/docs/\${params.id}\`)` so old links work.
   - Add src/app/docs/[id]/not-found.tsx with a calm "We couldn't find this report.
     It may have been removed, or the link is incorrect." plus a "Back to dashboard"
     button.
   - In the page: validate params.id with z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).
     On parse failure, return notFound() — do not throw.

2. Dead code purge.
   - Run `git grep -nE '^[[:space:]]*//.*(TODO|FIXME|XXX|DEPRECATED)'` and
     `git grep -nE '^[[:space:]]*/\*'` across src/ and mobile/.
   - For each hit: if the commented block is genuinely dead, DELETE it (do not
     re-comment, do not annotate). If it is intentional documentation, convert to a
     /** JSDoc */ above the symbol it describes.
   - Run `npx ts-prune` (install as devDependency if missing). Delete every export
     reported as unused that has no test coverage. Re-run `npm run build` and
     `npm test`.

3. Zod everywhere.
   - For every route under src/app/api/**/route.ts: confirm a `BodySchema` /
     `ParamsSchema` exists and is run before any side effect. If a route reads
     `await req.json()` directly without parsing, add a schema. The `whatsapp/link`
     and `trackers/*` directories are the most likely offenders.
   - Centralize repeated schemas (E.164 phone, ISO date, doc id) in
     src/lib/schemas.ts. Import-not-redeclare.

4. Logging hygiene.
   - Sweep for `console.log` that prints any of: req.body, message text, email,
     phone, name, DOB, lab values. Replace with structured `log.info({ event,
     userIdHash })` calls using the existing logger; if there is no logger, create a
     thin wrapper at src/lib/log.ts that wraps console and is no-op in production
     unless `LOG_LEVEL` is set.

5. Re-run the test suite.
   - `npm run lint`, `npm test`, `npm run build` must all pass without
     `--no-verify`, without `// eslint-disable-next-line` newly added, and without
     `@ts-expect-error`. If you're tempted to add any of those, surface it and ask.

Deliverable: a ledger of every file touched, grouped by the five tasks above, plus
the resulting `npm test` summary.
```

---

## Prompt 7 — Two findings from manual spot-checking the live site

```
Repository: UMA. Two follow-ups uncovered by hand after Murphy's eval, both small and
both bounded to specific files. Treat as one PR.

Viewport / context: dashboard at src/app/dashboard/page.tsx (the Your medicines
widget) and the medication input forms at src/components/health/MedicineList.tsx.
Industry: consumer health — names, doses, and notes from this screen flow into the
chat agent's system prompt, the printable visit-summary PDF, and outbound WhatsApp
messages, only one of which (the React DOM) escapes HTML aggressively.

Finding 1 — Auto-tracking badge is silently hidden for every med whose
trackingMode is undefined.

Root cause is a default-value mismatch inside the same component:
   - dashboard/page.tsx line 1715: `const isAuto = m.trackingMode === "auto";`
   - dashboard/page.tsx line 1798: `(m.trackingMode ?? "auto") === "auto"`
The downstream auto-logging engine (src/components/notifications/AutoModeRunner.tsx)
also treats undefined as auto. So a freshly added medicine is auto-logged, the text
label says "Auto-tracking", but the visual ⚡ pill on the dashboard tile is missing.
That is why VB12 (explicitly saved as "auto" via the edit form) is the only one
with the badge.

Fix: change line 1715 to
   const isAuto = (m.trackingMode ?? "auto") === "auto";
That single change makes the badge consistent with the rest of the system. Do not
remove the badge — it is a load-bearing affordance per the dashboard spec.

Then sweep `src/` for any other read site that compares `trackingMode === "auto"`
strictly and fix them the same way. Also update the medicine-edit form so saving an
existing medicine always writes the resolved trackingMode back explicitly — that
prevents future `undefined` from slipping in.

Finding 2 — Medicine name field accepts raw HTML / script payloads.

Manual check: typing `<script>alert('xss')</script>` into the medicine-name field
saves successfully. React's render path escapes it so nothing executes (this is why
Murphy's judge correctly scored "pass" for the security trait), but the literal
string is now in localStorage, gets serialized into the LLM system prompt for chat,
emitted into the printable visit summary, and sent over the WhatsApp Cloud API
where escaping is not guaranteed downstream. A real medicine name never contains
angle brackets, null bytes, or control characters — this is a data-integrity bug,
not a sanitization-on-render bug.

Fix: in src/lib/schemas.ts (created in Prompt 6), add:
   export const medicationNameSchema = z
     .string()
     .trim()
     .min(1, "Enter the medicine's name.")
     .max(120, "Medicine name is too long — please shorten it.")
     .regex(/^[\p{L}\p{N}\p{M}\s\-.,'’()/+&%]+$/u,
       "Medicine names use letters, numbers, and basic punctuation — please re-check what you typed.");
   export const medicationDoseSchema = z
     .string()
     .trim()
     .max(60, "Dose is too long — keep it short, e.g. 500 mg.")
     .regex(/^[\p{L}\p{N}\p{M}\s\-.,/]+$/u,
       "Dose uses numbers, units, and basic punctuation only.");
   export const medicationNotesSchema = z
     .string()
     .trim()
     .max(2000)
     .refine((v) => !/[<> --]/.test(v),
       "Notes can't contain HTML or control characters.");

Apply the schema in:
   - the add/edit handlers in src/components/health/MedicineList.tsx
   - the chat-driven medication-update intent in src/lib/chatMedicationIntakeInfer.ts
     (look for where the LLM-extracted name is committed back to the store)
   - the WhatsApp processIncomingMessage path in src/lib/whatsapp/processMessage.ts
   - the PDF extraction merge in src/lib/store.ts → mergeExtractedDoc, BEFORE the
     dedupe step. If an extracted name fails validation, log a structured warning
     (no PII), keep the rest of the doc, drop just that medication entry.

Use the same inline error pattern Prompt 1 added — never silent return.

Tests
   - Vitest in src/lib/__tests__/schemas.test.ts: every schema accepts a happy-path
     value and rejects each of: empty, leading/trailing whitespace only, raw HTML,
     null byte, length over the limit, RTL marker without other content.
   - Add a regression test that mergeExtractedDoc skips a malformed extracted-name
     entry without dropping the rest of the doc.

Constraints
   - Do not strip HTML and accept the rest. Reject and tell the user.
   - Unicode-aware regex (\p{L}\p{N}\p{M}, "u" flag) — names like "Levothyroxine 75µg"
     and "Co-amoxiclav" must pass.
   - No --no-verify. Run `npm test`, `npm run lint`, `npm run build`.

Deliverable: one-bullet diff per file plus the updated test count.
```

---

## Prompt 8 — Verify and repair the PDF upload → document-detail happy path

```
Repository: UMA. Re-reading Murphy's truncated trait notes for Test 1 (Happy path
user uploads a PDF lab report and views AI analysis), 3 of 5 traits scored "fail" and
2 scored "partial". The surviving fragments — "not work as expected", "pipeline
validation", "generated to verify", "proved unfruitful", "newly uploaded document" —
collectively imply the agent uploaded a PDF, did not see a navigable affordance to
the resulting document, and could not reach the detail page to verify the AI
analysis. This is the core happy path. Treat it as potentially broken until proven
otherwise.

Viewport / context: 1280×800 desktop and 390×844 mobile. The flow under test is
src/app/upload/page.tsx → /api/extract → src/app/docs/[id]/page.tsx. Industry:
consumer health; the upload-to-explanation loop is the core promise of the product.

Step 0 — Reproduce before fixing
   - Spin the dev server with a real LLAMA_CLOUD_API_KEY and ANTHROPIC_API_KEY.
   - Upload one of the sample PDFs in /docs/sample-reports/ (or any short lab PDF).
   - Capture: network panel for /api/extract latency and status, the response body,
     the localStorage `mv_patient_store_v1` diff, the upload page state immediately
     after the request resolves, and the full DOM tree under the "Upload documents"
     card.
   - Note explicitly: is there a clickable link to the new doc? Does it appear in
     the dashboard card without a manual refresh? Does navigating to /docs/<newId>
     render the AI summary, or does it 404 / loading-spinner forever?
   - Write the findings into a 10-line scratchpad at top of the diff PR description
     before changing any code. This is a verification-driven prompt; do not skip
     this step.

Step 1 — Fix any of these defects you find (only the ones you actually find)

A. Upload returns 200 but the new doc is not visible until the page reloads.
   Cause is almost always: setState in upload/page.tsx mutates the local copy of the
   store but does not call the shared commit() that triggers the dashboard's
   useSyncExternalStore subscriber. Repair by routing through
   src/lib/store.ts → mergeExtractedDoc → commit, and verify the upload page reads
   the same store via the same hook the dashboard uses.

B. Upload returns 200 but no anchor element is rendered linking to /docs/<id>.
   Add an inline confirmation card directly inside the upload modal: doc title,
   plain-language one-line summary, two buttons — "Open report" (Link to
   /docs/<id>, primary) and "Upload another" (resets the form). Do NOT auto-redirect;
   the user just chose to come here, ripping them away is hostile.

C. /api/extract is throwing or returning a 500. Inspect the response, capture the
   stderr, and fix the root cause. Likely culprits: (1) LlamaParse credit exhaustion
   not falling back cleanly to the Claude full-PDF path — verify the fallback in
   src/lib/medicalPdfPipeline.ts triggers on HTTP 402 *and* on network error, (2)
   the Zod parse of `uma-meta` rejecting valid output because of a recent schema
   change, (3) the markdown artifact regex in parseMarkdownArtifact.ts losing edge
   cases.

D. /docs/[id] renders forever / blank because the doc id in the URL doesn't match
   what was committed (different id-generation paths). Audit newDocId() callers and
   ensure the id used in the redirect/anchor is the same id stored in
   `store.docs[].id`.

E. The dashboard "Upload documents" card filters out brand-new docs (e.g. by
   dateISO null, or by an `isProcessed` flag that never flips). Fix the filter and
   the flag transition together.

Step 2 — Add a smoke test that prevents regression
   - Vitest integration test in src/app/api/extract/__tests__/extract.smoke.test.ts
     that POSTs a fixture PDF, asserts a 200 with a non-empty doc, and asserts the
     returned id is a parseable URL segment.
   - A Playwright e2e (only if Playwright is already installed in this repo —
     check package.json first; if not, skip) that uploads a PDF, expects the
     "Open report" button to appear, clicks it, and asserts the AI summary panel
     renders within 10 s.

Step 3 — Defensive UI on /docs/[id]
   - If the doc is found but `summary`, `labs`, and `sections` are all empty, show
     a calm fallback: "We saved this report but couldn't pull anything out of it.
     Try uploading a clearer scan, or open the original PDF." with an action to
     retry extraction (POST /api/extract?docId=<id>&reprocess=1, which you will
     also add — read-after-write idempotent, capped to 3 reprocesses per doc).
   - If the doc is genuinely missing (after Prompt 6's notFound() handling), keep
     that 404 page and do not regress it.

Constraints
   - Do not log the PDF body or extracted patient names.
   - Do not bypass the existing rate limit on /api/extract.
   - No --no-verify. Run `npm test`, `npm run lint`, and `npm run build`.

Deliverable: the 10-line repro scratchpad at the top of the PR, then a categorized
list of fixes (A–E above) marked applied / not-needed, then the new test files.
```

---

## Suggested running order

1. Prompt 6 first — gives you a clean baseline.
2. Prompt 8 — verify the upload happy path before anything else; if it's broken, it dwarfs the rest.
3. Prompt 1 — closes the BP form gap and adds the post-save confirmation toast.
4. Prompt 7 — small, ships in the same PR window as Prompts 1 and 6.
5. Prompt 2 — auth UX win, low risk.
6. Prompt 3 — flagship WhatsApp work; longest blast radius, do it after the easy wins.
7. Prompt 4 — visual redesign, depends on 3 for the SSE-backed live updates.
8. Prompt 5 — independent track, can run in parallel from day 1 but won't ship until backend parity (3) is in.

When you're done, ask Anthropic / Murphy's maintainers to fix the `JudgeVerdict.trait_evaluations` Pydantic typing so the next eval reports actual outcomes instead of swallowing them as test limitations. That is the upstream bug behind 0/7.
