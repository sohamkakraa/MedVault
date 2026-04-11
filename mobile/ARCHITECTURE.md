# UMA Mobile — System Architecture

## Overview

UMA Mobile is a React Native + Expo application providing full UMA functionality on iOS, Android, Apple Watch, and Wear OS. It extends the web app with wearable integration, on-device AI for daily routine understanding, and a multi-agent system with dedicated health skills.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | React Native 0.79+ / Expo SDK 53 | Max code sharing with Next.js web app (TypeScript, types, logic) |
| Navigation | Expo Router (file-based) | Same mental model as Next.js App Router |
| State | Zustand + MMKV | Fast encrypted local storage + reactive state |
| Backend | Supabase (Postgres + Auth + Edge Functions + Realtime) | HIPAA-ready, RLS, AES-256 at rest, BAA available |
| On-device AI | Gemma 4 E2B via MediaPipe LLM Inference | <1.5GB RAM, multimodal, function-calling, 60% less battery |
| Cloud AI | Anthropic Claude (via Supabase Edge Functions) | PDF extraction, complex medical reasoning |
| Wearables | react-native-health (HealthKit) + react-native-health-connect (Health Connect) | Unified access to steps, HR, sleep, SpO2 |
| Watch apps | watchOS (SwiftUI companion) + Wear OS (Jetpack Compose) | Notifications, check-ins, quick vitals |
| Security | AES-256-GCM client-side encryption + Supabase RLS + biometric auth | Defense-in-depth for PHI |
| Charts | Victory Native | React Native-optimized charting |
| UI | Tamagui + CSS variables (matching web theme) | Cross-platform styling with web compatibility |

---

## Project Structure

```
mobile/
├── app/                          # Expo Router screens (file-based routing)
│   ├── (auth)/                   # Auth group (login, onboarding)
│   │   ├── login.tsx
│   │   └── onboarding.tsx
│   ├── (tabs)/                   # Main tabbed interface
│   │   ├── _layout.tsx           # Tab navigator
│   │   ├── index.tsx             # Dashboard / Health Overview
│   │   ├── chat.tsx              # AI Companion Chat
│   │   ├── upload.tsx            # Document Upload
│   │   ├── wearables.tsx         # Wearable Data & Insights
│   │   └── profile.tsx           # Profile & Settings
│   ├── docs/[id].tsx             # Document detail view
│   ├── _layout.tsx               # Root layout (auth gate + providers)
│   └── +not-found.tsx
├── agents/                       # Multi-agent system
│   ├── orchestrator.ts           # Routes queries to specialist agents
│   ├── types.ts                  # Agent interfaces and message types
│   ├── health-companion/         # Primary conversational agent
│   │   ├── index.ts
│   │   ├── system-prompt.ts
│   │   └── tools.ts              # Function-calling tools for this agent
│   ├── report-explainer/         # Document interpretation agent
│   │   ├── index.ts
│   │   └── system-prompt.ts
│   ├── routine-analyzer/         # On-device daily routine agent (Gemma 4)
│   │   ├── index.ts
│   │   ├── inference.ts          # MediaPipe LLM bridge
│   │   └── system-prompt.ts
│   ├── medication-tracker/       # Medication adherence agent
│   │   ├── index.ts
│   │   └── system-prompt.ts
│   └── wearable-insights/        # Wearable data interpretation agent
│       ├── index.ts
│       └── system-prompt.ts
├── components/                   # Shared UI components
│   ├── ui/                       # Primitives (Button, Card, Badge, Input)
│   ├── charts/                   # Health trend charts
│   ├── chat/                     # Chat UI components + ASCII character
│   └── wearables/                # Wearable data display widgets
├── lib/                          # Core business logic
│   ├── types.ts                  # Shared types (re-exported from web where possible)
│   ├── supabase.ts               # Supabase client + auth helpers
│   ├── store.ts                  # Zustand store (replaces web localStorage)
│   ├── encryption.ts             # AES-256-GCM client-side encryption
│   ├── sync.ts                   # Offline-first sync engine
│   ├── wearables/                # Wearable abstraction layer
│   │   ├── index.ts              # Unified API
│   │   ├── healthkit.ts          # Apple HealthKit bridge
│   │   ├── health-connect.ts     # Google Health Connect bridge
│   │   └── types.ts              # Wearable data types
│   └── ai/                       # AI integration utilities
│       ├── on-device.ts          # Gemma 4 E2B local inference
│       └── cloud.ts              # Claude API via Supabase Edge
├── supabase/                     # Supabase configuration
│   ├── migrations/               # SQL migrations
│   │   └── 001_initial_schema.sql
│   ├── functions/                # Edge Functions
│   │   ├── extract-pdf/          # PDF → structured data (Claude)
│   │   └── chat/                 # Cloud AI chat endpoint
│   └── seed.sql                  # Demo data
├── watch/                        # Watch companion apps
│   ├── ios/                      # watchOS SwiftUI app
│   └── android/                  # Wear OS Compose app
├── app.json                      # Expo config
├── package.json
├── tsconfig.json
└── eas.json                      # EAS Build config
```

---

## Security Architecture

### Threat Model

Health data is among the most sensitive PII. Our security is defense-in-depth:

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Device Security                                │
│  • Biometric auth (Face ID / fingerprint) via expo-local-authentication
│  • App lock after 5 min inactivity                      │
│  • Encrypted local storage (MMKV with encryption key)   │
│  • Certificate pinning for API calls                    │
│  • Jailbreak/root detection                             │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│ Layer 2: Data Encryption (Client-Side)                  │
│  • AES-256-GCM encryption BEFORE data leaves device     │
│  • Per-user encryption key derived from auth token       │
│  • Only encrypted blobs stored in Supabase               │
│  • Decryption happens only on authenticated device       │
│  • PDF originals encrypted at rest in Supabase Storage   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│ Layer 3: Backend Security (Supabase)                    │
│  • Row-Level Security: users can ONLY access own rows    │
│  • AES-256 encryption at rest (Supabase-managed)         │
│  • TLS 1.3 in transit                                    │
│  • JWT-based auth with short-lived tokens                │
│  • Edge Functions validate + sanitize all inputs (Zod)   │
│  • No PII in logs — structured logging without PHI       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│ Layer 4: Data Minimization                              │
│  • Store only health-relevant fields                     │
│  • Discard billing amounts, insurance IDs, SSNs          │
│  • Auto-redact non-health PII from extracted documents   │
│  • Configurable retention policies per data type         │
│  • User can delete all data with one action              │
└─────────────────────────────────────────────────────────┘
```

### What We Store vs. Discard

| Keep | Discard |
|---|---|
| Lab values, dates, reference ranges | Billing amounts, insurance claim numbers |
| Medication names, doses, frequencies | Credit card or payment details |
| Diagnosis names, ICD codes | Social Security / Aadhaar numbers |
| Doctor names, facility names | Full postal addresses (keep city only) |
| Allergies, conditions | Employer information |
| Wearable health metrics | Device serial numbers |

---

## Agent Architecture

### Multi-Agent Orchestrator

Each agent is specialized for a specific health domain. The orchestrator routes user queries to the right agent based on intent classification.

```
User Message
     │
     ▼
┌──────────────┐
│ Orchestrator │ ← classifies intent, maintains conversation context
└──────┬───────┘
       │
       ├──▶ Health Companion Agent (default)
       │    • General health Q&A grounded in user's records
       │    • Conversational, supportive tone
       │    • Runs on: Claude API (cloud)
       │
       ├──▶ Report Explainer Agent
       │    • Triggered on PDF upload or "explain my report"
       │    • Deep document analysis with citations
       │    • Runs on: Claude API (cloud) — needs full context window
       │
       ├──▶ Routine Analyzer Agent
       │    • Understands daily habits from wearable data
       │    • Personalized lifestyle suggestions
       │    • Runs on: Gemma 4 E2B (ON-DEVICE) — private, cost-free
       │
       ├──▶ Medication Tracker Agent
       │    • Proactive reminders, adherence tracking
       │    • Injection/vaccination countdown
       │    • Runs on: Gemma 4 E2B (ON-DEVICE) — low latency
       │
       └──▶ Wearable Insights Agent
            • Interprets trends in steps, HR, sleep, SpO2
            • Flags anomalies, suggests improvements
            • Runs on: Gemma 4 E2B (ON-DEVICE) — real-time
```

### Agent Design Principles

1. **Ask, don't assume**: Every agent MUST ask for clarification when context is insufficient. Never hallucinate medical information.
2. **Cite sources**: Ground every claim in the user's actual records or established medical guidelines.
3. **Escalate appropriately**: If a query exceeds an agent's skill, route to a more capable agent or recommend consulting a doctor.
4. **One question at a time**: Never overwhelm the user with multiple questions in a single response.
5. **No diagnosis**: Agents explain and inform but NEVER diagnose. Always note when professional consultation is needed.

---

## Wearable Integration

### Unified API

```typescript
interface WearableService {
  requestPermissions(): Promise<PermissionResult>;
  getSteps(range: DateRange): Promise<StepData[]>;
  getHeartRate(range: DateRange): Promise<HeartRateData[]>;
  getSleep(range: DateRange): Promise<SleepData[]>;
  getSpO2(range: DateRange): Promise<SpO2Data[]>;
  getActiveEnergy(range: DateRange): Promise<EnergyData[]>;
  subscribeToRealtime(metric: MetricType, cb: (data: any) => void): Unsubscribe;
}
```

### Platform Mapping

| Metric | HealthKit (iOS) | Health Connect (Android) |
|---|---|---|
| Steps | HKQuantityType.stepCount | Steps record |
| Heart Rate | HKQuantityType.heartRate | HeartRate record |
| Sleep | HKCategoryType.sleepAnalysis | SleepSession record |
| SpO2 | HKQuantityType.oxygenSaturation | OxygenSaturation record |
| Active Energy | HKQuantityType.activeEnergyBurned | ActiveCaloriesBurned record |
| Resting HR | HKQuantityType.restingHeartRate | RestingHeartRate record |

### Background Sync

- iOS: HealthKit background delivery with `enableBackgroundDelivery`
- Android: Health Connect change tokens with periodic WorkManager sync
- Both: Debounced push to Supabase (encrypted) every 15 minutes

---

## Offline-First Sync Strategy

```
Local Store (MMKV)  ←→  Sync Engine  ←→  Supabase (Postgres)
                           │
                    Conflict Resolution:
                    • Last-write-wins for profile fields
                    • Append-only for labs (dedup by name|date|value|unit)
                    • Prepend for documents (dedup by contentHash)
                    • Union merge for allergies/conditions
```

---

## Responsive Design

| Device | Layout |
|---|---|
| Phone (portrait) | Single-column, tab navigation, bottom sheet chat |
| Phone (landscape) | Two-column dashboard, side-panel chat |
| Tablet / iPad | Split-view: sidebar nav + content area |
| Watch (watchOS) | Complications: next med, daily steps. Notifications: med reminders, check-ins |
| Watch (Wear OS) | Tiles: vitals summary. Notifications: same as watchOS |

---

## On-Device AI (Gemma 4 E2B)

### Deployment

- Model: `gemma-4-e2b-it` (instruction-tuned, <1.5GB)
- Runtime: MediaPipe LLM Inference API via React Native bridge
- Download: On first launch, with progress indicator. Stored in app's private directory.
- Fallback: If device can't run local model (low RAM), route to Claude API.

### Privacy Guarantee

The Routine Analyzer, Medication Tracker, and Wearable Insights agents run ENTIRELY on-device. No health data leaves the phone for these agents. This is critical for user trust and regulatory compliance.

### Function Calling

Gemma 4 E2B supports function calling, enabling agents to:
- Query the local health store
- Read wearable data
- Set medication reminders
- Log wellness check-in responses
