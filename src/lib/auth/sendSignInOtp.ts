import { Resend } from "resend";

export function isOtpEmailDeliveryConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  return Boolean(key && from);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Resend API error `name` field (no PII). */
export type ResendOtpErrorName =
  | "missing_api_key"
  | "invalid_api_Key"
  | "invalid_from_address"
  | "validation_error"
  | "rate_limit_exceeded"
  | "application_error"
  | "internal_server_error"
  | string;

export type SendSignInOtpResult =
  | { ok: true }
  | { ok: false; kind: "network" }
  | { ok: false; kind: "resend"; name: ResendOtpErrorName };

/**
 * User-facing copy for failed sends (no secrets or recipient data).
 */
export function messageForSendSignInOtpFailure(result: Extract<SendSignInOtpResult, { ok: false }>): string {
  if (result.kind === "network") {
    return "We could not reach the email service. Try again in a moment.";
  }
  switch (result.name) {
    case "invalid_from_address":
      return (
        "The sign-in email could not be sent because the sender address is not verified in Resend. " +
        "Use UMA <onboarding@resend.dev> in AUTH_EMAIL_FROM until your domain is verified, or verify your domain in the Resend dashboard."
      );
    case "missing_api_key":
    case "invalid_api_Key":
      return "Email could not be sent: check that RESEND_API_KEY is valid for this environment.";
    case "rate_limit_exceeded":
      return "Too many sign-in emails were sent. Please wait a few minutes and try again.";
    case "validation_error":
      return "The email service rejected the message. Check AUTH_EMAIL_FROM format (e.g. UMA <onboarding@resend.dev>).";
    default:
      return "We could not send the sign-in email. Try again in a moment.";
  }
}

function logResendOtpFailure(result: Extract<SendSignInOtpResult, { ok: false }>) {
  const allow =
    process.env.NODE_ENV === "development" || process.env.AUTH_LOG_RESEND_ERRORS === "1";
  if (!allow) return;
  if (result.kind === "network") {
    console.warn("[uma-auth] Resend OTP: network or unexpected error");
    return;
  }
  console.warn("[uma-auth] Resend OTP failed:", result.name);
}

/**
 * Sends a 6-digit sign-in code. Does not log the recipient or code.
 */
export async function sendSignInOtpEmail(to: string, code: string): Promise<SendSignInOtpResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!key || !from) return { ok: false, kind: "resend", name: "missing_api_key" };

  const resend = new Resend(key);
  const safeCode = escapeHtml(code);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: "Your UMA sign-in code",
      text: `Your UMA sign-in code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<p style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#151515">Your UMA sign-in code is:</p>
<p style="font-family:ui-monospace,monospace;font-size:28px;font-weight:600;letter-spacing:0.2em;margin:16px 0">${safeCode}</p>
<p style="font-family:system-ui,sans-serif;font-size:14px;color:#555">This code expires in 10 minutes. If you did not try to sign in, you can ignore this message.</p>`,
    });

    if (error) {
      const result = { ok: false as const, kind: "resend" as const, name: error.name as ResendOtpErrorName };
      logResendOtpFailure(result);
      return result;
    }
    if (!data?.id) {
      const result = { ok: false as const, kind: "resend" as const, name: "application_error" };
      logResendOtpFailure(result);
      return result;
    }
    return { ok: true };
  } catch {
    const result = { ok: false as const, kind: "network" as const };
    logResendOtpFailure(result);
    return result;
  }
}
