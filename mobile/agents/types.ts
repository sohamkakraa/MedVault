/**
 * Agent System Types
 *
 * Defines the core interface for the multi-agent AI system that powers UMA Mobile.
 * All agents adhere to this contract, enabling routing, context passing, and
 * orchestration across cloud and on-device runtimes.
 */

import {
  AgentId,
  AgentRuntime,
  AgentContext,
  AgentResponse,
  PatientStore,
} from "../lib/types";

/**
 * Base agent interface
 *
 * Every agent in the system must implement this contract:
 * - Unique ID and descriptive metadata
 * - A `canHandle` predicate to determine if this agent can answer a question
 * - A `process` method to generate a response
 * - System-level instructions for the LLM
 */
export interface Agent {
  /** Unique identifier for this agent */
  id: AgentId;

  /** Human-readable name */
  name: string;

  /** Description of what this agent handles */
  description: string;

  /** Where the agent runs: "cloud" (Claude via Supabase) or "on-device" (Gemma 4 E2B) */
  runtime: AgentRuntime;

  /** System prompt — LLM instructions that define the agent's role and behavior */
  systemPrompt: string;

  /**
   * Predicate: can this agent handle the given user message?
   *
   * Used by the orchestrator to route messages to the best agent.
   * Should return true only when the agent is confident it can provide a relevant response.
   *
   * @param message - The user's message
   * @param context - Current conversation context (store, history, wearables, etc.)
   * @returns true if this agent should handle the message
   */
  canHandle(message: string, context: AgentContext): boolean;

  /**
   * Process the user message and generate a response
   *
   * Agents must:
   * - Ground responses in the user's actual medical data (PatientStore)
   * - Never hallucinate — cite sources or ask for clarification
   * - Maintain a supportive, non-alarmist tone
   * - Suggest professional consultation when appropriate
   * - Ask one question at a time if clarification is needed
   *
   * @param message - The user's message
   * @param context - Full conversation context
   * @returns Promise<AgentResponse> with message, agent ID, and optional actions
   */
  process(message: string, context: AgentContext): Promise<AgentResponse>;
}

/**
 * Agent configuration
 *
 * Minimal metadata used by the orchestrator to register and route to agents.
 */
export interface AgentConfig {
  id: AgentId;
  name: string;
  description: string;
  runtime: AgentRuntime;
}

/**
 * Intent classification result
 *
 * When the orchestrator analyzes a user message, it returns an intent
 * that helps determine which agent(s) can best handle it.
 */
export interface IntentClassification {
  /** Primary intent detected (maps to an agent ID, or "unknown" for fallback) */
  primary: AgentId | "unknown";

  /** Secondary intents (when multiple agents might be relevant) */
  secondary: (AgentId | "unknown")[];

  /** Confidence that this classification is correct (high/medium/low) */
  confidence: "high" | "medium" | "low";

  /** Keywords that triggered this classification */
  keywords: string[];

  /** Reason for the classification (for debugging/transparency) */
  reason: string;
}

/**
 * Orchestration decision
 *
 * After classifying intent, the orchestrator decides how to proceed.
 */
export interface OrchestrationDecision {
  /** Which agent should handle this message */
  agent: Agent;

  /** The classified intent */
  intent: IntentClassification;

  /** Whether to ask for clarification before routing (if confidence is low) */
  askForClarification: boolean;

  /** Optional clarification question for the user */
  clarificationQuestion?: string;
}

/**
 * Chat request to the orchestrator
 *
 * Minimal input: message + context. The orchestrator handles routing.
 */
export interface ChatRequest {
  message: string;
  context: AgentContext;
}

/**
 * Chat response from the orchestrator
 *
 * Complete answer with agent metadata, confidence, and optional actions.
 */
export interface ChatResponse {
  message: string;
  agentId: AgentId;
  needsClarification?: boolean;
  citations?: string[];
  confidence?: "high" | "medium" | "low";
  consultDoctor?: boolean;
  actions?: AgentAction[];
}

// Re-export action types for convenience
export type AgentAction = import("../lib/types").AgentAction;
