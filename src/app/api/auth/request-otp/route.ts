import { NextResponse } from "next/server";
import { z } from "zod";
import { setOtpDb } from "@/lib/auth/otpDb";
import { checkOtpRateLimit } from "@/lib/auth/otpRateLimit";
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

export const runtime = "nodejs";

const bodySchema = z.object({
  identifier: z.string().min(3).max(320),
  phoneCountryCode: z.string().max(8).optional(),
});

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
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
  if (!checkOtpRateLimit(`otp:${ip}`)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
  }

  const norm = normalizeLoginIdentifier(identifier, phoneCountryCode);
  if (!norm) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  if (norm.kind === "phone") {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign-in with phone is not available yet. Please use your email address.",
      },
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
