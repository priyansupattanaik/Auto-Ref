/* AutoRef background/service-worker.js — message router & side panel / server controller (MV3).
   Ephemeral service worker: durable state lives in chrome.storage.local. */
import { generateMessage } from './ai-client.js';

const FALLBACK_TEMPLATE_DEFAULT =
  'Hi {{firstName}}, I noticed you\'re a {{role}} at {{company}}. I\'d love to connect about opportunities on your team. {{customNote}}';

const DEFAULTS = {
  settings: {
    apiKey: '',
    model: 'nvidia/llama-3.1-nemotron-70b-instruct',
    aiMode: true,
    mockAI: false,
    temperature: 0.8,
    aboutMe: '',
    customNote: '',
    tone: 'friendly',
    targetCompanies: [],
    targetRoles: [],
    fallbackTemplate: FALLBACK_TEMPLATE_DEFAULT,
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
  },
  queue: [],
  sentLog: {},
  msgCache: {},
  stats: { sentToday: 0, sentTotal: 0, skipped: 0, failed: 0, aiUsed: 0, fallbackUsed: 0, lastRunDate: null },
  runState: { running: false, phase: 'idle', currentUrn: null, startedAt: null },
};

// Enable opening Side Panel on clicking extension action icon
if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[AutoRef] sidePanel.setPanelBehavior:', err));
}

export async function ensureDefaults() {
  const cur = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (cur[k] === undefined) patch[k] = DEFAULTS[k];
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}

function chromeStore() {
  return {
    readCache: async () => {
      const d = await chrome.storage.local.get('msgCache');
      return (d && d.msgCache) || {};
    },
    writeCache: async (cache) => {
      await chrome.storage.local.set({ msgCache: cache });
    },
  };
}

export async function startServerNative() {
  return new Promise((resolve) => {
    if (!chrome.runtime.sendNativeMessage) {
      resolve({ ok: false, error: 'Native messaging not supported' });
      return;
    }
    chrome.runtime.sendNativeMessage('com.autoref.server', { action: 'start' }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(res || { ok: true, status: 'started' });
      }
    });
  });
}

export async function checkServerHealth() {
  try {
    const res = await fetch('http://127.0.0.1:8787/api/health');
    if (res.ok) {
      const data = await res.json();
      return { ok: true, running: true, data };
    }
  } catch (_) {}
  return { ok: false, running: false };
}

export async function syncConfigFromServer() {
  try {
    const res = await fetch('http://127.0.0.1:8787/api/config');
    if (res.ok) {
      const config = await res.json();
      if (config && config.ok) {
        const stored = await chrome.storage.local.get(['settings']);
        const settings = Object.assign({}, DEFAULTS.settings, stored.settings || {});
        let changed = false;
        if (config.apiKey && settings.apiKey !== config.apiKey) {
          settings.apiKey = config.apiKey;
          changed = true;
        }
        if (config.model && settings.model !== config.model) {
          settings.model = config.model;
          changed = true;
        }
        if (changed) {
          await chrome.storage.local.set({ settings });
        }
        return { ok: true, config };
      }
    }
  } catch (_) {}
  return { ok: false };
}

// Fallback & auto-trigger when action clicked
if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    // Automatically trigger local server start
    startServerNative().catch(() => {});
    syncConfigFromServer().catch(() => {});
    if (chrome.sidePanel && chrome.sidePanel.open && tab) {
      try {
        if (tab.id) {
          await chrome.sidePanel.open({ tabId: tab.id });
        } else if (tab.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId });
        }
      } catch (_) {}
    }
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await syncConfigFromServer();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await syncConfigFromServer();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg.type !== 'string') {
      sendResponse({ ok: false, error: 'unknown message' });
      return;
    }
    switch (msg.type) {
      case 'AUTOREF_PING':
        await ensureDefaults();
        await syncConfigFromServer();
        sendResponse({ ok: true, version: '0.1.0' });
        break;
      case 'AUTOREF_START_SERVER': {
        const startResult = await startServerNative();
        let health = { ok: false, running: false };
        // Wait and poll server health with backoff
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 350));
          health = await checkServerHealth();
          if (health.running) break;
        }
        if (health.running) {
          await syncConfigFromServer();
        }
        sendResponse({ ok: true, startResult, health });
        break;
      }
      case 'AUTOREF_SERVER_STATUS': {
        const health = await checkServerHealth();
        if (health.running) {
          await syncConfigFromServer();
        }
        sendResponse(health);
        break;
      }
      case 'AUTOREF_GENERATE': {
        // Full NVIDIA path (cache -> mockAI/aiMode gates -> fetch+retry -> fallback).
        const data = await chrome.storage.local.get(['settings']);
        const settings = Object.assign({}, DEFAULTS.settings, data.settings || {});
        // If settings have no API key, try fast sync from local server first
        if (!settings.apiKey) {
          await syncConfigFromServer();
          const refreshed = await chrome.storage.local.get(['settings']);
          Object.assign(settings, refreshed.settings || {});
        }
        const res = await generateMessage(msg.profile || {}, settings, {
          fetchFn: fetch,
          store: chromeStore(),
          serverUrl: 'http://127.0.0.1:8787',
        });
        sendResponse(res);
        break;
      }
      case 'AUTOREF_NOTIFY': {
        void sender;
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'unknown type: ' + msg.type });
    }
  })().catch((e) => {
    try { sendResponse({ ok: false, error: String((e && e.message) || e) }); } catch (_) { /* noop */ }
  });
  return true; // async response
});
