# UMA Mobile Multi-Agent AI System Guide

## Overview

This guide documents the complete multi-agent AI system for UMA Mobile, a privacy-first health companion app. The system routes user messages to specialized agents that either run on-device (using Gemma 4 E2B) or in the cloud (using Claude API), with no data leaving the phone for sensitive operations.

## System Architecture

### The Five Agents

```
User Message
    ↓
Orchestrator (Intent Classification)
    ↓
    ├─→ Health Companion (Cloud - Claude)
    ├─→ Report Explainer (Cloud - Claude)
    ├─→ Routine Analyzer (On-Device - Gemma)
    ├─→ Medication Tracker (On-Device - Gemma)
    └─→ Wearable Insights (On-Device - Gemma)
```

### 1. Health Companion (`agents/health-companion/`)
**Runtime:** Cloud (Claude API)  
**Primary Role:** Conversational health knowledge companion

- Answers health questions grounded in the user's actual medical records
- Provides emotional support with a warm, patient-friendly tone
- Never diagnoses; always recommends professional consultation
- Cites specific lab values, medications, and documents
- Asks one question at a time if clarification is needed
- Includes "Not medical advice" disclaimers

**Key Files:**
- `index.ts` - Agent implementation with patient context formatting
- `system-prompt.ts` - Detailed system prompt with 1000+ lines of guidelines

**How it works:**
1. Takes user message + full PatientStore (meds, labs, docs, profile)
2. Calls Claude API with system prompt + patient context
3. Returns supportive, cited response

### 2. Report Explainer (`agents/report-explainer/`)
**Runtime:** Cloud (Claude API)  
**Primary Role:** Interpret medical documents in plain language

- Explains lab results, imaging findings, diagnoses
- Highlights important values and their meanings
- Never alarmist; frames results supportively
- Connects findings to user's known conditions
- Proposes saving documents to the store

**Triggered by:**
- User uploads PDF
- Keywords: "pdf", "document", "report", "lab result", "imaging", "explain"
- Recent documents in user's history

### 3. Routine Analyzer (`agents/routine-analyzer/`)
**Runtime:** On-Device (Gemma 4 E2B)  
**Primary Role:** Analyze daily patterns from wearable data

- Runs **entirely on-device** — no data leaves the phone
- Analyzes sleep, activity, heart rate patterns
- Identifies anomalies (e.g., sleep drop, HR spike)
- Gives personalized lifestyle suggestions
- Asks clarifying questions about routine changes

**Privacy Guarantee:** All analysis is local; patient data never sent to cloud.

**Files:**
- `index.ts` - Agent implementation
- `inference.ts` - MediaPipe LLM Inference bridge

### 4. Medication Tracker (`agents/medication-tracker/`)
**Runtime:** On-Device (Gemma 4 E2B)  
**Primary Role:** Medication adherence coaching

- Proactively asks about medication adherence (one at a time)
- Tracks which medications were taken
- Manages injection/vaccination countdowns
- Suggests practical reminder strategies
- Never shames; normalizes missed doses

**On-Device Privacy:** Medication tracking stays on the user's phone.

### 5. Wearable Insights (`agents/wearable-insights/`)
**Runtime:** On-Device (Gemma 4 E2B)  
**Primary Role:** Health metric trend analysis

- Analyzes steps, heart rate, sleep, SpO2 trends
- Flags anomalies without diagnosing
- Suggests improvements based on patterns
- Connects wearable data to known conditions
- Provides benchmark ranges (steps per day, sleep hours, etc.)

**On-Device Privacy:** All analysis local, no data transmission.

---

## The Orchestrator

### Location
`agents/orchestrator.ts`

### How It Works

The Orchestrator is the system's router. When a user sends a message:

1. **Intent Classification** - Analyzes keywords and context
2. **Confidence Scoring** - Determines how confident it is about the classification
3. **Decision** - Selects the best agent, or asks for clarification if unsure
4. **Routing** - Passes the message to the selected agent

### Intent Routing Rules

```
PDF/document keywords     → report-explainer
├─ "pdf", "document", "report", "imaging", "x-ray", "findings"

Medication keywords       → medication-tracker
├─ "medication", "dose", "pill", "injection", "adherence"

Wearable/activity keywords → wearable-insights
├─ "steps", "heart rate", "sleep", "heart rate", "exercise"

Routine keywords          → routine-analyzer
├─ "routine", "habit", "daily", "schedule", "lifestyle"

Everything else (default) → health-companion
└─ Fallback for ambiguous queries
```

### Anti-Hallucination Features

- **Confidence-based clarification** - If confidence is low, asks the user for clarification instead of routing blindly
- **Agent confidence check** - Calls each agent's `canHandle()` method; if it returns false, falls back to health-companion
- **Explicit fallback** - Always defaults to health-companion for unknown queries
- **Never guesses** - Would rather ask "Could you be more specific?" than provide incorrect information

---

## Key Files by Category

### Core Types & Interfaces
- `lib/types.ts` - Agent types (AgentId, AgentContext, AgentResponse, AgentAction)
- `agents/types.ts` - Agent contract, intent classification, orchestration types

### Agents
- `agents/orchestrator.ts` - Main router + intent classifier
- `agents/health-companion/index.ts` - Health Q&A agent
- `agents/health-companion/system-prompt.ts` - Health companion instructions
- `agents/report-explainer/index.ts` - Document interpreter
- `agents/routine-analyzer/index.ts` - Wearable pattern analyzer
- `agents/routine-analyzer/inference.ts` - MediaPipe bridge
- `agents/medication-tracker/index.ts` - Medication coach
- `agents/wearable-insights/index.ts` - Health metric analyzer

### AI Utilities
- `lib/ai/cloud.ts` - Claude API wrapper (retry logic, streaming, tool calling)
- `lib/ai/on-device.ts` - Gemma management (model lifecycle, memory checks)

---

## Usage Example

### Basic Chat Flow

```typescript
import { Orchestrator } from "./agents/orchestrator";
import { HealthCompanionAgent } from "./agents/health-companion";
import { ReportExplainerAgent } from "./agents/report-explainer";
import { RoutineAnalyzerAgent } from "./agents/routine-analyzer";
import { MedicationTrackerAgent } from "./agents/medication-tracker";
import { WearableInsightsAgent } from "./agents/wearable-insights";
import { AgentContext } from "./lib/types";

// 1. Initialize all agents
const agents = [
  new HealthCompanionAgent(),
  new ReportExplainerAgent(),
  new RoutineAnalyzerAgent(), // pass nativeModule if available
  new MedicationTrackerAgent(),
  new WearableInsightsAgent(),
];

// 2. Create orchestrator
const orchestrator = new Orchestrator();
orchestrator.registerAgents(agents);

// 3. Build context
const context: AgentContext = {
  store: patientStore, // from localStorage
  recentWearables: wearableData, // last 7 days
  conversationHistory: chatHistory, // previous messages
  userTimezone: "America/Los_Angeles",
};

// 4. Send message
const response = await orchestrator.routeMessage({
  message: "What was my last HbA1c?",
  context,
});

console.log(response.message); // "Your last HbA1c was 7.1%..."
console.log(response.agentId); // "health-companion"
console.log(response.citations); // ["Lab report from Central Clinic, Feb 28, 2026"]
```

### Understanding Intent Classification

```typescript
const decision = orchestrator.explainDecision(message, context);

console.log(decision.intent.primary); // "medication-tracker"
console.log(decision.intent.keywords); // ["dose", "pill", "took"]
console.log(decision.intent.confidence); // "high"
console.log(decision.intent.reason); // "Matched 3 keywords: dose, pill, took"
```

---

## System Prompts

### Health Companion System Prompt

Located in `agents/health-companion/system-prompt.ts`

Key principles:
- Never diagnose or replace professional medical advice
- Always cite sources (lab values, medications, documents)
- Ask ONE question at a time
- Maintain supportive, non-alarmist tone
- Recommend professional consultation when appropriate
- Include "Not medical advice" disclaimers

**Length:** ~1,000 words of detailed guidelines with example responses

### Other Agent Prompts

Embedded in each agent's `index.ts` file as `const <AGENT>_SYSTEM_PROMPT`:

- **Report Explainer** - Plain-language medical interpretation
- **Routine Analyzer** - Wearable pattern analysis (1000+ chars)
- **Medication Tracker** - Adherence coaching (1000+ chars)
- **Wearable Insights** - Health metric trend analysis (1500+ chars)

---

## Cloud vs. On-Device Decision Matrix

### Use Cloud (Claude API)
- Complex medical document analysis (PDFs, imaging)
- General health knowledge questions
- Nuanced medical interpretation
- Need for detailed, contextual responses
- User's full medical history needed

**Agents:** Health Companion, Report Explainer

### Use On-Device (Gemma 4 E2B)
- Wearable data analysis (local only)
- Routine/habit tracking (no data transmission)
- Medication adherence (privacy-first)
- Daily wellness check-ins
- Anything where the user's privacy is paramount

**Agents:** Routine Analyzer, Medication Tracker, Wearable Insights

### Privacy Principle
**Nothing sensitive leaves the phone.** On-device agents analyze patient data locally and never transmit it to cloud servers. Only intentional cloud calls (e.g., for Claude's medical knowledge) send patient context, and that context is stored only for the duration of the request.

---

## Error Handling & Fallbacks

### Cloud AI Errors
- **401 Unauthorized** → Check API key
- **429 Rate Limit** → Retry with exponential backoff (1s → 2s → 4s)
- **500 Server Error** → Graceful message: "Claude API temporarily unavailable"
- **Network error** → Fallback to on-device if available
- **Default fallback** → "I'm having trouble right now. Could you try again?"

### On-Device Errors
- **Model not loaded** → Download on first use (with progress callback)
- **Insufficient RAM** → Fall back to cloud AI
- **Inference timeout** → Return null; caller decides next step
- **Model download failure** → Disable on-device agents, use cloud

### Agent Fallbacks
- **Any agent fails to handle** → Route to health-companion
- **Orchestrator confidence too low** → Ask for clarification
- **Cloud API unavailable** → Suggest trying on-device agents
- **Complete system failure** → Offline mode with basic Q&A

---

## Implementation Checklist

### Phase 1: Core Infrastructure ✅
- [x] Agent types and interfaces defined
- [x] Orchestrator with intent classification
- [x] Cloud AI wrapper (Claude API)
- [x] On-device inference bridge (MediaPipe)

### Phase 2: Cloud Agents ✅
- [x] Health Companion agent
- [x] Report Explainer agent
- [x] Detailed system prompts

### Phase 3: On-Device Agents ✅
- [x] Routine Analyzer agent
- [x] Medication Tracker agent
- [x] Wearable Insights agent

### Phase 4: Integration (Next Steps)
- [ ] Connect to React Native UI
- [ ] Integrate with PatientStore (localStorage)
- [ ] Set up Supabase Edge Function for Claude calls
- [ ] Initialize native module for MediaPipe
- [ ] Add test suite for intent classification
- [ ] Add test suite for each agent
- [ ] Monitor latency and token usage

### Phase 5: Optimization
- [ ] Cache patient context summaries
- [ ] Implement smart retry strategies
- [ ] Add telemetry (without logging PII)
- [ ] Profile on-device inference speed
- [ ] Optimize on-device model (quantization, pruning)

---

## Important Security & Privacy Notes

### PII Handling
- **Never log patient names, dates of birth, medical record numbers**
- **Store only anonymized error messages** in logs
- **All on-device analysis is private by design**
- **Cloud requests include only necessary context**, not full medical history

### API Key Management
- `ANTHROPIC_API_KEY` must be set in environment
- For Supabase Edge Functions, inject via environment secrets
- Never commit API keys to version control
- Rotate keys regularly

### Data Minimization
- Only send to cloud what's necessary to answer the question
- On-device agents should always be preferred for sensitive analysis
- Patient wearable data never leaves device
- Conversation history stored locally only

---

## Testing Strategy

### Unit Tests
- Orchestrator intent classification
- Each agent's `canHandle()` predicate
- Keyword matching logic

### Integration Tests
- Full chat flow from message → agent → response
- Fallback mechanisms when agent fails
- Error handling and retry logic

### System Tests
- Multi-turn conversations (context preservation)
- Agent switching mid-conversation
- Cloud API unavailability scenarios
- Low-memory device scenarios

### Example Test
```typescript
describe("Medication Tracker Agent", () => {
  it("should handle medication questions", async () => {
    const agent = new MedicationTrackerAgent();
    const context = { /* setup */ };
    
    const result = await agent.process(
      "Did I take my Metformin today?",
      context
    );
    
    expect(result.agentId).toBe("medication-tracker");
    expect(result.message).toContain("Metformin"); // or ask clarifying question
  });
});
```

---

## Debugging

### Check Orchestrator Decision
```typescript
const decision = orchestrator.explainDecision(message, context);
console.log({
  primary: decision.intent.primary,
  secondary: decision.intent.secondary,
  confidence: decision.intent.confidence,
  keywords: decision.intent.keywords,
  reason: decision.intent.reason,
});
```

### Check Agent Availability
```typescript
import { getInferenceStats, isOnDeviceAIAvailable } from "./lib/ai/on-device";

console.log(isOnDeviceAIAvailable()); // true/false
console.log(getInferenceStats()); // { isAvailable, isInitializing, error }
```

### Monitor Cloud API
```typescript
// Enable logging in callCloudAI
// Check console for token counts, model info, retry attempts
```

---

## References

- **Main Types:** `/sessions/hopeful-modest-shannon/mnt/UMA/mobile/lib/types.ts`
- **Agent System:** `/sessions/hopeful-modest-shannon/mnt/UMA/mobile/agents/`
- **AI Utilities:** `/sessions/hopeful-modest-shannon/mnt/UMA/mobile/lib/ai/`

---

## Next Steps

1. **Connect to UI** - Wire up the orchestrator to your chat screen
2. **Test end-to-end** - Run a sample conversation with each agent
3. **Optimize latency** - Profile cloud vs. on-device response times
4. **Add telemetry** - Track agent usage patterns (anonymized)
5. **Expand system prompts** - Add more medical context and guidelines
6. **Implement persistent storage** - Save agent preferences and conversation history
7. **Add more agents** - E.g., appointment booking, doctor recommendations

---

**Built with privacy, safety, and patient empowerment in mind.**
