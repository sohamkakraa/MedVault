import Anthropic from "@anthropic-ai/sdk";

/**
 * Sole call site for `process.env.ANTHROPIC_API_KEY`.
 * All Anthropic SDK construction goes through one of these helpers.
 */

export function getAnthropicEnvKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}

export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export type AnthropicLikeClient = Anthropic;
