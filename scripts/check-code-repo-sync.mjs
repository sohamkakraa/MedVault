#!/usr/bin/env node
/**
 * check-code-repo-sync.mjs
 *
 * Pre-commit hook — ensures every staged file has a row in CODE_REPO.md.
 *
 * - For new files: appends a stub row with "TODO: describe" and stages it.
 * - For deleted files: warns if the row was not removed (non-blocking).
 * - Fails only when a staged file is completely absent from CODE_REPO.md
 *   (after auto-stub insertion fails).
 *
 * Wire up via simple-git-hooks in package.json:
 *   "simple-git-hooks": { "pre-commit": "node scripts/check-code-repo-sync.mjs" }
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const REPO_FILE = join(ROOT, "CODE_REPO.md");

const SKIP_EXTS = new Set([".json", ".md", ".sql", ".toml", ".css", ".png", ".ico", ".svg", ".txt", ".gitkeep"]);
const SKIP_PATHS = ["node_modules", ".next", ".git", ".claude/worktrees", "__screenshots__"];

function getStagedFiles() {
  try {
    return execSync("git diff --cached --name-only", { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function shouldCheck(file) {
  if (SKIP_PATHS.some((p) => file.includes(p))) return false;
  const ext = "." + file.split(".").pop();
  if (SKIP_EXTS.has(ext)) return false;
  return file.startsWith("src/") || file.startsWith("scripts/") || file.startsWith("prisma/");
}

function isInRegistry(content, file) {
  return content.includes(`\`${file}\``);
}

function appendStubRow(content, file) {
  // Find the best section to insert into
  const ext = file.split(".").pop();
  const topDir = file.split("/").slice(0, 2).join("/");
  const sectionHeader = `## \`${topDir}/\``;

  const stubRow = `- \`${file}\` · TODO: describe · no named exports`;

  // Try to insert after the matching section header
  const idx = content.indexOf(sectionHeader);
  if (idx !== -1) {
    const afterHeader = content.indexOf("\n", idx) + 1;
    return content.slice(0, afterHeader) + stubRow + "\n" + content.slice(afterHeader);
  }

  // Fallback: append at end
  return content.trimEnd() + "\n" + stubRow + "\n";
}

const staged = getStagedFiles();
const relevant = staged.filter(shouldCheck);

if (relevant.length === 0) {
  process.exit(0);
}

let repoContent = "";
try {
  repoContent = readFileSync(REPO_FILE, "utf8");
} catch {
  console.warn("[code-repo-sync] CODE_REPO.md not found — skipping check. Run: node scripts/bootstrap-code-repo.mjs");
  process.exit(0);
}

let modified = false;
let hasUnresolved = false;

for (const file of relevant) {
  if (isInRegistry(repoContent, file)) continue;

  // Check if it's a deletion
  const isDeleted = !spawnSync("git", ["ls-files", "--error-unmatch", file], { cwd: ROOT }).status === 0;
  if (isDeleted) {
    console.warn(`[code-repo-sync] WARN: \`${file}\` deleted but row not removed from CODE_REPO.md`);
    continue;
  }

  // New file — append stub
  console.log(`[code-repo-sync] Adding stub row for new file: ${file}`);
  repoContent = appendStubRow(repoContent, file);
  modified = true;
}

if (modified) {
  writeFileSync(REPO_FILE, repoContent, "utf8");
  try {
    execSync(`git add "${REPO_FILE}"`, { cwd: ROOT });
    console.log("[code-repo-sync] CODE_REPO.md updated and staged. Fill in the TODO descriptions.");
  } catch {
    console.warn("[code-repo-sync] Could not auto-stage CODE_REPO.md — please stage it manually.");
  }
}

if (hasUnresolved) {
  process.exit(1);
}

process.exit(0);
