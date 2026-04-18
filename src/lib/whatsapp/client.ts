/**
 * WhatsApp Business Cloud API client.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import { normalizeWhatsAppTo } from "./phone";

const GRAPH_API = "https://graph.facebook.com/v21.0";

function getConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set");
  }
  return { token, phoneNumberId };
}

async function graphPost(path: string, body: unknown) {
  const { token } = getConfig();
  const res = await fetch(`${GRAPH_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[WhatsApp] Graph API error ${res.status}:`, text);
    throw new Error(`WhatsApp API ${res.status}: ${text}`);
  }
  return res.json();
}

/** Mark a message as "read" (blue ticks). */
export async function markRead(messageId: string) {
  const { phoneNumberId } = getConfig();
  return graphPost(`/${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

/** Send a plain text reply. WhatsApp limits messages to 4096 chars. */
export async function sendText(to: string, text: string) {
  const { phoneNumberId } = getConfig();
  const trimmed = text.slice(0, 4096);
  const toDigits = normalizeWhatsAppTo(to);
  return graphPost(`/${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toDigits,
    type: "text",
    text: { preview_url: false, body: trimmed },
  });
}

/**
 * Send a message template (required for proactive/outbound messages
 * outside the 24-hour conversation window).
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode = "en",
  components?: unknown[],
) {
  const { phoneNumberId } = getConfig();
  const toDigits = normalizeWhatsAppTo(to);
  return graphPost(`/${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components?.length ? { components } : {}),
    },
  });
}

/**
 * Sends a one-time verification code. **Meta requires a message template** for
 * business-initiated messages when the user has not messaged you in the last
 * 24 hours — plain `text` OTPs are usually rejected (error 131047 etc.).
 *
 * Create a template in WhatsApp Manager with one body variable, e.g.
 * "Your UMA verification code is {{1}}. It expires in 10 minutes."
 * Then set WHATSAPP_OTP_TEMPLATE_NAME (and optionally WHATSAPP_OTP_TEMPLATE_LANG).
 */
export async function sendOtpMessage(to: string, code: string) {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME?.trim();
  const templateLang = process.env.WHATSAPP_OTP_TEMPLATE_LANG?.trim() || "en";

  if (templateName) {
    return sendTemplate(to, templateName, templateLang, [
      { type: "body", parameters: [{ type: "text", text: code }] },
    ]);
  }

  console.warn(
    "[WhatsApp] WHATSAPP_OTP_TEMPLATE_NAME is not set. Sending plain text; Meta usually blocks this unless the user messaged you within 24h. Create an approved OTP template and set WHATSAPP_OTP_TEMPLATE_NAME.",
  );
  return sendText(
    to,
    `Your UMA verification code is: *${code}*\n\nEnter this in the UMA app to link your WhatsApp. Expires in 10 minutes.`,
  );
}

/** Returns true if the required env vars are configured. */
export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}
