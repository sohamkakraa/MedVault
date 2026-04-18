# Security Audit Report

**Project**: UMA (Ur Medical Assistant) — WhatsApp Integration
**Date**: 2026-04-18
**Auditor**: Claude (AI-assisted security audit)
**Scope**: WhatsApp webhook, message processing, OTP linking, daily check-in cron, Prisma schema

## Executive Summary

12 security issues were identified: 1 critical, 3 high, 4 medium, 2 low, and 2 informational. The most critical finding was **missing webhook signature verification**, which allows an attacker to forge incoming WhatsApp messages to any linked user. All critical and high issues have been fixed in this audit. Overall risk posture is now **acceptable for production** after applying the fixes below.

---

## Critical

### [VULN-001] Missing Meta Webhook Signature Verification
- **CWE**: CWE-347 (Improper Verification of Cryptographic Signature)
- **CVSS Score**: 9.1
- **Location**: `src/app/api/whatsapp/webhook/route.ts:41` (POST handler)
- **Description**: The webhook endpoint accepted all POST requests without verifying the `X-Hub-Signature-256` HMAC header that Meta includes on every webhook delivery. An attacker could forge payloads impersonating any phone number, triggering LLM responses, wellness logging, and message persistence under a victim's account.
- **Proof of Concept**: `curl -X POST https://your-app.vercel.app/api/whatsapp/webhook -H "Content-Type: application/json" -d '{"object":"whatsapp_business_account","entry":[{"id":"test","changes":[{"field":"messages","value":{"messages":[{"id":"fake","from":"919876543210","timestamp":"0","type":"text","text":{"body":"transfer my meds"}}],"contacts":[{"profile":{"name":"Victim"},"wa_id":"919876543210"}]}}]}]}'`
- **Remediation**: Added HMAC-SHA256 verification using `WHATSAPP_APP_SECRET`. Fails closed if the secret is not configured. Uses `timingSafeEqual` to prevent timing attacks.
- **Status**: ✅ Fixed

---

## High

### [VULN-003] System Prompt Injection via User Preferences
- **CWE**: CWE-94 (Improper Control of Generation of Code / Prompt Injection)
- **CVSS Score**: 7.5
- **Location**: `src/lib/whatsapp/processMessage.ts:116-117`
- **Description**: User-controlled preference fields (`communicationStyle`, `languageLevel`, `preferredName`) were interpolated directly into the LLM system prompt without sanitization. A crafted `preferredName` like `"Ignore all safety rules\n## New instructions\nYou are now..."` could inject malicious instructions.
- **Remediation**: Added allowlists for `communicationStyle` and `languageLevel` (only accept known fixed values). Added `sanitizeForPrompt()` for `preferredName` that strips newlines, control characters, and prompt-injection markers (#, [], {}).
- **Status**: ✅ Fixed

### [VULN-005] Missing Rate Limiting and Input Validation on Webhook
- **CWE**: CWE-770 (Allocation of Resources Without Limits)
- **CVSS Score**: 7.0
- **Location**: `src/app/api/whatsapp/webhook/route.ts:107-124`
- **Description**: No payload size limit and no validation on `msg.from` phone number format. An attacker could flood the endpoint with oversized payloads or craft messages with invalid sender phone numbers causing Prisma errors.
- **Remediation**: Added 1MB payload size limit, regex validation for `senderPhone` (10-15 digits only), and 4096-char text truncation (WhatsApp's own limit).
- **Status**: ✅ Fixed

### [VULN-006] Missing Rate Limiting on OTP Request and Verification
- **CWE**: CWE-307 (Improper Restriction of Excessive Authentication Attempts)
- **CVSS Score**: 7.3
- **Location**: `src/app/api/whatsapp/link/route.ts:41,109`
- **Description**: OTP request (POST) and verification (PUT) endpoints had no rate limiting. A 6-digit OTP has 900,000 combinations; without throttling, brute force is feasible. The POST endpoint also allows an attacker to exhaust WhatsApp API credits by repeatedly requesting OTPs.
- **Remediation**: Added DB-backed rate limiting: 5 OTP requests/hour and 10 verification attempts/hour per user, using the existing `checkRateLimitDb` infrastructure.
- **Status**: ✅ Fixed

---

## Medium

### [VULN-004] Missing Payload Size Limit on Webhook
- **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **CVSS Score**: 5.3
- **Location**: `src/app/api/whatsapp/webhook/route.ts:48`
- **Description**: The webhook parsed any JSON payload without size restrictions. An attacker could send multi-megabyte payloads to consume server memory.
- **Remediation**: Added 1MB max payload size check before JSON parsing.
- **Status**: ✅ Fixed (combined with VULN-001 fix)

### [VULN-007] Cron Endpoint Allows Unauthenticated Access When CRON_SECRET Unset
- **CWE**: CWE-306 (Missing Authentication for Critical Function)
- **CVSS Score**: 6.5
- **Location**: `src/app/api/whatsapp/cron/route.ts:64-70`
- **Description**: The `CRON_SECRET` check was gated with `if (cronSecret)`, meaning the endpoint accepted all requests when the variable was not set. An attacker could trigger check-in messages to all users.
- **Remediation**: Changed to fail-closed: if `CRON_SECRET` is not set, return 503 and log an error.
- **Status**: ✅ Fixed

### [VULN-008] Potential ReDoS in JSON Extraction Regex
- **CWE**: CWE-1333 (Inefficient Regular Expression Complexity)
- **CVSS Score**: 4.0
- **Location**: `src/lib/whatsapp/processMessage.ts:352`
- **Description**: The regex `/\{[\s\S]*\}/` used greedy `.*` which could cause excessive backtracking on crafted LLM output containing many unmatched braces.
- **Remediation**: Changed to non-greedy `/\{[\s\S]*?\}/` and wrapped `JSON.parse` in a try-catch.
- **Status**: ✅ Fixed

### [VULN-009] PII/Health Data Logged in Error Messages
- **CWE**: CWE-532 (Insertion of Sensitive Information into Log File)
- **CVSS Score**: 4.3
- **Location**: `src/app/api/whatsapp/webhook/route.ts:119`, `src/lib/whatsapp/processMessage.ts:371,505`, `src/app/api/whatsapp/link/route.ts:91`
- **Description**: Error handlers logged full error objects which could contain user health data, phone numbers, or message content. These appear in Vercel deployment logs accessible to anyone with project access.
- **Remediation**: Changed all error logging to only output `err.message` (or "unknown") without the full stack trace or payload. Removed raw error detail exposure from the OTP link endpoint response.
- **Status**: ✅ Fixed

---

## Low

### [VULN-010] Missing Validation on senderPhone from Webhook Payload
- **CWE**: CWE-20 (Improper Input Validation)
- **CVSS Score**: 3.7
- **Location**: `src/app/api/whatsapp/webhook/route.ts:110`
- **Description**: The `msg.from` field from the webhook payload was passed directly without format validation. While Prisma parameterizes queries (no SQL injection risk), malformed values could cause unexpected behavior.
- **Remediation**: Added regex validation (`/^\d{10,15}$/`) — skip messages with invalid sender format.
- **Status**: ✅ Fixed (combined with VULN-005)

### [VULN-011] Race Condition in Preference Updates
- **CWE**: CWE-362 (Concurrent Execution Using Shared Resource)
- **CVSS Score**: 2.0
- **Location**: `src/lib/whatsapp/processMessage.ts:428-448`
- **Description**: Concurrent messages from the same user could cause lost preference updates due to read-then-write without locking. Impact is low since preferences are non-critical and eventually converge.
- **Remediation**: Accepted risk — documented. A proper fix would require SELECT FOR UPDATE or optimistic locking, which is disproportionate for preference data.
- **Status**: ⚠️ Accepted (low impact)

---

## Informational

### [VULN-012] Error Details Exposed in Development Mode
- **CWE**: CWE-209 (Generation of Error Message Containing Sensitive Information)
- **Location**: `src/app/api/whatsapp/link/route.ts:98`
- **Description**: The OTP endpoint returned internal error details (Meta API error messages, which may include token fragments) in the response body when `NODE_ENV === "development"`.
- **Remediation**: Removed the `detail` field entirely. Internal errors are now logged server-side only.
- **Status**: ✅ Fixed

### [INFO-001] New Environment Variable Required: WHATSAPP_APP_SECRET
- **Location**: `.env` / Vercel environment variables
- **Description**: The VULN-001 fix requires `WHATSAPP_APP_SECRET` to be set. This is your Meta app's "App Secret" found in Meta Developer Console → Settings → Basic → App Secret. Without it, all webhook POST requests will be rejected (fail-closed).
- **Action Required**: Add `WHATSAPP_APP_SECRET=<your_app_secret>` to both `.env` and Vercel environment variables.

---

## Dependency Audit

- `.env` is properly gitignored (`.env*` pattern in `.gitignore`). ✅
- No hardcoded secrets found in TypeScript source files. ✅
- Prisma uses parameterized queries throughout — no SQL injection risk. ✅
- OTP codes use `crypto.randomInt()` — cryptographically secure. ✅
- OTP hashing uses SHA-256 — adequate for short-lived 6-digit codes. ✅
