# Recon
URL: http://localhost:3000
Title: UMA — Ur Medical Assistant
Login method: OTP via email (devOtp returned in response when AUTH_DEV_RETURN_OTP=1)
Upload: /dashboard?upload=1 → input[type=file] → 'Read file' btn → 'Save to home screen'
Chat: /chat → threaded, Input placeholder='Type your message…'
Storage: localStorage (mv_patient_store_v1) + Neon Postgres for auth/threads
