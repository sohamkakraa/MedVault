#!/usr/bin/env node
/**
 * Set the WhatsApp Business profile (About text, description, vertical,
 * websites, email) AND upload a profile photo.
 *
 * Run once after registering the WhatsApp number, and again any time you
 * want to refresh the public-facing business identity that recipients see
 * when they open your contact card.
 *
 * Display name is NOT settable here — that change goes through Meta Business
 * Manager and requires Meta approval (1–7 days). See ./WA_DISPLAY_NAME.md.
 *
 * Required env vars:
 *   WHATSAPP_ACCESS_TOKEN     — system-user access token with whatsapp_business_management
 *   WHATSAPP_PHONE_NUMBER_ID  — the Phone Number ID (NOT the phone number)
 *
 * Usage:
 *   node scripts/set-wa-profile.mjs
 *
 * Optional flags:
 *   --logo=path/to/logo.png   — defaults to public/uma-logo-square.png if present
 *   --dry-run                 — print what would be sent, don't actually call the API
 *
 * Docs:
 *   - Profile fields: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/business-profiles
 *   - Photo upload:   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/resumable-upload-api
 */
import { readFile, stat } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const GRAPH = "https://graph.facebook.com/v21.0";

const PROFILE = {
  about: "UMA — Ur Medical Assistant. Plain-language help with your reports, medicines, and reminders.",
  description:
    "UMA helps you understand your medical reports, manage medicines, log readings, and stay on top of follow-ups. Not medical advice.",
  email: "hello@sohamkakra.com",
  vertical: "HEALTH", // one of: AUTO BEAUTY APPAREL EDU ENTERTAIN EVENT_PLAN FINANCE GROCERY GOVT HOTEL HEALTH NONPROFIT PROF_SERVICES RETAIL TRAVEL RESTAURANT NOT_A_BIZ OTHER
  websites: ["https://uma.sohamkakra.com"],
  // address is intentionally omitted — small consumer-facing apps usually
  // skip it to avoid showing a personal home address.
};

function arg(name, fallback) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (found) return found.slice(name.length + 3);
  if (process.argv.includes(`--${name}`)) return true;
  return fallback;
}

const DRY_RUN = !!arg("dry-run", false);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_LOGO = resolve(REPO_ROOT, "public/uma-logo-square.png");
const LOGO_PATH = arg("logo", DEFAULT_LOGO);

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const APP_ID = process.env.WHATSAPP_APP_ID; // optional but required for the resumable upload step

if (!TOKEN || !PHONE_NUMBER_ID) {
  console.error("ERROR: WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set in your environment.");
  process.exit(1);
}

async function call(method, path, body, headers = {}) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${method} ${path}`);
    if (body) console.log("  body:", typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body, null, 2));
    return { dry: true };
  }
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(typeof body === "string" || body instanceof Uint8Array
        ? {}
        : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body == null ? undefined : typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${method} ${path}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function setProfileFields() {
  console.log("• Setting About / description / vertical / websites / email…");
  const payload = {
    messaging_product: "whatsapp",
    ...PROFILE,
  };
  const out = await call("POST", `/${PHONE_NUMBER_ID}/whatsapp_business_profile`, payload);
  console.log("  done.", out?.success != null ? `success=${out.success}` : "");
}

async function uploadAndSetProfilePhoto() {
  if (!APP_ID) {
    console.warn("⚠ WHATSAPP_APP_ID not set — skipping profile photo upload (resumable upload needs the app id).");
    return;
  }
  let bytes;
  try {
    const s = await stat(LOGO_PATH);
    if (!s.isFile()) throw new Error("not a file");
    bytes = await readFile(LOGO_PATH);
  } catch (err) {
    console.warn(`⚠ Logo not found at ${LOGO_PATH} — skipping photo upload. ${err instanceof Error ? err.message : ""}`);
    return;
  }
  console.log(`• Uploading ${basename(LOGO_PATH)} (${bytes.length} bytes)…`);

  // Step 1: create a resumable upload session
  const fileName = basename(LOGO_PATH);
  const fileSize = bytes.length;
  const fileType = "image/png";
  const session = await call(
    "POST",
    `/${APP_ID}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${fileSize}&file_type=${encodeURIComponent(fileType)}`,
  );
  const sessionId = session?.id;
  if (!sessionId) {
    console.warn("⚠ No session id returned, skipping photo upload.", session);
    return;
  }

  // Step 2: upload the bytes
  const uploadOut = await call("POST", `/${sessionId}`, bytes, {
    Authorization: `OAuth ${TOKEN}`,
    file_offset: "0",
    "Content-Type": fileType,
  });
  const handle = uploadOut?.h;
  if (!handle) {
    console.warn("⚠ No handle returned from upload; not setting photo.", uploadOut);
    return;
  }

  // Step 3: attach handle to the business profile
  await call("POST", `/${PHONE_NUMBER_ID}/whatsapp_business_profile`, {
    messaging_product: "whatsapp",
    profile_picture_handle: handle,
  });
  console.log("  profile photo set.");
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no API calls will be made.\n" : "Updating WhatsApp Business profile…\n");
  await setProfileFields();
  await uploadAndSetProfilePhoto();
  console.log("\nDone. Note: display-name change requires a separate request via Meta Business Manager.");
  console.log("See scripts/WA_DISPLAY_NAME.md for the manual steps.");
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
