# PROGRESS.md — AutoRef build status

| Phase | Status | Timestamp (UTC) | Notes |
|-------|--------|-----------------|-------|
| P1 Skeleton | DONE | 2026-09-15 21:09 | Manifest exact per §4, file tree, storage helpers, selectors shell, popup/options shell. |
| P2 Mock site | DONE | 2026-09-15 21:09 | connections/profile/thread pages + mock-runner.md. Inline scripts `node --check` clean; hooks (data-urn, paginate-on-scroll, hasThread/captcha/warning params, `__mockSent`) grep-audited. |
| P3 Queue scraper | DONE | 2026-09-15 21:09 | Scroll-and-paginate, urn dedupe, 500-cap, merge preserving existing; headline parser unit-tested (7 seps). |
| P4 Profile extraction + filters | DONE | 2026-09-15 21:09 | DOM extraction, target-match (empty=all), blacklist (ci urn/name, company substring) unit-tested. |
| P5 History check | DONE | 2026-09-15 21:09 | Layer-1 sentLog + Layer-2 bubble count, backfill (source `fallback` w/ detected text — schema-constrained, see checks.md). |
| P6 Fallback messaging (dry-run) | DONE | 2026-09-15 21:09 | Full state machine in `content/main.js`, resume-on-reload via persisted phase/currentUrn, `done(dry)` never clicks Send (guard unit-tested), `sentToday` counts real sends only. |
| P7 AI client | DONE | 2026-09-15 21:09 | NVIDIA POST, cache+prune, 3 attempts w/ 4s/8s backoff on 429/5xx/network, fail-fast other 4xx, JSON→regex parse, fallback; mockAI + `__test_429__`/`__test_badjson__` hooks; Test AI button in Options. 18/18 ai-client asserts pass. |
| P8 Real sending (mock) | DONE | 2026-09-15 21:09 | Type→guarded clickSend→verify→sentLog/stats; verify-fail → `failed`. |
| P9 Popup + Options full UI | DONE | 2026-09-15 21:09 | Start/Pause, live counters, action line, review approve/skip via msgCache drafts, dry-run banner, attach-to-tab injector; Options persist + confirm-off + preview + danger zone. |
| P10 Safety + polish | DONE | 2026-09-15 21:09 | Cap/hours/blacklist/review/abort/consecutive-failure/single-thread all implemented; `withinWorkHours` (incl. overnight) + `consecutiveFailures` unit-tested; `?captcha=1` fixture + runner path. |
| P11 LIVE selectors | DONE | 2026-09-15 21:09 | LIVE set aria-label/data-testid anchored, key parity with MOCK asserted; marked UNVERIFIED — supervised manual test in checks.md. |
| P12 Server & Sidebar & Agent Model | DONE | 2026-09-16 03:15 | Added server.js with .env loading, native messaging host for auto-starting server on click, configured side_panel (chrome.sidePanel) sidebar layout, upgraded default AI model to agent model nvidia/llama-3.1-nemotron-70b-instruct, and verified end-to-end. |

Verification: `node --check` clean on all project JS files (16 files); 95/95 node-harness asserts pass (`test/harness.mjs`); custom end-to-end integration test (`test/verify-all.mjs`) passes 100%.
