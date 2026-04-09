/**
 * Prisma schema uses `directUrl = env("DIRECT_URL")`. When only DATABASE_URL is set,
 * we mirror it into DIRECT_URL (e.g. single Neon URL or local Postgres).
 *
 * Prisma CLI loads `.env` in its own process; our Node wrappers must populate
 * `process.env` first (DATABASE_URL often exists only in `.env`, not the shell).
 *
 * Empty `DIRECT_URL=` lines in `.env` must not win — Prisma treats empty string like a missing var (P1012).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(relPath) {
  const p = resolve(process.cwd(), relPath);
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (let line of text.split("\n")) {
    line = line.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) {
      line = line.slice(7).trim();
    }
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Ignore empty assignments so DIRECT_URL= does not block defaulting from DATABASE_URL.
    if (val === "") continue;
    process.env[key] = val;
  }
}

export function loadProjectEnvForPrismaScripts() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
  loadEnvFile(".env.development.local");
}

/** Normalize DATABASE_URL / DIRECT_URL on the current process (non-empty DIRECT_URL whenever DB is set). */
export function applyDirectUrlDefault() {
  loadProjectEnvForPrismaScripts();
  const db = process.env.DATABASE_URL?.trim() ?? "";
  let direct = process.env.DIRECT_URL?.trim() ?? "";
  if (db) {
    if (!direct) direct = db;
    process.env.DATABASE_URL = db;
    process.env.DIRECT_URL = direct;
  }
}

/**
 * Env object for spawning Prisma CLI — always pass explicit DATABASE_URL + DIRECT_URL when DB is configured,
 * so the child never sees an empty DIRECT_URL after Prisma merges `.env`.
 */
export function prismaChildEnv() {
  applyDirectUrlDefault();
  const db = process.env.DATABASE_URL?.trim() ?? "";
  const direct = (process.env.DIRECT_URL?.trim() || db) || "";
  if (!db) {
    return { ...process.env };
  }
  return {
    ...process.env,
    DATABASE_URL: db,
    DIRECT_URL: direct || db,
  };
}
