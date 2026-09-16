MASTER IMPLEMENTATION PROMPT — "AutoRef": AI-Powered LinkedIn Referral Bot (Chrome MV3 Extension) 0. YOUR ROLE & OPERATING MODE
You are the lead engineer for this project. You will:

Build the entire project end-to-end, phase by phase (build order in §10).
Self-verify after every phase using the test harness (§9). A phase is NOT complete until its acceptance criteria pass.
When any bug, test failure, or runtime error occurs, spawn a focused bugfix subagent following the protocol in §11. Do not silently hack fixes.
Maintain two files at repo root at all times: PROGRESS.md (phase status: DONE / IN PROGRESS / BLOCKED, with timestamps) and BUGLOG.md (every bug: symptom → root cause → fix → regression test added).

1. HARD CONSTRAINTS (NEVER VIOLATE)
   Chrome Extension Manifest V3, vanilla JavaScript only — no npm, no build step, no bundlers, no TypeScript. Files load directly via "Load Unpacked".
   No backend server. All logic and data live locally (chrome.storage.local).
   LLM calls go ONLY to NVIDIA's free OpenAI-compatible endpoint: https://integrate.api.nvidia.com/v1/chat/completions (Bearer token auth, free tier ~40 RPM — more than enough).
   dryRun defaults to true. The extension must be physically incapable of sending a real LinkedIn message until the user explicitly turns dry-run off in the Options page.
   Never hardcode an API key. The user enters it in Options; it is stored only in chrome.storage.local.
   All code must work when the service worker is killed and restarted at any moment (MV3 ephemeral workers) — persist state after every step.
   All LinkedIn CSS selectors live in ONE file: content/selectors.js, with two parallel selector sets: LIVE (real LinkedIn) and MOCK (test pages). No selector may appear anywhere else in the codebase.
2. ARCHITECTURE (BUILD EXACTLY THIS)
   Chrome MV3├─ Popup UI (start/stop, live stats, review queue)├─ Background Service Worker (ephemeral)│ ├─ Message router: relays popup commands ↔ content script│ └─ AI CLIENT: NVIDIA API calls, retry+backoff, response cache├─ chrome.storage.local (single source of truth; every write is durable)└─ Content Script — injected into the LinkedIn tab ├─ MAIN AUTOMATION LOOP (lives HERE, in the tab — survives SW death) ├─ Scraper, History Checker, Messenger └─ Reads/writes storage directly; asks SW only for AI generation
   Rationale you must preserve: MV3 service workers die after ~30s idle, so a multi-hour loop cannot live there. The content script's tab stays open, so the loop lives there. The SW exists mainly because content scripts cannot make cross-origin fetches to the NVIDIA API — the SW can.

3. FILE TREE (CREATE EXACTLY THIS)
   auto-ref/├── manifest.json├── PROGRESS.md├── BUGLOG.md├── background/│ ├── service-worker.js # message router only; imports ai-client.js via importScripts or ES module│ └── ai-client.js # NVIDIA call, retries, cache read/write, fallback├── content/│ ├── main.js # orchestrator: the state machine loop│ ├── scrapers.js # connections list + profile data extraction│ ├── history-check.js # existing-thread detection│ ├── messenger.js # compose → fill → send → verify│ └── selectors.js # LIVE + MOCK selector sets, single source of truth├── lib/│ ├── prompt.js # SYSTEM_PROMPT + buildUserPrompt()│ ├── template.js # {{var}} substitution for fallback messages│ ├── delay.js # sleep(), randomDelay(min,max), humanTyping()│ └── storage.js # get/set helpers for every storage key├── popup/│ ├── popup.html / popup.js / popup.css├── options/│ ├── options.html / options.js / options.css└── test/ ├── mock-linkedin/ │ ├── connections.html # mock connections list page │ ├── profile.html # mock profile page (parameterized via ?name=&role=&company=&hasThread=) │ └── thread.html # mock message thread content ├── mock-runner.md # instructions: how to run E2E against mock pages └── checks.md # acceptance-criteria checklist per phase
4. manifest.json (EXACT CONTENT)
   { "manifest_version": 3, "name": "AutoRef — AI Referral Assistant", "version": "0.1.0", "description": "Personal assistant that drafts and sends referral requests to your own LinkedIn connections. Runs locally. Dry-run by default.", "permissions": ["storage", "alarms", "scripting", "tabs"], "host_permissions": [ "https://www.linkedin.com/*", "https://integrate.api.nvidia.com/*" ], "background": { "service_worker": "background/service-worker.js", "type": "module" }, "action": { "default_popup": "popup/popup.html" }, "options_page": "options/options.html", "content_scripts": [ { "matches": ["https://www.linkedin.com/*"], "js": [ "lib/delay.js", "lib/storage.js", "lib/template.js", "lib/prompt.js", "content/selectors.js", "content/scrapers.js", "content/history-check.js", "content/messenger.js", "content/main.js" ], "run_at": "document_idle" } ]}
   Note: content scripts must NOT be ES modules (no import statements there) — use plain scripts sharing a window.AutoRef namespace. The SW may use ES modules.

5. STORAGE SCHEMA (chrome.storage.local — EXACT KEYS)
   settings: { // AI apiKey: "", model: "meta/llama-3.1-8b-instruct", aiMode: true, mockAI: false, // test mode: skip real API, return canned response temperature: 0.8, // Content aboutMe: "", customNote: "", tone: "friendly", targetCompanies: [], targetRoles: [], fallbackTemplate: "Hi {{firstName}}, I noticed you're a {{role}} at {{company}}. I'd love to connect about opportunities on your team. {{customNote}}", // Safety dryRun: true, reviewMode: false, dailyCap: 15, workHoursEnabled: true, workHoursStart: 9, workHoursEnd: 18, delayMinSec: 45, delayMaxSec: 150, blacklistProfiles: [], blacklistCompanies: [], mockMode: false // use MOCK selectors against test/\*.html pages},queue: [ { urn, profileUrl, name, role, company, status: "pending"|"in_progress"|"done"|"skipped"|"failed", reason } ],sentLog: { [urn]: { name, company, dateISO, source: "ai"|"fallback", messageText } },msgCache: { [cacheKey]: { message, ts } }, // cacheKey = `${urn}::${model}::v1`stats: { sentToday, sentTotal, skipped, failed, aiUsed, fallbackUsed, lastRunDate },runState: { running: false, phase: "idle", currentUrn: null, startedAt: null }
   Rules: every state transition writes to storage BEFORE proceeding to the next step. On startup, main.js reads runState and resumes an interrupted run (any in_progress item re-enters the queue at its phase). Daily counters reset when lastRunDate ≠ today.

6. CORE FLOWS (IMPLEMENT EXACTLY)
   6.1 State machine (content/main.js)
   IDLE → SCRAPE_QUEUE → NEXT → (check blacklist, daily cap, work hours → if blocked, PAUSE)→ OPEN_PROFILE → EXTRACT_INFO→ TARGET_MATCH? no → SKIP(reason:"no match")→ ALREADY_SENT_LOCALLY? (sentLog[urn] exists) yes → SKIP(reason:"already messaged")→ OPEN_MESSAGE_MODAL → THREAD_EXISTS? yes → SKIP(reason:"prior thread"), also backfill sentLog→ GENERATE_MESSAGE (SW → ai-client) → on total failure use fallbackTemplate→ reviewMode? → park draft in queue as status "awaiting_review", WAIT for popup approval→ dryRun? → log draft to sentLog with source tag but DO NOT send; status "done(dry)"→ TYPE_MESSAGE (human-like per-char delay 30–80ms, occasional 300ms pause) → CLICK_SEND→ VERIFY_SENT (message text appears in thread) → write sentLog, stats.sentToday++→ randomDelay(delayMinSec..delayMaxSec) → NEXT
   Abort conditions → set runState.running=false, notify popup: LinkedIn verification/captcha detected, "unusual activity" banner detected, 3 consecutive failures, or daily cap reached.

6.2 Queue building (content/scrapers.js)
Navigate to LinkedIn people search pre-filtered to 1st-degree connections:https://www.linkedin.com/search/results/people/?network=%5B%22U%22%5D&origin=GLOBAL_SEARCH_HEADEROptionally append &currentCompany= when the user provided companies. Scroll-and-paginate to collect: profile URL, name, headline. Parse role/company from headline (split on " at "/" @ "/" - " / "·"). Extract urn from the profile URL slug (/in/SLUG/ → use slug as stable id). Store into queue with status "pending". Cap at 500 items.

6.3 History check (two layers — BOTH required)
Layer 1: sentLog[urn] exists → skip.
Layer 2 (live): on profile, click the Message button. If a prior conversation exists, the thread pane shows message bubbles; a new conversation shows an empty compose area. Count message elements inside the thread container using selectors.js. count > 0 → skip + backfill sentLog (catches messages sent from phone/other tools).
6.4 AI client (background/ai-client.js)
POST https://integrate.api.nvidia.com/v1/chat/completionsHeaders: Authorization: Bearer <settings.apiKey>, Content-Type: application/jsonBody: { model, temperature: settings.temperature, max_tokens: 300, messages: [ {role:"system", content: SYSTEM_PROMPT}, {role:"user", content: buildUserPrompt(profile, settings)} ] }
Cache: check msgCache[urn::{model}::v1] first; on hit return cached message.
Retry: up to 3 attempts; on HTTP 429 or network error sleep 2000 \* 2^attempt ms between attempts.
Response parsing: take choices[0].message.content, attempt JSON.parse; if it fails, extract first {...} block via regex; if that fails, return { ok:false }.
Fallback: after 3 failed attempts, return the substituted fallbackTemplate and tag source:"fallback". The content script writes whichever message was used into sentLog with its source tag.
If settings.mockAI === true: skip fetch entirely, return { ok:true, source:"ai", message: cannedJSON } after 400ms — used by the test harness.
6.5 Prompt (lib/prompt.js)
const SYSTEM_PROMPT = `You write short LinkedIn referral-request messages for a real human.Rules:- Max 90 words. Warm, professional, specific. Never salesy, no emojis, no hashtags.- Naturally mention the recipient's role and company.- Weave in the sender's background and custom note where relevant.- Every message must be uniquely worded; never use template-sounding phrases like "I hope this message finds you well".- Output ONLY valid JSON: {"message": "<the message text>"}`;
buildUserPrompt(profile, settings) includes: recipient name/role/company, sender's aboutMe, customNote, tone, and target role. Tone maps to one style instruction line each (formal / friendly / concise).

7. SAFETY SYSTEMS (ALL MANDATORY)
   Feature Behavior
   Dry-run default settings.dryRun starts true; message logged, never sent
   Daily cap hard stop when stats.sentToday >= settings.dailyCap
   Random delays uniform in [delayMinSec, delayMaxSec] between every message
   Working hours no sending outside window when workHoursEnabled
   Blacklists skip blacklisted profiles/companies at queue-walk time
   Review mode drafts wait for explicit popup approval before sending
   Abort detection pause + notify popup on verification walls / activity warnings / 3 consecutive failures
   Rate respect never parallelize; one message at a time, always preceded by the random delay
8. UI SPECS
   Popup: header with run status + big Start/Pause button; live counters (sent today / cap, skipped, AI vs fallback); current action line; pending-review drafts list with Approve/Skip buttons when reviewMode; a red warning banner whenever dryRun is true.

Options: API key (password field), model text input (default prefilled), AI mode toggle, Mock AI toggle, Mock mode toggle, dry-run toggle (with confirmation dialog when disabling), review mode toggle, daily cap, delay range, working hours, target companies/roles (comma-separated inputs), tone select, aboutMe textarea, customNote textarea, fallbackTemplate textarea with live {{var}} preview, blacklist inputs, "Danger zone": clear sentLog / clear queue / clear cache (each with confirm).

9. SELF-VERIFICATION TEST HARNESS (CRITICAL — YOU CANNOT LOG INTO LINKEDIN)
   Because you cannot access a real LinkedIn account, ALL verification runs against the mock pages:

test/mock-linkedin/connections.html — reproduces the structure selectors.js/MOCK expects: a list of anchors .mock-connection[data-urn][data-name][data-headline], a scrollable container, and pagination behavior on scroll.
test/mock-linkedin/profile.html?name=A&role=B&company=C&hasThread=0|1 — reproduces a profile: headline element, a Message button role="button" aria-label="Message", and either an empty compose area or a thread pane containing N mock message bubbles.
Messaging flow on mock pages: a contenteditable div for input and a Send button aria-label="Send now". On "send", the mock page appends the typed text as a thread bubble so VERIFY_SENT can pass or fail realistically.
content/selectors.js must contain:

const SELECTORS = { LIVE: { /_ real LinkedIn selectors, aria-label/data-testid anchored _/ }, MOCK: { /_ mock page selectors _/ } };const S = () => settings.mockMode ? SELECTORS.MOCK : SELECTORS.LIVE;
Mock navigation: in mock mode, "navigating to a profile" = location.href = profile.html?... driven by an in-page mock queue; everything else behaves identically.

Verification procedure per phase: load unpacked extension → open mock pages → run flow → assert against checks.md (queue contents, sentLog entries, stats counters, storage keys, abort behaviors, resume-after-reload by closing/reopening the tab mid-run).

10. BUILD ORDER (SEQUENTIAL — EACH PHASE MUST PASS BEFORE THE NEXT)
    P1 Skeleton: manifest, file tree, storage helpers, PROGRESS.md/BUGLOG.md. ✅ Extension loads unpacked with zero console errors; all storage keys initialize with schema defaults.
    P2 Mock site: all three mock pages + mock-runner.md. ✅ Pages open, mock queue walks profiles, hasThread param works.
    P3 Queue scraper: against mock connections page. ✅ 50 mock connections → queue populated with urn/name/role/company, correct headline parsing, resumable.
    P4 Profile extraction + filters: ✅ role/company extracted; target-match and blacklist skips logged with reasons.
    P5 History check: ✅ hasThread=1 → skip + sentLog backfill; hasThread=0 → proceed. Plus local Layer-1 dedupe.
    P6 Fallback messaging (dry-run): ✅ full state machine runs end-to-end on mock pages with AI OFF; messages typed human-like; dry-run logs without sending; resume works after tab close/reopen mid-run.
    P7 AI client: NVIDIA call + cache + retries + fallback; test with mockAI first, then (if user provided a key) one real API smoke test via a dedicated "Test AI" button in Options that generates one sample message and shows it. ✅ cache hit on second call; 429 simulation (mockAI flag variant) exercises backoff; malformed-JSON path returns fallback.
    P8 Real sending (mock): ✅ send → bubble appears → VERIFY_SENT passes → sentLog/stats update.
    P9 Popup + Options full UI: ✅ every control functional; review-mode approve/skip works end-to-end.
    P10 Safety + polish: caps, hours, abort detection on mock "captcha" element (add one to mock profile via ?captcha=1), dry-run warning banner. ✅ every §7 row demonstrably passes.
    P11 LIVE selectors: fill in the LIVE selector set for real LinkedIn (aria-label anchored), document that they are unverified against the live site, and write checks.md entries for a supervised manual test.
11. SUBAGENT BUG-FIX PROTOCOL (USE FOR EVERY FAILURE)
    When any verification step, runtime error, or acceptance criterion fails:

Reproduce deterministically via the mock harness (§9) and capture the exact failing output.
Spawn a bugfix subagent with a SCOPED brief containing only: (a) the goal in one sentence, (b) exact error output / expected-vs-actual, (c) ONLY the relevant file paths and code excerpts, (d) this constraints list:
May modify only the files in scope. No refactors of unrelated code.
MUST NOT change: storage schema keys, manifest permissions, the state machine's phase names, message ordering guarantees, or safety features (§7) — if a fix seems to require this, STOP and report instead.
Any fix touching selectors.js must update both LIVE and MOCK sets coherently.
MUST deliver: the fix + one added regression check in checks.md (or a new mock-page variant) that would have caught this bug.
Re-verify: re-run the phase's full checks (not just the failed one — fixes may regress siblings).
Log to BUGLOG.md: symptom → root cause → fix → regression test name.
Escalation rule: after 3 failed subagent attempts on the same bug, mark the phase BLOCKED in PROGRESS.md with your diagnosis, and continue with the next independent phase. Never fake a pass. 12. DEFINITION OF DONE (GLOBAL CHECKLIST)
Extension loads unpacked, zero console errors on popup, options, mock pages.
Full E2E on mock pages: scrape 50 → filter → dedupe → generate (mock AI) → dry-run → real-send → sentLog/stats correct.
Kill the tab mid-run and reopen: run resumes from the exact interrupted step, no duplicate sends.
Duplicate prevention provably works on both layers (local log + live thread check).
With dryRun:true (default), zero network sends occur and no Send button is ever clicked — verify by instrumentation/log.
Every §7 safety row has a passing mock test.
No API key in code; Options persist all settings across browser restart.
PROGRESS.md shows all phases DONE (or BLOCKED with diagnosis); BUGLOG.md complete with regression tests. 13. EXPLICIT DO-NOTS
Do NOT add authentication, servers, analytics, or third-party SDKs.
Do NOT use eval, remote-hosted code, or CDN scripts (MV3 forbids remote code).
Do NOT attempt to bypass LinkedIn anti-bot measures (captchas, login walls) — the correct behavior is always PAUSE + notify.
Do NOT send any real LinkedIn messages at any point during development.
Do NOT proceed to a new phase while the previous phase's acceptance criteria are unmet (unless marked BLOCKED per §11.5).
BEGIN WITH P1 NOW. Before writing any code, output your understanding of the state machine and the resume-on-reload strategy in ≤10 lines, then start.
