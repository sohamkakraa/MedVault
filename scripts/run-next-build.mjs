#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const nextMain = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

export function nextSpawn(args) {
  if (!existsSync(nextMain)) {
    console.error(`[UMA] Missing Next.js CLI at ${nextMain}. Run npm install.`);
    return 127;
  }
  const r = spawnSync(process.execPath, [nextMain, ...args], {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
  if (r.error) {
    console.error("[UMA] spawn failed:", r.error.message);
    return 1;
  }
  return r.status ?? 1;
}

export function runNextBuild() {
  process.exit(nextSpawn(["build"]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runNextBuild();
}
