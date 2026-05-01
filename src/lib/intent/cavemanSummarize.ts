/**
 * Caveman context compression — keeps the last N messages verbatim and
 * replaces older messages with a terse running summary so the LLM has
 * long-range memory without burning tokens on full verbatim history.
 *
 * Usage:
 *   1. On every LLM call: call buildContextWindow(messages, storedSummary)
 *      to get [summary injected as prefix] + last KEEP_LAST messages.
 *   2. Async, after every UPDATE_EVERY new messages when count > THRESHOLD:
 *      call summarizeOlderMessages(messages, storedSummary) → new summary string
 *      then persist with updateContextSummary(threadId, newSummary).
 */

export const KEEP_LAST = 8;
export const SUMMARY_THRESHOLD = 15; // don't compress until thread has this many messages
export const UPDATE_EVERY = 5; // re-compress every N new messages

/**
 * Build the messages array to pass to the LLM.
 * When a summary exists, it's injected as a framing exchange before the verbatim window.
 */
export function buildContextWindow(
  messages: { role: "user" | "assistant"; content: string }[],
  storedSummary: string | null,
  keepLast = KEEP_LAST,
): { role: "user" | "assistant"; content: string }[] {
  if (!storedSummary || messages.length <= SUMMARY_THRESHOLD) {
    return messages.slice(-keepLast * 2); // keep a bit more when no summary
  }
  const verbatim = messages.slice(-keepLast);
  return [
    {
      role: "user" as const,
      content: `[Earlier conversation summary]\n${storedSummary}`,
    },
    {
      role: "assistant" as const,
      content: "Understood, I have the context from our earlier conversation.",
    },
    ...verbatim,
  ];
}

/**
 * Generate a terse summary of messages older than the verbatim window.
 * Calls Claude Haiku — should only be called asynchronously after response delivery.
 * Returns the new summary string, or the existing stored summary on failure.
 */
export async function summarizeOlderMessages(
  messages: { role: "user" | "assistant"; content: string }[],
  storedSummary: string | null,
  keepLast = KEEP_LAST,
): Promise<string | null> {
  const toSummarize = messages.slice(0, -keepLast);
  if (toSummarize.length === 0) return storedSummary;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return storedSummary;

  const transcript = toSummarize
    .map((m) => `${m.role === "user" ? "User" : "UMA"}: ${m.content.slice(0, 400)}`)
    .join("\n");

  const prompt = storedSummary
    ? `Previous summary:\n${storedSummary}\n\nNewer conversation to incorporate:\n${transcript}\n\nUpdate the summary to include the new conversation. Terse bullet points, under 200 words. Health facts, decisions, key context only.`
    : `Summarize this health conversation as terse bullet points (under 200 words). Capture: health facts mentioned, decisions made, user concerns, medications or conditions discussed.\n\n${transcript}`;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 320,
      messages: [{ role: "user", content: prompt }],
    });
    const summary = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();
    return summary || storedSummary;
  } catch {
    return storedSummary;
  }
}
