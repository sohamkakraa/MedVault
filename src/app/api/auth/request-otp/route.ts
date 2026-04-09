import { NextResponse } from "next/server";
import { z } from "zod";
import { setOtpDb } from "@/lib/auth/otpDb";
import { checkOtpRateLimit } from "@/lib/auth/otpRateLimit";
import { normalizeLoginIdentifier } from "@/lib/auth/identifiers";
import { getBetaDemoConfig, isBetaDemoIdentifier, shouldExposeBetaDemoOtp } from "@/lib/auth/betaDemo";

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
      { ok: false, error: "Enter a valid email or phone number with country code." },
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

  const devReturn =
    process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_RETURN_OTP === "1";
  const betaExpose = isBetaDemoIdentifier(norm) && shouldExposeBetaDemoOtp();

  return NextResponse.json({
    ok: true,
    channel: norm.kind,
    ...(devReturn ? { devOtp: code } : {}),
    ...(betaExpose ? { betaDemoOtp: code } : {}),
    message:
      "No SMS or email is sent in this prototype. For local testing, set AUTH_DEV_RETURN_OTP=1 to receive the code in this response; production would use your messaging provider.",
  });
}
