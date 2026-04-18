/**
 * WhatsApp Cloud API expects `to` as digits only (international format, no +).
 * Incoming webhooks use the same format.
 */
export function normalizeWhatsAppTo(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new Error("invalid_whatsapp_phone");
  }
  return digits;
}
