#!/usr/bin/env node
/**
 * Vercel build: clear step labels, Prisma + Next via node (avoid npx spawn issues on CI).
 */
import { applyDirectUrlDefault } from "./prisma-env.mjs";
import { prismaSpawn } from "./run-prisma-cli.mjs";
import { nextSpawn } from "./run-next-build.mjs";

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

function fail(label, code) {
  console.error(`\n[vercel-build] FAILED: ${label} (exit ${code})\n`);
  if (label.includes("migrate")) {
    console.error(
      "If this is a database error: set DATABASE_URL and (on Neon) DIRECT_URL for this Vercel environment, then redeploy.",
    );
  }
  process.exit(code);
}

function run(label, code) {
  console.error(`\n[vercel-build] ${label}\n`);
  if (code !== 0) fail(label, code);
}

run("prisma migrate deploy", prismaSpawn(["migrate", "deploy"]));
run("prisma generate", prismaSpawn(["generate"]));
run("next build", nextSpawn(["build"]));
