/**
 * Prisma schema may define `directUrl` (e.g. Neon: pooled DATABASE_URL + direct DIRECT_URL).
 * When only DATABASE_URL is set, default DIRECT_URL so generate/migrate work (non-pooled setups).
 */
export function applyDirectUrlDefault() {
  if (!process.env.DIRECT_URL?.trim() && process.env.DATABASE_URL?.trim()) {
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }
}
