/**
 * Medication Tracker Agent
 *
 * Manages medication adherence conversationally. Runs on-device (Gemma 4 E2B)
 * so medication history stays private.
 *
 * Responsibilities:
 * - Proactively ask about medication adherence (one at a time)
 * - Track which medications the user has taken
 * - Manage injection/vaccination countdowns
 * - Set reminders via AgentAction
 * - Never assume adherence — always ask
 * - Support users in building consistent medication habits
 *
 * Privacy: All medication tracking stays on-device.
 */

import {
  Agent,
  IntentClassification,
  OrchestrationDecision,
} from "../types";
import {
  AgentContext,
  AgentResponse,
  AgentAction,
  ExtractedMedication,
} from "../../lib/types";
import {
  createOnDeviceInference,
  OnDeviceInference,
} from "../routine-analyzer/inference";

const MEDICATION_TRACKER_SYSTEM_PROMPT = `You are a supportive medication adherence coach. Your role is to help users take their medications on time and as prescribed.

YOUR ROLE:
- Ask about medication adherence in a friendly, non-judgmental way
- Help users understand why their medications matter
- Suggest practical strategies for remembering to take meds
- Manage injection/vaccination schedules
- Set reminders and track doses
- Support users in building consistent habits

APPROACH:
- Ask ONE medication at a time, never all at once
- Use a conversational tone, not a checklist
- Normalize occasional missed doses — don't shame
- Be encouraging: "How's the Metformin working for you?" not "Did you take your Metformin?"
- Remember what the user told you earlier in the conversation

STRATEGIES TO SUGGEST:
- Link medication taking to an existing habit (breakfast, bedtime, etc.)
- Use phone reminders or alarms
- Use a pill organizer or calendar
- Ask family or caregivers for support
- Track doses on a calendar (very simple but effective)
- Set a daily alarm 30 minutes before the scheduled time

HANDLING MISSED DOSES:
- If the user forgot, ask what got in the way (was it a schedule change? Forgetfulness?)
- Suggest practical workarounds based on the root cause
- Don't scold or judge — missed doses happen to everyone
- If it's a pattern, suggest a different reminder strategy

HANDLING SIDE EFFECTS:
- If the user reports side effects, acknowledge them
- Never suggest stopping or changing the dose (only a doctor can do that)
- Suggest they talk to their doctor about adjusting the medication
- Help them decide if side effects are severe enough to warrant immediate contact

INJECTIONS AND VACCINATIONS:
- Track dates and upcoming due dates
- Remind the user a week before the injection is due
- Celebrate completed injections
- Connect injections to their purpose (e.g., "Your monthly B12 shot helps with energy")

RESPONSE STRUCTURE:
1. Start with a friendly greeting/check-in
2. Ask about ONE specific medication
3. Acknowledge their adherence (positive or supportive)
4. If they missed doses, explore why and suggest solutions
5. Set a reminder if needed
6. Ask about the next medication or close the conversation

EXAMPLE RESPONSES:

"Hey there! How's everything going with your medications this week?

Let's start with the Metformin — how many doses did you take this week? Any challenges?"

"I noticed you mentioned forgetting your evening dose. That's really common! A few things that help:
- Set a phone alarm for 7pm (right after dinner)
- Use a pill organizer so you can see which days you've taken it
- Ask someone you live with to remind you

Want to try one of these this week?"

"Great to hear you've been consistent with Metformin! How about your Lisinopril — how are you doing with the twice-daily dose?"

"I see that your B12 injection is due next Tuesday, March 18. Will you be able to get to your clinic, or does someone else give you the injection at home?"

LIMITATIONS:
- Don't suggest new medications or dosage changes
- Don't explain complex drug interactions (refer to doctor)
- Don't track medication side effects beyond mild, obvious ones
- Always encourage professional consultation for health concerns

TONE:
- Supportive and encouraging, never judgmental
- Practical and solution-focused
- Honest about challenges ("It's hard to remember multiple medications — let's find a system that works for you")`;

/**
 * Medication Tracker Agent Implementation
 */
class MedicationTrackerAgent implements Agent {
  readonly id = "medication-tracker";
  readonly name = "Medication Tracker";
  readonly description =
    "Helps you stay on top of your medications with friendly reminders and adherence tracking.";
  readonly runtime = "on-device";
  readonly systemPrompt = MEDICATION_TRACKER_SYSTEM_PROMPT;

  private inference: OnDeviceInference;
  private isInitialized: boolean = false;

  constructor(nativeModule?: any) {
    this.inference = createOnDeviceInference(nativeModule);
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const canRun = await this.inference.canRunOnDevice();
      if (!canRun) {
        console.warn(
          "Device cannot run on-device Gemma. Medication Tracker requires sufficient RAM."
        );
        return;
      }

      await this.inference.downloadModel((progress) => {
        console.log(`Medication Tracker model download: ${progress.percentComplete.toFixed(1)}%`);
      });

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize Medication Tracker:", error);
      this.isInitialized = false;
    }
  }

  /**
   * Can handle medication-related questions
   */
  canHandle(message: string, context: AgentContext): boolean {
    const medKeywords = [
      "medication",
      "medicine",
      "pill",
      "dose",
      "dosage",
      "tablet",
      "injection",
      "vaccine",
      "vaccination",
      "shot",
      "took",
      "taken",
      "reminder",
      "refill",
      "prescription",
      "did i take",
      "forgot",
      "missed",
      "adherence",
    ];

    const lowerMessage = message.toLowerCase();
    return (
      medKeywords.some((kw) => lowerMessage.includes(kw)) ||
      context.store.meds.length > 0
    );
  }

  /**
   * Process medication adherence questions
   */
  async process(
    message: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      // Ensure model is loaded
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.isInitialized) {
        return {
          message:
            "I'm unable to run medication tracking on this device right now.",
          agentId: this.id,
          confidence: "low",
        };
      }

      // Format medication list
      const medContext = this.formatMedications(context.store.meds);

      // Build context
      const userContext = `
User: ${context.store.profile.name || "Unknown"}
Email: ${context.store.profile.email || "Not provided"}
`;

      // Prepare prompt
      const fullPrompt = `${this.systemPrompt}

---

USER CONTEXT:
${userContext}

CURRENT MEDICATIONS:
${medContext}

---

User's message: "${message}"

Respond in a friendly, conversational way. If the user hasn't mentioned a specific medication, consider asking about one of their current meds. Remember:
1. Ask ONE medication at a time
2. Never ask multiple questions in a single message
3. Be supportive and non-judgmental
4. Suggest reminders or strategies if they're struggling
5. Recommend talking to their doctor for medication changes`;

      // Run inference
      const result = await this.inference.generate(fullPrompt, {
        temperature: 0.7,
        maxTokens: 512,
        topP: 0.9,
      });

      // Check if we should suggest setting a reminder
      const actions: AgentAction[] = [];
      if (
        result.text.toLowerCase().includes("reminder") ||
        result.text.toLowerCase().includes("set a reminder")
      ) {
        // Extract medication name if mentioned
        const medName = this.findMentionedMedication(result.text, context.store.meds);
        if (medName) {
          actions.push({
            type: "set_reminder",
            medication: medName,
            time: "08:00", // Default time; could be extracted from conversation
          });
        }
      }

      return {
        message: result.text,
        agentId: this.id,
        confidence: "high",
        citations: ["On-device medication tracking"],
        actions: actions.length > 0 ? actions : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Medication Tracker error:", errorMessage);

      return {
        message: `I'm having trouble right now. Please try again in a moment.`,
        agentId: this.id,
        confidence: "low",
      };
    }
  }

  /**
   * Format medications for readability
   */
  private formatMedications(meds: ExtractedMedication[]): string {
    if (meds.length === 0) {
      return "No medications recorded.";
    }

    return meds
      .map((med) => {
        let medStr = `- ${med.name}`;
        if (med.dose) medStr += ` ${med.dose}`;
        if (med.frequency) medStr += ` ${med.frequency}`;
        if (med.startDate) medStr += ` (since ${med.startDate})`;
        if (med.missedDoses && med.missedDoses > 0) {
          medStr += ` [${med.missedDoses} missed doses]`;
        }
        return medStr;
      })
      .join("\n");
  }

  /**
   * Find which medication is mentioned in the response
   */
  private findMentionedMedication(
    text: string,
    meds: ExtractedMedication[]
  ): string | null {
    const lowerText = text.toLowerCase();
    for (const med of meds) {
      if (lowerText.includes(med.name.toLowerCase())) {
        return med.name;
      }
    }
    return null;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.inference.isLoaded()) {
      await this.inference.unloadModel();
    }
  }
}

export default MedicationTrackerAgent;
export { MedicationTrackerAgent };
