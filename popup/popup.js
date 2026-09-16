/* AutoRef popup.js — macOS Frosted Glassmorphism Sidebar Controller.
   Manages tab navigation, dual theme switching, telemetry circular progress ring,
   interactive review cards with live editing, companion server status, and Thinking Orbs. */
(function () {
  'use strict';

  const DEFAULT_AGENT_MODEL = 'nvidia/llama-3.1-nemotron-70b-instruct';

  const CONTENT_FILES = [
    'lib/thinking-orb.js',
    'lib/delay.js', 'lib/storage.js', 'lib/template.js', 'lib/prompt.js',
    'content/selectors.js', 'content/scrapers.js', 'content/history-check.js',
    'content/messenger.js', 'content/overlay-widget.js', 'content/main.js',
  ];

  let serverStatus = {
    running: false,
    hasApiKey: false,
    model: DEFAULT_AGENT_MODEL,
    port: 8787,
  };
  let isCheckingServer = false;

  let headerOrb = null;
  let serverOrb = null;
  let actionOrb = null;
  let currentTheme = 'dark';

  function $(id) {
    return document.getElementById(id);
  }

  function countWords(str) {
    if (!str) return 0;
    const m = String(str).trim().match(/\S+/g);
    return m ? m.length : 0;
  }

  // Dual Theme Management
  async function initTheme() {
    const d = await chrome.storage.local.get(['theme']);
    if (d && d.theme) {
      currentTheme = d.theme;
    } else if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      currentTheme = 'light';
    } else {
      currentTheme = 'dark';
    }
    applyTheme(currentTheme);
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('theme-dark', theme === 'dark');

    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    if (sunIcon && moonIcon) {
      if (theme === 'dark') {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
      } else {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
      }
    }

    const isDark = theme === 'dark';
    if (headerOrb) headerOrb.setDark(isDark);
    if (serverOrb) serverOrb.setDark(isDark);
    if (actionOrb) actionOrb.setDark(isDark);
  }

  async function toggleTheme() {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await chrome.storage.local.set({ theme: next });
  }

  // Segmented Tab Management
  function initTabs() {
    const tabs = document.querySelectorAll('.segmented-item');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });
  }

  function switchTab(tabName) {
    const tabs = document.querySelectorAll('.segmented-item');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach((t) => {
      const isTarget = t.getAttribute('data-tab') === tabName;
      t.classList.toggle('active', isTarget);
      t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    panels.forEach((p) => {
      const isTarget = p.id === 'panel-' + tabName;
      p.classList.toggle('active', isTarget);
    });
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
    const serverOrbSlot = $('server-orb');
    const keyStatusEl = $('engine-key-status');

    if (modelEl) modelEl.textContent = serverStatus.model || DEFAULT_AGENT_MODEL;

    if (!dot || !label || !sub) return;

    if (isCheckingServer) {
      dot.classList.add('hidden');
      if (serverOrbSlot) {
        serverOrbSlot.classList.remove('hidden');
        if (!serverOrb && typeof ThinkingOrb !== 'undefined') {
          serverOrb = ThinkingOrb.mount(serverOrbSlot, { state: 'connecting', size: 20, dark: currentTheme === 'dark' });
        } else if (serverOrb) {
          serverOrb.update({ state: 'connecting', size: 20, paused: false, dark: currentTheme === 'dark' });
        }
      }
      label.textContent = 'Server: Connecting…';
      sub.textContent = 'Checking local companion server on port ' + serverStatus.port;
      if (btn) btn.classList.add('hidden');
      if (keyStatusEl) keyStatusEl.textContent = 'Checking…';
      return;
    }

    if (serverOrbSlot) serverOrbSlot.classList.add('hidden');
    dot.classList.remove('hidden');

    dot.className = 'dot';
    if (serverStatus.running) {
      dot.classList.add('green');
      label.textContent = 'Server: Running';
      if (btn) btn.classList.add('hidden');
      if (serverStatus.hasApiKey) {
        sub.textContent = 'API key loaded from .env · Port ' + serverStatus.port;
        if (keyStatusEl) keyStatusEl.textContent = 'Active in .env';
      } else {
        sub.textContent = '⚠️ Add API_KEY to .env file to enable AI';
        if (keyStatusEl) keyStatusEl.textContent = 'Missing API_KEY in .env';
      }
    } else {
      dot.classList.add('red');
      label.textContent = 'Server: Offline';
      sub.textContent = 'Auto-start failed. Run start-server.bat';
      if (btn) {
        btn.classList.remove('hidden');
        const btnText = btn.querySelector('span');
        if (btnText) btnText.textContent = 'Start';
      }
      if (keyStatusEl) keyStatusEl.textContent = 'Server offline';
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
    isCheckingServer = true;
    renderServerUI();
    try {
      const resp = await fetch('http://127.0.0.1:8787/api/health').catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        serverStatus.running = true;
        serverStatus.hasApiKey = !!data.hasApiKey;
        serverStatus.model = data.model || DEFAULT_AGENT_MODEL;
        serverStatus.port = data.port || 8787;
        isCheckingServer = false;
        renderServerUI();
        await fetchAndSyncConfig();
        return true;
      }
    } catch (_) {}

    if (autoStart) {
      try {
        await chrome.runtime.sendMessage({ type: 'AUTOREF_START_SERVER' });
      } catch (_) {}

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
            isCheckingServer = false;
            renderServerUI();
            await fetchAndSyncConfig();
            return true;
          }
        } catch (_) {}
      }
    }

    serverStatus.running = false;
    isCheckingServer = false;
    renderServerUI();
    return false;
  }

  function updateTelemetryRing(sentToday, dailyCap) {
    const ring = $('telemetry-ring');
    const percentEl = $('telemetry-percent');
    if (!ring || !percentEl) return;

    const cap = Math.max(1, dailyCap || 15);
    const sent = Math.max(0, sentToday || 0);
    const pct = Math.min(100, Math.round((sent / cap) * 100));

    // Circle radius = 34, circumference = 2 * PI * 34 ≈ 213.628
    const circumference = 2 * Math.PI * 34;
    const offset = circumference - (pct / 100) * circumference;

    ring.style.strokeDashoffset = String(offset);
    percentEl.textContent = pct + '%';
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

      // Update progress ring
      updateTelemetryRing(s.stats.sentToday, s.settings.dailyCap);

      const statusText = s.runState.running ? 'running (' + s.runState.phase + ')' : s.runState.phase;
      $('run-status').textContent = statusText;

      // Update Hero Button
      const heroBtn = $('start-pause');
      const heroLabel = $('hero-btn-label');
      const heroIcon = $('hero-btn-icon');

      if (s.runState.running) {
        if (heroLabel) heroLabel.textContent = 'Pause';
        else heroBtn.textContent = 'Pause';
        heroBtn.classList.add('is-paused');
        if (heroIcon) {
          heroIcon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>`;
        }
      } else {
        if (heroLabel) heroLabel.textContent = 'Start';
        else heroBtn.textContent = 'Start';
        heroBtn.classList.remove('is-paused');
        if (heroIcon) {
          heroIcon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
        }
      }

      $('dryrun-banner').classList.toggle('hidden', !s.settings.dryRun);

      const lr = lastReason(s.queue);
      $('current-action').textContent =
        'Action: ' + s.runState.phase +
        (s.runState.currentUrn ? ' · ' + s.runState.currentUrn : '') +
        (lr ? ' · ' + lr : '');

      const hintText = hintFor(s, tabUrl);
      const hintEl = $('hint');
      if (hintEl) {
        hintEl.textContent = hintText;
        hintEl.classList.toggle('hidden', !hintText);
      }

      // Thinking Orb animation states
      const headerOrbSlot = $('header-orb');
      const actionOrbSlot = $('action-orb');
      let targetState = 'breathing';

      if (s.runState.running) {
        if (s.runState.phase === 'scrape_queue' || s.runState.phase === 'searching') {
          targetState = 'searching';
        } else if (s.runState.phase === 'generate_message' || s.runState.phase === 'compose' || s.runState.phase === 'generating' || s.runState.phase === 'ai') {
          targetState = 'composing';
        } else {
          targetState = 'working';
        }
      } else {
        targetState = 'breathing';
      }

      const isDark = currentTheme === 'dark';
      if (headerOrbSlot && typeof ThinkingOrb !== 'undefined') {
        if (!headerOrb) {
          headerOrb = ThinkingOrb.mount(headerOrbSlot, { state: targetState, size: 20, dark: isDark });
        } else {
          headerOrb.update({ state: targetState, size: 20, dark: isDark });
        }
      }

      if (actionOrbSlot && typeof ThinkingOrb !== 'undefined') {
        if (s.runState.running) {
          actionOrbSlot.classList.remove('hidden');
          if (!actionOrb) {
            actionOrb = ThinkingOrb.mount(actionOrbSlot, { state: targetState, size: 20, dark: isDark });
          } else {
            actionOrb.update({ state: targetState, size: 20, dark: isDark });
          }
        } else {
          actionOrbSlot.classList.add('hidden');
        }
      }

      // Review Queue Section
      const awaiting = s.queue.filter((q) => q.status === 'awaiting_review');
      const reviewBadge = $('review-badge');
      const reviewCountPill = $('review-count-pill');
      const emptyState = $('review-empty-state');

      if (reviewBadge) {
        reviewBadge.textContent = String(awaiting.length);
        reviewBadge.classList.toggle('hidden', awaiting.length === 0);
      }
      if (reviewCountPill) {
        reviewCountPill.textContent = String(awaiting.length);
      }
      if (emptyState) {
        emptyState.classList.toggle('hidden', awaiting.length > 0);
      }

      const ul = $('review-list');
      if (ul) {
        ul.textContent = '';
        for (const item of awaiting.slice(0, 20)) {
          const li = document.createElement('li');
          li.className = 'review-item-card';

          // Card Header with Avatar & Name
          const cardHeader = document.createElement('div');
          cardHeader.className = 'review-card-header';

          const recInfo = document.createElement('div');
          recInfo.className = 'review-recipient-info';

          const avatar = document.createElement('div');
          avatar.className = 'recipient-avatar';
          const initials = (item.name || 'U').split(' ').map((n) => n[0]).slice(0, 2).join('');
          avatar.textContent = initials;

          const meta = document.createElement('div');
          meta.className = 'recipient-meta';

          const nameEl = document.createElement('span');
          nameEl.className = 'recipient-name';
          nameEl.textContent = item.name || 'Connection';

          const subEl = document.createElement('span');
          subEl.className = 'recipient-sub';
          subEl.textContent = (item.role ? item.role + ' ' : '') + (item.company ? '@ ' + item.company : '');

          meta.appendChild(nameEl);
          meta.appendChild(subEl);
          recInfo.appendChild(avatar);
          recInfo.appendChild(meta);
          cardHeader.appendChild(recInfo);
          li.appendChild(cardHeader);

          // Draft Container with Live Editing
          const draftBox = document.createElement('div');
          draftBox.className = 'draft-edit-box';

          const draftHeader = document.createElement('div');
          draftHeader.className = 'draft-box-header';

          const draftLabel = document.createElement('span');
          draftLabel.className = 'draft-box-label';
          draftLabel.textContent = 'Draft Message';

          const wordBadge = document.createElement('span');
          wordBadge.className = 'draft-word-badge';
          const initialDraft = draftFor(s, item.urn);
          wordBadge.textContent = countWords(initialDraft) + ' words';

          draftHeader.appendChild(draftLabel);
          draftHeader.appendChild(wordBadge);
          draftBox.appendChild(draftHeader);

          const textarea = document.createElement('textarea');
          textarea.className = 'review-draft-textarea';
          textarea.value = initialDraft;
          textarea.placeholder = 'Message draft...';
          textarea.addEventListener('input', () => {
            wordBadge.textContent = countWords(textarea.value) + ' words';
          });
          draftBox.appendChild(textarea);
          li.appendChild(draftBox);

          // Action Buttons: Approve & Send, Regenerate, Skip
          const actionsRow = document.createElement('div');
          actionsRow.className = 'review-card-actions';

          const ap = document.createElement('button');
          ap.type = 'button';
          ap.className = 'btn-review-action btn-approve';
          ap.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><span>Approve &amp; Send</span>`;
          ap.addEventListener('click', () => review(item.urn, 'approve', textarea.value));

          const rg = document.createElement('button');
          rg.type = 'button';
          rg.className = 'btn-review-action btn-regen';
          rg.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg><span>Regenerate</span>`;
          rg.addEventListener('click', () => review(item.urn, 'regenerate'));

          const sk = document.createElement('button');
          sk.type = 'button';
          sk.className = 'btn-review-action btn-skip';
          sk.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg><span>Skip</span>`;
          sk.addEventListener('click', () => review(item.urn, 'skip'));

          actionsRow.appendChild(ap);
          actionsRow.appendChild(rg);
          actionsRow.appendChild(sk);
          li.appendChild(actionsRow);

          ul.appendChild(li);
        }
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
      if (t && t.id != null) return await chrome.tabs.sendMessage(t.id, payload);
    } catch (e) {
      /* tab may not have the content script — storage poller covers it */
    }
    return null;
  }

  async function toggleRun() {
    const s = await read();
    if (s.runState.running) {
      await chrome.storage.local.set({ runState: Object.assign({}, s.runState, { running: false }) });
      await notifyTab({ type: 'AUTOREF_CMD', cmd: { cmd: 'pause' } });
    } else {
      if (!serverStatus.running) {
        checkServer(true).catch(() => {});
      }

      const actionable = s.queue.some((q) => q && (q.status === 'pending' || q.status === 'in_progress'));
      await chrome.storage.local.set({
        runState: {
          running: true,
          phase: actionable ? 'next' : 'scrape_queue',
          currentUrn: null,
          startedAt: new Date().toISOString(),
        },
      });

      const t = await activeTab();
      const currentUrl = (t && t.url) ? t.url : '';
      const isMock = !!s.settings.mockMode || /localhost|127\.0\.0\.1/i.test(currentUrl);

      let isAlreadyOnPage = false;
      if (isMock) {
        isAlreadyOnPage = /localhost|127\.0\.0\.1/i.test(currentUrl) &&
          (/connections\.html/i.test(currentUrl) || /profile\.html/i.test(currentUrl) || /thread\.html/i.test(currentUrl));
      } else {
        isAlreadyOnPage = /linkedin\.com\/search\/results\/people/i.test(currentUrl) ||
          /linkedin\.com\/in\//i.test(currentUrl);
      }

      if (isAlreadyOnPage) {
        await notifyTab({ type: 'AUTOREF_CMD', cmd: { cmd: 'start' } });
      } else {
        const targetUrl = isMock
          ? `http://127.0.0.1:${serverStatus.port || 8787}/connections.html`
          : 'https://www.linkedin.com/search/results/people/?network=%5B%22U%22%5D&origin=GLOBAL_SEARCH_HEADER';

        try {
          if (t && t.id != null && !currentUrl.startsWith('chrome://') && !currentUrl.startsWith('chrome-extension://') && !currentUrl.startsWith('devtools://')) {
            await chrome.tabs.update(t.id, { url: targetUrl });
          } else {
            await chrome.tabs.create({ url: targetUrl, active: true });
          }
        } catch (navErr) {
          console.warn('[AutoRef] tab navigation error:', navErr);
          try {
            await chrome.tabs.create({ url: targetUrl, active: true });
          } catch (_) {}
        }
      }
    }
    const curTab = await activeTab();
    render(curTab && curTab.url);
  }

  async function review(urn, action, customText) {
    const s = await read();
    if (action === 'regenerate') {
      const key = urn + '::' + s.settings.model + '::v1';
      const cache = Object.assign({}, s.msgCache);
      delete cache[key];
      await chrome.storage.local.set({ msgCache: cache });
      // Ask content script to regenerate if attached
      const notified = await notifyTab({ type: 'AUTOREF_CMD', cmd: { cmd: 'regenerate', urn: urn } });
      if (!notified || !notified.ok) {
        // Fallback: call background generate directly
        const item = s.queue.find((q) => q && q.urn === urn);
        if (item) {
          try {
            const genRes = await chrome.runtime.sendMessage({
              type: 'AUTOREF_GENERATE',
              profile: item,
            });
            if (genRes && genRes.message) {
              const fresh = (await chrome.storage.local.get(['msgCache'])).msgCache || {};
              fresh[key] = { message: genRes.message, source: genRes.source || 'ai', ts: Date.now() };
              await chrome.storage.local.set({ msgCache: fresh });
            }
          } catch (_) {}
        }
      }
      const t = await activeTab();
      render(t && t.url);
      return;
    }

    const next = s.queue.map((q) => {
      if (!q || q.urn !== urn) return q;
      if (action === 'skip') return Object.assign({}, q, { status: 'skipped', reason: 'review skipped by user' });
      return Object.assign({}, q, { status: 'pending', reason: 'approved by user', approved: true });
    });
    const patch = { queue: next };

    if (action === 'approve') {
      if (customText) {
        const key = urn + '::' + s.settings.model + '::v1';
        const cache = Object.assign({}, s.msgCache);
        cache[key] = { message: customText, source: 'user_edited', ts: Date.now() };
        patch.msgCache = cache;
      }
      if (!s.runState.running || s.runState.phase === 'awaiting_review') {
        patch.runState = { running: true, phase: 'next', currentUrn: null, startedAt: new Date().toISOString() };
      }
    } else if (action === 'skip') {
      patch.stats = Object.assign({}, s.stats, { skipped: (s.stats.skipped || 0) + 1 });
      if (s.runState.phase === 'awaiting_review') {
        patch.runState = { running: true, phase: 'next', currentUrn: null, startedAt: new Date().toISOString() };
      }
    }

    await chrome.storage.local.set(patch);
    await notifyTab({ type: 'AUTOREF_CMD', cmd: { cmd: action, urn: urn, customText: customText } });
    const t = await activeTab();
    render(t && t.url);
  }

  async function attach() {
    try {
      const t = await activeTab();
      if (!t || t.id == null) {
        const h = $('hint');
        if (h) { h.textContent = 'No active tab.'; h.classList.remove('hidden'); }
        return;
      }
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: CONTENT_FILES });
      const h = $('hint');
      if (h) {
        h.textContent = 'Attached. The loop runs in this tab now.';
        h.classList.remove('hidden');
      }
    } catch (e) {
      const h = $('hint');
      if (h) {
        h.textContent = 'Attach failed: ' + String((e && e.message) || e);
        h.classList.remove('hidden');
      }
    }
  }

  function openOptions() {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.openOptionsPage === 'function') {
      chrome.runtime.openOptionsPage();
    } else if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await initTheme();
    initTabs();

    // Check / start server
    checkServer(true);

    const t = await activeTab().catch(() => null);
    render(t && t.url);

    setInterval(async () => {
      const cur = await activeTab().catch(() => null);
      render(cur && cur.url);
      checkServer(false);
    }, 2000);

    // Event listeners
    $('open-options')?.addEventListener('click', openOptions);
    $('footer-options-link')?.addEventListener('click', (e) => { e.preventDefault(); openOptions(); });
    $('engine-options-link')?.addEventListener('click', (e) => { e.preventDefault(); openOptions(); });
    $('btn-open-options-alt')?.addEventListener('click', openOptions);
    $('start-pause')?.addEventListener('click', toggleRun);
    $('attach')?.addEventListener('click', attach);
    $('server-toggle-btn')?.addEventListener('click', () => checkServer(true));
    $('theme-toggle')?.addEventListener('click', toggleTheme);

    // Synchronize theme across extension contexts in real-time
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.theme && changes.theme.newValue) {
          applyTheme(changes.theme.newValue);
        }
      });
    }

    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', async (e) => {
        const d = await chrome.storage.local.get(['theme']);
        if (!d || !d.theme) {
          applyTheme(e.matches ? 'light' : 'dark');
        }
      });
    }
  });
})();
