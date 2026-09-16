# BUGLOG.md — AutoRef bug register

## H1 (test harness only — no extension change needed)
- Symptom: harness assert `captcha detected` failed (94/95); `S().captcha` returned the LIVE selector set mid-run.
- Root cause: my chrome.storage shim used braceless `if (A) for (...) if (B) ...; else if ...` — the `else` bound to the INNER `if` (dangling-else), so every non-member key reset `out = {...keys}`, wiping the seeded `mockMode:true`. Boot then read defaults → LIVE selectors. Classic dangling-else, caught by the captcha test itself.
- Fix: braced all shim branches; re-ran → 95/95.
- Regression: harness now pins + asserts MOCK selectors before DOM tests; extension repo grep-audited for the same anti-pattern (`) for (`) — none found (all extension conditionals are braced).

## Extension bugs found during P2–P11 verification
- None. All 95 harness asserts (parser, template/prompt parity lib↔SW, selectors parity, filters, hours, consec-failures, AI retry/backoff/cache/fallback paths, dry-run Send guard, verify, storage defaults) pass; `node --check` clean on all 13 JS files + 3 mock inline scripts.
