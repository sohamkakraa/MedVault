import { prisma } from "@/lib/prisma";
import type { PatientStore } from "@/lib/types";
import type { Prisma } from "@prisma/client";

export async function getServerPatientStore(userId: string): Promise<PatientStore | null> {
  const record = await prisma.patientRecord.findUnique({ where: { userId } });
  if (!record) return null;
  return record.data as PatientStore;
}

const MAX_RETRIES = 3;

/**
 * Read-modify-write with optimistic concurrency.
 * Retries up to MAX_RETRIES times on concurrent write conflicts.
 * Fires a Postgres NOTIFY after a successful upsert so SSE clients can refresh.
 */
export async function upsertPatientStore(
  userId: string,
  updater: (current: PatientStore | null) => PatientStore,
): Promise<PatientStore> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await prisma.patientRecord.findUnique({ where: { userId } });
    const next = updater(current ? (current.data as PatientStore) : null);
    const data = next as unknown as Prisma.InputJsonValue;

    if (!current) {
      await prisma.patientRecord.create({ data: { userId, data } });
      await prisma.$executeRawUnsafe(`NOTIFY patient_store_changed, '${userId}'`);
      return next;
    }

    const updated = await prisma.patientRecord.updateMany({
      where: { userId, updatedAt: current.updatedAt },
      data: { data },
    });

    if (updated.count === 1) {
      await prisma.$executeRawUnsafe(`NOTIFY patient_store_changed, '${userId}'`);
      return next;
    }
    // Concurrent write detected — retry with fresh read
  }
  throw new Error("upsertPatientStore: optimistic concurrency retry exhausted");
}
