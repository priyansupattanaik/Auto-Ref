# Mock Runner — E2E verification without a LinkedIn account

Content scripts only auto-inject on `linkedin.com`. For mock pages, attach manually:

## 0. Setup (once)

1. `chrome://extensions` → Developer mode → Load unpacked → `auto-ref/`. Zero console errors.
2. Serve the mocks (content scripts need `http(s)://`, not `file://`):
   `python -m http.server 8137` from `auto-ref/test/mock-linkedin/`
   → `http://localhost:8137/connections.html`
3. Open AutoRef Options, set for tests, **Save**:
   - `Mock mode` ON, `Mock AI` ON (no key/network needed), `AI mode` ON
   - `Dry-run` ON (for P2–P7), delays `0`–`1`, `Daily cap` 50, working-hours OFF
   - Targets/blanklists empty (P3 baseline)
4. Open `connections.html` → popup → **Attach to this tab** (injects the loop; needs the click gesture).

## Test paths

- **P2**: open `connections.html` (scroll → count grows to 50), open a `profile.html?urn=mock-person-1&name=...&hasThread=1` link (bubbles visible after Message click), `thread.html?count=2`.
- **P3**: attach → Start → queue = 50 with urn/name/role/company; reload mid-scrape → resumes.
- **P4**: set targets `Acme` / roles `Engineer` → non-matches skipped with `no match`; blacklist a name/company → `blacklisted …`.
- **P5**: `hasThread=1` items → `prior thread` + sentLog backfill; re-run → `already messaged` (Layer 1).
- **P6 (dry-run)**: full run, AI mode OFF → all `done(dry)`, compose shows human typing, **Send never clicked** (`__mockSent` unset), sentLog has drafts. Kill tab mid-run → reopen connections → Attach → auto-resumes, no duplicates.
- **P7**: Options → Test AI (mockAI) shows canned message; repeat → cached. Node harness covers 429/backoff/malformed-JSON (no browser needed).
- **P8**: dry-run OFF → send → bubble appears → `done`, sentLog/stats update.
- **P9**: review mode ON → drafts park as `awaiting_review` → popup Approve/Skip.
- **P10**: run the `mock-person-7` profile (`?captcha=1`) → run pauses; cap/hours/blacklist rows per `checks.md`.
- **P11**: supervised live test only — see `checks.md`.

## Test hooks

- `connections.html?count=N` (1–500) controls fixture size.
- Every 5th fixture person has `hasThread=1`; `mock-person-7` links carry `&captcha=1`.
- `profile.html?…&warning=1` renders the activity-warning fixture.
- AI hooks (no network): urn `__test_429__` exercises 429 backoff; `__test_badjson__` exercises the malformed-JSON → fallback path.
