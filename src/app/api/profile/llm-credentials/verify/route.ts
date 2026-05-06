import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/server/authSession";
import { PROVIDERS } from "@/lib/providers/registry";
import { saveCredential } from "@/lib/server/llmCredentials";

export const runtime = "nodejs";

const Body = z.object({
  provider: z.string(),
  modelId: z.string(),
  apiKey: z.string().min(1).max(512),
});

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { provider, modelId, apiKey } = parsed.data;
  const spec = PROVIDERS[provider as keyof typeof PROVIDERS];
  if (!spec || provider === "default") return NextResponse.json({ error: "Unknown provider" }, { status: 400 });

  const result = await spec.verify(apiKey, modelId);
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason }, { status: 422 });

  await saveCredential(userId, provider as import("@/lib/providers/registry").ProviderId, modelId, apiKey);
  return NextResponse.json({ ok: true, lastFour: apiKey.slice(-4) });
}
