#!/usr/bin/env node
/**
 * Vercel build: prisma migrate → prisma generate → next build.
 * Exit 1 = one of those steps failed; scroll up in the Vercel log for Prisma/Next output
 * immediately above the matching "[vercel-build] ── … ──" banner.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { applyDirectUrlDefault } from "./prisma-env.mjs";
import { prismaSpawn } from "./run-prisma-cli.mjs";
import { nextSpawn } from "./run-next-build.mjs";

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

console.error("\n[vercel-build] Diagnostic (no secret values logged):");
console.error(`  cwd: ${process.cwd()}`);
console.error(`  node: ${process.version}`);
console.error(`  VERCEL_ENV: ${process.env.VERCEL_ENV ?? "(unset)"}`);
console.error(`  DATABASE_URL length: ${db.length}`);
console.error(
  `  DIRECT_URL: ${dir ? `set, length ${dir.length}` : "unset"}${!directUrlBeforeDefault && dir ? " (copied from DATABASE_URL)" : ""}`,
);

const prismaMain = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
const nextMain = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
console.error(`  prisma CLI file exists: ${existsSync(prismaMain)}`);
console.error(`  next CLI file exists: ${existsSync(nextMain)}`);
console.error(
  "\n[vercel-build] Steps run in order. On failure, find the LAST \"──\" banner below,\n" +
    "then read the error lines immediately ABOVE it (Prisma P#### or Next/TypeScript).\n",
);

function fail(label, code) {
  console.error(`\n[vercel-build] ══ FAILED: ${label} (exit ${code}) ══\n`);
  if (label.includes("migrate")) {
    console.error(`Decode:
  • P1001 / "Can't reach database" → wrong DATABASE_URL, DB down, or network; use sslmode=require if your host requires it.
  • P1017 / connection closed → on Neon set DIRECT_URL to the non-pooled "direct" connection; keep pooled URL in DATABASE_URL.
  • Auth failed → wrong user/password in the URL.
  • https://www.prisma.io/docs/reference/error-reference
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
  console.error(`\n[vercel-build] ── ${label} ──\n`);
  if (code !== 0) fail(label, code);
  console.error(`[vercel-build] OK: ${label}\n`);
}

run("prisma migrate deploy", prismaSpawn(["migrate", "deploy"]));
run("prisma generate", prismaSpawn(["generate"]));
run("next build", nextSpawn(["build"]));

console.error("[vercel-build] All steps finished successfully.\n");
