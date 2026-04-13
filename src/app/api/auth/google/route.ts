/**
 * GET /api/auth/google
 *
 * Initiates the Google OAuth 2.0 flow:
 *   1. Generates a random state token for CSRF protection
 *   2. Stores it in a short-lived HttpOnly cookie
 *   3. Redirects the browser to Google's consent screen
 */

import { NextResponse } from "next/server";
import {
  appOrigin,
  buildGoogleAuthUrl,
  getGoogleConfig,
  GOOGLE_STATE_COOKIE,
} from "@/lib/auth/googleOAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const config = getGoogleConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL(
        "/login?error=" + encodeURIComponent("Google sign-in is not configured on this server."),
        appOrigin(req)
      )
    );
  }

  const state = crypto.randomUUID();
  const origin = appOrigin(req);
  const redirectUri = `${origin}/api/auth/google/callback`;
  const authUrl = buildGoogleAuthUrl(config, redirectUri, state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
