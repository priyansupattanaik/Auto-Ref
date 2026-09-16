# Acceptance Checklist

## P1 Skeleton
- [x] `manifest.json` matches BRIEF §4 exactly; extension loads unpacked with zero console errors (popup, options, SW).
- [x] File tree from BRIEF §3 exists.
- [x] All storage keys (`settings`, `queue`, `sentLog`, `msgCache`, `stats`, `runState`) initialize with schema defaults (§5); `dryRun` defaults to `true`; no API key hardcoded.
- [x] Content scripts are plain scripts on `window.AutoRef` (no `import`); only SW uses ES modules.
- [x] All LinkedIn selectors live in `content/selectors.js` (LIVE + MOCK); LIVE/MOCK key parity.

## P2 Mock site
- [ ] `connections.html` renders N `.mock-connection[data-urn][data-name][data-headline]` in `#mock-scroll-container`, paginates on scroll (`?count=` works).
- [ ] `profile.html?name=&role=&company=&hasThread=` renders name/headline, Message button, bubbles iff `hasThread>0`, `?captcha=1`/`?warning=1` fixtures.
- [ ] Send on mock appends a `.mock-bubble` with the typed text (`__mockSent` set).

## P3 Queue scraper
- [ ] 50 mock connections → 50 queue items with urn/name/role/company; all 4 headline separators parsed; dedupe by urn; cap 500; reload mid-scrape resumes.

## P4 Profile extraction + filters
- [ ] Extraction fills role/company from profile DOM; target-match skips log `no match` (empty targets = match all); blacklist skips log `blacklisted profile|company`.

## P5 History check
- [ ] `hasThread=1` → skip `prior thread` + sentLog backfill (source `fallback` w/ detected text — schema allows only ai|fallback); `hasThread=0` → proceeds; re-run → Layer-1 `already messaged`.

## P6 Fallback messaging (dry-run)
- [ ] AI OFF end-to-end: human-like typing visible, all `done(dry)`, sentLog drafted, Send never clicked; kill tab mid-run → resumes, no duplicates; `sentToday` stays 0 in dry-run (cap counts real sends only).

## P7 AI client
- [ ] mockAI canned message; second call cache hit (no fetch); `__test_429__` backs off 4s/8s then succeeds; `__test_badjson__`/malformed JSON → fallback template with `{{var}}` substituted; no key → fallback; Test AI button shows `[source] message`.

## P8 Real sending (mock)
- [ ] dry-run OFF: type → Send clicked → bubble appears → VERIFY passes → `done`, sentLog + `sentToday`/`sentTotal` + source counters update; verify-fail → `failed`.

## P9 Popup + Options
- [ ] Popup: status/counters/action line live-refresh; Start/Pause toggles `runState`; review list shows drafts with Approve (resumes via cache, no regen) / Skip; dry-run banner iff `dryRun`; Attach injects scripts into mock tab.
- [ ] Options: every control persists across restart; disabling dry-run needs confirm; `{{var}}` live preview; danger-zone clears each confirm + work.

## P10 Safety + polish
- [ ] Dry-run default ON; `clickSend` refuses when `dryRun` (unit-audited).
- [ ] Daily cap pauses (`sentToday >= dailyCap`); delays uniform in `[delayMinSec, delayMaxSec]` before NEXT; hours gate pauses outside window (incl. overnight); blacklists skip at walk time; review parks per item (non-blocking); captcha/warning/`?captcha=1` pauses + item reason `aborted: …`; 3 consecutive failures pause; strictly one-at-a-time.

## P11 LIVE selectors (UNVERIFIED — supervised manual test only)
- [ ] LIVE set is aria-label/data-testid anchored; documented as unverified.
- [ ] Manual: with dry-run ON + cap 1 + review ON, Start from LinkedIn people search, approve one draft, confirm skip/send behavior, then turn OFF and re-verify. Never bulk-send; never attempt to bypass login/captcha walls (PAUSE is correct).
