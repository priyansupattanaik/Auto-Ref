/* AutoRef lib/storage.js — plain script, shares window.AutoRef namespace. No imports.
   Single source of truth: chrome.storage.local. Every write is durable.
   All keys per BRIEF §5. Must survive MV3 service-worker restarts. */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  const FALLBACK_TEMPLATE_DEFAULT =
    'Hi {{firstName}}, I noticed you\'re a {{role}} at {{company}}. I\'d love to connect about opportunities on your team. {{customNote}}';

  const DEFAULT_SETTINGS = {
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
  };

  const DEFAULT_STATS = {
    sentToday: 0,
    sentTotal: 0,
    skipped: 0,
    failed: 0,
    aiUsed: 0,
    fallbackUsed: 0,
    lastRunDate: null,
  };

  const DEFAULT_RUNSTATE = {
    running: false,
    phase: 'idle',
    currentUrn: null,
    startedAt: null,
  };

  const DEFAULTS = {
    settings: DEFAULT_SETTINGS,
    queue: [],
    sentLog: {},
    msgCache: {},
    stats: DEFAULT_STATS,
    runState: DEFAULT_RUNSTATE,
  };

  const ALL_KEYS = ['settings', 'queue', 'sentLog', 'msgCache', 'stats', 'runState'];

  function deepClone(v) {
    return v === undefined ? v : JSON.parse(JSON.stringify(v));
  }

  function todayISODate(d) {
    const t = d instanceof Date ? d : new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const day = String(t.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, (items) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(items || {});
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(obj, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function applyDefaults(items) {
    const out = {};
    for (const k of ALL_KEYS) {
      if (items && items[k] !== undefined) out[k] = items[k];
      else out[k] = deepClone(DEFAULTS[k]);
    }
    // Merge settings/stats/runState shallowly so new default fields appear.
    out.settings = Object.assign(deepClone(DEFAULT_SETTINGS), out.settings || {});
    out.stats = Object.assign(deepClone(DEFAULT_STATS), out.stats || {});
    out.runState = Object.assign(deepClone(DEFAULT_RUNSTATE), out.runState || {});
    if (!Array.isArray(out.queue)) out.queue = [];
    if (!out.sentLog || typeof out.sentLog !== 'object') out.sentLog = {};
    if (!out.msgCache || typeof out.msgCache !== 'object') out.msgCache = {};
    return out;
  }

  // Initialize any missing keys with schema defaults. Returns full state.
  async function initStorage() {
    const items = await storageGet(ALL_KEYS);
    const withDefaults = applyDefaults(items);
    const toWrite = {};
    for (const k of ALL_KEYS) {
      if (items[k] === undefined) toWrite[k] = withDefaults[k];
    }
    if (Object.keys(toWrite).length) await storageSet(toWrite);
    await resetDailyCountersIfNeeded(withDefaults);
    return getAll();
  }

  async function getAll() {
    const items = await storageGet(ALL_KEYS);
    return applyDefaults(items);
  }

  async function getSettings() {
    const s = await getAll();
    return s.settings;
  }
  async function setSettings(patch) {
    const cur = await getSettings();
    const next = Object.assign({}, cur, patch || {});
    await storageSet({ settings: next });
    return next;
  }

  async function getQueue() {
    const s = await getAll();
    return s.queue;
  }
  async function setQueue(queue) {
    await storageSet({ queue: queue || [] });
  }

  async function getSentLog() {
    const s = await getAll();
    return s.sentLog;
  }
  async function setSentLog(sentLog) {
    await storageSet({ sentLog: sentLog || {} });
  }

  async function getMsgCache() {
    const s = await getAll();
    return s.msgCache;
  }
  async function setMsgCache(msgCache) {
    await storageSet({ msgCache: msgCache || {} });
  }

  async function getStats() {
    const s = await getAll();
    return s.stats;
  }
  async function setStats(stats) {
    await storageSet({ stats: stats });
  }

  async function getRunState() {
    const s = await getAll();
    return s.runState;
  }
  // Every state transition must write BEFORE proceeding (BRIEF §5).
  async function setRunState(patch) {
    const cur = await getRunState();
    const next = Object.assign({}, cur, patch || {});
    await storageSet({ runState: next });
    return next;
  }

  // Daily counters reset when lastRunDate !== today.
  async function resetDailyCountersIfNeeded(state) {
    const s = state || (await getAll());
    const today = todayISODate(new Date());
    if (s.stats.lastRunDate !== today) {
      const next = Object.assign({}, s.stats, { sentToday: 0, lastRunDate: today });
      await storageSet({ stats: next });
      return next;
    }
    return s.stats;
  }

  NS.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  NS.DEFAULT_STATS = DEFAULT_STATS;
  NS.DEFAULT_RUNSTATE = DEFAULT_RUNSTATE;
  NS.ALL_KEYS = ALL_KEYS;
  NS.todayISODate = todayISODate;
  NS.storageGet = storageGet;
  NS.storageSet = storageSet;
  NS.initStorage = initStorage;
  NS.getAll = getAll;
  NS.getSettings = getSettings;
  NS.setSettings = setSettings;
  NS.getQueue = getQueue;
  NS.setQueue = setQueue;
  NS.getSentLog = getSentLog;
  NS.setSentLog = setSentLog;
  NS.getMsgCache = getMsgCache;
  NS.setMsgCache = setMsgCache;
  NS.getStats = getStats;
  NS.setStats = setStats;
  NS.getRunState = getRunState;
  NS.setRunState = setRunState;
  NS.resetDailyCountersIfNeeded = resetDailyCountersIfNeeded;
})();
