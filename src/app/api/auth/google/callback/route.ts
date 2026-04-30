/**
 * GET /api/auth/google/callback
 *
 * Handles the Google OAuth callback:
 *   1. Validates the state cookie (CSRF check)
 *   2. Exchanges the authorisation code for tokens
 *   3. Fetches the Google user's email + stable ID
 *   4. Upserts the User record — linking accounts when the same email already exists
 *   5. Issues a session cookie and redirects to /dashboard
 *
 * Account linking behaviour:
 *   - Google sign-in for an email that was OTP-created → googleId is added to that user
 *   - OTP sign-in for an email that was Google-created → user already exists, OTP just signs in
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  appOrigin,
  exchangeGoogleCode,
  getGoogleConfig,
  getGoogleUserInfo,
  GOOGLE_STATE_COOKIE,
} from "@/lib/auth/googleOAuth";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionSigningFailureHint,
  signSessionToken,
} from "@/lib/auth/sessionToken";

export const runtime = "nodejs";

function loginRedirect(origin: string, error?: string): Response {
  const url = new URL("/login", origin);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const origin = appOrigin(req);
  const { searchParams } = new URL(req.url);

  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // User denied consent on Google's screen
  if (errorParam) {
    return loginRedirect(origin, "Google sign-in was cancelled.");
  }

  if (!code || !stateParam) {
    return loginRedirect(origin, "Invalid response from Google. Please try again.");
  }

  // ── CSRF check ──────────────────────────────────────────────
  const jar = await cookies();
  const savedState = jar.get(GOOGLE_STATE_COOKIE)?.value;
  if (!savedState || savedState !== stateParam) {
    return loginRedirect(origin, "Sign-in session expired. Please try again.");
  }

  // ── Exchange code for tokens ─────────────────────────────────
  const config = getGoogleConfig();
  if (!config) {
    return loginRedirect(origin, "Google sign-in is not configured on this server.");
  }

  let googleUser: Awaited<ReturnType<typeof getGoogleUserInfo>>;
  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokens = await exchangeGoogleCode(config, code, redirectUri);
    googleUser = await getGoogleUserInfo(tokens.access_token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[google/callback] token/userinfo error:", msg);
    return loginRedirect(origin, "Could not complete Google sign-in. Please try again.");
  }

  if (!googleUser.email_verified) {
    return loginRedirect(origin, "Your Google email address is not verified. Please verify it and try again.");
  }

  // ── Upsert user with account linking ────────────────────────
  //
  // Priority order when finding an existing user:
  //   1. User with matching googleId  → already linked, just sign in
  //   2. User with matching email     → OTP-created account, link it now
  //   3. Neither                      → create fresh account
  //
  let user: { id: string; email: string | null };
  try {
    // Case 1: already linked via Google
    let existing = await prisma.user.findUnique({
      where: { googleId: googleUser.sub },
    });

    if (!existing) {
      // Case 2: user exists by email (OTP-created or previous sign-in method)
      const byEmail = await prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (byEmail) {
        // Link Google credentials to existing account
        existing = await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: googleUser.sub,
            googleEmail: googleUser.email,
            // Ensure the canonical email is set (might already be)
            email: byEmail.email ?? googleUser.email,
          },
        });
      }
    }

    if (!existing) {
      // Case 3: brand new user via Google
      existing = await prisma.user.create({
        data: {
          email: googleUser.email,
          googleId: googleUser.sub,
          googleEmail: googleUser.email,
        },
      });
    }

    user = existing;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Rare race: two concurrent sign-ins trying to create the same user
      return loginRedirect(origin, "Account conflict. Please try signing in again.");
    }
    console.error("[google/callback] db error:", e instanceof Error ? e.message : "unknown");
    return loginRedirect(origin, "Could not create or find your account. Please try again.");
  }

  // ── Issue session ────────────────────────────────────────────
  const token = await signSessionToken({
    sub: user.id,
    email: user.email ?? undefined,
  });
  if (!token) {
    return loginRedirect(origin, sessionSigningFailureHint());
  }

  // Clear the state cookie
  const res = NextResponse.redirect(new URL("/dashboard", origin));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  res.cookies.set(GOOGLE_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
