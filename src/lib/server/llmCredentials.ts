import { prisma } from "@/lib/prisma";
import type { ProviderId } from "@/lib/providers/registry";

// pgcrypto symmetric encryption — key stored in LLM_CRED_MASTER_SECRET env var.
// We call postgres functions directly to keep the key server-side only.

async function encryptKey(plaintext: string): Promise<Uint8Array> {
  const secret = process.env.LLM_CRED_MASTER_SECRET;
  if (!secret) throw new Error("LLM_CRED_MASTER_SECRET env var not set");
  // pgp_sym_encrypt returns BYTEA; Prisma v6 maps BYTEA to Uint8Array
  const result = await prisma.$queryRaw<{ c: Uint8Array }[]>`
    SELECT pgp_sym_encrypt(${plaintext}, ${secret}) as c
  `;
  return result[0].c;
}

async function decryptKey(cipher: Uint8Array): Promise<string> {
  const secret = process.env.LLM_CRED_MASTER_SECRET;
  if (!secret) throw new Error("LLM_CRED_MASTER_SECRET env var not set");
  // Convert Uint8Array to Buffer for Prisma raw query parameter
  const cipherBuf = Buffer.from(cipher);
  const result = await prisma.$queryRaw<{ p: string }[]>`
    SELECT pgp_sym_decrypt(${cipherBuf}, ${secret}) as p
  `;
  return result[0].p;
}

export async function saveCredential(
  userId: string,
  provider: ProviderId,
  modelId: string,
  apiKey: string,
): Promise<void> {
  const cipher = await encryptKey(apiKey);
  const lastFour = apiKey.slice(-4);
  await prisma.userLlmCredential.upsert({
    where: { userId },
    create: { userId, provider, modelId, apiKeyCipher: Buffer.from(cipher), apiKeyLastFour: lastFour, verifiedAt: new Date() },
    update: { provider, modelId, apiKeyCipher: Buffer.from(cipher), apiKeyLastFour: lastFour, verifiedAt: new Date() },
  });
}

export async function loadCredential(userId: string): Promise<{
  provider: ProviderId;
  modelId: string;
  apiKey: string;
  lastFour: string;
  verifiedAt: Date | null;
} | null> {
  const row = await prisma.userLlmCredential.findUnique({ where: { userId } });
  if (!row) return null;
  try {
    const apiKey = await decryptKey(row.apiKeyCipher as Uint8Array);
    return { provider: row.provider as ProviderId, modelId: row.modelId, apiKey, lastFour: row.apiKeyLastFour, verifiedAt: row.verifiedAt };
  } catch {
    return null;
  }
}

export async function deleteCredential(userId: string): Promise<void> {
  await prisma.userLlmCredential.delete({ where: { userId } }).catch(() => {});
}

export async function getCredentialMeta(userId: string): Promise<{
  provider: ProviderId;
  modelId: string;
  lastFour: string;
  verifiedAt: Date | null;
} | null> {
  const row = await prisma.userLlmCredential.findUnique({ where: { userId } });
  if (!row) return null;
  return { provider: row.provider as ProviderId, modelId: row.modelId, lastFour: row.apiKeyLastFour, verifiedAt: row.verifiedAt };
}
