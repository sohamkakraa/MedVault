# UMA Changelog

> One-line entry per item touched. Format: `YYYY-MM-DD · batch-item · summary`.

## 2026-05-07i

- 2026-05-07 · item 11 · Modularity audit: fix 6 direct localStorage.setItem violations in familyConnections.ts (5) and profile/page.tsx (1); create modularity.md + component-map.md skill files; add concerningItems row to CLAUDE.md bento table

## 2026-05-07h

- 2026-05-07 · item 5 · Add Tidy debug panel (TidyDebugSheet) with Bug icon toggle, extended tidy API debug envelope, and localStorage persistence of last 5 runs
- 2026-05-07 · item 4 · Remove checkmark from SelectItem; use background highlight for selected state; add inline pencil-rename for doctor/hospital pickers in profile page

## 2026-05-07g

- 2026-05-07 · item 3 · BYOK — add provider registry (registry.ts), UserLlmCredential Prisma model + pgcrypto migration, llmCredentials.ts encryption helpers, 3 API routes (/api/profile/llm-credentials GET/DELETE + /verify POST), AI provider section in profile page, skill file .claude/skills/uma/byok.md, LLM_CRED_MASTER_SECRET env var in CLAUDE.md

## 2026-05-07f

- 2026-05-07 · item 9 · Add Playwright e2e test suite under tests/e2e/ with fixtures, flows, visual, and a11y stubs; add eval/eval:visual/eval:a11y/eval:update-snapshots npm scripts; add .github/workflows/e2e.yml CI workflow

## 2026-05-07e

- 2026-05-07 · item 6 · Add "Concerning items" hero section to dashboard with ConcerningTile component for flagged labs + BMI

## 2026-05-07d (batch 2026-05-07c continued)

- 2026-05-07 · item 8a · Remove duplicate LayoutDashboard icon from ThreadSidebar header
- 2026-05-07 · item 8b · Add Archived tab to ThreadSidebar with Unarchive action + POST /api/threads/[id]/unarchive route
- 2026-05-07 · item 8c · Select-all in chat uses full ID list from GET /api/threads?idsOnly=true
- 2026-05-07 · item 8d · Auto-rename threads after context summary update via Haiku + proposeThreadTitle helper

## 2026-05-07c

- 2026-05-07 · item 1 · Add docstring note to `cavemanSummarize.ts` clarifying it is UMA's own implementation, unrelated to the JuliusBrussee ecosystem
- 2026-05-07 · item 2 · Anthropic prompt caching — split buildRetrievalContext into cacheablePrefix/dynamicSuffix; add cache_control to both chat routes; update computeChatCost for cache read (0.1x) and write (1.25x) pricing; add cacheCreationInputTokens/cacheReadInputTokens to usage telemetry
- 2026-05-07 · item 7 · Add Murphy npm scripts (`murphy`, `murphy:auth`, `murphy:goal`, `murphy:open`) to `package.json`; add `.github/workflows/murphy.yml` CI workflow (non-blocking, `ui` label); create `.claude/skills/uma/murphy.md`
- 2026-05-07 · item 10a · Delete orphaned root scripts (debug_dashboard.js, screenshot_verify.js, run-family-tests.mjs, UMA_Architecture.html); move all SHIP_NOTES_* files to docs/ship-notes/; add murphy frames to .gitignore
