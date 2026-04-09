#!/usr/bin/env node
/**
 * Vercel build: clear step labels in logs, DATABASE_URL check, Prisma + Next.
 */
import { spawnSync } from "node:child_process";
import { applyDirectUrlDefault } from "./prisma-env.mjs";

if (!process.env.DATABASE_URL?.trim()) {
  console.error(`
[UMA] Missing DATABASE_URL

Add it in Vercel: Project → Settings → Environment Variables
Enable it for the environment you deploy (Production and/or Preview).

Using Neon? Prefer:
  • DATABASE_URL = pooled connection (serverless)
  • DIRECT_URL   = direct connection (for migrations)
If DIRECT_URL is unset, it defaults to DATABASE_URL (fine for non-Neon or direct-only URLs).

See README.md → "Deploy a beta on a free tier".
`);
  process.exit(1);
}

applyDirectUrlDefault();

function run(label, command, args) {
  console.error(`\n[vercel-build] ${label}\n`);
  const r = spawnSync(command, args, { stdio: "inherit", env: process.env, shell: false });
  if (r.status !== 0) {
    console.error(`\n[vercel-build] FAILED: ${label} (exit ${r.status ?? 1})\n`);
    process.exit(r.status ?? 1);
  }
}

run("prisma migrate deploy", "npx", ["prisma", "migrate", "deploy"]);
run("prisma generate", "npx", ["prisma", "generate"]);
run("next build", "npx", ["next", "build"]);
