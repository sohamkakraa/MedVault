export type ProviderId =
  | "default"
  | "anthropic"
  | "openai"
  | "perplexity"
  | "google"
  | "moonshot"
  | "deepseek"
  | "huggingface";

export type ProviderModel = {
  id: string;
  label: string;
  contextWindow: number;
  inputPerMTok: number;
  outputPerMTok: number;
  supportsTools: boolean;
  supportsVision: boolean;
};

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  docsUrl: string;
  consoleUrl: string;
  apiKeyPattern?: RegExp;
  curatedModels: ProviderModel[];
  verify: (key: string, modelId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  default: {
    id: "default",
    label: "UMA Default (Claude)",
    docsUrl: "https://uma.health",
    consoleUrl: "https://uma.health",
    curatedModels: [{ id: "server-managed", label: "(server-managed)", contextWindow: 200000, inputPerMTok: 0, outputPerMTok: 0, supportsTools: false, supportsVision: false }],
    verify: async () => ({ ok: true }),
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    docsUrl: "https://docs.anthropic.com",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    apiKeyPattern: /^sk-ant-/,
    curatedModels: [
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", contextWindow: 200000, inputPerMTok: 1, outputPerMTok: 5, supportsTools: true, supportsVision: false },
      { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", contextWindow: 200000, inputPerMTok: 3, outputPerMTok: 15, supportsTools: true, supportsVision: true },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6", contextWindow: 200000, inputPerMTok: 15, outputPerMTok: 75, supportsTools: true, supportsVision: true },
    ],
    verify: async (key, modelId) => {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: key });
        await client.messages.create({ model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "Unknown error" };
      }
    },
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    docsUrl: "https://platform.openai.com/docs",
    consoleUrl: "https://platform.openai.com/api-keys",
    apiKeyPattern: /^sk-/,
    curatedModels: [
      { id: "gpt-4o-mini", label: "GPT-4o Mini", contextWindow: 128000, inputPerMTok: 0.15, outputPerMTok: 0.6, supportsTools: true, supportsVision: false },
      { id: "gpt-4o", label: "GPT-4o", contextWindow: 128000, inputPerMTok: 2.5, outputPerMTok: 10, supportsTools: true, supportsVision: true },
      { id: "gpt-4.1", label: "GPT-4.1", contextWindow: 1000000, inputPerMTok: 2, outputPerMTok: 8, supportsTools: true, supportsVision: true },
      { id: "o3-mini", label: "o3 Mini", contextWindow: 200000, inputPerMTok: 1.1, outputPerMTok: 4.4, supportsTools: true, supportsVision: false },
    ],
    verify: async (key, modelId) => {
      try {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey: key });
        await client.chat.completions.create({ model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "Unknown error" };
      }
    },
  },
  google: {
    id: "google",
    label: "Google (Gemini)",
    docsUrl: "https://ai.google.dev/docs",
    consoleUrl: "https://aistudio.google.com/app/apikey",
    curatedModels: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", contextWindow: 1000000, inputPerMTok: 0.075, outputPerMTok: 0.3, supportsTools: true, supportsVision: true },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", contextWindow: 1000000, inputPerMTok: 1.25, outputPerMTok: 10, supportsTools: true, supportsVision: true },
    ],
    verify: async (key, modelId) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) return { ok: true };
        const err = await res.json().catch(() => ({}));
        return { ok: false, reason: (err as { error?: { message?: string } })?.error?.message?.slice(0, 120) ?? `HTTP ${res.status}` };
      } catch (e: unknown) {
        return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "Unknown error" };
      }
    },
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    docsUrl: "https://api-docs.deepseek.com",
    consoleUrl: "https://platform.deepseek.com/api_keys",
    curatedModels: [
      { id: "deepseek-chat", label: "DeepSeek Chat", contextWindow: 64000, inputPerMTok: 0.14, outputPerMTok: 0.28, supportsTools: true, supportsVision: false },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", contextWindow: 64000, inputPerMTok: 0.55, outputPerMTok: 2.19, supportsTools: false, supportsVision: false },
    ],
    verify: async (key, modelId) => {
      try {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey: key, baseURL: "https://api.deepseek.com/v1" });
        await client.chat.completions.create({ model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "Unknown error" };
      }
    },
  },
  moonshot: {
    id: "moonshot",
    label: "Moonshot (Kimi)",
    docsUrl: "https://platform.moonshot.cn/docs",
    consoleUrl: "https://platform.moonshot.cn/console/api-keys",
    curatedModels: [
      { id: "moonshot-v1-32k", label: "Moonshot v1 32k", contextWindow: 32000, inputPerMTok: 0.12, outputPerMTok: 0.12, supportsTools: true, supportsVision: false },
      { id: "kimi-k2", label: "Kimi K2", contextWindow: 128000, inputPerMTok: 0.6, outputPerMTok: 2.5, supportsTools: true, supportsVision: false },
    ],
    verify: async (key, modelId) => {
      try {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey: key, baseURL: "https://api.moonshot.cn/v1" });
        await client.chat.completions.create({ model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "Unknown error" };
      }
    },
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    docsUrl: "https://docs.perplexity.ai",
    consoleUrl: "https://www.perplexity.ai/settings/api",
    curatedModels: [
      { id: "sonar", label: "Sonar", contextWindow: 127000, inputPerMTok: 1, outputPerMTok: 1, supportsTools: false, supportsVision: false },
      { id: "sonar-pro", label: "Sonar Pro", contextWindow: 127000, inputPerMTok: 3, outputPerMTok: 15, supportsTools: false, supportsVision: false },
      { id: "sonar-reasoning", label: "Sonar Reasoning", contextWindow: 127000, inputPerMTok: 1, outputPerMTok: 5, supportsTools: false, supportsVision: false },
    ],
    verify: async (key, modelId) => {
      try {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey: key, baseURL: "https://api.perplexity.ai" });
        await client.chat.completions.create({ model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "Unknown error" };
      }
    },
  },
  huggingface: {
    id: "huggingface",
    label: "HuggingFace",
    docsUrl: "https://huggingface.co/docs/inference-providers",
    consoleUrl: "https://huggingface.co/settings/tokens",
    curatedModels: [
      { id: "meta-llama/Meta-Llama-3-70B-Instruct", label: "Llama 3 70B Instruct", contextWindow: 8000, inputPerMTok: 0.9, outputPerMTok: 0.9, supportsTools: false, supportsVision: false },
      { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 72B", contextWindow: 32000, inputPerMTok: 0.77, outputPerMTok: 0.77, supportsTools: false, supportsVision: false },
      { id: "mistralai/Mistral-Nemo-Instruct-2407", label: "Mistral Nemo", contextWindow: 128000, inputPerMTok: 0.15, outputPerMTok: 0.15, supportsTools: false, supportsVision: false },
    ],
    verify: async (key, modelId) => {
      try {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey: key, baseURL: "https://api-inference.huggingface.co/v1" });
        await client.chat.completions.create({ model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "Unknown error" };
      }
    },
  },
};
