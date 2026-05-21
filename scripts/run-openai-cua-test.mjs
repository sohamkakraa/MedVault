#!/usr/bin/env node
/**
 * Runs OpenAI CUA UI tests against UMA using openai-testing-agent-demo (cloned to _tmp-testing-agent).
 *
 * Prerequisites:
 *   - UMA dev server: npm run dev (localhost:3000)
 *   - OPENAI_API_KEY in UMA .env
 *   - Once: cd _tmp-testing-agent && npm install && npx playwright install chromium
 *
 * Usage: node scripts/run-openai-cua-test.mjs
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const AGENT_ROOT = join(ROOT, "_tmp-testing-agent");
const CUA_DIR = join(AGENT_ROOT, "cua-server");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(join(ROOT, ".env"));

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required in .env for the CUA testing agent.");
  process.exit(1);
}

if (!existsSync(join(AGENT_ROOT, "cua-server", "package.json"))) {
  console.error("Clone openai-testing-agent-demo to _tmp-testing-agent first.");
  process.exit(1);
}

const TEST_CASE = `You are testing UMA (Ur Medical Assistant), a health dashboard for non-technical users.

1. Confirm you are on the health dashboard (look for health summary cards, medications, or "At a Glance").
2. Scroll through the dashboard and verify at least two sections are readable.
3. Open the chat interface from the navigation or floating chat control.
4. Type "What medications am I on?" and send it. Wait for a reply.
5. Open the notification bell if visible and confirm the panel opens.
6. Report PASS if all steps completed without broken layouts or error pages.`;

const SOCKET_URL = process.env.SOCKET_SERVER_URL || "http://localhost:8000";
const UMA_URL = process.env.UMA_CUA_URL || "http://localhost:3000/dashboard";

function runCuaServer() {
  return spawn("npm", ["run", "dev"], {
    cwd: CUA_DIR,
    env: { ...process.env, SOCKET_PORT: "8000", CORS_ORIGIN: "*" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitForServer(ms = 8000) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTest() {
  console.log("Starting CUA server on port 8000...");
  const child = runCuaServer();
  child.stdout?.on("data", (d) => process.stdout.write(d));
  child.stderr?.on("data", (d) => process.stderr.write(d));

  await waitForServer(6000);

  console.log(`Connecting to ${SOCKET_URL} — target ${UMA_URL}`);
  const socket = io(SOCKET_URL, { transports: ["websocket"] });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Socket connection timeout")), 15000);
    socket.on("connect", () => {
      clearTimeout(timeout);
      resolve(undefined);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const messages = [];
  socket.on("message", (msg) => {
    const line = typeof msg === "string" ? msg : JSON.stringify(msg);
    messages.push(line);
    console.log("[agent]", line);
  });
  socket.on("testscriptupdate", (data) => {
    console.log("[review]", JSON.stringify(data, null, 2));
  });

  socket.emit("testCaseInitiated", {
    testCase: TEST_CASE,
    url: UMA_URL,
    userName: "",
    password: "",
    loginRequired: true,
    userInfo: JSON.stringify({
      name: "Test Agent",
      email: "test-agent@uma.local",
      address: "N/A",
    }),
  });

  const waitMs = Number(process.env.UMA_CUA_WAIT_MS || 180_000);
  console.log(`Test running (browser may open). Waiting up to ${waitMs / 1000}s...`);
  await new Promise((r) => setTimeout(r, waitMs));

  socket.close();
  child.kill("SIGTERM");
  console.log("\n--- Agent messages ---");
  for (const m of messages) console.log(m);
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
