/**
 * Quick WhatsApp API connectivity test.
 *
 * Usage:
 *   node scripts/test-whatsapp.mjs                     # just test credentials
 *   node scripts/test-whatsapp.mjs send 919876543210   # send a test message
 *   node scripts/test-whatsapp.mjs webhook             # simulate a webhook call
 *
 * Reads from .env in the project root.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");

// Simple .env parser
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const GRAPH_API = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

function masked(s) {
  if (!s) return "(not set)";
  if (s.length <= 10) return "****";
  return s.slice(0, 6) + "..." + s.slice(-4);
}

console.log("\n=== WhatsApp Integration Test ===\n");
console.log(`WHATSAPP_ACCESS_TOKEN    : ${masked(TOKEN)}`);
console.log(`WHATSAPP_PHONE_NUMBER_ID : ${PHONE_ID || "(not set)"}`);
console.log(`WHATSAPP_VERIFY_TOKEN    : ${masked(process.env.WHATSAPP_VERIFY_TOKEN)}`);
console.log(`WHATSAPP_OTP_TEMPLATE    : ${process.env.WHATSAPP_OTP_TEMPLATE_NAME || "(not set — OTP will use plain text)"}`);
console.log();

if (!TOKEN || !PHONE_ID) {
  console.error("❌ Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID. Cannot proceed.\n");
  process.exit(1);
}

// ─── Test 1: Verify token by fetching phone number info ─────────────────────

async function testCredentials() {
  console.log("1️⃣  Testing credentials (GET phone number info)...");
  try {
    const res = await fetch(`${GRAPH_API}/${PHONE_ID}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`   ✅ Credentials valid!`);
      console.log(`   Phone  : ${data.display_phone_number || "N/A"}`);
      console.log(`   Name   : ${data.verified_name || "N/A"}`);
      console.log(`   Quality: ${data.quality_rating || "N/A"}`);
      return true;
    } else {
      console.log(`   ❌ API returned ${res.status}:`);
      console.log(`   ${JSON.stringify(data.error || data, null, 2)}`);
      return false;
    }
  } catch (err) {
    console.log(`   ❌ Network error: ${err.message}`);
    return false;
  }
}

// ─── Test 2: Send a test message ────────────────────────────────────────────

async function testSendMessage(to) {
  // Normalize: strip +, spaces, dashes
  const digits = to.replace(/[^\d]/g, "");
  console.log(`\n2️⃣  Sending test message to ${digits}...`);
  try {
    const res = await fetch(`${GRAPH_API}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: digits,
        type: "text",
        text: { preview_url: false, body: "👋 Hello from UMA! This is a test message to verify WhatsApp integration is working." },
      }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`   ✅ Message sent!`);
      console.log(`   Message ID: ${data.messages?.[0]?.id || "N/A"}`);
      return true;
    } else {
      console.log(`   ❌ Send failed (${res.status}):`);
      console.log(`   ${JSON.stringify(data.error || data, null, 2)}`);
      if (data.error?.code === 131030) {
        console.log(`\n   ℹ️  This usually means the recipient hasn't opted in or isn't a test number.`);
        console.log(`   Add this number as a test recipient in Meta Developer Console.`);
      }
      return false;
    }
  } catch (err) {
    console.log(`   ❌ Network error: ${err.message}`);
    return false;
  }
}

// ─── Test 3: Local webhook simulation ───────────────────────────────────────

async function testWebhook() {
  const port = process.env.PORT || 3000;
  const baseUrl = `http://localhost:${port}`;

  console.log(`\n3️⃣  Testing webhook verification (GET ${baseUrl}/api/whatsapp/webhook)...`);
  try {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "test";
    const url = `${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=test_challenge_123`;
    const res = await fetch(url);
    const text = await res.text();
    if (res.ok && text === "test_challenge_123") {
      console.log(`   ✅ Webhook verification works! (returned challenge correctly)`);
    } else {
      console.log(`   ❌ Unexpected response: ${res.status} — ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`   ❌ Could not reach local server: ${err.message}`);
    console.log(`   Make sure the dev server is running (npm run dev)`);
  }

  console.log(`\n4️⃣  Testing webhook POST (simulated incoming message)...`);
  try {
    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          id: "test",
          changes: [{
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PHONE_ID, display_phone_number: "test" },
              contacts: [{ profile: { name: "Test User" }, wa_id: "919999999999" }],
              messages: [{
                id: "wamid.test_" + Date.now(),
                from: "919999999999",
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Hello UMA, this is a test" },
              }],
            },
          }],
        }],
      }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`   ✅ Webhook accepted the POST (${res.status}: ${JSON.stringify(data)})`);
      console.log(`   Note: The message processing happens async — check server logs for results.`);
    } else {
      console.log(`   ⚠️  Webhook returned ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.log(`   ❌ Could not reach local server: ${err.message}`);
  }
}

// ─── Run tests ──────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];

const credsOk = await testCredentials();

if (cmd === "send" && arg) {
  if (credsOk) await testSendMessage(arg);
  else console.log("\n⏭️  Skipping send test — credentials are invalid.");
} else if (cmd === "webhook") {
  await testWebhook();
} else if (cmd === "send" && !arg) {
  console.log("\n⚠️  Usage: node scripts/test-whatsapp.mjs send <phone_number>");
  console.log("   Example: node scripts/test-whatsapp.mjs send 919876543210");
} else {
  console.log("\n💡 To send a test message, run:");
  console.log("   node scripts/test-whatsapp.mjs send <phone_e164_digits>");
  console.log("\n💡 To test your local webhook, run (with dev server up):");
  console.log("   node scripts/test-whatsapp.mjs webhook");
}

console.log();
