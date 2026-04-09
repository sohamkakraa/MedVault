# UMA

UMA (Ur Medical Assistant) helps people upload medical PDFs, see trends, and chat in plain language. The app uses **Next.js** with a **PostgreSQL** backend for accounts and cloud sync, plus **browser storage** as a cache and for data that is not sent to the server (for example, embedded PDF bytes are stripped before sync).

## What the backend includes (beta)

- **PostgreSQL + Prisma**: `User`, `OtpChallenge`, `PatientRecord` (JSON blob per user).
- **Sign-in**: One-time codes stored in the database; signed session cookie (`AUTH_SECRET`) with user id.
- **Patient data**: `GET` / `PUT` `/api/patient-store` syncs the structured store for signed-in users (PDF base64 is omitted in the payload to keep rows small).
- **Still prototype**: SMS/email OTP delivery is not wired—you use `AUTH_DEV_RETURN_OTP=1` locally, configure a **shared beta demo** (below), or add a provider for real betas.

### Shared beta (dummy) sign-in

For **invited testers** on a hosted build, you can enable one shared email account without SMS or email delivery:

1. Set **`AUTH_BETA_DEMO_EMAIL`** to a dedicated address (for example `demo-beta@yourdomain.com`).
2. Set **`AUTH_BETA_DEMO_OTP`** to any **six digits**. Share the email and code with testers over a **private** channel (Slack, email invite, etc.).
3. Testers choose **Email** on the sign-in page, enter that address, tap **Send code**, then enter the 6-digit code.
4. Optional **`AUTH_BETA_EXPOSE_DEMO_OTP=1`**: after **Send code**, the UI (and JSON response) includes the OTP so testers do not need the invite text. Same trade-off as `AUTH_DEV_RETURN_OTP`—use only on **non-public** preview URLs, not a production site open to the internet.

Everyone using that email shares a single **User** and **PatientRecord** in the database. Rotate the OTP or remove these variables when the beta ends.

## What is not “enterprise complete”

- No real OTP SMS/email provider (add Twilio, etc., when you are ready).
- No separate blob store for raw PDFs (they stay on the device unless you extend the API).
## Tech stack

- Next.js App Router, Tailwind CSS v4
- Prisma + PostgreSQL
- Anthropic Claude for PDF extraction and chat (optional OpenAI fallback)

## Local setup

### 1) Install

```bash
npm install
```

### 2) Database

Create a Postgres database (local Docker, or a free [Neon](https://neon.tech) project). Set `DATABASE_URL` and **`DIRECT_URL`** in `.env.local` (see `.env.example`). On Neon, use the **pooled** URI for `DATABASE_URL` and the **direct** URI for `DIRECT_URL`; for a single host, copy the same string into both.

Apply the schema:

```bash
npm run db:migrate
```

For quick local iteration you can use:

```bash
npm run db:push
```

### 3) Environment

```bash
cp .env.example .env.local
```

Fill at least: `DATABASE_URL`, `DIRECT_URL` (match `DATABASE_URL` unless you use Neon pooled + direct), `AUTH_SECRET` (16+ random characters), and `ANTHROPIC_API_KEY` if you use AI features. For local OTP testing: `AUTH_DEV_RETURN_OTP=1`.

### 4) Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Troubleshooting: `Can't resolve '@prisma/client'`

That means dependencies or the generated client are missing. From the project root run:

```bash
npm install
npm run db:generate
```

Commit an up-to-date **`package-lock.json`** after `npm install` so Vercel installs the same tree. This repo’s `vercel.json` uses `npm install` (not `npm ci`) so the first deploy can reconcile the lockfile if needed.

### Production-style build (local)

```bash
npm run build
npm run start
```

---

## Deploy a beta on a free tier (temp / preview URLs)

A common **free** combo: **[Vercel](https://vercel.com) (Hobby)** for the app + **[Neon](https://neon.tech) (free)** for Postgres. Vercel gives you a `*.vercel.app` URL; every git branch/PR can get its own **Preview URL** (temporary-style links for testers).

### A) Neon (database)

1. Sign up at [neon.tech](https://neon.tech), create a project.
2. In the Neon dashboard, open **Connection details** and copy **two** strings when available:
   - **Pooled** (or “Transaction” / serverless) → `DATABASE_URL` in Vercel.
   - **Direct** (non-pooled, for migrations) → `DIRECT_URL` in Vercel.
3. If you only use one connection string, set **both** env vars to the same value (works for small betas; Neon recommends split pooled/direct for production).

### B) GitHub

1. Push this repo to GitHub (if it is not already).

### C) Vercel

1. Sign up at [vercel.com](https://vercel.com) (free Hobby tier).
2. **Add New Project** → import the GitHub repo.
3. **Before the first deploy**, open **Settings → Environment Variables** and add **`DATABASE_URL`** (and the other vars below). If `DATABASE_URL` is missing, the build fails early. If **`migrate deploy`** fails on Neon while `generate` works, add **`DIRECT_URL`** (Neon’s **direct** connection string).
4. **Environment variables** (Production + Preview):

   | Name | Notes |
   |------|--------|
   | `DATABASE_URL` | Postgres connection string (Neon: pooled / serverless URI) |
   | `DIRECT_URL` | Same as `DATABASE_URL` if you have one URI; Neon: **direct** URI for migrations |
   | `AUTH_SECRET` | Long random string (32+ chars) |
   | `ANTHROPIC_API_KEY` | For PDF extraction + Claude chat |
   | `ANTHROPIC_MODEL` | Optional (defaults in `.env.example`) |
   | `ANTHROPIC_PDF_MODEL` | Optional |
   | `AUTH_DEV_RETURN_OTP` | Set to `1` **only** for internal demos where returning the OTP in JSON is acceptable—**never** for public betas unless you understand the risk |
   | `AUTH_BETA_DEMO_EMAIL` | Optional: shared beta email (see “Shared beta (dummy) sign-in”) |
   | `AUTH_BETA_DEMO_OTP` | Optional: six digits; must be set with the demo email |
   | `AUTH_BETA_EXPOSE_DEMO_OTP` | Optional: `1` to show the demo OTP on screen after Send code (closed previews only) |

5. Deploy. This repo’s `vercel.json` runs **`npm install`** (which runs **`prisma generate`**), then **`node scripts/vercel-build.mjs`**: **`prisma migrate deploy`**, **`prisma generate`**, **`next build`**. Build logs include **`[vercel-build]`** lines so you can see which step failed.

#### Build failed: `vercel-build` exited with 1

Vercel’s summary line does **not** say *which* command failed. The script runs **three** steps in order; exit code **1** means **one** of them returned non-zero.

In the **full** build log, search for **`[vercel-build]`**:

- A **diagnostic** block at the start shows whether `DATABASE_URL` / `DIRECT_URL` are set (lengths only, no secrets) and whether the Prisma/Next CLI files exist.
- Before each step: **`── prisma migrate deploy ──`**, then **`── prisma generate ──`**, then **`── next build ──`**. Find the **last** such banner: the real error (Prisma **P####**, TypeScript, ESLint, etc.) appears **immediately above** it.
- After a failure, the script prints a short **decode** hint for that step.

**Repeated** failures are usually the **same** underlying issue (for example **migrate deploy** against a DB that is asleep, unreachable from Vercel, or still using a **pooled-only** Neon URL without a **direct** `DIRECT_URL`).

6. **Preview deployments**: push a branch or open a PR—Vercel shows a unique preview URL in the dashboard and on the PR. Use that to share a “temp” beta link.

### D) After deploy

- Open your `https://….vercel.app` URL, sign in with the OTP flow (with a real messaging provider or a controlled dev OTP mode).
- Confirm `/api/patient-store` works by signing in on two browsers: data should follow the account after sync.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` (via script) + `next build` |
| `npm run start` | Production server (after `build`) |
| `npm run db:migrate` | `prisma migrate deploy` (production/staging DB) |
| `npm run db:push` | `prisma db push` (prototyping; skips migration files) |

## License

MIT
