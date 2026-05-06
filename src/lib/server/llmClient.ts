import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { loadCredential } from "./llmCredentials";
import {
  createAnthropicClient,
  getAnthropicEnvKey,
} from "./llmProviders/anthropic";
import { createOpenAiClient, getOpenAiEnvKey } from "./llmProviders/openai";

export type LlmRole = "chat" | "extract" | "intent" | "tidy" | "structure";

export type AnthropicLlmClient = {
  provider: "anthropic";
  source: "byok" | "env";
  modelId: string | null;
  anthropic: Anthropic;
};

export type OpenAiLlmClient = {
  provider: "openai";
  source: "byok" | "env";
  modelId: string | null;
  openai: OpenAI;
};

export type NoLlmClient = {
  provider: "none";
  source: "none";
  modelId: null;
};

export type LlmClient = AnthropicLlmClient | OpenAiLlmClient | NoLlmClient;

/**
 * Single chokepoint for LLM SDK access. Resolves the user's BYOK credential
 * (if any) first, then falls back to env-configured Anthropic, then env OpenAI,
 * else returns a `none` sentinel.
 *
 * Direct reads of `process.env.ANTHROPIC_API_KEY` / `OPENAI_API_KEY` outside
 * `llmProviders/{anthropic,openai}.ts` are forbidden.
 */
export async function getLlmClient(
  userId: string | null,
  _role: LlmRole,
): Promise<LlmClient> {
  if (userId) {
    try {
      const cred = await loadCredential(userId);
      if (cred) {
        if (cred.provider === "anthropic") {
          return {
            provider: "anthropic",
            source: "byok",
            modelId: cred.modelId,
            anthropic: createAnthropicClient(cred.apiKey),
          };
        }
        if (cred.provider === "openai") {
          return {
            provider: "openai",
            source: "byok",
            modelId: cred.modelId,
            openai: createOpenAiClient(cred.apiKey),
          };
        }
        // Unsupported BYOK provider — fall through to env fallback for now
      }
    } catch {
      // Decryption / DB error — fall through to env
    }
  }

  const envAnthropic = getAnthropicEnvKey();
  if (envAnthropic) {
    return {
      provider: "anthropic",
      source: "env",
      modelId: null,
      anthropic: createAnthropicClient(envAnthropic),
    };
  }

  const envOpenAi = getOpenAiEnvKey();
  if (envOpenAi) {
    return {
      provider: "openai",
      source: "env",
      modelId: null,
      openai: createOpenAiClient(envOpenAi),
    };
  }

  return { provider: "none", source: "none", modelId: null };
}

/**
 * Convenience: returns an Anthropic SDK instance or null. Used by call sites
 * whose feature surface is Anthropic-only (PDF document blocks, citations,
 * tool use w/ caching). Honors BYOK when the user picked Anthropic, else
 * falls back to env's Anthropic key.
 */
export async function getAnthropicForUser(
  userId: string | null,
  role: LlmRole,
): Promise<{ client: Anthropic; modelId: string | null; source: "byok" | "env" } | null> {
  const c = await getLlmClient(userId, role);
  if (c.provider === "anthropic") {
    return { client: c.anthropic, modelId: c.modelId, source: c.source };
  }
  // BYOK user picked a non-Anthropic provider — fall back to env Anthropic
  const envKey = getAnthropicEnvKey();
  if (envKey) {
    return { client: createAnthropicClient(envKey), modelId: null, source: "env" };
  }
  return null;
}
