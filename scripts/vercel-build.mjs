#!/usr/bin/env node
/**
 * Vercel build: prisma migrate → prisma generate → next build.
 * Exit 1 = one of those steps failed; scroll up in the Vercel log for Prisma/Next output
 * immediately above the matching "[vercel-build] ── … ──" banner.
 *
 * Use stdout (console.log) for routine messages so Vercel does not mark the build as having "errors".
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { applyDirectUrlDefault, loadProjectEnvForPrismaScripts } from "./prisma-env.mjs";
import { prismaSpawn } from "./run-prisma-cli.mjs";
import { nextSpawn } from "./run-next-build.mjs";

loadProjectEnvForPrismaScripts();

if (!process.env.DATABASE_URL?.trim()) {
  console.error(`
[vercel-build] STOP: DATABASE_URL is missing or whitespace-only.

Vercel → Project → Settings → Environment Variables:
  • Add DATABASE_URL for each environment you use (Production and/or Preview).
  • PR previews only see variables when "Preview" is enabled for that key.

See README.md → "Deploy a beta on a free tier".
`);
  process.exit(1);
}

const directUrlBeforeDefault = Boolean(process.env.DIRECT_URL?.trim());
applyDirectUrlDefault();

const db = process.env.DATABASE_URL.trim();
const dir = process.env.DIRECT_URL?.trim() ?? "";

console.log("\n[vercel-build] Diagnostic (no secret values logged):");
console.log(`  cwd: ${process.cwd()}`);
console.log(`  node: ${process.version}`);
console.log(`  VERCEL_ENV: ${process.env.VERCEL_ENV ?? "(unset)"}`);
console.log(`  DATABASE_URL length: ${db.length}`);
console.log(
  `  DIRECT_URL: ${dir ? `set, length ${dir.length}` : "unset"}${!directUrlBeforeDefault && dir ? " (copied from DATABASE_URL)" : ""}`,
);

const prismaMain = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
const nextMain = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
console.log(`  prisma CLI file exists: ${existsSync(prismaMain)}`);
console.log(`  next CLI file exists: ${existsSync(nextMain)}`);
console.log(
  "\n[vercel-build] Steps run in order. On failure, find the LAST \"──\" banner below,\n" +
    "then read the output immediately ABOVE it (Prisma P#### or Next/TypeScript).\n",
);

/** Synchronous sleep — safe in a build script (single-threaded, no event loop needed). */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fail(label, code) {
  console.error(`\n[vercel-build] ══ FAILED: ${label} (exit ${code}) ══\n`);
  if (label.includes("migrate")) {
    console.error(`Decode:
  • P1002 / advisory lock timeout → Neon scale-to-zero woke too slowly, or DIRECT_URL points to the pooler.
      Fix: set DIRECT_URL to the non-pooled Neon connection string (omit "-pooler" from the hostname).
  • P1001 / "Can't reach database" → wrong DATABASE_URL, DB down, or network; use sslmode=require if your host requires it.
  • P1017 / connection closed → on Neon set DIRECT_URL to the non-pooled "direct" connection; keep pooled URL in DATABASE_URL.
  • Auth failed → wrong user/password in the URL.
  • https://www.prisma.io/docs/reference-error-reference
`);
  } else if (label.includes("generate")) {
    console.error(`Decode:
  • P1012 → env missing when reading schema (unexpected after migrate).
`);
  } else if (label.includes("next build")) {
    console.error(`Decode:
  • TypeScript / "Failed to compile" → fix errors shown above.
  • ESLint during build → fix lint or adjust next.config (see Next docs).
`);
  }
  process.exit(code);
}

function run(label, code) {
  console.log(`\n[vercel-build] ── ${label} ──\n`);
  if (code !== 0) fail(label, code);
  console.log(`[vercel-build] OK: ${label}\n`);
}

/**
 * prisma migrate deploy can hit P1002 (advisory lock timeout) on Neon when the DB
 * wakes from scale-to-zero. Retry up to 3 times with a 6-second gap.
 */
function runMigrate(maxAttempts = 3, delayMs = 6000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n[vercel-build] ── prisma migrate deploy (attempt ${attempt}/${maxAttempts}) ──\n`);
    const code = prismaSpawn(["migrate", "deploy"]);
    if (code === 0) {
      console.log(`[vercel-build] OK: prisma migrate deploy\n`);
      return;
    }
    if (attempt < maxAttempts) {
      console.log(`[vercel-build] migrate exited ${code} — waiting ${delayMs / 1000}s before retry (Neon wake-up / advisory lock)...`);
      sleepSync(delayMs);
    } else {
      fail("prisma migrate deploy", code);
    }
  }
}

runMigrate();
run("prisma generate", prismaSpawn(["generate"]));
run("next build", nextSpawn(["build"]));

console.log("[vercel-build] All steps finished successfully.\n");
