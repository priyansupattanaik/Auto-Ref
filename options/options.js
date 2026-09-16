/* AutoRef options.js — macOS System Settings Controller.
   Manages category navigation, dual theme switching, model pill tags, live slider badges,
   interactive variable chips, server sync, Thinking Orb studio, and AI smoke tests. */
(function () {
  'use strict';

  const DEFAULT_AGENT_MODEL = 'nvidia/llama-3.1-nemotron-70b-instruct';

  const DEFAULTS = {
    apiKey: '',
    model: DEFAULT_AGENT_MODEL,
    aiMode: true,
    mockAI: false,
    temperature: 0.8,
    aboutMe: '',
    customNote: '',
    tone: 'friendly',
    targetCompanies: [],
    targetRoles: [],
    fallbackTemplate: 'Hi {{firstName}}, I noticed you\'re a {{role}} at {{company}}. I\'d love to connect about opportunities on your team. {{customNote}}',
    dryRun: true,
    reviewMode: true,
    dailyCap: 15,
    workHoursEnabled: true,
    workHoursStart: 9,
    workHoursEnd: 18,
    delayMinSec: 45,
    delayMaxSec: 120,
    coffeeBreakInterval: 5,
    coffeeBreakDurationSec: 900,
    blacklistProfiles: [],
    blacklistCompanies: [],
    mockMode: false,
  };

  const SAMPLE = { name: 'Ada Lovelace', role: 'Software Engineer', company: 'Analytical Engines' };

  const csvToArr = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const arrToCsv = (a) => (Array.isArray(a) ? a.join(', ') : '');

  let envOrb = null;
  let testAiOrb = null;
  let showcaseOrb = null;
  let currentTheme = 'dark';

  function $(id) {
    return document.getElementById(id);
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
    if (envOrb) envOrb.setDark(isDark);
    if (testAiOrb) testAiOrb.setDark(isDark);
  }

  async function toggleTheme() {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await chrome.storage.local.set({ theme: next });
  }

  // Category Navigation
  function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const targetId = item.getAttribute('data-target');
        if (!targetId) return;

        navItems.forEach((n) => n.classList.remove('active'));
        item.classList.add('active');

        const sections = document.querySelectorAll('.settings-section');
        sections.forEach((sec) => {
          sec.classList.toggle('active', sec.id === targetId);
        });
      });
    });
  }

  // Model Pill Selection
  function initModelPills() {
    const pills = document.querySelectorAll('.model-pill');
    const modelInput = $('model');

    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const selectedModel = pill.getAttribute('data-model');
        if (selectedModel && modelInput) {
          modelInput.value = selectedModel;
          updateActiveModelPill(selectedModel);
        }
      });
    });

    if (modelInput) {
      modelInput.addEventListener('input', () => {
        updateActiveModelPill(modelInput.value);
      });
    }
  }

  function updateActiveModelPill(modelName) {
    const pills = document.querySelectorAll('.model-pill');
    let matched = false;
    pills.forEach((pill) => {
      const isMatch = pill.getAttribute('data-model') === modelName;
      pill.classList.toggle('active', isMatch);
      if (isMatch) matched = true;
    });
    return matched;
  }

  // Variable Chips for Template
  function initVariableChips() {
    const chips = document.querySelectorAll('.var-chip');
    const tplInput = $('fallbackTemplate');

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const token = chip.getAttribute('data-var');
        if (!token || !tplInput) return;

        const start = tplInput.selectionStart;
        const end = tplInput.selectionEnd;
        const val = tplInput.value;

        if (typeof start === 'number' && typeof end === 'number') {
          tplInput.value = val.substring(0, start) + token + val.substring(end);
          tplInput.selectionStart = tplInput.selectionEnd = start + token.length;
        } else {
          tplInput.value = val + ' ' + token;
        }

        tplInput.focus();
        renderPreview();
      });
    });
  }

  // Sliders with floating live badges
  function initSliderBadges() {
    const tempInput = $('temperature');
    const tempBadge = $('temperature-badge');
    if (tempInput && tempBadge) {
      const updateTemp = () => {
        tempBadge.textContent = Number(tempInput.value).toFixed(2);
      };
      tempInput.addEventListener('input', updateTemp);
      updateTemp();
    }

    const capInput = $('dailyCap');
    const capBadge = $('dailyCap-badge');
    if (capInput && capBadge) {
      const updateCap = () => {
        capBadge.textContent = String(capInput.value);
      };
      capInput.addEventListener('input', updateCap);
      updateCap();
    }
  }

  function renderPreview() {
    try {
      const tpl = $('fallbackTemplate')?.value;
      const firstName = SAMPLE.name.split(' ')[0];
      const vars = {
        firstName: firstName,
        name: SAMPLE.name,
        role: SAMPLE.role,
        company: SAMPLE.company,
        customNote: $('customNote')?.value || '',
      };
      const out = String(tpl || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, k) =>
        vars[k] === undefined || vars[k] === null ? '' : String(vars[k]),
      ).replace(/[ \t]{2,}/g, ' ').replace(/\s+\./g, '.').trim();
      const prevEl = $('tpl-preview');
      if (prevEl) prevEl.textContent = out || '(Template output will preview here)';
    } catch (_) {
      /* preview never blocks */
    }
  }

  async function checkServerSync() {
    const envStatus = $('env-status');
    const envOrbSlot = $('env-orb');

    if (envOrbSlot && typeof ThinkingOrb !== 'undefined') {
      envOrbSlot.classList.remove('hidden');
      if (!envOrb) {
        envOrb = ThinkingOrb.mount(envOrbSlot, { state: 'connecting', size: 20, dark: currentTheme === 'dark' });
      } else {
        envOrb.update({ state: 'connecting', size: 20, paused: false, dark: currentTheme === 'dark' });
      }
    }

    try {
      const resp = await fetch('http://127.0.0.1:8787/api/config');
      if (resp.ok) {
        const conf = await resp.json();
        if (conf && conf.ok) {
          if (envOrbSlot) envOrbSlot.classList.add('hidden');
          if (envStatus) {
            envStatus.textContent = '🟢 Server connected on port ' + conf.port +
              ' · API Key: ' + (conf.hasApiKey ? 'Active in .env' : 'Not configured in .env') +
              ' · Model: ' + conf.model;
          }
          const apiKeyEl = $('apiKey');
          if (apiKeyEl) {
            apiKeyEl.value = conf.hasApiKey
              ? '●●●●●●●● (Active in .env)'
              : '⚠️ Add API_KEY to .env in project root';
          }
          if (!$('model')?.value && conf.model) {
            $('model').value = conf.model;
            updateActiveModelPill(conf.model);
          }
          return;
        }
      }
    } catch (_) {}

    if (envOrbSlot) envOrbSlot.classList.add('hidden');
    if (envStatus) {
      envStatus.textContent = '⚠️ Local companion server offline. Run "start-server.bat" to enable .env syncing.';
    }
  }

  async function load() {
    const d = await chrome.storage.local.get(['settings']);
    const s = Object.assign({}, DEFAULTS, d.settings || {});

    $('apiKey').value = s.apiKey ? '●●●●●●●● (Loaded from .env)' : '(Managed via .env file)';
    $('model').value = s.model || DEFAULT_AGENT_MODEL;
    updateActiveModelPill(s.model || DEFAULT_AGENT_MODEL);

    $('aiMode').checked = !!s.aiMode;
    $('mockAI').checked = !!s.mockAI;
    $('temperature').value = s.temperature;
    $('aboutMe').value = s.aboutMe;
    $('customNote').value = s.customNote;
    $('tone').value = s.tone;
    $('targetCompanies').value = arrToCsv(s.targetCompanies);
    $('targetRoles').value = arrToCsv(s.targetRoles);
    $('fallbackTemplate').value = s.fallbackTemplate;
    $('dryRun').checked = !!s.dryRun;
    $('reviewMode').checked = !!s.reviewMode;
    $('dailyCap').value = s.dailyCap;
    $('delayMinSec').value = s.delayMinSec;
    $('delayMaxSec').value = s.delayMaxSec;
    if ($('coffeeBreakInterval')) $('coffeeBreakInterval').value = s.coffeeBreakInterval || 5;
    if ($('coffeeBreakDurationSec')) $('coffeeBreakDurationSec').value = s.coffeeBreakDurationSec || 900;
    $('workHoursEnabled').checked = !!s.workHoursEnabled;
    $('workHoursStart').value = s.workHoursStart;
    $('workHoursEnd').value = s.workHoursEnd;
    $('blacklistProfiles').value = arrToCsv(s.blacklistProfiles);
    $('blacklistCompanies').value = arrToCsv(s.blacklistCompanies);
    $('mockMode').checked = !!s.mockMode;

    $('dryrun-banner').classList.toggle('hidden', !s.dryRun);

    // Refresh live badge indicators
    const tempBadge = $('temperature-badge');
    if (tempBadge) tempBadge.textContent = Number(s.temperature).toFixed(2);
    const capBadge = $('dailyCap-badge');
    if (capBadge) capBadge.textContent = String(s.dailyCap);

    renderPreview();
    checkServerSync();
  }

  async function save(e) {
    if (e) e.preventDefault();
    const prevData = await chrome.storage.local.get(['settings']);
    const prevSettings = prevData.settings || {};
    const wasDry = prevSettings;
    const wasDryRun = wasDry ? wasDry.dryRun !== false : true;
    const dryRun = $('dryRun').checked;

    if (wasDryRun && !dryRun) {
      const ok = confirm('Disable Dry-Run Mode? AutoRef will be able to send real LinkedIn messages to your connections.');
      if (!ok) {
        $('dryRun').checked = true;
        return;
      }
    }

    const settings = {
      apiKey: prevSettings.apiKey || '',
      model: $('model').value.trim() || DEFAULT_AGENT_MODEL,
      aiMode: $('aiMode').checked,
      mockAI: $('mockAI').checked,
      temperature: $('temperature').value.trim() !== '' && Number.isFinite(Number($('temperature').value))
        ? Math.max(0, Math.min(2, Number($('temperature').value)))
        : DEFAULTS.temperature,
      aboutMe: $('aboutMe').value,
      customNote: $('customNote').value,
      tone: $('tone').value,
      targetCompanies: csvToArr($('targetCompanies').value),
      targetRoles: csvToArr($('targetRoles').value),
      fallbackTemplate: $('fallbackTemplate').value,
      dryRun: dryRun,
      reviewMode: $('reviewMode').checked,
      dailyCap: Math.max(1, Number($('dailyCap').value) || 15),
      delayMinSec: Math.max(0, Number($('delayMinSec').value) || 0),
      delayMaxSec: Math.max(0, Number($('delayMaxSec').value) || 0),
      coffeeBreakInterval: Math.max(1, Number($('coffeeBreakInterval')?.value) || prevSettings.coffeeBreakInterval || 5),
      coffeeBreakDurationSec: Math.max(1, Number($('coffeeBreakDurationSec')?.value) || prevSettings.coffeeBreakDurationSec || 900),
      workHoursEnabled: $('workHoursEnabled').checked,
      workHoursStart: $('workHoursStart').value.trim() !== '' && Number.isFinite(Number($('workHoursStart').value))
        ? Number($('workHoursStart').value)
        : DEFAULTS.workHoursStart,
      workHoursEnd: $('workHoursEnd').value.trim() !== '' && Number.isFinite(Number($('workHoursEnd').value))
        ? Number($('workHoursEnd').value)
        : DEFAULTS.workHoursEnd,
      blacklistProfiles: csvToArr($('blacklistProfiles').value),
      blacklistCompanies: csvToArr($('blacklistCompanies').value),
      mockMode: $('mockMode').checked,
    };

    await chrome.storage.local.set({ settings: settings });

    const statusEl = $('status');
    if (statusEl) {
      statusEl.textContent = '✓ Saved successfully at ' + new Date().toLocaleTimeString();
      statusEl.style.color = 'var(--accent-green)';
      setTimeout(() => {
        if (statusEl.textContent.startsWith('✓ Saved')) {
          statusEl.textContent = 'Ready';
          statusEl.style.color = '';
        }
      }, 4000);
    }

    $('dryrun-banner').classList.toggle('hidden', !settings.dryRun);
  }

  async function testAI() {
    const out = $('test-ai-out');
    const orbSlot = $('test-ai-orb');

    if (orbSlot && typeof ThinkingOrb !== 'undefined') {
      orbSlot.classList.remove('hidden');
      if (!testAiOrb) {
        testAiOrb = ThinkingOrb.mount(orbSlot, { state: 'composing', size: 20, dark: currentTheme === 'dark' });
      } else {
        testAiOrb.update({ state: 'composing', size: 20, paused: false, dark: currentTheme === 'dark' });
      }
    }

    out.textContent = 'Generating AI referral draft with model…';
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'AUTOREF_GENERATE',
        profile: {
          urn: '__options_smoke__',
          profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
          name: 'Ada Lovelace',
          role: 'Software Engineer',
          company: 'Analytical Engines',
        },
      });
      if (res && res.message) {
        out.textContent = '[' + (res.source || '?') + (res.cached ? ', cached' : '') + '] ' + res.message;
      } else {
        out.textContent = 'No message returned: ' + JSON.stringify(res);
      }
    } catch (e) {
      out.textContent = 'Error: ' + String((e && e.message) || e);
    } finally {
      if (orbSlot) orbSlot.classList.add('hidden');
    }
  }

  function initShowcase() {
    const previewContainer = $('showcase-orb-preview');
    if (!previewContainer || typeof ThinkingOrb === 'undefined') return;

    const stateSelect = $('orb-state-select');
    const sizeSelect = $('orb-size-select');
    const speedSelect = $('orb-speed-select');
    const darkToggle = $('orb-dark-toggle');
    const pausedToggle = $('orb-paused-toggle');

    showcaseOrb = ThinkingOrb.mount(previewContainer, {
      state: stateSelect ? stateSelect.value : 'composing',
      size: sizeSelect ? Number(sizeSelect.value) : 64,
      speed: speedSelect ? Number(speedSelect.value) : 1,
      dark: darkToggle ? darkToggle.checked : false,
      paused: pausedToggle ? pausedToggle.checked : false,
    });

    if (stateSelect) {
      stateSelect.addEventListener('change', () => showcaseOrb.setState(stateSelect.value));
    }
    if (sizeSelect) {
      sizeSelect.addEventListener('change', () => showcaseOrb.setSize(Number(sizeSelect.value)));
    }
    if (speedSelect) {
      speedSelect.addEventListener('change', () => showcaseOrb.setSpeed(Number(speedSelect.value)));
    }
    if (darkToggle) {
      darkToggle.addEventListener('change', () => {
        showcaseOrb.setDark(darkToggle.checked);
        previewContainer.classList.toggle('dark-preview', darkToggle.checked);
      });
    }
    if (pausedToggle) {
      pausedToggle.addEventListener('change', () => showcaseOrb.setPaused(pausedToggle.checked));
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await initTheme();
    initNavigation();
    initModelPills();
    initVariableChips();
    initSliderBadges();
    initShowcase();

    load().catch((e) => console.error('[AutoRef options]', e));

    $('opts')?.addEventListener('submit', save);
    $('test-ai')?.addEventListener('click', testAI);
    $('fallbackTemplate')?.addEventListener('input', renderPreview);
    $('customNote')?.addEventListener('input', renderPreview);
    $('theme-toggle')?.addEventListener('click', toggleTheme);

    const confirmClear = (label, key) => async () => {
      if (!confirm('Are you sure you want to clear ' + label + '? This action cannot be undone.')) return;
      const patch = {};
      if (key === 'queue') patch.queue = [];
      if (key === 'sentLog') patch.sentLog = {};
      if (key === 'msgCache') patch.msgCache = {};
      await chrome.storage.local.set(patch);
      const statusEl = $('status');
      if (statusEl) {
        statusEl.textContent = 'Cleared ' + label + '.';
        setTimeout(() => { statusEl.textContent = 'Ready'; }, 3000);
      }
    };

    $('clear-queue')?.addEventListener('click', confirmClear('queue', 'queue'));
    $('clear-sent')?.addEventListener('click', confirmClear('sent history', 'sentLog'));
    $('clear-cache')?.addEventListener('click', confirmClear('message cache', 'msgCache'));
  });
})();
