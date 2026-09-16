/* AutoRef popup.js — Sidebar & popup controller.
   Automatically connects to / starts local companion server,
   loads API key and agent model from .env, and manages referral queue. */
(function () {
  'use strict';

  const DEFAULT_AGENT_MODEL = 'nvidia/llama-3.1-nemotron-70b-instruct';

  const CONTENT_FILES = [
    'lib/delay.js', 'lib/storage.js', 'lib/template.js', 'lib/prompt.js',
    'content/selectors.js', 'content/scrapers.js', 'content/history-check.js',
    'content/messenger.js', 'content/main.js',
  ];

  let serverStatus = {
    running: false,
    hasApiKey: false,
    model: DEFAULT_AGENT_MODEL,
    port: 8787,
  };

  function $(id) {
    return document.getElementById(id);
  }

  async function read() {
    const d = await chrome.storage.local.get(['settings', 'stats', 'runState', 'queue', 'msgCache']);
    return {
      settings: Object.assign(
        { dryRun: true, dailyCap: 15, model: DEFAULT_AGENT_MODEL, workHoursEnabled: true, workHoursStart: 9, workHoursEnd: 18 },
        d.settings || {},
      ),
      stats: Object.assign({ sentToday: 0, skipped: 0, failed: 0, aiUsed: 0, fallbackUsed: 0 }, d.stats || {}),
      runState: Object.assign({ running: false, phase: 'idle', currentUrn: null }, d.runState || {}),
      queue: Array.isArray(d.queue) ? d.queue : [],
      msgCache: (d.msgCache && typeof d.msgCache === 'object') ? d.msgCache : {},
    };
  }

  function lastReason(queue) {
    for (let i = queue.length - 1; i >= 0; i--) {
      const q = queue[i];
      if (q && q.reason) return q.urn + ': ' + q.reason;
    }
    return '';
  }

  function hintFor(s, tabUrl) {
    if (s.runState.phase === 'scrape_queue' && s.runState.running) {
      if (tabUrl && !/connections\.html|linkedin\.com\/search\/results\/people/.test(tabUrl)) {
        return 'Scraping needs the connections page: open mock connections.html (or LinkedIn people search) and press Start there.';
      }
    }
    if (s.runState.phase === 'paused') {
      if (s.stats.sentToday >= s.settings.dailyCap) return 'Paused: daily cap reached.';
      const h = new Date().getHours();
      if (s.settings.workHoursEnabled && (h < s.settings.workHoursStart || h >= s.settings.workHoursEnd)) {
        return 'Paused: outside working hours.';
      }
      const lr = lastReason(s.queue);
      return 'Paused.' + (lr ? ' Last note — ' + lr : ' Open Options to resume conditions, then Start.');
    }
    return '';
  }

  function draftFor(s, urn) {
    const key = urn + '::' + s.settings.model + '::v1';
    const e = s.msgCache[key];
    return e && e.message ? e.message : '';
  }

  function renderServerUI() {
    const dot = $('server-dot');
    const label = $('server-label');
    const sub = $('server-sub');
    const btn = $('server-toggle-btn');
    const modelEl = $('active-model');

    if (modelEl) modelEl.textContent = serverStatus.model || DEFAULT_AGENT_MODEL;

    if (!dot || !label || !sub) return;

    dot.className = 'dot';
    if (serverStatus.running) {
      dot.classList.add('green');
      label.textContent = 'Server: Running';
      if (btn) btn.classList.add('hidden');
      if (serverStatus.hasApiKey) {
        sub.textContent = 'API key loaded from .env · Port ' + serverStatus.port;
      } else {
        sub.textContent = '⚠️ Add API_KEY to .env file to enable AI';
      }
    } else {
      dot.classList.add('red');
      label.textContent = 'Server: Offline';
      sub.textContent = 'Auto-start failed. Run start-server.bat';
      if (btn) {
        btn.classList.remove('hidden');
        btn.textContent = 'Start';
      }
    }
  }

  async function fetchAndSyncConfig() {
    try {
      const cfgResp = await fetch('http://127.0.0.1:8787/api/config').catch(() => null);
      if (cfgResp && cfgResp.ok) {
        const cfg = await cfgResp.json();
        if (cfg && cfg.ok) {
          const d = await chrome.storage.local.get(['settings']);
          const cur = d.settings || {};
          let dirty = false;
          if (cfg.apiKey !== undefined && cur.apiKey !== cfg.apiKey) { cur.apiKey = cfg.apiKey; dirty = true; }
          if (cfg.model && cur.model !== cfg.model) { cur.model = cfg.model; dirty = true; }
          if (dirty) await chrome.storage.local.set({ settings: cur });
          return cfg;
        }
      }
    } catch (_) {}
    return null;
  }

  async function checkServer(autoStart = false) {
    try {
      const resp = await fetch('http://127.0.0.1:8787/api/health').catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        serverStatus.running = true;
        serverStatus.hasApiKey = !!data.hasApiKey;
        serverStatus.model = data.model || DEFAULT_AGENT_MODEL;
        serverStatus.port = data.port || 8787;
        renderServerUI();
        await fetchAndSyncConfig();
        return true;
      }
    } catch (_) {}

    if (autoStart) {
      // Trigger background server startup via native messaging
      try {
        await chrome.runtime.sendMessage({ type: 'AUTOREF_START_SERVER' });
      } catch (_) {}

      // Retry up to 5 times (total ~2 seconds) for Windows Node startup
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 400));
        try {
          const retryResp = await fetch('http://127.0.0.1:8787/api/health').catch(() => null);
          if (retryResp && retryResp.ok) {
            const data = await retryResp.json();
            serverStatus.running = true;
            serverStatus.hasApiKey = !!data.hasApiKey;
            serverStatus.model = data.model || DEFAULT_AGENT_MODEL;
            serverStatus.port = data.port || 8787;
            renderServerUI();
            await fetchAndSyncConfig();
            return true;
          }
        } catch (_) {}
      }
    }

    serverStatus.running = false;
    renderServerUI();
    return false;
  }

  async function render(tabUrl) {
    try {
      const s = await read();
      $('c-sent-today').textContent = String(s.stats.sentToday);
      $('c-cap').textContent = String(s.settings.dailyCap);
      $('c-skipped').textContent = String(s.stats.skipped);
      $('c-failed').textContent = String(s.stats.failed);
      $('c-ai').textContent = String(s.stats.aiUsed);
      $('c-fallback').textContent = String(s.stats.fallbackUsed);
      $('run-status').textContent =
        'Status: ' + (s.runState.running ? 'running (' + s.runState.phase + ')' : s.runState.phase);
      $('start-pause').textContent = s.runState.running ? 'Pause' : 'Start';
      $('dryrun-banner').classList.toggle('hidden', !s.settings.dryRun);
      const lr = lastReason(s.queue);
      $('current-action').textContent =
        'Action: ' + s.runState.phase +
        (s.runState.currentUrn ? ' · ' + s.runState.currentUrn : '') +
        (lr ? ' · ' + lr : '');
      $('hint').textContent = hintFor(s, tabUrl);

      const awaiting = s.queue.filter((q) => q.status === 'awaiting_review');
      $('review-section').classList.toggle('hidden', awaiting.length === 0);
      const ul = $('review-list');
      ul.textContent = '';
      for (const item of awaiting.slice(0, 20)) {
        const li = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = item.name + ' (' + item.company + ') ';
        const prev = document.createElement('div');
        prev.textContent = draftFor(s, item.urn).slice(0, 220);
        const ap = document.createElement('button');
        ap.textContent = 'Approve';
        ap.addEventListener('click', () => review(item.urn, 'approve'));
        const sk = document.createElement('button');
        sk.textContent = 'Skip';
        sk.addEventListener('click', () => review(item.urn, 'skip'));
        li.appendChild(name);
        li.appendChild(prev);
        li.appendChild(ap);
        li.appendChild(sk);
        ul.appendChild(li);
      }
    } catch (e) {
      console.error('[AutoRef popup]', e);
    }
  }

  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0];
  }

  async function notifyTab(payload) {
    try {
      const t = await activeTab();
      if (t && t.id != null) await chrome.tabs.sendMessage(t.id, payload);
    } catch (e) {
      /* tab may not have the content script — the storage poller covers it */
    }
  }

  async function toggleRun() {
    const s = await read();
    if (s.runState.running) {
      await chrome.storage.local.set({ runState: Object.assign({}, s.runState, { running: false }) });
      await notifyTab({ type: 'AUTOREF_CMD', cmd: { cmd: 'pause' } });
    } else {
      const actionable = s.queue.some((q) => q && (q.status === 'pending' || q.status === 'in_progress'));
      await chrome.storage.local.set({
        runState: {
          running: true,
          phase: actionable ? 'next' : 'scrape_queue',
          currentUrn: null,
          startedAt: new Date().toISOString(),
        },
      });
      await notifyTab({ type: 'AUTOREF_CMD', cmd: { cmd: 'start' } });
    }
    const t = await activeTab();
    render(t && t.url);
  }

  async function review(urn, action) {
    const s = await read();
    const next = s.queue.map((q) => {
      if (!q || q.urn !== urn) return q;
      if (action === 'skip') return Object.assign({}, q, { status: 'skipped', reason: 'review skipped by user' });
      return Object.assign({}, q, { status: 'pending', reason: 'approved by user', approved: true });
    });
    const patch = { queue: next };
    if (action === 'skip') {
      patch.stats = Object.assign({}, s.stats, { skipped: (s.stats.skipped || 0) + 1 });
    } else if (!s.runState.running) {
      patch.runState = { running: true, phase: 'next', currentUrn: null, startedAt: new Date().toISOString() };
    }
    await chrome.storage.local.set(patch);
    await notifyTab({ type: 'AUTOREF_CMD', cmd: { cmd: action, urn: urn } });
    const t = await activeTab();
    render(t && t.url);
  }

  async function attach() {
    try {
      const t = await activeTab();
      if (!t || t.id == null) {
        $('hint').textContent = 'No active tab.';
        return;
      }
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: CONTENT_FILES });
      $('hint').textContent = 'Attached. The loop runs in this tab now.';
    } catch (e) {
      $('hint').textContent = 'Attach failed: ' + String((e && e.message) || e);
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // Automatically start or check companion server upon sidebar load
    checkServer(true);

    const t = await activeTab().catch(() => null);
    render(t && t.url);

    setInterval(async () => {
      const cur = await activeTab().catch(() => null);
      render(cur && cur.url);
      checkServer(false);
    }, 2000);

    $('open-options').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    $('start-pause').addEventListener('click', toggleRun);
    $('attach').addEventListener('click', attach);
    $('server-toggle-btn').addEventListener('click', () => checkServer(true));
  });
})();
