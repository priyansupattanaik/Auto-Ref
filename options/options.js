/* AutoRef options.js — Options page controller.
   Loads and saves settings, syncs with local .env server, and tests AI. */
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
    reviewMode: false,
    dailyCap: 15,
    workHoursEnabled: true,
    workHoursStart: 9,
    workHoursEnd: 18,
    delayMinSec: 45,
    delayMaxSec: 150,
    blacklistProfiles: [],
    blacklistCompanies: [],
    mockMode: false,
  };

  const SAMPLE = { name: 'Ada Lovelace', role: 'Software Engineer', company: 'Analytical Engines' };

  const csvToArr = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const arrToCsv = (a) => (Array.isArray(a) ? a.join(', ') : '');

  function renderPreview() {
    try {
      const tpl = document.getElementById('fallbackTemplate').value;
      const firstName = SAMPLE.name.split(' ')[0];
      const vars = {
        firstName: firstName, name: SAMPLE.name, role: SAMPLE.role, company: SAMPLE.company,
        customNote: document.getElementById('customNote').value || '',
      };
      const out = String(tpl || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, k) =>
        vars[k] === undefined || vars[k] === null ? '' : String(vars[k]),
      ).replace(/[ \t]{2,}/g, ' ').replace(/\s+\./g, '.').trim();
      document.getElementById('tpl-preview').textContent = 'Preview: ' + out;
    } catch (e) {
      /* preview never blocks */
    }
  }

  async function checkServerSync() {
    const envStatus = document.getElementById('env-status');
    try {
      const resp = await fetch('http://127.0.0.1:8787/api/config');
      if (resp.ok) {
        const conf = await resp.json();
        if (conf && conf.ok) {
          if (envStatus) {
            envStatus.textContent = '🟢 Server connected on port ' + conf.port +
              ' — API Key from .env: ' + (conf.hasApiKey ? 'Loaded' : 'Not set in .env') +
              ' — Agent Model: ' + conf.model;
            envStatus.style.borderColor = '#81c784';
            envStatus.style.background = '#e8f5e9';
            envStatus.style.color = '#1b5e20';
          }
          const apiKeyEl = document.getElementById('apiKey');
          if (apiKeyEl) {
            apiKeyEl.value = conf.hasApiKey
              ? '●●●●●●●● (Active in .env)'
              : '⚠️ Not set in .env (add API_KEY=nvapi-... to .env)';
          }
          if (!document.getElementById('model').value && conf.model) {
            document.getElementById('model').value = conf.model;
          }
        }
      }
    } catch (_) {
      if (envStatus) {
        envStatus.textContent = '⚠️ Local server offline. Run "start-server.bat" to load API key from .env.';
        envStatus.style.borderColor = '#ffcc80';
        envStatus.style.background = '#fff3e0';
        envStatus.style.color = '#e65100';
      }
    }
  }

  async function load() {
    const d = await chrome.storage.local.get(['settings']);
    const s = Object.assign({}, DEFAULTS, d.settings || {});
    const $ = (id) => document.getElementById(id);
    $('apiKey').value = s.apiKey ? '●●●●●●●● (Loaded from .env)' : '(Managed via .env file)';
    $('model').value = s.model || DEFAULT_AGENT_MODEL;
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
    $('workHoursEnabled').checked = !!s.workHoursEnabled;
    $('workHoursStart').value = s.workHoursStart;
    $('workHoursEnd').value = s.workHoursEnd;
    $('blacklistProfiles').value = arrToCsv(s.blacklistProfiles);
    $('blacklistCompanies').value = arrToCsv(s.blacklistCompanies);
    $('mockMode').checked = !!s.mockMode;
    document.getElementById('dryrun-banner').classList.toggle('hidden', !s.dryRun);
    renderPreview();
    checkServerSync();
  }

  async function save(e) {
    if (e) e.preventDefault();
    const $ = (id) => document.getElementById(id);
    const prevData = await chrome.storage.local.get(['settings']);
    const prevSettings = prevData.settings || {};
    const wasDry = prevSettings;
    const wasDryRun = wasDry ? wasDry.dryRun !== false : true;
    const dryRun = $('dryRun').checked;
    if (wasDryRun && !dryRun) {
      const ok = confirm('Turn OFF dry-run? The extension will be able to send real LinkedIn messages.');
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
    document.getElementById('status').textContent = 'Saved ' + new Date().toLocaleTimeString();
    document.getElementById('dryrun-banner').classList.toggle('hidden', !settings.dryRun);
  }

  async function testAI() {
    const out = document.getElementById('test-ai-out');
    out.textContent = 'Generating with model…';
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
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    load().catch((e) => console.error('[AutoRef options]', e));
    document.getElementById('opts').addEventListener('submit', save);
    document.getElementById('test-ai').addEventListener('click', testAI);
    document.getElementById('fallbackTemplate').addEventListener('input', renderPreview);
    document.getElementById('customNote').addEventListener('input', renderPreview);
    const confirmClear = (label, key) => async () => {
      if (!confirm('Clear ' + label + '?')) return;
      const patch = {};
      if (key === 'queue') patch.queue = [];
      if (key === 'sentLog') patch.sentLog = {};
      if (key === 'msgCache') patch.msgCache = {};
      await chrome.storage.local.set(patch);
      document.getElementById('status').textContent = 'Cleared ' + label + '.';
    };
    document.getElementById('clear-queue').addEventListener('click', confirmClear('queue', 'queue'));
    document.getElementById('clear-sent').addEventListener('click', confirmClear('sentLog', 'sentLog'));
    document.getElementById('clear-cache').addEventListener('click', confirmClear('cache', 'msgCache'));
  });
})();
