/**
 * Health Companion Agent
 *
 * The primary conversational agent for UMA Mobile. Runs on the cloud (Claude API)
 * and has access to the user's complete medical history, medications, lab values,
 * and wearable data.
 *
 * Characteristics:
 * - Grounded responses citing actual patient data
 * - Supportive, non-alarmist tone
 * - Never diagnoses or replaces professional advice
 * - Asks one question at a time
 * - Transparent about limitations and when to consult a doctor
 */

import {
  Agent,
  IntentClassification,
  OrchestrationDecision,
} from "../types";
import {
  AgentContext,
  AgentResponse,
  AgentMessage,
  PatientStore,
  ExtractedLab,
  ExtractedMedication,
} from "../../lib/types";
import { HEALTH_COMPANION_SYSTEM_PROMPT } from "./system-prompt";
import { callCloudAI } from "../../lib/ai/cloud";

/**
 * Format the patient store as a concise context string for the Claude API
 *
 * Includes recent medications, recent labs, allergies, conditions, and profile info.
 * Intentionally summarizes rather than dumping raw data.
 */
function formatPatientContext(store: PatientStore, limit: number = 10): string {
  const lines: string[] = [];

  // Profile
  if (store.profile.name) {
    lines.push(`Patient: ${store.profile.name}`);
    if (store.profile.dob) {
      lines.push(`DOB: ${store.profile.dob}`);
    }
    if (store.profile.primaryCareProvider) {
      lines.push(`Primary Care Provider: ${store.profile.primaryCareProvider}`);
    }
  }

  // Allergies
  if (store.profile.allergies.length > 0) {
    lines.push(`\nAllergies: ${store.profile.allergies.join(", ")}`);
  }

  // Conditions
  if (store.profile.conditions.length > 0) {
    lines.push(`Conditions: ${store.profile.conditions.join(", ")}`);
  }

  // Recent medications
  if (store.meds.length > 0) {
    lines.push("\nCurrent Medications:");
    store.meds.slice(0, limit).forEach((med) => {
      let medStr = `  - ${med.name}`;
      if (med.dose) medStr += ` ${med.dose}`;
      if (med.frequency) medStr += ` ${med.frequency}`;
      if (med.startDate) medStr += ` (since ${med.startDate})`;
      lines.push(medStr);
    });
    if (store.meds.length > limit) {
      lines.push(`  ... and ${store.meds.length - limit} more`);
    }
  }

  // Recent labs
  if (store.labs.length > 0) {
    lines.push("\nRecent Lab Values (most recent first):");
    const labsByName = groupLabsByName(store.labs);
    Object.entries(labsByName)
      .slice(0, limit)
      .forEach(([name, labs]) => {
        if (labs.length > 0) {
          const latest = labs[0];
          let labStr = `  - ${latest.name}: ${latest.value}`;
          if (latest.unit) labStr += ` ${latest.unit}`;
          if (latest.refRange) labStr += ` (ref: ${latest.refRange})`;
          if (latest.date) labStr += ` [${latest.date}]`;
          lines.push(labStr);
        }
      });
  }

  // Recent documents
  if (store.docs.length > 0) {
    lines.push("\nRecent Documents:");
    store.docs.slice(0, Math.min(5, limit)).forEach((doc) => {
      lines.push(
        `  - ${doc.title} (${doc.type}, ${doc.dateISO}) from ${doc.provider || "Unknown"}`
      );
    });
  }

  return lines.join("\n");
}

/**
 * Group lab values by name for easier display
 */
function groupLabsByName(
  labs: ExtractedLab[]
): Record<string, ExtractedLab[]> {
  const grouped: Record<string, ExtractedLab[]> = {};
  labs.forEach((lab) => {
    if (!grouped[lab.name]) {
      grouped[lab.name] = [];
    }
    grouped[lab.name].push(lab);
  });
  // Sort each group by date (most recent first)
  Object.keys(grouped).forEach((name) => {
    grouped[name].sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  });
  return grouped;
}

/**
 * Format conversation history for the Claude API
 */
function formatConversationHistory(messages: AgentMessage[]): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));
}

/**
 * Health Companion Agent Implementation
 */
class HealthCompanionAgent implements Agent {
  readonly id = "health-companion";
  readonly name = "Health Companion";
  readonly description =
    "Your personal health knowledge companion. Helps you understand your medical records, medications, and health trends in plain language.";
  readonly runtime = "cloud";
  readonly systemPrompt = HEALTH_COMPANION_SYSTEM_PROMPT;

  /**
   * This agent can handle nearly any health-related question.
   * It's the fallback for ambiguous queries.
   */
  canHandle(message: string, context: AgentContext): boolean {
    // Health companion can handle almost anything health-related
    // As a fallback agent, return true unless the message is clearly not health-related
    const nonHealthKeywords = ["weather", "sports scores", "movie", "recipe"];
    const lowerMessage = message.toLowerCase();
    return !nonHealthKeywords.some((kw) => lowerMessage.includes(kw));
  }

  /**
   * Process a user message using the Claude API
   */
  async process(
    message: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      // Format the patient context for Claude
      const patientContext = formatPatientContext(context.store);

      // Format conversation history
      const conversationHistory = formatConversationHistory(
        context.conversationHistory
      );

      // Build the system prompt with patient context
      const systemPromptWithContext = `${this.systemPrompt}

---

PATIENT CONTEXT (Provided for this conversation):
${patientContext}

---

TIMEZONE: ${context.userTimezone || "Unknown"}

WEARABLE DATA (Last 7 days):
${
  context.recentWearables.length > 0
    ? context.recentWearables
        .slice(0, 5)
        .map(
          (w) =>
            `${w.date}: ${w.steps} steps, ${w.avgHeartRate || "?"} avg HR, ${w.sleepDurationMinutes || "?"} min sleep`
        )
        .join("\n")
    : "No wearable data available"
}

---

Respond to the user's question using the context above. Remember to:
1. Cite sources when referencing patient data
2. Ask for clarification if needed (ONE question at a time)
3. Include "Not medical advice" disclaimer when appropriate
4. Never diagnose or replace professional medical advice`;

      // Call the cloud AI API
      const response = await callCloudAI({
        systemPrompt: systemPromptWithContext,
        userMessage: message,
        conversationHistory,
      });

      // Parse the response
      // The cloud API may return metadata about citations, confidence, or doctor consultation
      const citationsMatch = response.match(
        /\[citations?: (.*?)\]/i
      );
      const citations = citationsMatch
        ? citationsMatch[1].split(",").map((c) => c.trim())
        : undefined;

      const consultDoctorMatch = response.match(/\[consult_doctor\]/i);
      const consultDoctor = !!consultDoctorMatch;

      // Clean up metadata markers from the response
      let cleanMessage = response
        .replace(/\[citations?: .*?\]/i, "")
        .replace(/\[consult_doctor\]/i, "")
        .trim();

      return {
        message: cleanMessage,
        agentId: this.id,
        citations,
        consultDoctor,
        confidence: "high",
      };
    } catch (error) {
      // Fallback response if the cloud API fails
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Health Companion API error:", errorMessage);

      return {
        message: `I'm having trouble connecting to my knowledge base right now. Could you try your question again? If this keeps happening, please check your internet connection.`,
        agentId: this.id,
        confidence: "low",
      };
    }
  }
}

export default HealthCompanionAgent;
export { HealthCompanionAgent };
