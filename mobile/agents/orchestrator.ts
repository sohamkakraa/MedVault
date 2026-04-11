/**
 * Agent Orchestrator
 *
 * Routes user messages to the appropriate agent based on intent classification.
 * Maintains conversation context, handles ambiguous queries, and ensures
 * the system never hallucinates — asking for clarification when unsure.
 *
 * Intent routing rules:
 * - PDF/document mentions → report-explainer
 * - Medication/dose/pill/reminder mentions → medication-tracker
 * - Steps/sleep/heart rate/exercise/wearable mentions → wearable-insights
 * - Routine/habit/daily/schedule/suggestion mentions → routine-analyzer
 * - Everything else → health-companion (default, highest confidence fallback)
 */

import {
  Agent,
  AgentConfig,
  IntentClassification,
  OrchestrationDecision,
  ChatRequest,
  ChatResponse,
} from "./types";

import { AgentContext, AgentResponse } from "../lib/types";

/**
 * Keyword sets for intent classification
 * Each set is associated with an agent ID.
 */
const INTENT_KEYWORDS: Record<string, string[]> = {
  "report-explainer": [
    "pdf",
    "document",
    "report",
    "lab result",
    "imaging",
    "x-ray",
    "scan",
    "ct",
    "mri",
    "ultrasound",
    "ecg",
    "ekg",
    "what does this mean",
    "explain",
    "understanding",
    "findings",
    "diagnosis",
    "discharge",
    "hospital",
    "clinic",
  ],
  "medication-tracker": [
    "medication",
    "medicine",
    "pill",
    "dose",
    "dosage",
    "tablet",
    "capsule",
    "injection",
    "vaccine",
    "vaccination",
    "shot",
    "took",
    "taken",
    "reminder",
    "refill",
    "prescription",
    "metformin",
    "aspirin",
    "ibuprofen",
    "did i take",
    "did you take",
    "forgot",
    "missed",
    "adherence",
    "compliance",
  ],
  "wearable-insights": [
    "steps",
    "heart rate",
    "sleep",
    "sleeping",
    "resting hr",
    "pulse",
    "exercise",
    "workout",
    "activity",
    "active",
    "spo2",
    "oxygen",
    "breathing",
    "fitbit",
    "apple watch",
    "garmin",
    "watch",
    "wearable",
    "trend",
    "pattern",
    "energy",
    "kcal",
    "calories",
  ],
  "routine-analyzer": [
    "routine",
    "habit",
    "habit",
    "daily",
    "schedule",
    "suggest",
    "suggestion",
    "improve",
    "advice",
    "better",
    "morning",
    "evening",
    "lifestyle",
    "day",
    "typical",
    "usual",
    "pattern",
    "behavior",
  ],
};

/**
 * Orchestrator class
 *
 * Manages agent registry, intent classification, and routing decisions.
 */
export class Orchestrator {
  private agents: Map<string, Agent> = new Map();

  /**
   * Register an agent with the orchestrator
   * @param agent - Agent implementation
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Register multiple agents at once
   * @param agents - Array of agent implementations
   */
  registerAgents(agents: Agent[]): void {
    agents.forEach((agent) => this.registerAgent(agent));
  }

  /**
   * Get all registered agents
   */
  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get a specific agent by ID
   */
  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /**
   * Classify the user's intent based on keywords and context
   *
   * Returns the most likely agent(s) to handle the message.
   * Scores agents based on keyword matches and context availability.
   *
   * @param message - User message to classify
   * @param context - Conversation context (for context-aware routing)
   * @returns Intent classification with primary, secondary, and confidence
   */
  private classifyIntent(
    message: string,
    context: AgentContext
  ): IntentClassification {
    const lowerMessage = message.toLowerCase();
    const scores: Record<string, { score: number; keywords: string[] }> = {
      "report-explainer": { score: 0, keywords: [] },
      "medication-tracker": { score: 0, keywords: [] },
      "wearable-insights": { score: 0, keywords: [] },
      "routine-analyzer": { score: 0, keywords: [] },
      "health-companion": { score: 0, keywords: [] },
    };

    // Keyword scoring: count matches for each agent
    Object.entries(INTENT_KEYWORDS).forEach(([agentId, keywords]) => {
      keywords.forEach((keyword) => {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          scores[agentId].score += 1;
          scores[agentId].keywords.push(keyword);
        }
      });
    });

    // Context-aware scoring: boost agents if relevant data is available
    if (context.store.docs.length > 0 && scores["report-explainer"].score === 0) {
      // If user has recent documents and no explicit document keywords, give report-explainer a boost
      const recentDoc = context.store.docs[0];
      const docAge = Date.now() - new Date(recentDoc.dateISO).getTime();
      if (docAge < 7 * 24 * 60 * 60 * 1000) {
        // Document uploaded in the last 7 days
        scores["report-explainer"].score += 0.5;
      }
    }

    if (context.store.meds.length > 0 && scores["medication-tracker"].score === 0) {
      scores["medication-tracker"].score += 0.3;
    }

    if (context.recentWearables.length > 0 && scores["wearable-insights"].score === 0) {
      scores["wearable-insights"].score += 0.3;
    }

    // Sort by score
    const sorted = Object.entries(scores).sort(([, a], [, b]) => b.score - a.score);

    const [primaryId, primaryData] = sorted[0];
    const [secondaryId, secondaryData] = sorted[1] || ["unknown", { keywords: [] }];

    // Determine confidence based on score difference
    let confidence: "high" | "medium" | "low" = "low";
    if (primaryData.score >= 3) {
      confidence = "high";
    } else if (primaryData.score >= 1.5) {
      confidence = "medium";
    } else if (primaryData.score > 0) {
      confidence = "low";
    }

    // If no keywords matched, fall back to health-companion with low confidence
    if (primaryData.score === 0) {
      return {
        primary: "health-companion",
        secondary: [secondaryId as any],
        confidence: "low",
        keywords: [],
        reason:
          "No specific intent keywords detected. Routing to general health companion.",
      };
    }

    return {
      primary: primaryId as any,
      secondary: [secondaryId as any],
      confidence,
      keywords: primaryData.keywords,
      reason: `Matched ${primaryData.score} keyword(s): ${primaryData.keywords.join(
        ", "
      )}`,
    };
  }

  /**
   * Make an orchestration decision: which agent should handle this message?
   *
   * If confidence is low, asks for clarification rather than guessing.
   *
   * @param message - User message
   * @param context - Conversation context
   * @returns Orchestration decision (agent + intent + optional clarification)
   */
  private makeDecision(
    message: string,
    context: AgentContext
  ): OrchestrationDecision {
    const intent = this.classifyIntent(message, context);

    // Get the primary agent (or fall back to health-companion if unknown)
    let primaryAgentId = intent.primary;
    if (primaryAgentId === "unknown") {
      primaryAgentId = "health-companion";
    }

    const agent = this.agents.get(primaryAgentId);
    if (!agent) {
      // Fallback to health-companion if the selected agent is not registered
      const fallback = this.agents.get("health-companion");
      if (!fallback) {
        throw new Error(
          "No agents registered. At minimum, health-companion must be available."
        );
      }
      return {
        agent: fallback,
        intent,
        askForClarification: true,
        clarificationQuestion: `I'm not entirely sure what you're asking about. Could you provide more details?`,
      };
    }

    // If confidence is low, ask for clarification instead of routing blindly
    if (intent.confidence === "low" && intent.primary !== "health-companion") {
      const fallback = this.agents.get("health-companion");
      if (fallback) {
        return {
          agent: fallback,
          intent,
          askForClarification: true,
          clarificationQuestion: `I'm not certain which specialist agent to use. Could you be more specific about what you're asking? For example, are you asking about a medication, a lab result, or something else?`,
        };
      }
    }

    // Also check if the agent itself says it can't handle the message
    if (!agent.canHandle(message, context)) {
      const fallback = this.agents.get("health-companion");
      if (fallback && fallback.id !== agent.id) {
        return {
          agent: fallback,
          intent,
          askForClarification: false,
        };
      }
    }

    return {
      agent,
      intent,
      askForClarification: false,
    };
  }

  /**
   * Route a user message to the appropriate agent and get a response
   *
   * Main entry point for the chat system.
   *
   * @param request - Chat request (message + context)
   * @returns Chat response from the selected agent
   */
  async routeMessage(request: ChatRequest): Promise<ChatResponse> {
    const decision = this.makeDecision(request.message, request.context);

    // If we need clarification, ask the user
    if (decision.askForClarification && decision.clarificationQuestion) {
      return {
        message: decision.clarificationQuestion,
        agentId: decision.agent.id,
        needsClarification: true,
        confidence: decision.intent.confidence,
      };
    }

    // Otherwise, process the message with the selected agent
    const agentResponse = await decision.agent.process(
      request.message,
      request.context
    );

    return {
      message: agentResponse.message,
      agentId: agentResponse.agentId,
      needsClarification: agentResponse.needsClarification,
      citations: agentResponse.citations,
      confidence: agentResponse.confidence,
      consultDoctor: agentResponse.consultDoctor,
      actions: agentResponse.actions,
    };
  }

  /**
   * Debug helper: get the intended agent for a message without processing it
   *
   * Useful for testing and understanding routing decisions.
   *
   * @param message - User message
   * @param context - Conversation context
   * @returns Orchestration decision with reasoning
   */
  explainDecision(
    message: string,
    context: AgentContext
  ): OrchestrationDecision {
    return this.makeDecision(message, context);
  }
}

/**
 * Create a default orchestrator with all core agents registered
 *
 * @param agents - Array of agent implementations
 * @returns Configured orchestrator ready to route messages
 */
export function createOrchestrator(agents: Agent[]): Orchestrator {
  const orchestrator = new Orchestrator();
  orchestrator.registerAgents(agents);
  return orchestrator;
}
