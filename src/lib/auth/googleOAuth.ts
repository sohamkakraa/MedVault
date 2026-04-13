/**
 * Google OAuth 2.0 helpers — server-side only (never import from client code).
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID      — from Google Cloud Console → OAuth 2.0 credentials
 *   GOOGLE_CLIENT_SECRET  — same credential
 *
 * In Google Cloud Console → Authorised redirect URIs add:
 *   https://your-domain.com/api/auth/google/callback
 *   http://localhost:3000/api/auth/google/callback  (for local dev)
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleUserInfo {
  sub: string;       // Google user ID (stable)
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Derive the canonical app origin from the incoming request URL. */
export function appOrigin(req: Request): string {
  const u = new URL(req.url);
  // Trust x-forwarded-proto in production (Vercel / reverse proxies)
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}`;
}

/** Build the Google OAuth authorisation URL. */
export function buildGoogleAuthUrl(
  config: GoogleConfig,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokens {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

/** Exchange an authorisation code for tokens. */
export async function exchangeGoogleCode(
  config: GoogleConfig,
  code: string,
  redirectUri: string
): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<GoogleTokens>;
}

/** Fetch the authenticated user's profile from Google. */
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed (${res.status})`);
  }
  const data = (await res.json()) as GoogleUserInfo;
  if (!data.sub || !data.email) {
    throw new Error("Google userinfo missing required fields");
  }
  return data;
}

/** Cookie name for the transient OAuth state parameter (CSRF protection). */
export const GOOGLE_STATE_COOKIE = "uma_google_state";
