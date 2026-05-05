import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionClaims } from "@/lib/auth/sessionToken";

export async function getSessionClaims(): Promise<SessionClaims | null> {
  // 1. Check Authorization: Bearer <token> header (used by iOS native client)
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const claims = await verifySessionToken(token);
      if (claims) return claims;
    }
  }

  // 2. Fall back to cookie (web app)
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return verifySessionToken(raw);
}

export async function requireUserId(): Promise<string | null> {
  const c = await getSessionClaims();
  return c?.sub ?? null;
}
