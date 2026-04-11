/**
 * UMA Mobile Agent System Entry Point
 *
 * This file exports the complete agent system and provides helper functions
 * for initialization and basic usage.
 *
 * Usage:
 * ```typescript
 * import { initializeAgentSystem, AgentSystem } from './agents';
 *
 * const agentSystem = await initializeAgentSystem();
 * const response = await agentSystem.chat("What's my last HbA1c?", context);
 * ```
 */

export { Orchestrator, createOrchestrator } from "./orchestrator";
export type {
  Agent,
  AgentConfig,
  IntentClassification,
  OrchestrationDecision,
  ChatRequest,
  ChatResponse,
} from "./types";

export { HealthCompanionAgent } from "./health-companion";
export { ReportExplainerAgent } from "./report-explainer";
export { RoutineAnalyzerAgent } from "./routine-analyzer";
export { MedicationTrackerAgent } from "./medication-tracker";
export { WearableInsightsAgent } from "./wearable-insights";

import { Orchestrator } from "./orchestrator";
import { Agent } from "./types";
import { AgentContext, AgentResponse } from "../lib/types";
import { HealthCompanionAgent } from "./health-companion";
import { ReportExplainerAgent } from "./report-explainer";
import { RoutineAnalyzerAgent } from "./routine-analyzer";
import { MedicationTrackerAgent } from "./medication-tracker";
import { WearableInsightsAgent } from "./wearable-insights";

/**
 * Complete agent system with orchestrator and all agents
 */
export class AgentSystem {
  private orchestrator: Orchestrator;
  private agents: Map<string, Agent> = new Map();

  constructor(orchestrator: Orchestrator, agents: Agent[]) {
    this.orchestrator = orchestrator;
    agents.forEach((agent) => this.agents.set(agent.id, agent));
  }

  /**
   * Send a user message through the agent system
   *
   * @param message - User's message
   * @param context - Conversation context (store, history, wearables, timezone)
   * @returns Agent response with message, citations, and optional actions
   */
  async chat(message: string, context: AgentContext): Promise<AgentResponse> {
    return this.orchestrator.routeMessage({ message, context });
  }

  /**
   * Debug: explain which agent would handle a message
   */
  explainDecision(message: string, context: AgentContext) {
    return this.orchestrator.explainDecision(message, context);
  }

  /**
   * Get a specific agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Cleanup: unload models, free resources
   * Call when app goes to background or on shutdown
   */
  async cleanup(): Promise<void> {
    // Unload on-device models
    const onDeviceAgents = Array.from(this.agents.values()).filter(
      (a) => a.runtime === "on-device"
    );

    for (const agent of onDeviceAgents) {
      if ("cleanup" in agent && typeof agent.cleanup === "function") {
        try {
          await (agent as any).cleanup();
        } catch (error) {
          console.error(`Failed to cleanup ${agent.id}:`, error);
        }
      }
    }
  }
}

/**
 * Initialize the complete agent system
 *
 * This should be called once at app startup.
 *
 * @param nativeModule - Optional native module for MediaPipe inference
 * @param onProgress - Optional callback for on-device model download progress
 * @returns Initialized AgentSystem ready to chat
 */
export async function initializeAgentSystem(
  nativeModule?: any,
  onProgress?: (progress: any) => void
): Promise<AgentSystem> {
  // Create all agents
  const agents: Agent[] = [
    new HealthCompanionAgent(),
    new ReportExplainerAgent(),
    new RoutineAnalyzerAgent(nativeModule),
    new MedicationTrackerAgent(nativeModule),
    new WearableInsightsAgent(nativeModule),
  ];

  // Initialize on-device agents (async, but we don't block startup)
  for (const agent of agents) {
    if (
      agent.runtime === "on-device" &&
      "initialize" in agent &&
      typeof agent.initialize === "function"
    ) {
      try {
        await (agent as any).initialize();
      } catch (error) {
        console.warn(`Failed to initialize ${agent.id}:`, error);
        // Continue; we'll fall back to cloud if needed
      }
    }
  }

  // Create orchestrator and register agents
  const orchestrator = new Orchestrator();
  orchestrator.registerAgents(agents);

  return new AgentSystem(orchestrator, agents);
}

/**
 * Minimal initialization for cloud-only mode
 *
 * Use this if you want to skip on-device model downloads
 * (faster startup, but less privacy for sensitive data).
 */
export async function initializeCloudOnlyAgentSystem(): Promise<AgentSystem> {
  const agents: Agent[] = [
    new HealthCompanionAgent(),
    new ReportExplainerAgent(),
    // Note: on-device agents are registered but will fall back to cloud
    new RoutineAnalyzerAgent(),
    new MedicationTrackerAgent(),
    new WearableInsightsAgent(),
  ];

  const orchestrator = new Orchestrator();
  orchestrator.registerAgents(agents);

  return new AgentSystem(orchestrator, agents);
}

/**
 * Type-safe agent response handler
 *
 * Helper to safely access agent response fields.
 *
 * @example
 * ```typescript
 * const response = await agentSystem.chat(message, context);
 * if (response.needsClarification) {
 *   // Show input field for clarification
 * } else if (response.consultDoctor) {
 *   // Show warning badge
 * }
 * for (const citation of response.citations || []) {
 *   // Show sources
 * }
 * ```
 */
export function getResponseMetadata(response: AgentResponse) {
  return {
    agentId: response.agentId,
    message: response.message,
    needsClarification: response.needsClarification ?? false,
    citations: response.citations ?? [],
    confidence: response.confidence ?? "medium",
    consultDoctor: response.consultDoctor ?? false,
    actions: response.actions ?? [],
  };
}

/**
 * Default context builder
 *
 * Convenience function to build an AgentContext from minimal inputs.
 *
 * @example
 * ```typescript
 * const context = buildAgentContext({
 *   store: patientStore,
 *   recentWearables: [/* ... */],
 *   conversationHistory: chatHistory,
 *   userTimezone: "America/Los_Angeles",
 * });
 * ```
 */
export function buildAgentContext(
  params: Partial<AgentContext> & {
    store: AgentContext["store"];
    userTimezone: AgentContext["userTimezone"];
  }
): AgentContext {
  return {
    store: params.store,
    recentWearables: params.recentWearables ?? [],
    conversationHistory: params.conversationHistory ?? [],
    userTimezone: params.userTimezone,
  };
}
