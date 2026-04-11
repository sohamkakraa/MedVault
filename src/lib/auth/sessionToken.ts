const MAX_AGE_SEC = 60 * 60 * 24 * 14;

export type SessionClaims = {
  v: 2;
  exp: number;
  sub: string;
  email?: string;
  phoneE164?: string;
};

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") {
    return "uma-dev-auth-secret-min-16-chars";
  }
  return "";
}

/**
 * Production (including Vercel Preview: NODE_ENV=production) needs AUTH_SECRET ≥ 16 chars.
 * Local `next dev` uses a dev fallback, so missing AUTH_SECRET only breaks prod-like deploys.
 */
export function sessionSigningFailureHint(): string {
  if (process.env.NODE_ENV !== "production") {
    return "Server configuration error.";
  }
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    return "Sign-in cannot complete: set AUTH_SECRET to at least 16 characters in this environment (e.g. Vercel → Settings → Environment Variables → Preview).";
  }
  return "Server configuration error.";
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const b64 = (s + "=".repeat(pad)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSessionToken(
  claims: {
    sub: string;
    email?: string;
    phoneE164?: string;
    exp?: number;
  },
): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const exp = claims.exp ?? Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload: SessionClaims = {
    v: 2,
    exp,
    sub: claims.sub,
    email: claims.email,
    phoneE164: claims.phoneE164,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = toBase64Url(new TextEncoder().encode(payloadJson));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  const secret = getSecret();
  if (!secret) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const payloadB64 = token.slice(0, i);
  const sigB64 = token.slice(i + 1);
  if (!payloadB64 || !sigB64) return null;
  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64Url(sigB64);
  } catch {
    return null;
  }
  const key = await importHmacKey(secret);
  const sigForVerify = new Uint8Array(sigBytes.length);
  sigForVerify.set(sigBytes);
  const ok = await crypto.subtle.verify("HMAC", key, sigForVerify, new TextEncoder().encode(payloadB64));
  if (!ok) return null;
  let payload: SessionClaims;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as SessionClaims;
  } catch {
    return null;
  }
  if (payload.v !== 2 || typeof payload.exp !== "number" || typeof payload.sub !== "string" || !payload.sub) {
    return null;
  }
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
}

export const SESSION_COOKIE = "mv_session";
export const SESSION_MAX_AGE = MAX_AGE_SEC;
