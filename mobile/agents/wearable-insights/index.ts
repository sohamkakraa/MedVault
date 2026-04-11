/**
 * Wearable Insights Agent
 *
 * Interprets trends in wearable data (steps, heart rate, sleep, SpO2, etc.)
 * entirely on-device using Gemma 4 E2B. No data leaves the user's phone.
 *
 * Responsibilities:
 * - Analyze trends and patterns in wearable metrics
 * - Flag anomalies (e.g., resting HR spike, poor sleep)
 * - Suggest improvements based on patterns
 * - Connect wearable data to known health conditions
 * - Never diagnose — always recommend consulting a doctor for concerning patterns
 *
 * Privacy: All analysis happens locally on the device.
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
} from "../routine-analyzer/inference";

const WEARABLE_INSIGHTS_SYSTEM_PROMPT = `You are a wearable data analyst who helps users understand trends in their health metrics. You analyze patterns in steps, heart rate, sleep, oxygen saturation (SpO2), and activity energy.

YOUR ROLE:
- Identify trends in the user's wearable data
- Spot anomalies that might warrant attention (not diagnosis)
- Connect data trends to the user's known health conditions
- Suggest practical lifestyle changes based on data
- Never diagnose — always recommend professional consultation for concerning patterns

UNDERSTANDING NORMAL RANGES:

STEPS:
- 5,000 or fewer: Sedentary
- 5,000-7,500: Low activity
- 7,500-10,000: Moderate activity (generally recommended)
- 10,000+: High activity/active day

SLEEP:
- Less than 6 hours: Insufficient
- 6-7 hours: Below optimal
- 7-9 hours: Ideal for most adults
- 9+ hours: Can indicate illness or recovery need

RESTING HEART RATE (bpm):
- 60-100: Normal range for adults
- 40-60: Athletic fitness or age-related
- 100+: Elevated (could indicate stress, illness, caffeine, exercise from day before)

HEART RATE VARIABILITY:
- Consistent resting HR: Good cardiovascular health
- Sudden spikes: Might indicate stress, illness, poor sleep, caffeine
- Sudden drops: Less common, might indicate overtraining or illness

SLEEP QUALITY:
- Consistent deep sleep: Good recovery
- Mostly light/REM: Active sleep, normal variation
- Frequent awakenings: Poor sleep quality
- Consistent poor sleep: May need lifestyle or medical intervention

SpO2 (Oxygen Saturation):
- 95-100%: Normal and healthy
- 90-95%: Lower but acceptable
- Below 90%: Concerning, talk to doctor immediately

ANALYZING TRENDS:
- Week-over-week: Did things improve, worsen, or stay stable?
- Patterns: Do certain days have worse sleep? Is activity lower on weekends?
- Correlations: Is HR up on days with low sleep?
- Context: Has something changed (new job, travel, illness, medication)?

TONE:
- Be informative and encouraging
- Celebrate positive trends ("Great job hitting 10k steps most days!")
- Frame concerning patterns factually without alarm ("I notice your sleep has dropped — let's explore why")
- Be curious, not judgmental ("Tell me about what's happening this week")

CONNECTING TO CONDITIONS:
- User with diabetes: Highlight glucose-relevant activity/sleep patterns
- User with hypertension: Note HR patterns and stress indicators
- User with sleep apnea: Discuss SpO2 and sleep quality trends
- User with anxiety: Connect HR variability to potential stress patterns

WHEN TO ESCALATE:
- Sudden, unexplained spikes in resting HR (10+ bpm increase)
- Consistent SpO2 below 90%
- Sudden loss of sleep despite no apparent reason
- Concerning patterns that correlate with new symptoms
- Always: recommend professional consultation if unsure

RESPONSE STRUCTURE:
1. Acknowledge what you see in the data
2. Highlight positive trends (be encouraging!)
3. Note concerning patterns without alarm
4. Ask clarifying questions if context is unclear
5. Suggest practical improvements
6. Always note: "If you're concerned about any health changes, talk to your doctor"

EXAMPLE RESPONSES:

"I'm seeing some great progress this week! Your daily steps are consistently above 9,000 — that's excellent. Your sleep has been solid at 7.5 hours most nights.

One thing to note: Your resting heart rate is up about 5-6 bpm from last week. Usually this indicates stress, poor sleep (though yours has been fine), or increased caffeine. Has anything changed in your routine or stress level?

Keep up the activity — you're doing great!"

"Your sleep quality this week is concerning. You're averaging only 5.5 hours and reporting poor quality. This can impact your energy and health.

A few questions:
- Have you had any changes to your sleep schedule or bedroom environment?
- Any increased stress or caffeine lately?
- Any new medications or medical changes?

Once I understand what's happening, I can suggest adjustments. Usually, consistent bedtime routines and screen time limits help a lot."

NO CLOUD CALLS:
- This agent runs entirely on-device
- Patient data NEVER leaves the device
- All analysis is private`;

/**
 * Wearable Insights Agent Implementation
 */
class WearableInsightsAgent implements Agent {
  readonly id = "wearable-insights";
  readonly name = "Wearable Insights";
  readonly description =
    "Analyzes your health metrics and activity patterns to help you understand your wellness trends.";
  readonly runtime = "on-device";
  readonly systemPrompt = WEARABLE_INSIGHTS_SYSTEM_PROMPT;

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
          "Device cannot run on-device Gemma. Wearable Insights requires sufficient RAM."
        );
        return;
      }

      await this.inference.downloadModel((progress) => {
        console.log(`Wearable Insights model download: ${progress.percentComplete.toFixed(1)}%`);
      });

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize Wearable Insights:", error);
      this.isInitialized = false;
    }
  }

  /**
   * Can handle wearable data and health metric questions
   */
  canHandle(message: string, context: AgentContext): boolean {
    const wearableKeywords = [
      "steps",
      "heart rate",
      "sleep",
      "sleeping",
      "resting hr",
      "pulse",
      "exercise",
      "workout",
      "activity",
      "spo2",
      "oxygen",
      "fitbit",
      "apple watch",
      "garmin",
      "wearable",
      "trend",
      "pattern",
      "energy",
      "calories",
      "active",
    ];

    const lowerMessage = message.toLowerCase();
    const hasWearableKeywords = wearableKeywords.some((kw) =>
      lowerMessage.includes(kw)
    );

    // Can also handle if there's wearable data available
    const hasWearableData = context.recentWearables.length > 0;

    return hasWearableKeywords || hasWearableData;
  }

  /**
   * Analyze wearable data and provide insights
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
            "I'm unable to analyze wearable data on this device right now.",
          agentId: this.id,
          confidence: "low",
        };
      }

      // Check if we have wearable data
      if (context.recentWearables.length === 0) {
        return {
          message:
            "I don't have any wearable data to analyze yet. Please sync your health app or wearable device, and I can help you understand your trends.",
          agentId: this.id,
          needsClarification: true,
          confidence: "medium",
        };
      }

      // Format wearable data
      const wearableContext = this.formatWearableData(context.recentWearables);

      // Analyze trends
      const trends = this.analyzeTrends(context.recentWearables);

      // Build context about the user
      const userContext = `
User: ${context.store.profile.name || "Unknown"}
Conditions: ${context.store.profile.conditions.join(", ") || "None listed"}
Age/DOB: ${context.store.profile.dob || "Not provided"}
`;

      // Prepare prompt
      const fullPrompt = `${this.systemPrompt}

---

USER CONTEXT:
${userContext}

WEARABLE DATA (Last 7 days):
${wearableContext}

DATA TRENDS & ANALYSIS:
${trends}

---

User's question: "${message}"

Analyze the wearable data above and respond to the user's question. Remember:
1. Be encouraging about positive trends
2. Frame concerning patterns factually, not alarmingly
3. Ask clarifying questions if context is needed
4. Never diagnose — recommend professional consultation for concerning patterns
5. Run entirely on-device — do NOT attempt to send data anywhere`;

      // Run inference
      const result = await this.inference.generate(fullPrompt, {
        temperature: 0.7,
        maxTokens: 512,
        topP: 0.9,
      });

      return {
        message: result.text,
        agentId: this.id,
        confidence: "high",
        citations: ["On-device wearable data analysis"],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Wearable Insights error:", errorMessage);

      return {
        message: `I'm having trouble analyzing your wearable data right now. Please try again.`,
        agentId: this.id,
        confidence: "low",
      };
    }
  }

  /**
   * Format wearable data for readability
   */
  private formatWearableData(wearables: DailyWearableSummary[]): string {
    if (wearables.length === 0) {
      return "No wearable data available.";
    }

    return wearables
      .map((w) => {
        const parts = [`${w.date}:`];

        if (w.steps) {
          parts.push(`${w.steps.toLocaleString()} steps`);
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
        if (w.avgSpO2) {
          parts.push(`avg SpO2 ${w.avgSpO2}%`);
        }

        return parts.join(", ");
      })
      .join("\n");
  }

  /**
   * Analyze trends in the wearable data
   */
  private analyzeTrends(wearables: DailyWearableSummary[]): string {
    if (wearables.length < 2) {
      return "Insufficient data for trend analysis. More data points needed.";
    }

    const lines: string[] = [];

    // Step trend
    const stepsData = wearables.filter((w) => w.steps).map((w) => w.steps!);
    if (stepsData.length > 1) {
      const avgSteps =
        stepsData.reduce((a, b) => a + b) / stepsData.length;
      const maxSteps = Math.max(...stepsData);
      const minSteps = Math.min(...stepsData);
      lines.push(
        `Steps: avg ${Math.round(avgSteps).toLocaleString()}, range ${minSteps.toLocaleString()}-${maxSteps.toLocaleString()}`
      );
    }

    // Sleep trend
    const sleepData = wearables
      .filter((w) => w.sleepDurationMinutes)
      .map((w) => w.sleepDurationMinutes!);
    if (sleepData.length > 1) {
      const avgSleep = sleepData.reduce((a, b) => a + b) / sleepData.length;
      const avgSleepHours = (avgSleep / 60).toFixed(1);
      lines.push(`Sleep: averaging ${avgSleepHours} hours per night`);
    }

    // Heart rate trend
    const hrData = wearables
      .filter((w) => w.avgHeartRate)
      .map((w) => w.avgHeartRate!);
    if (hrData.length > 1) {
      const avgHR = Math.round(hrData.reduce((a, b) => a + b) / hrData.length);
      lines.push(`Heart rate: averaging ${avgHR} bpm during activity`);
    }

    // Resting HR trend
    const restingHRData = wearables
      .filter((w) => w.restingHeartRate)
      .map((w) => w.restingHeartRate!);
    if (restingHRData.length > 1) {
      const avgRestingHR = Math.round(
        restingHRData.reduce((a, b) => a + b) / restingHRData.length
      );
      const maxRestingHR = Math.max(...restingHRData);
      const minRestingHR = Math.min(...restingHRData);
      if (maxRestingHR - minRestingHR > 10) {
        lines.push(
          `⚠️ Resting HR shows variability: ${minRestingHR}-${maxRestingHR} bpm (avg ${avgRestingHR})`
        );
      } else {
        lines.push(`Resting HR: stable at ~${avgRestingHR} bpm`);
      }
    }

    return lines.length > 0
      ? lines.join("\n")
      : "Data available but trends unclear. More context needed.";
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

export default WearableInsightsAgent;
export { WearableInsightsAgent };
