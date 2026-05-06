import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { otpStorageKey, hashOtpCode } from "@/lib/auth/otpMemory";

const OTP_TTL_MS = 10 * 60 * 1000;

export async function setOtpDb(normalizedKey: string, code: string): Promise<void> {
  const lookupKey = otpStorageKey(normalizedKey);
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.otpChallenge.deleteMany({ where: { lookupKey } });
  await prisma.otpChallenge.create({
    data: { lookupKey, codeHash, expiresAt },
  });
}

export async function verifyAndConsumeOtpDb(normalizedKey: string, code: string): Promise<boolean> {
  const lookupKey = otpStorageKey(normalizedKey);
  const row = await prisma.otpChallenge.findUnique({ where: { lookupKey } });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) await prisma.otpChallenge.delete({ where: { lookupKey } }).catch(() => {});
    return false;
  }
  const a = Buffer.from(row.codeHash, "hex");
  const b = Buffer.from(hashOtpCode(code.trim()), "hex");
  const ok = a.length === b.length && timingSafeEqual(a, b);
  await prisma.otpChallenge.delete({ where: { lookupKey } }).catch(() => {});
  return ok;
}
