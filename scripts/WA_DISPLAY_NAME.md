# Setting "UMA: UrMedicalAssistant" as the WhatsApp display name

The display name (the bold text recipients see at the top of the chat, before they tap into the contact card) is **not** changeable through the WhatsApp Cloud API. Meta requires every display-name change to go through a manual review in Meta Business Manager — usually 1–7 business days, sometimes same-day.

## One-time setup

1. Go to [business.facebook.com](https://business.facebook.com).
2. **Settings → WhatsApp Accounts → [select your WABA] → Phone Numbers**.
3. Find the row for **+91 81256 20706**, click **Settings** on the right.
4. Click **Profile**.
5. **Display name** field → enter exactly: `UMA: UrMedicalAssistant`.
6. Click **Save**. Meta will confirm the request was submitted; status changes to **Pending review**.
7. Wait for the email confirmation (usually < 48h). Once approved, the new name appears in every recipient's WhatsApp client within ~30 minutes.

## Display-name rules to know before submitting

Meta will reject the name if any of these apply:

- Generic terms only (e.g. "Health Bot") — must include a brand component.
- Generic punctuation/emoji at the start.
- All lowercase or all uppercase.
- Name doesn't match what's on your verified business assets.

`UMA: UrMedicalAssistant` clears all four.

## Other profile fields

Profile photo, About text, business description, websites, email, and category **are** API-settable and are handled by `scripts/set-wa-profile.mjs`. Run that after the display name is approved (or before — order doesn't matter).

## Required env vars for the API script

| Var | Where to find it |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Business Manager → System Users → your system user → Generate token, scopes: `whatsapp_business_management`, `whatsapp_business_messaging` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta App dashboard → WhatsApp → API Setup → Phone Number ID |
| `WHATSAPP_APP_ID` | Meta App dashboard → top-left, the long numeric ID |

## Logo

Put a 640×640 PNG at `public/uma-logo-square.png` before running the script. WhatsApp accepts up to 5 MB, but smaller is better — aim for under 200 KB.
