#!/usr/bin/env node
/**
 * Run Prisma CLI without npx (spawnSync("npx", …) can ENOENT on some CI images).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { prismaChildEnv } from "./prisma-env.mjs";

const prismaMain = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");

/** @returns {number} exit code */
export function prismaSpawn(args) {
  if (!existsSync(prismaMain)) {
    console.error(`[UMA] Missing Prisma CLI at ${prismaMain}. Run npm install.`);
    return 127;
  }
  const r = spawnSync(process.execPath, [prismaMain, ...args], {
    stdio: "inherit",
    env: prismaChildEnv(),
    cwd: process.cwd(),
  });
  if (r.error) {
    console.error("[UMA] spawn failed:", r.error.message);
    return 1;
  }
  return r.status ?? 1;
}

export function runPrismaCli(args) {
  process.exit(prismaSpawn(args));
}
