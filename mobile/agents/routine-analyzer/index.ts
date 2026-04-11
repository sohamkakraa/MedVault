/**
 * Routine Analyzer Agent
 *
 * Analyzes daily routines and wearable data patterns entirely on-device using Gemma 4 E2B.
 * NO data leaves the user's phone — all analysis happens locally.
 *
 * Responsibilities:
 * - Understand patterns in sleep, activity, heart rate, and exercise
 * - Identify anomalies (e.g., sudden sleep drop, resting HR spike)
 * - Give personalized, actionable suggestions based on the data
 * - Ask clarifying questions about lifestyle when data is insufficient
 * - Connect patterns to the user's known conditions when relevant
 *
 * Privacy: This agent never sends patient data to the cloud.
 */

import {
  Agent,
  IntentClassification,
  OrchestrationDecision,
} from "../types";
import {
  AgentContext,
  AgentResponse,
  DailyWearableSummary,
} from "../../lib/types";
import {
  createOnDeviceInference,
  OnDeviceInference,
  InferenceOptions,
} from "./inference";

const ROUTINE_ANALYZER_SYSTEM_PROMPT = `You are a personal wellness coach who understands activity patterns, sleep habits, and health trends. You analyze wearable data (steps, sleep, heart rate, energy) to understand the user's daily routine and suggest improvements.

YOUR ROLE:
- Analyze patterns in the user's wearable data
- Spot trends: improving sleep? More steps? Heart rate changes?
- Suggest practical, personalized improvements (not medical advice)
- Ask clarifying questions about lifestyle factors
- Connect patterns to their known conditions when relevant (e.g., "I see your sleep dropped after you mentioned stress")

ANALYZING WEARABLE DATA:
- Steps: 5,000-7,500 is moderate, 7,500-10,000 is good, 10,000+ is excellent
- Sleep: 7-9 hours is ideal for most adults, less than 6 is concerning
- Resting HR: Normal is 60-100 bpm; if it spikes, it might indicate stress or illness
- Sleep quality: Look for consistency; sudden drops might indicate stress or health issues

TONE:
- Be encouraging and supportive
- Celebrate improvements ("Great job maintaining 8 hours of sleep this week!")
- Frame suggestions as experiments to try, not requirements
- Acknowledge that routines change and that's normal

NEVER:
- Diagnose or suggest treating any condition
- Make assumptions about what caused a pattern
- Recommend stopping medications or treatments
- Replace professional medical advice
- Assume causation (e.g., "Your HR is high because of anxiety" — just note that it's elevated)

WHEN TO ASK CLARIFYING QUESTIONS:
- If patterns are unclear, ask about lifestyle changes, stress, or recent events
- If data is limited, ask what a typical day looks like
- If patterns seem inconsistent with what the user says, ask for context
- Always ask ONE question at a time

RESPONSE STRUCTURE:
1. Start with what you observe in the data
2. Highlight positive trends
3. Note any concerning patterns (without alarm)
4. Ask clarifying questions if needed
5. Suggest practical improvements
6. Always note: "If you're concerned about any health changes, talk to your doctor"

EXAMPLE RESPONSE:

"I'm seeing some interesting patterns in your data this week:
- Your sleep has been averaging 6.5 hours, down from 7.5 hours last week
- Your steps are steady at around 8,500 per day (good consistency!)
- Your resting heart rate is up about 5 bpm from normal

The sleep drop stands out. A few questions:
- Has anything stressful happened this week?
- Have you changed your sleep schedule or bedtime routine?
- Any caffeine or screen time changes before bed?

Once I understand what's going on, I can suggest adjustments. Usually, consistent sleep and a calm bedtime routine help a lot."

NO CLOUD CALLS:
- This agent runs entirely on-device
- All analysis happens locally on the user's phone
- Patient data NEVER leaves the device
- The user's privacy is protected by design`;

/**
 * Routine Analyzer Agent Implementation
 */
class RoutineAnalyzerAgent implements Agent {
  readonly id = "routine-analyzer";
  readonly name = "Routine Analyzer";
  readonly description =
    "Understands your daily patterns and gives personalized suggestions for better sleep, activity, and wellness.";
  readonly runtime = "on-device";
  readonly systemPrompt = ROUTINE_ANALYZER_SYSTEM_PROMPT;

  private inference: OnDeviceInference;
  private isInitialized: boolean = false;

  constructor(nativeModule?: any) {
    this.inference = createOnDeviceInference(nativeModule);
  }

  /**
   * Initialize the agent (download model if needed)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const canRun = await this.inference.canRunOnDevice();
      if (!canRun) {
        console.warn(
          "Device cannot run on-device Gemma. This agent requires sufficient RAM."
        );
        return;
      }

      await this.inference.downloadModel((progress) => {
        console.log(`Routine Analyzer model download: ${progress.percentComplete.toFixed(1)}%`);
      });

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize Routine Analyzer:", error);
      this.isInitialized = false;
    }
  }

  /**
   * Can handle questions about routine, habits, daily patterns, wearables, sleep
   */
  canHandle(message: string, context: AgentContext): boolean {
    const routineKeywords = [
      "routine",
      "habit",
      "daily",
      "schedule",
      "sleep",
      "suggest",
      "advice",
      "typical day",
      "pattern",
      "steps",
      "activity",
      "exercise",
      "lifestyle",
      "improve",
    ];

    const lowerMessage = message.toLowerCase();
    const hasKeywords = routineKeywords.some((kw) =>
      lowerMessage.includes(kw)
    );

    // Also can handle if there's recent wearable data
    const hasWearableData = context.recentWearables.length > 0;

    return hasKeywords || hasWearableData;
  }

  /**
   * Analyze wearable data and routine patterns
   */
  async process(
    message: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      // Ensure the model is loaded
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.isInitialized) {
        // Fallback if initialization failed
        return {
          message:
            "I'm unable to run the routine analysis on this device right now. Please check your internet connection for an alternative approach.",
          agentId: this.id,
          confidence: "low",
        };
      }

      // Format wearable data for analysis
      const wearableContext = this.formatWearableData(
        context.recentWearables
      );

      // Build context about the user
      const userContext = `
User: ${context.store.profile.name || "Unknown"}
Conditions: ${context.store.profile.conditions.join(", ") || "None listed"}
Known factors that affect sleep/activity: ${
        context.store.profile.notes || "Not specified"
      }
`;

      // Prepare the prompt for Gemma
      const fullPrompt = `${this.systemPrompt}

---

USER CONTEXT:
${userContext}

RECENT WEARABLE DATA (Last 7 days):
${wearableContext}

---

User's question: "${message}"

Analyze the data above and respond to the user's question. Remember:
1. Only reference data that was provided
2. Ask ONE clarifying question if you need more context
3. Never diagnose or replace professional medical advice
4. Be encouraging and positive
5. Run entirely on-device — do NOT attempt to send data anywhere`;

      // Run inference with Gemma
      const result = await this.inference.generate(fullPrompt, {
        temperature: 0.7,
        maxTokens: 512,
        topP: 0.9,
      });

      return {
        message: result.text,
        agentId: this.id,
        confidence: "high",
        citations: ["On-device analysis of wearable data"],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Routine Analyzer error:", errorMessage);

      return {
        message: `I'm having trouble analyzing your routine data right now. Please try again.`,
        agentId: this.id,
        confidence: "low",
      };
    }
  }

  /**
   * Format recent wearable data for readability
   */
  private formatWearableData(wearables: DailyWearableSummary[]): string {
    if (wearables.length === 0) {
      return "No wearable data available. Please sync your health app or wearable device.";
    }

    const lines = wearables.map((w) => {
      const parts = [`${w.date}:`];

      if (w.steps) {
        parts.push(`${w.steps} steps`);
      }
      if (w.avgHeartRate) {
        parts.push(`avg HR ${w.avgHeartRate} bpm`);
      }
      if (w.restingHeartRate) {
        parts.push(`resting HR ${w.restingHeartRate} bpm`);
      }
      if (w.sleepDurationMinutes) {
        const hours = (w.sleepDurationMinutes / 60).toFixed(1);
        parts.push(`${hours} hrs sleep`);
      }
      if (w.sleepQuality) {
        parts.push(`quality: ${w.sleepQuality}`);
      }
      if (w.activeEnergyKcal) {
        parts.push(`${w.activeEnergyKcal} kcal active`);
      }

      return parts.join(", ");
    });

    return lines.join("\n");
  }

  /**
   * Clean up resources when done
   */
  async cleanup(): Promise<void> {
    if (this.inference.isLoaded()) {
      await this.inference.unloadModel();
    }
  }
}

export default RoutineAnalyzerAgent;
export { RoutineAnalyzerAgent };
