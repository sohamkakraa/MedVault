/**
 * Cloud AI Utility
 *
 * Calls Claude API via Supabase Edge Functions for complex medical document
 * analysis and general health Q&A. Handles streaming responses, retries,
 * and never logs PII.
 *
 * This is used by:
 * - Health Companion agent (primary conversational AI)
 * - Report Explainer agent (PDF document analysis)
 *
 * All requests are encrypted in transit and PII is never logged.
 */

import { Anthropic } from "@anthropic-ai/sdk";

/**
 * Configuration for cloud AI calls
 */
export interface CloudAIConfig {
  apiKey?: string; // Uses ANTHROPIC_API_KEY env var if not provided
  model?: string; // Default: claude-opus-4-1-20250805
  maxTokens?: number; // Default: 2048
  temperature?: number; // Default: 0.7
}

/**
 * Request to the cloud AI
 */
export interface CloudAIRequest {
  systemPrompt: string;
  userMessage: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  config?: CloudAIConfig;
}

/**
 * Response from the cloud AI
 */
export interface CloudAIResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  stopReason?: string;
}

/**
 * Initialize the Anthropic client
 *
 * Uses ANTHROPIC_API_KEY from environment.
 * For Supabase Edge Functions, the API key is injected into the environment.
 */
function createClient(apiKey?: string): Anthropic {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Cannot initialize cloud AI client."
    );
  }
  return new Anthropic({ apiKey: key });
}

/**
 * Call the Claude API for health questions and document analysis
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Never logs PII to console
 * - Transparent token counting
 * - Streaming support (when needed)
 *
 * @param request - Cloud AI request with system prompt, user message, and history
 * @returns Response from Claude with token counts
 */
export async function callCloudAI(request: CloudAIRequest): Promise<string> {
  const {
    systemPrompt,
    userMessage,
    conversationHistory = [],
    config = {},
  } = request;

  const {
    apiKey,
    model = "claude-opus-4-1-20250805",
    maxTokens = 2048,
    temperature = 0.7,
  } = config;

  const client = createClient(apiKey);

  // Build message history for context
  const messages = [
    ...conversationHistory,
    { role: "user" as const, content: userMessage },
  ];

  try {
    // Call Claude with exponential backoff retry
    const response = await callWithRetry(
      async () => {
        return client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages,
        });
      },
      { maxRetries: 3, initialDelayMs: 1000 }
    );

    // Extract the response text
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    return textContent.text;
  } catch (error) {
    // Log error without PII
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Cloud AI call failed:", errorMessage);

    // Re-throw with a user-friendly message
    if (errorMessage.includes("401")) {
      throw new Error("Authentication failed. Check your API key.");
    } else if (errorMessage.includes("429")) {
      throw new Error("Rate limited. Please try again in a moment.");
    } else if (errorMessage.includes("500")) {
      throw new Error("Claude API is temporarily unavailable. Try again soon.");
    }

    throw error;
  }
}

/**
 * Call a function with exponential backoff retry
 *
 * @param fn - Async function to call
 * @param options - Retry configuration
 * @returns Result of the function
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; initialDelayMs: number } = {
    maxRetries: 3,
    initialDelayMs: 1000,
  }
): Promise<T> {
  const { maxRetries, initialDelayMs } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryable = isRetryableError(error);

      if (isLastAttempt || !isRetryable) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.log(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`
      );

      await sleep(delayMs);
    }
  }

  throw new Error("Should not reach here");
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: any): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  // Retry on rate limits, timeouts, and temporary server errors
  return (
    message.includes("429") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  );
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Claude with streaming support (for future use)
 *
 * Returns an async iterator that yields text chunks as they arrive.
 * This is more responsive for long documents or detailed explanations.
 *
 * @param request - Cloud AI request
 * @yields Text chunks as they arrive from Claude
 */
export async function* callCloudAIStreaming(
  request: CloudAIRequest
): AsyncGenerator<string> {
  const {
    systemPrompt,
    userMessage,
    conversationHistory = [],
    config = {},
  } = request;

  const {
    apiKey,
    model = "claude-opus-4-1-20250805",
    maxTokens = 2048,
    temperature = 0.7,
  } = config;

  const client = createClient(apiKey);

  const messages = [
    ...conversationHistory,
    { role: "user" as const, content: userMessage },
  ];

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Cloud AI streaming call failed:", errorMessage);
    throw error;
  }
}

/**
 * Call Claude with tool/function calling support
 *
 * For agents that need to make structured function calls
 * (e.g., "set_reminder", "save_document")
 *
 * @param request - Cloud AI request
 * @param tools - Tool definitions with name, description, input_schema
 * @returns Claude response with text + optional tool calls
 */
export async function callCloudAIWithTools(
  request: CloudAIRequest,
  tools: Array<{
    name: string;
    description: string;
    input_schema: Record<string, any>;
  }>
): Promise<{
  text: string;
  toolCalls: Array<{ name: string; id: string; input: Record<string, any> }>;
}> {
  const {
    systemPrompt,
    userMessage,
    conversationHistory = [],
    config = {},
  } = request;

  const {
    apiKey,
    model = "claude-opus-4-1-20250805",
    maxTokens = 2048,
    temperature = 0.7,
  } = config;

  const client = createClient(apiKey);

  const messages = [
    ...conversationHistory,
    { role: "user" as const, content: userMessage },
  ];

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages,
      tools: tools as any, // Type casting for Anthropic SDK
    });

    // Extract text and tool calls
    let text = "";
    const toolCalls = [];

    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          name: block.name,
          id: block.id,
          input: block.input as Record<string, any>,
        });
      }
    }

    return { text, toolCalls };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Cloud AI tool call failed:", errorMessage);
    throw error;
  }
}

/**
 * Batch call Claude for multiple independent requests
 *
 * Useful for parallel processing of multiple documents or questions.
 * Respects rate limits automatically.
 *
 * @param requests - Array of cloud AI requests
 * @returns Array of responses in the same order
 */
export async function callCloudAIBatch(
  requests: CloudAIRequest[]
): Promise<string[]> {
  const results: string[] = [];

  for (const request of requests) {
    try {
      const result = await callCloudAI(request);
      results.push(result);
      // Rate limit: wait between requests
      await sleep(500);
    } catch (error) {
      console.error("Batch call failed for one request:", error);
      results.push(""); // Push empty string on failure
    }
  }

  return results;
}
