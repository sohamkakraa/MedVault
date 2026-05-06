import type { PatientStore } from "@/lib/types";

/** Drop embedded PDF bytes and sensitive ephemeral fields before syncing to the API.
 *
 * Security: `whatsappVerificationCode` and `whatsappVerificationSentAt` are
 * short-lived OTP fields that live on `profile` in the client-side localStorage
 * store. They must never be persisted verbatim to the database — the server
 * manages WhatsApp verification state on the User row, not in patientRecord.
 */
export function patientStoreForApiPayload(store: PatientStore): PatientStore {
  const { whatsappVerificationCode: _code, whatsappVerificationSentAt: _sentAt, ...safeProfile } =
    store.profile as PatientStore["profile"] & {
      whatsappVerificationCode?: unknown;
      whatsappVerificationSentAt?: unknown;
    };
  return {
    ...store,
    profile: safeProfile as PatientStore["profile"],
    docs: store.docs.map((d) => ({ ...d, originalPdfBase64: undefined })),
  };
}

export function parsePatientStoreJson(data: unknown): PatientStore | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.docs) || !o.profile || typeof o.profile !== "object") return null;
  return data as PatientStore;
}
