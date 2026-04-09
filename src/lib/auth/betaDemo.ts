import type { NormalizedIdentifier } from "@/lib/auth/identifiers";
import { looksLikeEmail, normalizeEmail } from "@/lib/auth/identifiers";

export type BetaDemoConfig = { email: string; otp: string };

/**
 * Shared beta / dummy sign-in: fixed email + 6-digit OTP stored like a normal challenge.
 * Set AUTH_BETA_DEMO_EMAIL + AUTH_BETA_DEMO_OTP on the server. Optional AUTH_BETA_EXPOSE_DEMO_OTP=1
 * returns the code in the request-otp JSON (same trade-off as AUTH_DEV_RETURN_OTP).
 */
export function getBetaDemoConfig(): BetaDemoConfig | null {
  const raw = process.env.AUTH_BETA_DEMO_EMAIL?.trim();
  const otp = process.env.AUTH_BETA_DEMO_OTP?.trim();
  if (!raw || !otp) return null;
  if (!/^\d{6}$/.test(otp)) return null;
  const email = normalizeEmail(raw);
  if (!looksLikeEmail(email)) return null;
  return { email, otp };
}

export function isBetaDemoIdentifier(norm: NormalizedIdentifier): boolean {
  const cfg = getBetaDemoConfig();
  if (!cfg || norm.kind !== "email") return false;
  return norm.display === cfg.email;
}

export function shouldExposeBetaDemoOtp(): boolean {
  return process.env.AUTH_BETA_EXPOSE_DEMO_OTP === "1";
}
