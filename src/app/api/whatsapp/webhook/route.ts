/**
 * WhatsApp Business Cloud API webhook.
 *
 * GET  — Meta verification handshake (called once when you register the webhook URL).
 * POST — Incoming messages, status updates, and other notifications.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";
import { processIncomingMessage } from "@/lib/whatsapp/processMessage";
import { isWhatsAppConfigured } from "@/lib/whatsapp/client";
import { prisma } from "@/lib/prisma";

const WebhookBodySchema = z
  .object({
    object: z.string(),
    entry: z
      .array(
        z.object({
          id: z.string(),
          changes: z
            .array(z.object({ field: z.string(), value: z.record(z.string(), z.unknown()) }))
            .optional(),
        })
      )
      .optional(),
  })
  .passthrough();

export const runtime = "nodejs";
export const maxDuration = 30; // Allow up to 30s for LLM processing

/**
 * VULN-001 fix: Verify that the webhook payload was actually sent by Meta.
 * Meta signs every POST with HMAC-SHA256 using the App Secret.
 * Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  // If no app secret configured, log a warning but allow (so webhook works during initial setup).
  // Set WHATSAPP_APP_SECRET in production to enable signature verification. — VULN-001
  if (!appSecret) {
    console.warn("[WhatsApp] WHATSAPP_APP_SECRET not set — skipping signature verification. Set it in production.");
    return true;
  }
  if (!signatureHeader) return false;

  const [algo, signature] = signatureHeader.split("=");
  if (algo !== "sha256" || !signature) return false;

  const expectedSignature = createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"));
  } catch {
    return false;
  }
}

/**
 * Webhook verification (Meta handshake).
 * Meta sends: GET ?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=RANDOM
 * We must return the challenge value as plain text if the token matches.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken && verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Incoming webhook events from Meta.
 * Always return 200 quickly — process messages asynchronously.
 */
export async function POST(req: NextRequest) {
  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ error: "WhatsApp not configured" }, { status: 503 });
  }

  // VULN-001: Read raw body for signature verification before parsing
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // VULN-004: Limit payload size to prevent DoS (1 MB max)
  if (rawBody.length > 1_048_576) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // VULN-001: Verify Meta signature before processing
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature)) {
    console.warn("[WhatsApp] Webhook signature verification failed — rejecting request.");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let parsed: z.infer<typeof WebhookBodySchema>;
  try {
    const json: unknown = JSON.parse(rawBody);
    const result = WebhookBodySchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Process the message synchronously — Vercel serverless functions terminate
  // after the response is sent, so background processing via waitUntil/catch
  // is unreliable. Meta tolerates responses up to ~20s for webhooks.
  try {
    await handlePayload(parsed as WebhookPayload);
  } catch (err) {
    console.error("[WhatsApp] Processing error:", err instanceof Error ? err.message : "unknown");
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// ─── Types (subset of Meta webhook payload) ──────────────────────────────────

type WebhookPayload = {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value: {
        messaging_product?: string;
        metadata?: { phone_number_id: string; display_phone_number: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
};

async function handlePayload(body: WebhookPayload) {
  if (body.object !== "whatsapp_business_account") return;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const { messages, contacts } = change.value;
      if (!messages?.length) continue;

      for (const msg of messages) {
        if (msg.type !== "text" || !msg.text?.body) continue;

        const senderPhone = msg.from;

        // VULN-010: Validate senderPhone is digits-only and sane length
        if (!/^\d{10,15}$/.test(senderPhone)) {
          console.warn("[WhatsApp] Skipping message with invalid sender phone format.");
          continue;
        }

        const waId = contacts?.[0]?.wa_id ?? senderPhone;
        // VULN-005: Limit message text length to prevent abuse (4096 = WhatsApp max)
        const text = msg.text.body.trim().slice(0, 4096);

        if (!text) continue;

        // Idempotency: create delivery row inside a transaction; skip if already present
        let shouldProcess = false;
        try {
          await prisma.$transaction(async (tx) => {
            const existing = await tx.whatsAppDelivery.findUnique({ where: { eId: msg.id } });
            if (existing) return;
            await tx.whatsAppDelivery.create({ data: { eId: msg.id } });
            shouldProcess = true;
          });
        } catch {
          console.error(`[WhatsApp] Idempotency check failed for ${msg.id}`);
        }

        if (!shouldProcess) continue;

        try {
          await processIncomingMessage(waId, senderPhone, msg.id, text);
        } catch {
          // VULN-009: Avoid logging raw message content (may contain PII/health data)
          console.error(`[WhatsApp] Failed to process message ${msg.id}`);
        }
      }
    }
  }
}
