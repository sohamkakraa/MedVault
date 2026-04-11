import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isTransientConnectionError(e: unknown): boolean {
  if (e && typeof e === "object") {
    const code = (e as { code?: string }).code;
    if (code === "P1017" || code === "P1001") return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.toLowerCase();
  return (
    m.includes("kind: closed") ||
    m.includes("server has closed the connection") ||
    m.includes("connection closed") ||
    m.includes("econnreset") ||
    m.includes("socket hang up") ||
    m.includes("terminated")
  );
}

function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (e) {
          if (!isTransientConnectionError(e)) throw e;
          await base.$disconnect().catch(() => {});
          await base.$connect();
          return query(args);
        }
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
