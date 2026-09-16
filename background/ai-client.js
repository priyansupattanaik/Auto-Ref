/* AutoRef background/ai-client.js — ES module imported by service-worker.js.
   NVIDIA OpenAI-compatible endpoint ONLY. Retry + backoff + cache + fallback (P7).
   SYNC NOTE: SYSTEM_PROMPT, TONE_LINES, buildUserPrompt mirror lib/prompt.js and
   renderTemplate/templateVarsFor mirror lib/template.js (those are classic scripts
   for content_scripts and cannot be ESM-imported). Keep byte-identical logic;
   verified by the node harness (Temp dir) comparing outputs. */

export const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const CACHE_VERSION = 'v1';
export const MAX_ATTEMPTS = 3;
export const CACHE_LIMIT = 200;

export const SYSTEM_PROMPT = `You write short LinkedIn referral-request messages for a real human.
Rules:
- Max 90 words. Warm, professional, specific. Never salesy, no emojis, no hashtags.
- Naturally mention the recipient's role and company.
- Weave in the sender's background and custom note where relevant.
- Every message must be uniquely worded; never use template-sounding phrases like "I hope this message finds you well".
- Output ONLY valid JSON: {"message": "<the message text>"}`;

export const TONE_LINES = {
  formal: 'Style: formal and respectful, complete sentences, no contractions.',
  friendly: 'Style: warm, friendly and conversational while staying professional.',
  concise: 'Style: brief and to the point, under 60 words, no small talk.',
};

export function buildUserPrompt(profile, settings) {
  const p = profile || {};
  const s = settings || {};
  const toneKey = String(s.tone || 'friendly').toLowerCase();
  const toneLine = TONE_LINES[toneKey] || TONE_LINES.friendly;
  return [
    'Recipient: ' + (p.name || 'unknown'),
    'Role: ' + (p.role || 'unknown'),
    'Company: ' + (p.company || 'unknown'),
    'Profile: ' + (p.profileUrl || 'unknown'),
    'Sender background: ' + (s.aboutMe || '(not provided)'),
    'Custom note to weave in: ' + (s.customNote || '(none)'),
    'Target role context: ' + ((s.targetRoles || []).join(', ') || '(general)'),
    toneLine,
    'Write the referral-request message JSON now.',
  ].join('\n');
}

export function renderTemplate(template, vars) {
  const tpl = String(template == null ? '' : template);
  const v = vars && typeof vars === 'object' ? vars : {};
  return tpl
    .replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, key) => {
      const val = v[key];
      return val === undefined || val === null ? '' : String(val);
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

export function templateVarsFor(profile, settings) {
  const p = profile || {};
  const s = settings || {};
  const name = String(p.name || '').trim();
  return {
    firstName: name.split(/\s+/)[0] || '',
    name: name,
    role: p.role || '',
    company: p.company || '',
    profileUrl: p.profileUrl || '',
    customNote: s.customNote || '',
    aboutMe: s.aboutMe || '',
    tone: s.tone || 'friendly',
  };
}

export function cacheKeyFor(urn, model) {
  return urn + '::' + model + '::' + CACHE_VERSION;
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pruneCache(cache) {
  const keys = Object.keys(cache || {});
  if (keys.length <= CACHE_LIMIT) return cache;
  keys
    .sort((a, b) => String(cache[a].ts || '').localeCompare(String(cache[b].ts || '')))
    .slice(0, keys.length - CACHE_LIMIT)
    .forEach((k) => delete cache[k]);
  return cache;
}

function fallbackResult(profile, settings, reason) {
  return {
    ok: true,
    source: 'fallback',
    message: renderTemplate(settings.fallbackTemplate, templateVarsFor(profile, settings)),
    reason: reason,
  };
}

function cannedMock(profile) {
  const p = profile || {};
  const first = String(p.name || 'there').trim().split(/\s+/)[0] || 'there';
  return {
    ok: true,
    source: 'ai',
    mocked: true,
    message:
      'Hi ' + first + ', I noticed your work as ' + (p.role || 'a colleague') + ' at ' +
      (p.company || 'your company') + '. I would love to chat about referral opportunities on your team.',
  };
}

// Extract {"message": "..."} from model text: strict JSON, then first {...} block.
export function parseModelContent(text) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, reason: 'empty content' };
  try {
    const o = JSON.parse(t);
    if (o && typeof o.message === 'string' && o.message.trim()) return { ok: true, message: o.message.trim() };
  } catch (e) {
    /* try regex */
  }
  const m = t.match(/\{[\s\S]*?\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]);
      if (o && typeof o.message === 'string' && o.message.trim()) return { ok: true, message: o.message.trim() };
    } catch (e) {
      /* fall through */
    }
  }
  return { ok: false, reason: 'unparseable model content' };
}

/* generateMessage(profile, settings, deps)
   deps: { fetchFn, store: {readCache, writeCache}, sleepFn, nowISO }
   - cache hit -> {ok, source, message, cached:true} (no network)
   - !aiMode -> fallback (no network)
   - mockAI -> canned after 400ms; test hooks: urn __test_429__ (two 429s then
     success, exercises backoff), __test_badjson__ (malformed -> fallback)
   - real: POST, up to 3 attempts, backoff 2000*2^attempt ms on 429/network/5xx,
     fail-fast fallback on other 4xx; unparseable-after-retries -> fallback. */
export async function generateMessage(profile, settings, deps) {
  const d = deps || {};
  const sleepFn = d.sleepFn || defaultSleep;
  const nowISO = d.nowISO || (() => new Date().toISOString());
  const store = d.store || null;
  const p = profile || {};
  const s = settings || {};
  const urn = p.urn || '';
  const model = s.model || 'nvidia/llama-3.1-nemotron-70b-instruct';
  if (!urn) return { ok: false, reason: 'missing profile urn' };

  const key = cacheKeyFor(urn, model);
  if (store) {
    try {
      const cache = (await store.readCache()) || {};
      if (cache[key] && cache[key].message) {
        return { ok: true, source: cache[key].source || 'ai', message: cache[key].message, cached: true };
      }
    } catch (e) {
      /* cache read failure must not block generation */
    }
  }

  const save = async (message, source) => {
    if (!store) return;
    try {
      const cache = (await store.readCache()) || {};
      cache[key] = { message: message, ts: nowISO(), source: source };
      await store.writeCache(pruneCache(cache));
    } catch (e) {
      /* cache write failure is non-fatal */
    }
  };

  if (!s.aiMode) return fallbackResult(p, s, 'aiMode off');

  if (s.mockAI) {
    if (urn === '__test_429__') {
      // Simulate two 429s then success so the backoff path is exercised.
      await sleepFn(2000 * Math.pow(2, 1));
      await sleepFn(2000 * Math.pow(2, 2));
      const c = cannedMock(p);
      await save(c.message, 'ai');
      return Object.assign({}, c, { attempts: 3 });
    }
    if (urn === '__test_badjson__') {
      await sleepFn(400);
      return fallbackResult(p, s, 'mock bad-json');
    }
    await sleepFn(400);
    const c = cannedMock(p);
    await save(c.message, 'ai');
    return c;
  }

  let activeApiKey = s.apiKey;
  if (!activeApiKey && d.serverUrl) {
    try {
      const srvResp = await fetch(`${d.serverUrl}/api/config`);
      if (srvResp.ok) {
        const srvData = await srvResp.json();
        if (srvData && srvData.apiKey) activeApiKey = srvData.apiKey;
      }
    } catch (_) {}
  }
  if (!activeApiKey) return fallbackResult(p, s, 'no API key configured');

  const fetchFn = d.fetchFn || fetch;
  const body = JSON.stringify({
    model: model,
    temperature: s.temperature != null ? s.temperature : 0.8,
    max_tokens: 300,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(p, s) },
    ],
  });

  let lastError = 'unknown';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp = null;
    try {
      resp = await fetchFn(NVIDIA_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + activeApiKey, 'Content-Type': 'application/json' },
        body: body,
      });
    } catch (e) {
      lastError = 'network: ' + String((e && e.message) || e);
      resp = null;
    }
    if (resp) {
      const status = resp.status;
      if (status === 429 || (status >= 500 && status <= 599)) {
        lastError = 'http ' + status;
      } else if (status < 200 || status >= 300) {
        return fallbackResult(p, s, 'http ' + status);
      } else {
        try {
          const data = await resp.json();
          const content = data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : '';
          const parsed = parseModelContent(content);
          if (parsed.ok) {
            await save(parsed.message, 'ai');
            return { ok: true, source: 'ai', message: parsed.message, attempts: attempt };
          }
          lastError = 'parse: ' + parsed.reason;
        } catch (e) {
          lastError = 'read: ' + String((e && e.message) || e);
        }
      }
    }
    if (attempt < MAX_ATTEMPTS) await sleepFn(2000 * Math.pow(2, attempt));
  }
  return fallbackResult(p, s, 'attempts exhausted: ' + lastError);
}

export async function readCache(urn, model, store) {
  if (store) {
    const cache = (await store.readCache()) || {};
    return cache[cacheKeyFor(urn, model)] || null;
  }
  const data = await chrome.storage.local.get('msgCache');
  const cache = (data && data.msgCache) || {};
  return cache[cacheKeyFor(urn, model)] || null;
}

export async function writeCache(urn, model, message, source, store) {
  const entry = { message: message, ts: new Date().toISOString(), source: source || 'ai' };
  if (store) {
    const cache = (await store.readCache()) || {};
    cache[cacheKeyFor(urn, model)] = entry;
    await store.writeCache(pruneCache(cache));
    return;
  }
  const data = await chrome.storage.local.get('msgCache');
  const cache = (data && data.msgCache) || {};
  cache[cacheKeyFor(urn, model)] = entry;
  await chrome.storage.local.set({ msgCache: pruneCache(cache) });
}
