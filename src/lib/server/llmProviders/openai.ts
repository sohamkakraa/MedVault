import OpenAI from "openai";

/**
 * Sole call site for `process.env.OPENAI_API_KEY`.
 */

export function getOpenAiEnvKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

export function createOpenAiClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export type OpenAiLikeClient = OpenAI;
