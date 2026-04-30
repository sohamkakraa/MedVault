import { NextResponse } from "next/server";
import { z } from "zod";
import { setOtpDb } from "@/lib/auth/otpDb";
import { checkRateLimitDb } from "@/lib/auth/otpRateLimitDb";
import { normalizeLoginIdentifier } from "@/lib/auth/identifiers";
import {
  getBetaDemoConfig,
  isBetaDemoIdentifier,
  shouldExposeBetaDemoOtp,
} from "@/lib/auth/betaDemo";
import {
  isOtpEmailDeliveryConfigured,
  messageForSendSignInOtpFailure,
  sendSignInOtpEmail,
} from "@/lib/auth/sendSignInOtp";
import { isWhatsAppConfigured, sendOtpMessage } from "@/lib/whatsapp/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  identifier: z.string().min(3).max(320),
  phoneCountryCode: z.string().max(8).optional(),
});

/**
 * Fixed VULN-010: prefer x-real-ip (set by Vercel's edge to the true client IP)
 * over x-forwarded-for, which can be spoofed by clients to bypass rate limiting.
 * On Vercel, x-real-ip is always the actual client IP and cannot be forged.
 */
function clientIp(req: Request): string {
  // x-real-ip is set by Vercel/nginx to the true client IP — not user-spoofable
  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  // Fallback: use the LAST (rightmost) value in x-forwarded-for, which is set
  // by the trusted proxy, not the client
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const parts = xf.split(",").map((s) => s.trim()).filter(Boolean);
    return parts[parts.length - 1] ?? "unknown";
  }
  return "unknown";
}

function devReturnAllowed(): boolean {
  return (
    process.env.AUTH_DEV_RETURN_OTP === "1" &&
    (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview")
  );
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { identifier, phoneCountryCode } = parsed.data;
  const ip = clientIp(req);
  // VULN-007 fix: use DB-backed rate limiter (8 OTP requests per hour per IP)
  if (!(await checkRateLimitDb(`otp-req:${ip}`, 8, 60 * 60 * 1000))) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
  }

  const norm = normalizeLoginIdentifier(identifier, phoneCountryCode);
  if (!norm) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const betaCfg = getBetaDemoConfig();
  const code =
    betaCfg && isBetaDemoIdentifier(norm) ? betaCfg.otp : String(Math.floor(100000 + Math.random() * 900000));
  try {
    await setOtpDb(norm.key, code);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Sign-in service is unavailable. Check DATABASE_URL and run database migrations." },
      { status: 503 },
    );
  }

  const devReturn = devReturnAllowed();
  const betaExpose = isBetaDemoIdentifier(norm) && shouldExposeBetaDemoOtp();
  const emailConfigured = isOtpEmailDeliveryConfigured();
  const isBetaDemoUser = Boolean(betaCfg && isBetaDemoIdentifier(norm));

  // Phone sign-in via WhatsApp. We reuse the same OtpChallenge store the email
  // path uses, so `verify-otp` can consume the code from the same lookup key.
  if (norm.kind === "phone") {
    if (!isWhatsAppConfigured()) {
      if (devReturn) {
        return NextResponse.json({
          ok: true,
          channel: norm.kind,
          devOtp: code,
          message:
            "WhatsApp is not configured on this server. For local or Preview testing, the sign-in code is shown below.",
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "Phone sign-in is not configured. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and (ideally) WHATSAPP_OTP_TEMPLATE_NAME on the server.",
        },
        { status: 503 },
      );
    }

    try {
      // `sendOtpMessage` uses the approved template when WHATSAPP_OTP_TEMPLATE_NAME
      // is set, otherwise falls back to plain text (which Meta usually blocks
      // outside a 24h window — the client logs a clear warning).
      await sendOtpMessage(norm.e164, code);
    } catch (e) {
      console.error("[uma-auth] WhatsApp OTP send failed:", e instanceof Error ? e.message : "unknown");
      if (devReturn) {
        return NextResponse.json({
          ok: true,
          channel: norm.kind,
          devOtp: code,
          message:
            "WhatsApp send failed; showing the code inline because AUTH_DEV_RETURN_OTP is enabled.",
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "We could not send the WhatsApp code. Double-check the number and try again, or sign in with email.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      channel: norm.kind,
      message:
        "We sent a 6-digit code to your WhatsApp. It expires in 10 minutes. If you do not see it, re-open WhatsApp or request a new code.",
      ...(devReturn ? { devOtp: code } : {}),
      ...(betaExpose ? { betaDemoOtp: code } : {}),
    });
  }

  if (emailConfigured) {
    const sent = await sendSignInOtpEmail(norm.display, code);
    if (!sent.ok) {
      const allowInlineOtp = devReturn || betaExpose;
      if (allowInlineOtp) {
        return NextResponse.json({
          ok: true,
          channel: norm.kind,
          ...(devReturn ? { devOtp: code } : {}),
          ...(betaExpose ? { betaDemoOtp: code } : {}),
          message:
            "Email could not be sent (check Resend domain and AUTH_EMAIL_FROM). For this Preview/dev session the code is shown below so you can continue testing.",
        });
      }
      return NextResponse.json(
        { ok: false, error: messageForSendSignInOtpFailure(sent) },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      channel: norm.kind,
      message:
        "We sent a 6-digit code to your email. It expires in about 10 minutes. If it does not arrive, check spam or request a new code.",
    });
  }

  if (devReturn || betaExpose) {
    return NextResponse.json({
      ok: true,
      channel: norm.kind,
      ...(devReturn ? { devOtp: code } : {}),
      ...(betaExpose ? { betaDemoOtp: code } : {}),
      message:
        "Email delivery is not configured on this server. For local or Preview testing, set RESEND_API_KEY and AUTH_EMAIL_FROM to send real messages.",
    });
  }

  if (isBetaDemoUser) {
    return NextResponse.json({
      ok: true,
      channel: norm.kind,
      message: "Use the sign-in code you were given for this demo account.",
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Email sign-in is not configured. Add RESEND_API_KEY and AUTH_EMAIL_FROM, or use AUTH_DEV_RETURN_OTP on a Preview deployment for testing.",
    },
    { status: 503 },
  );
}
