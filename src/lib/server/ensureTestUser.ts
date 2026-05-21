import { prisma } from "@/lib/prisma";

/**
 * Ensures a User row exists for automation / e2e sessions (signed cookie with a fixed sub).
 * Prevents FK errors when patient-store or threads APIs run against a cookie-only identity.
 */
export async function ensureTestUser(
  userId: string,
  profile?: { email?: string | null; phoneE164?: string | null },
): Promise<void> {
  const email = profile?.email?.trim() || `${userId}@uma.test`;
  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email,
      phoneE164: profile?.phoneE164 ?? null,
    },
    update: {
      ...(profile?.email ? { email: profile.email } : {}),
      ...(profile?.phoneE164 ? { phoneE164: profile.phoneE164 } : {}),
    },
  });
}
