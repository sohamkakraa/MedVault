import { prisma } from "@/lib/prisma";
import { getAnthropicForUser } from "./llmClient";

// Simple Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

export async function proposeThreadTitle(threadId: string, summary: string, userId?: string | null): Promise<void> {
  // Skip if thread has a manually-set title
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { title: true, titleIsManual: true },
  });
  if (!thread || thread.titleIsManual) return;

  const got = await getAnthropicForUser(userId ?? null, "chat");
  if (!got) return;

  const client = got.client;
  try {
    const resp = await client.messages.create({
      model: got.modelId || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 24,
      messages: [{
        role: "user",
        content: `Summarize this conversation summary in 4–6 words for a chat-list label. Plain text. No quotes. Title-case.\n\nSummary: ${summary.slice(0, 500)}`,
      }],
    });
    const proposed = (resp.content[0] as { type: string; text: string }).text?.trim();
    if (!proposed) return;

    const current = thread.title ?? "";
    // Only rename if meaningfully different
    if (levenshtein(current, proposed) > 6 || Math.abs(current.length - proposed.length) > 3) {
      await prisma.thread.update({ where: { id: threadId }, data: { title: proposed } });
    }
  } catch {
    // Non-critical — ignore errors
  }
}
