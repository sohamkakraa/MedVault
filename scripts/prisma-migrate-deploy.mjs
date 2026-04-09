#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { applyDirectUrlDefault } from "./prisma-env.mjs";

applyDirectUrlDefault();
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
