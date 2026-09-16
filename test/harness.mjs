// AutoRef verification harness.
// Shims browser globals, loads classic scripts, unit-tests pure logic + ai-client.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// ---------- shims ----------
const mem = {};
globalThis.window = globalThis;
globalThis.location = { href: 'http://localhost:8137/connections.html' };
const docStub = { handler: null, elementsById: {} };

class FakeNode {
  constructor(tag) {
    this.tagName = tag ? tag.toUpperCase() : 'DIV';
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.innerText = '';
    this.value = '';
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.listeners = {};
    this.disabled = false;
  }
  appendChild(c) {
    this.children.push(c);
    c.parentNode = this;
    if (c.id) docStub.elementsById[c.id] = c;
    return c;
  }
  removeChild(c) {
    const idx = this.children.indexOf(c);
    if (idx !== -1) this.children.splice(idx, 1);
    if (c.id) delete docStub.elementsById[c.id];
    c.parentNode = null;
    return c;
  }
  addEventListener(e, fn) { this.listeners[e] = fn; }
  dispatchEvent(e) { if (this.listeners[e.type]) this.listeners[e.type](e); }
  setAttribute(k, v) { this[k] = v; }
  getAttribute(k) { return this[k] || null; }
  focus() {}
  click() { if (this.listeners['click']) this.listeners['click']({ target: this }); }
  getBoundingClientRect() { return { top: 400, left: 100, right: 300, bottom: 440, width: 200, height: 40 }; }
  querySelector(sel) {
    for (const c of this.children) {
      if (c.id && sel.includes(c.id)) return c;
      if (c.className && c.className.split(/\s+/).some((cls) => cls && sel.includes(cls))) return c;
      const f = c.querySelector(sel);
      if (f) return f;
    }
    return null;
  }
  querySelectorAll(sel) {
    let res = [];
    for (const c of this.children) {
      if (c.id && sel.includes(c.id)) res.push(c);
      else if (c.className && c.className.split(/\s+/).some((cls) => cls && sel.includes(cls))) res.push(c);
      else if (sel === 'button' && c.tagName === 'BUTTON') res.push(c);
      res = res.concat(c.querySelectorAll(sel));
    }
    return res;
  }
}

const fakeBody = new FakeNode('BODY');
const fakeHead = new FakeNode('HEAD');
globalThis.document = {
  readyState: 'complete',
  body: fakeBody,
  head: fakeHead,
  documentElement: fakeBody,
  addEventListener() {},
  createElement(tag) { return new FakeNode(tag); },
  getElementById(id) { return docStub.elementsById[id] || null; },
  querySelector(sel) {
    if (docStub.handler) {
      const res = docStub.handler(sel);
      if (res !== undefined) return res;
    }
    if (sel.startsWith('#')) return docStub.elementsById[sel.slice(1)] || null;
    return fakeBody.querySelector(sel);
  },
  querySelectorAll(sel) {
    if (docStub.handlerAll) return docStub.handlerAll(sel);
    return fakeBody.querySelectorAll(sel);
  },
  queryCommandSupported() { return false; },
};
globalThis.setInterval = () => 0; // poller disabled in harness (keep real setTimeout)
globalThis.Event = globalThis.Event || class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } };
globalThis.InputEvent = globalThis.InputEvent || class extends globalThis.Event {};
globalThis.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        let out = {};
        if (Array.isArray(keys)) {
          for (const k of keys) { if (k in mem) out[k] = mem[k]; }
        } else if (typeof keys === 'string') {
          if (keys in mem) out[keys] = mem[keys];
        } else if (keys && typeof keys === 'object') {
          out = { ...keys };
          for (const k of Object.keys(out)) { if (k in mem) out[k] = mem[k]; }
        } else {
          out = { ...mem };
        }
        if (cb) setTimeout(() => cb(JSON.parse(JSON.stringify(out))), 0);
        return Promise.resolve(out);
      },
      set(obj, cb) {
        Object.assign(mem, JSON.parse(JSON.stringify(obj)));
        if (cb) setTimeout(() => cb(), 0);
        return Promise.resolve();
      },
    },
  },
  runtime: { lastError: undefined, onMessage: { addListener() {} }, sendMessage() {} },
};

mem.settings = { mockMode: true }; // mirror real mock-E2E config so boot() pins MOCK selectors
for (const f of ['lib/delay.js', 'lib/storage.js', 'lib/template.js', 'lib/prompt.js',
  'content/selectors.js', 'content/scrapers.js', 'content/history-check.js',
  'content/messenger.js', 'content/overlay-widget.js', 'content/main.js']) {
  eval(read(f)); // eslint-disable-line — loads into window.AutoRef
}
const NS = globalThis.AutoRef;
const ai = await import(pathToFileURL(path.join(ROOT, 'background/ai-client.js')).href);

// ---------- assert ----------
let pass = 0, fail = 0;
const FAILS = [];
function t(cond, msg) {
  if (cond) { pass++; }
  else { fail++; FAILS.push(msg); console.error('FAIL:', msg); }
}
function eq(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  t(ok, msg + ' | got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
}

// ---------- P3/P4: parsing ----------
eq(NS.parseHeadline('Senior SWE at Acme'), { role: 'Senior SWE', company: 'Acme' }, 'headline at');
eq(NS.parseHeadline('Designer @ Foo'), { role: 'Designer', company: 'Foo' }, 'headline @');
eq(NS.parseHeadline('PM - Bar'), { role: 'PM', company: 'Bar' }, 'headline dash');
eq(NS.parseHeadline('Dev · Baz'), { role: 'Dev', company: 'Baz' }, 'headline middot');
eq(NS.parseHeadline('Lead | Corp'), { role: 'Lead', company: 'Corp' }, 'headline pipe');
eq(NS.parseHeadline(' VP  —  BigCo '), { role: 'VP', company: 'BigCo' }, 'headline emdash');
eq(NS.parseHeadline(''), { role: '', company: '' }, 'headline empty');
eq(NS.parseHeadline('JustARole'), { role: 'JustARole', company: '' }, 'headline no-sep');
eq(NS.slugFromProfileUrl('https://www.linkedin.com/in/jane-doe/'), 'jane-doe', 'slug basic');
eq(NS.slugFromProfileUrl('https://www.linkedin.com/in/jane-doe?x=1'), 'jane-doe', 'slug query');
eq(NS.slugFromProfileUrl('https://example.com/'), '', 'slug none');
eq(NS.urnFromMockUrl('http://h/profile.html?urn=mock-person-3&name=X'), 'mock-person-3', 'mock urn');

// ---------- lib: template/prompt ----------
eq(NS.renderTemplate('Hi {{firstName}} at {{company}}.', { firstName: 'Ada', company: 'Acme' }),
  'Hi Ada at Acme.', 'template basic');
eq(NS.renderTemplate('Hi {{ firstName }}!', { firstName: 'Bo' }), 'Hi Bo!', 'template spaces');
eq(NS.renderTemplate('A {{missing}} B', {}), 'A B', 'template missing->empty');
eq(NS.templateVarsFor({ name: 'Ada Lovelace', role: 'SE', company: 'AE' }, { customNote: 'N' }).firstName,
  'Ada', 'firstName');
t(NS.buildUserPrompt({ name: 'N', role: 'R', company: 'C' }, { aboutMe: 'B', customNote: 'CN', tone: 'formal', targetRoles: ['T'] })
  .includes('formal and respectful'), 'tone formal line');
t(NS.buildUserPrompt({}, {}).includes('conversational'), 'tone default friendly');
t(NS.buildUserPrompt({}, { tone: 'concise' }).includes('under 60 words'), 'tone concise line');
t(NS.SYSTEM_PROMPT.includes('ONLY valid JSON'), 'system prompt json-only');
t(NS.SYSTEM_PROMPT.includes('90 words'), 'system prompt 90 words');

// ---------- selectors parity + switching ----------
eq(Object.keys(NS.SELECTORS.LIVE).sort(), Object.keys(NS.SELECTORS.MOCK).sort(), 'selector key parity');
NS.setMockMode(true);
t(NS.S().searchResultItem === '.mock-connection', 'mock selectors active');
NS.setMockMode(false);
t(/aria-label|data-testid|reusable-search/.test(NS.S().messageButton), 'live selectors anchored');
NS.setMockMode(true);

// ---------- history / filters ----------
t(NS.hasLocalHistory({ a: 1 }, 'a') === true, 'local history hit');
t(NS.hasLocalHistory({}, 'a') === false, 'local history miss');
t(NS.matchesTarget({ role: 'SE', company: 'Acme' }, {}) === true, 'target empty=all');
t(NS.matchesTarget({ role: 'SE', company: 'Acme' }, { targetCompanies: ['acme'] }) === true, 'target co ci');
t(NS.matchesTarget({ role: 'SE', company: 'Acme' }, { targetCompanies: ['Other'] }) === false, 'target co miss');
t(NS.matchesTarget({ role: 'Senior Data Scientist', company: 'X' }, { targetRoles: ['data'] }) === true, 'target role substr');
eq(NS.blacklistHit({ urn: 'u1', name: 'Ann', company: 'Acme Inc' }, { blacklistProfiles: ['U1'] }), 'profile', 'blacklist urn ci');
eq(NS.blacklistHit({ urn: 'u1', name: 'Ann Lee', company: 'X' }, { blacklistProfiles: ['ann lee'] }), 'profile', 'blacklist name ci');
eq(NS.blacklistHit({ urn: 'u9', name: 'Z', company: 'Acme Inc' }, { blacklistCompanies: ['acme'] }), 'company', 'blacklist co substr');
eq(NS.blacklistHit({ urn: 'u9', name: 'Z', company: 'Acme' }, {}), '', 'blacklist clean');

// ---------- main.js pure helpers ----------
const H = (h) => new Date(2026, 5, 15, h, 0, 0);
t(NS.withinWorkHours({ workHoursEnabled: false }, H(3)) === true, 'hours disabled');
t(NS.withinWorkHours({ workHoursEnabled: true, workHoursStart: 9, workHoursEnd: 18 }, H(10)) === true, 'hours inside');
t(NS.withinWorkHours({ workHoursEnabled: true, workHoursStart: 9, workHoursEnd: 18 }, H(8)) === false, 'hours before');
t(NS.withinWorkHours({ workHoursEnabled: true, workHoursStart: 9, workHoursEnd: 18 }, H(18)) === false, 'hours end-exclusive');
t(NS.withinWorkHours({ workHoursEnabled: true, workHoursStart: 22, workHoursEnd: 6 }, H(23)) === true, 'hours overnight in');
t(NS.withinWorkHours({ workHoursEnabled: true, workHoursStart: 22, workHoursEnd: 6 }, H(12)) === false, 'hours overnight out');
const F = (st) => ({ status: st });
eq(NS.consecutiveFailures([F('failed'), F('failed'), F('failed')]), 3, 'consec 3');
eq(NS.consecutiveFailures([F('failed'), F('done'), F('failed')]), 1, 'consec reset on done');
eq(NS.consecutiveFailures([F('failed'), F('skipped'), F('failed'), F('failed')]), 3, 'consec skip neutral');
eq(NS.consecutiveFailures([F('done(dry)'), F('pending')]), 0, 'consec none');
eq(NS.consecutiveFailures([]), 0, 'consec empty');
t(NS.pickNext([{ urn: 'a', status: 'pending' }, { urn: 'b', status: 'in_progress' }]).item.urn === 'b', 'pick resumes in_progress');
t(NS.pickNext([{ urn: 'a', status: 'done' }]) === null, 'pick drained null');
for (const st of ['done', 'done(dry)', 'skipped', 'failed', 'awaiting_review'])
  t(NS.TERMINAL_ITEM(st) === true, 'terminal ' + st);
t(NS.TERMINAL_ITEM('pending') === false && NS.TERMINAL_ITEM('in_progress') === false, 'non-terminal active');

// ---------- ai-client: mirror parity ----------
t(ai.SYSTEM_PROMPT === NS.SYSTEM_PROMPT, 'SYSTEM_PROMPT parity lib<->sw');
t(JSON.stringify(ai.TONE_LINES) === JSON.stringify(NS.TONE_LINES), 'TONE_LINES parity');
eq(ai.renderTemplate('Hi {{firstName}}.', { firstName: 'Al' }), NS.renderTemplate('Hi {{firstName}}.', { firstName: 'Al' }), 'render parity');
eq(ai.buildUserPrompt({ name: 'N' }, { tone: 'formal' }), NS.buildUserPrompt({ name: 'N' }, { tone: 'formal' }), 'prompt parity');
t(ai.cacheKeyFor('u', 'm') === 'u::m::v1', 'cache key format');
eq(ai.parseModelContent('{"message":"Hi"}'), { ok: true, message: 'Hi' }, 'parse strict json');
eq(ai.parseModelContent('prefix {"message":"Yo"} suffix'), { ok: true, message: 'Yo' }, 'parse embedded json');
t(ai.parseModelContent('no json here').ok === false, 'parse garbage fails');
t(ai.parseModelContent('').ok === false, 'parse empty fails');

// ---------- ai-client: generateMessage ----------
const memStore = (obj) => ({
  readCache: async () => JSON.parse(JSON.stringify(obj)),
  writeCache: async (c) => { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, JSON.parse(JSON.stringify(c))); },
});
const noFetch = async () => { throw new Error('fetch must not be called'); };
const SETT = { model: 'm', temperature: 0.8, aiMode: true, mockAI: false, apiKey: 'k', fallbackTemplate: 'Hi {{firstName}} ({{role}} @ {{company}})', tone: 'friendly' };
const PROF = { urn: 'u1', name: 'Ada Lovelace', role: 'SE', company: 'AE' };

// cache hit: no network
{
  const cache = { 'u1::m::v1': { message: 'cached!', ts: 't', source: 'ai' } };
  const r = await ai.generateMessage(PROF, SETT, { fetchFn: noFetch, store: memStore(cache), sleepFn: async () => {} });
  t(r.ok && r.message === 'cached!' && r.cached === true && r.source === 'ai', 'cache hit skips network');
}
// aiMode off: fallback, no network
{
  const sleeps = [];
  const r = await ai.generateMessage(PROF, { ...SETT, aiMode: false }, { fetchFn: noFetch, store: memStore({}), sleepFn: async (ms) => sleeps.push(ms) });
  t(r.ok && r.source === 'fallback' && r.message.includes('Ada') && r.message.includes('SE'), 'aiMode-off fallback render');
  t(sleeps.length === 0, 'aiMode-off no sleeps');
}
// mockAI canned + 400ms
{
  const sleeps = [];
  const cache = {};
  const r = await ai.generateMessage(PROF, { ...SETT, mockAI: true }, { fetchFn: noFetch, store: memStore(cache), sleepFn: async (ms) => sleeps.push(ms) });
  t(r.ok && r.source === 'ai' && r.message.includes('Ada'), 'mockAI canned');
  t(JSON.stringify(sleeps) === '[400]', 'mockAI 400ms delay');
  t(!!cache['u1::m::v1'], 'mockAI result cached');
}
// __test_429__: backoff 4s/8s then success
{
  const sleeps = [];
  const r = await ai.generateMessage({ ...PROF, urn: '__test_429__' }, { ...SETT, mockAI: true },
    { fetchFn: noFetch, store: memStore({}), sleepFn: async (ms) => sleeps.push(ms) });
  t(r.ok && r.source === 'ai' && r.attempts === 3, '429-hook succeeds after backoff');
  eq(sleeps, [4000, 8000], '429-hook backoff durations');
}
// __test_badjson__: fallback
{
  const r = await ai.generateMessage({ ...PROF, urn: '__test_badjson__' }, { ...SETT, mockAI: true },
    { fetchFn: noFetch, store: memStore({}), sleepFn: async () => {} });
  t(r.ok && r.source === 'fallback' && r.message.includes('Ada'), 'badjson-hook fallback');
}
// real success
{
  const cache = {};
  let calls = 0;
  const fetchOk = async () => { calls++; return { status: 200, json: async () => ({ choices: [{ message: { content: '{"message":"Hello Ada"}' } }] }) }; };
  const r = await ai.generateMessage(PROF, SETT, { fetchFn: fetchOk, store: memStore(cache), sleepFn: async () => {} });
  t(r.ok && r.source === 'ai' && r.message === 'Hello Ada' && calls === 1, 'real success path');
  t(cache['u1::m::v1'] && cache['u1::m::v1'].message === 'Hello Ada', 'real success cached');
}
// 429 twice then success via fetch
{
  const sleeps = [];
  let calls = 0;
  const flaky = async () => { calls++; if (calls < 3) return { status: 429, json: async () => ({}) }; return { status: 200, json: async () => ({ choices: [{ message: { content: '{"message":"Retry win"}' } }] }) }; };
  const r = await ai.generateMessage(PROF, SETT, { fetchFn: flaky, store: memStore({}), sleepFn: async (ms) => sleeps.push(ms) });
  t(r.ok && r.message === 'Retry win' && calls === 3, 'fetch 429 retried to success');
  eq(sleeps, [4000, 8000], 'fetch backoff durations');
}
// persistent 429 -> fallback after 3 attempts
{
  const sleeps = [];
  let calls = 0;
  const always429 = async () => { calls++; return { status: 429, json: async () => ({}) }; };
  const r = await ai.generateMessage(PROF, SETT, { fetchFn: always429, store: memStore({}), sleepFn: async (ms) => sleeps.push(ms) });
  t(r.ok && r.source === 'fallback' && calls === 3, 'persistent 429 -> fallback, 3 attempts');
  eq(sleeps, [4000, 8000], 'persistent 429 backoff');
}
// 403 fail-fast, no retry
{
  const sleeps = [];
  let calls = 0;
  const bad = async () => { calls++; return { status: 403, json: async () => ({}) }; };
  const r = await ai.generateMessage(PROF, SETT, { fetchFn: bad, store: memStore({}), sleepFn: async (ms) => sleeps.push(ms) });
  t(r.source === 'fallback' && calls === 1 && sleeps.length === 0, '403 fail-fast fallback');
}
// network error x3 -> fallback
{
  const sleeps = [];
  let calls = 0;
  const down = async () => { calls++; throw new Error('boom'); };
  const r = await ai.generateMessage(PROF, SETT, { fetchFn: down, store: memStore({}), sleepFn: async (ms) => sleeps.push(ms) });
  t(r.source === 'fallback' && calls === 3, 'network errors retried x3 -> fallback');
  eq(sleeps, [4000, 8000], 'network backoff');
}
// malformed content -> retries then fallback
{
  const sleeps = [];
  let calls = 0;
  const gib = async () => { calls++; return { status: 200, json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }) }; };
  const r = await ai.generateMessage(PROF, SETT, { fetchFn: gib, store: memStore({}), sleepFn: async (ms) => sleeps.push(ms) });
  t(r.source === 'fallback' && calls === 3, 'malformed json retried -> fallback');
  t(sleeps.length === 2, 'malformed backoff count');
}
// no key -> fallback, no fetch
{
  const r = await ai.generateMessage(PROF, { ...SETT, apiKey: '' }, { fetchFn: noFetch, store: memStore({}), sleepFn: async () => {} });
  t(r.source === 'fallback' && /API key/.test(r.reason || ''), 'missing key fallback');
}
// missing urn
{
  const r = await ai.generateMessage({}, SETT, { fetchFn: noFetch, store: memStore({}), sleepFn: async () => {} });
  t(r.ok === false, 'missing urn not ok');
}

// ---------- messenger: dry-run guard + send/verify on fakes ----------
{
  NS.setMockMode(true); // boot() async-resets from (default) settings; re-pin mock selectors
  t(NS.S().searchResultItem === '.mock-connection', 'mock selectors pinned for dom tests');
  let clicked = 0;
  const sendBtn = { disabled: false, getAttribute: () => null, click() { clicked++; } };
  docStub.handler = (sel) => (/mock-send|Send now/.test(sel) ? sendBtn : null);
  const blocked = await NS.clickSend({ dryRun: true });
  t(blocked.ok === false && clicked === 0, 'dry-run blocks Send click');
  const allowed = await NS.clickSend({ dryRun: false });
  t(allowed.ok === true && clicked === 1, 'non-dry-run clicks Send');
  const bubbles = [{ innerText: 'seeded hello' }, { innerText: 'Hello Ada, custom typed text here for verification xyz' }];
  docStub.handler = () => ({ querySelectorAll: () => bubbles });
  const ver = await NS.verifySent('Hello Ada, custom typed text here for verification xyz');
  t(ver.ok === true, 'verify finds sent text');
  const verMiss = await NS.verifySent('something entirely different not present qqq');
  t(verMiss.ok === false, 'verify misses absent text');
  docStub.handler = () => null;
  const noModal = await NS.openMessageModal();
  t(noModal.ok === false, 'missing message button fails cleanly');
  const abort0 = NS.detectAbortSignals();
  t(abort0.captcha === false && abort0.warning === false, 'no abort signals on clean page');
  docStub.handler = (sel) => (/#mock-captcha/.test(sel) ? {} : null);
  t(NS.detectAbortSignals().captcha === true, 'captcha detected');
  docStub.handler = null;
}
// humanTyping path (stubbed events)
{
  const el = { tagName: 'DIV', textContent: '', focus() {}, dispatchEvent() {} };
  await NS.humanTyping(el, 'Hi');
  t(el.textContent === 'Hi', 'humanTyping types chars');
}

// ---------- storage defaults ----------
{
  for (const k of Object.keys(mem)) delete mem[k];
  const all = await NS.initStorage();
  t(all.settings.dryRun === true && all.settings.apiKey === '' && Array.isArray(all.queue), 'storage defaults init');
  t(all.runState.phase === 'idle' && all.stats.sentToday === 0, 'runstate/stats defaults');
  t(all.settings.reviewMode === true, 'default reviewMode is true (Human-in-the-Loop)');
  t(all.settings.delayMinSec === 45 && all.settings.delayMaxSec === 120, 'default Gaussian delay range 45-120s');
  t(all.settings.coffeeBreakInterval === 5, 'default coffee break interval is 5 sends');
  t(all.settings.coffeeBreakDurationSec === 900, 'default coffee break duration is 15 minutes (900s)');
  t(all.stats.sendsSinceBreak === 0, 'default sendsSinceBreak starts at 0');
}

// ---------- Gaussian / Natural Delay ----------
{
  let minObs = 999, maxObs = -999, sum = 0;
  const N = 100;
  for (let i = 0; i < N; i++) {
    const val = NS.naturalRandomSec(45, 120);
    if (val < minObs) minObs = val;
    if (val > maxObs) maxObs = val;
    sum += val;
  }
  const mean = sum / N;
  t(minObs >= 45 && maxObs <= 120, 'Gaussian delay clamped in [45, 120]');
  t(mean >= 65 && mean <= 100, 'Gaussian delay mean centered near 82.5s');

  let ticks = [];
  await NS.countdownDelay(2, (rem) => ticks.push(rem), { aborted: true });
  t(ticks.length === 0, 'countdownDelay respects aborted signal');
}

// ---------- Typing Jitter & Typo Recovery ----------
{
  // Test typo recovery: force typoChance = 1
  const el = { tagName: 'DIV', textContent: '', focus() {}, dispatchEvent() {} };
  await NS.humanTyping(el, 'A', { typoChance: 1, fast: true });
  t(el.textContent === 'A', 'humanTyping with typo recovers to exact character');
}

// ---------- Multi-Tiered Resilient Selector Engine ----------
{
  NS.setMockMode(false);
  // Tier 1: ARIA labels and data-testid
  const fakeCompose = { tagName: 'DIV', getAttribute: () => 'Write a message' };
  docStub.handler = (sel) => {
    if (sel.includes('data-testid') && sel.includes('compose')) return fakeCompose;
    return null;
  };
  t(NS.findComposeBox() === fakeCompose, 'Multi-Tier: Compose box found via Tier 1 data-testid');

  // Tier 2: Visible text matching
  const sendBtnObj = { tagName: 'BUTTON', innerText: 'Send', getAttribute: () => null };
  docStub.handler = () => null;
  docStub.handlerAll = (sel) => (sel === 'button' ? [sendBtnObj] : []);
  t(NS.findSendButton() === sendBtnObj, 'Multi-Tier: Send button found via Tier 2 visible text');

  // Tier 3: Contextual docked chat window
  const dockedBox = { tagName: 'DIV', textContent: 'in-dock' };
  const dockedContainer = {
    querySelector: (s) => (s.includes('contenteditable') ? dockedBox : null),
  };
  docStub.handler = (sel) => {
    if (sel.includes('.msg-overlay-conversation-bubble')) return dockedContainer;
    return null;
  };
  docStub.handlerAll = null;
  t(NS.findComposeBox() === dockedBox, 'Multi-Tier: Compose box found via Tier 3 docked chat window');

  // Tier 3: Contextual modal dialog
  const modalBox = { tagName: 'DIV', textContent: 'in-modal' };
  const modalContainer = {
    querySelector: (s) => (s.includes('contenteditable') ? modalBox : null),
  };
  docStub.handler = (sel) => {
    if (sel.includes('div[role="dialog"]')) return modalContainer;
    return null;
  };
  t(NS.findComposeBox() === modalBox, 'Multi-Tier: Compose box found via Tier 3 modal dialog');

  // Anti-false-positive: Send button must NOT match "Send feedback"
  const feedbackBtn = { tagName: 'BUTTON', innerText: 'Feedback', getAttribute: (a) => (a === 'aria-label' ? 'Send feedback' : null) };
  docStub.handler = () => null;
  docStub.handlerAll = (sel) => (sel === 'button' ? [feedbackBtn] : []);
  t(NS.findSendButton() !== feedbackBtn, 'findSendButton ignores Send feedback button');

  // Anti-false-positive: Message button must NOT match global Messaging nav link
  const navMessagingLink = { tagName: 'A', getAttribute: (a) => (a === 'aria-label' ? 'Messaging' : null), closest: (s) => s.includes('global-nav') };
  docStub.handler = () => null;
  docStub.handlerAll = () => [navMessagingLink];
  t(NS.findMessageButton() !== navMessagingLink, 'findMessageButton ignores global Messaging nav tab');

  // Reset docStub
  docStub.handler = null;
  docStub.handlerAll = null;
  NS.setMockMode(true);
}

// ---------- Emergency Halt Detection ----------
{
  docStub.handler = (sel) => {
    if (sel.includes('checkpoint')) return {};
    return null;
  };
  const abortChk = NS.detectAbortSignals();
  t(abortChk.checkpoint === true && abortChk.any === true, 'detectAbortSignals catches security checkpoint');
  docStub.handler = null;
}

// ---------- Floating In-Page Overlay Widget ----------
{
  t(typeof NS.Overlay.countWords === 'function', 'Overlay has countWords');
  t(NS.Overlay.countWords('  Hello   world, this is   AutoRef! ') === 5, 'countWords computes accurate word count');
  t(NS.Overlay.countWords('') === 0, 'countWords handles empty text');
  t(NS.Overlay.formatTime(45) === '45s', 'formatTime under 60s');
  t(NS.Overlay.formatTime(125) === '2:05', 'formatTime minutes');

  let approvedDraft = '';
  let regenerated = false;
  let skipped = false;

  const card = NS.Overlay.render({
    profile: { name: 'Grace Hopper', role: 'Computer Scientist', company: 'Navy' },
    draft: 'Hi Grace, great work on compilers!',
    status: 'Awaiting Review',
    onApprove: (t) => { approvedDraft = t; },
    onRegenerate: async () => { regenerated = true; return 'Regenerated draft message!'; },
    onSkip: () => { skipped = true; },
  });

  t(card && card.id === 'autoref-inpage-overlay', 'Overlay rendered card with expected ID');
  t(NS.Overlay.isVisible() === true, 'Overlay isVisible true');
  t(NS.Overlay.getDraftText() === 'Hi Grace, great work on compilers!', 'Overlay gets draft text');

  // Test live editing
  const ta = document.getElementById('autoref-draft-input');
  t(!!ta, 'Overlay textarea exists in DOM');
  ta.value = 'Hi Grace, updated custom draft text here!';
  ta.dispatchEvent(new Event('input'));
  const wc = document.getElementById('autoref-word-count');
  t(wc && wc.textContent.includes('7 words'), 'Live word count updates on input');

  // Test Approve button
  const approveBtn = document.getElementById('autoref-btn-approve');
  approveBtn.click();
  t(approvedDraft === 'Hi Grace, updated custom draft text here!', 'Approve button sends updated text to callback');

  // Test Regenerate button
  const regenBtn = document.getElementById('autoref-btn-regenerate');
  regenBtn.click();
  t(regenerated === true, 'Regenerate button triggers callback');

  // Test Skip button
  const skipBtn = document.getElementById('autoref-btn-skip');
  skipBtn.click();
  t(skipped === true, 'Skip button triggers callback');

  // Test Emergency Halt Alert & Sound
  let alertDismissed = false;
  const alertEl = NS.Overlay.showEmergencyAlert('Mock Captcha Detected', () => { alertDismissed = true; });
  t(alertEl && alertEl.id === 'autoref-emergency-halt', 'showEmergencyAlert creates alert element');
  const disBtn = alertEl.querySelector('.autoref-em-btn');
  if (disBtn) disBtn.click();
  t(alertDismissed === true, 'Emergency alert dismiss button works');

  NS.Overlay.remove();
  t(NS.Overlay.isVisible() === false, 'Overlay removed cleanly');

  // Test runCountdown does not hang when card is not rendered
  let cdFinished = false;
  await NS.Overlay.runCountdown(0.01, 'Test: {time}', 'Skip').then(() => { cdFinished = true; });
  t(cdFinished === true, 'runCountdown resolves cleanly without hanging when card absent');
  NS.Overlay.remove();
}

// ---------- Typing Clear Pre-existing Content ----------
{
  const el = { tagName: 'DIV', textContent: 'stale previous draft text', focus() {}, dispatchEvent() {} };
  await NS.humanTyping(el, 'Fresh message', { fast: true });
  t(el.textContent === 'Fresh message', 'humanTyping clears stale content before typing');
}

// ---------- State Machine: Awaiting Review Guard ----------
{
  await NS.setSettings({ reviewMode: true, mockMode: true, dailyCap: 10 });
  await NS.setQueue([
    { urn: 'u1', name: 'Person 1', status: 'awaiting_review', approved: false },
    { urn: 'u2', name: 'Person 2', status: 'pending', approved: false },
  ]);
  await NS.setRunState({ running: true, phase: 'awaiting_review', currentUrn: 'u1' });

  // Running step() must NOT advance to u2 while u1 is awaiting review!
  const stepRes = await NS.step();
  t(stepRes === 'stop', 'step() returns stop when in awaiting_review phase');

  const curState = await NS.getRunState();
  t(curState.phase === 'awaiting_review' && curState.currentUrn === 'u1', 'runState remains parked on u1 in awaiting_review');

  const q = await NS.getQueue();
  t(q[0].status === 'awaiting_review' && q[1].status === 'pending', 'queue order preserved without premature advancement');
}

console.log('\nPASS: ' + pass + ' FAIL: ' + fail);
if (FAILS.length) { console.log('Failures listed above.'); process.exit(1); }
setTimeout(() => process.exit(0), 50).unref?.();
process.exit(0);
