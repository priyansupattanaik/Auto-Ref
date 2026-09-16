/* AutoRef content/main.js — orchestrator: the state machine loop (BRIEF §6.1).
   Lives in the TAB (survives SW death). Reads/writes chrome.storage.local
   directly; asks the SW only for AI generation (AUTOREF_GENERATE).
   RESUME STRATEGY: every transition persists runState+queue+sentLog+stats BEFORE
   the next step. Page navigation reloads this script; boot() re-reads state and
   continues from runState.phase/currentUrn, so killing the tab mid-run resumes
   from the exact interrupted step with no duplicate sends (dedupe: sentLog +
   live thread check before every send).
   STATS POLICY (documented): aiUsed/fallbackUsed count every generated message
   (dry or real). sentToday/sentTotal count REAL sends only, so the daily cap
   never blocks dry-run testing. Dry-run items end as status "done(dry)". */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  const PHASES = [
    'idle', 'scrape_queue', 'next', 'open_profile', 'extract_info',
    'open_message_modal', 'generate_message', 'awaiting_review',
    'typing', 'sending', 'verify', 'delay_wait', 'coffee_break', 'paused', 'done',
  ];
  const TERMINAL_ITEM = (st) =>
    st === 'done' || st === 'done(dry)' || st === 'skipped' || st === 'failed' || st === 'awaiting_review';
  const BUSY = { drive: false };
  const POLL_MS = 3000;
  const AI_TIMEOUT_MS = 60000;
  const MAX_STEPS_PER_DRIVE = 25;

  function log() {
    console.log.apply(console, ['[AutoRef]'].concat(Array.prototype.slice.call(arguments)));
  }

  function pageType() {
    const h = location.href;
    if (/connections\.html/i.test(h) || /linkedin\.com\/search\/results\/people/i.test(h)) return 'search';
    if (/profile\.html/i.test(h) || /linkedin\.com\/in\//i.test(h)) return 'profile';
    if (/thread\.html/i.test(h)) return 'thread';
    return 'other';
  }

  function withinWorkHours(settings, now) {
    const s = settings || {};
    if (!s.workHoursEnabled) return true;
    const d = now instanceof Date ? now : new Date();
    const h = d.getHours();
    const start = Number(s.workHoursStart);
    const end = Number(s.workHoursEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
    if (start === end) return true;
    if (start < end) return h >= start && h < end;
    return h >= start || h < end; // overnight window
  }

  // 3-consecutive-failure run over processed prefix: failed=++, done/done(dry)=reset,
  // skipped/pending/in_progress/awaiting_review are neutral (don't reset, don't count).
  function consecutiveFailures(queue) {
    let run = 0;
    let peak = 0;
    for (const q of queue || []) {
      if (!q) continue;
      if (q.status === 'failed') {
        run++;
        if (run > peak) peak = run;
      } else if (q.status === 'done' || q.status === 'done(dry)') {
        run = 0;
      }
    }
    return peak;
  }

  function pickNext(queue) {
    const q = queue || [];
    for (const it of q) if (it && it.status === 'in_progress') return { item: it, resumed: true };
    for (const it of q) if (it && it.status === 'pending') return { item: it, resumed: false };
    return null;
  }

  function updateItem(queue, urn, patch) {
    return (queue || []).map((it) => (it && it.urn === urn ? Object.assign({}, it, patch) : it));
  }

  function sendToSW(msg, timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => {
        if (!done) {
          done = true;
          reject(new Error('SW request timed out'));
        }
      }, timeoutMs || AI_TIMEOUT_MS);
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (done) return;
          done = true;
          clearTimeout(t);
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(res);
        });
      } catch (e) {
        if (!done) {
          done = true;
          clearTimeout(t);
          reject(e);
        }
      }
    });
  }

  async function pauseRun(reason, currentUrn) {
    await NS.setRunState({ running: false, phase: 'paused', currentUrn: currentUrn || null });
    log('paused:', reason);
  }

  async function markSkip(urn, reason) {
    const queue = await NS.getQueue();
    await NS.setQueue(updateItem(queue, urn, { status: 'skipped', reason: reason }));
    const stats = await NS.getStats();
    stats.skipped = (stats.skipped || 0) + 1;
    await NS.setStats(stats);
    log('skip', urn, '-', reason);
  }

  async function markFailed(urn, reason) {
    const queue = await NS.getQueue();
    await NS.setQueue(updateItem(queue, urn, { status: 'failed', reason: reason }));
    const stats = await NS.getStats();
    stats.failed = (stats.failed || 0) + 1;
    await NS.setStats(stats);
    log('failed', urn, '-', reason);
  }

  function msgCacheKey(urn, model) {
    return urn + '::' + model + '::v1';
  }

  async function parkDraft(urn, model, message, source) {
    const cache = await NS.getMsgCache();
    cache[msgCacheKey(urn, model)] = { message: message, ts: new Date().toISOString(), source: source };
    const keys = Object.keys(cache);
    if (keys.length > 200) {
      keys
        .sort((a, b) => String(cache[a].ts || '').localeCompare(String(cache[b].ts || '')))
        .slice(0, keys.length - 200)
        .forEach((k) => delete cache[k]);
    }
    await NS.setMsgCache(cache);
  }

  async function generateFor(item, settings) {
    try {
      const cache = (NS.getMsgCache ? await NS.getMsgCache() : null) || {};
      const key = msgCacheKey(item.urn, settings.model);
      if (cache[key] && cache[key].message) {
        return { ok: true, source: cache[key].source || 'fallback', message: cache[key].message, cached: true };
      }
    } catch (_) {
      /* ignore cache read error */
    }
    const fallback = NS.renderTemplate(settings.fallbackTemplate, NS.templateVarsFor(item, settings));
    if (!settings.aiMode) return { ok: true, source: 'fallback', message: fallback, reason: 'aiMode off' };
    try {
      const res = await sendToSW({ type: 'AUTOREF_GENERATE', profile: item }, AI_TIMEOUT_MS);
      if (res && res.message) return res;
      return { ok: true, source: 'fallback', message: fallback, reason: (res && res.reason) || 'ai empty' };
    } catch (e) {
      return { ok: true, source: 'fallback', message: fallback, reason: 'sw error: ' + String((e && e.message) || e) };
    }
  }

  function pageUrnMatches(item) {
    try {
      const href = location.href;
      const targetUrn = String((item && item.urn) || '').toLowerCase();
      const mockUrn = NS.urnFromMockUrl(href);
      if (mockUrn) return mockUrn.toLowerCase() === targetUrn;
      const slug = NS.slugFromProfileUrl(href);
      if (slug) return slug.toLowerCase() === targetUrn;
    } catch (e) {
      /* fall through */
    }
    return false;
  }

  function renderReviewOverlay(enrichedItem, draftText, currentSettings) {
    if (!NS.Overlay || !NS.Overlay.render) return;
    NS.Overlay.render({
      profile: enrichedItem,
      draft: draftText,
      status: 'Awaiting Review',
      settings: currentSettings,
      onApprove: async (editedText) => {
        const chosenDraft = editedText || draftText;
        await parkDraft(enrichedItem.urn, currentSettings.model, chosenDraft, 'user_edited');
        const q = await NS.getQueue();
        await NS.setQueue(
          updateItem(q, enrichedItem.urn, { status: 'in_progress', reason: 'approved by user', approved: true }),
        );
        await NS.setRunState({ running: true, phase: 'typing', currentUrn: enrichedItem.urn });
        drive();
      },
      onRegenerate: async () => {
        const cache = (await NS.getMsgCache()) || {};
        delete cache[msgCacheKey(enrichedItem.urn, currentSettings.model)];
        await NS.setMsgCache(cache);
        const fresh = await generateFor(enrichedItem, currentSettings);
        await parkDraft(enrichedItem.urn, currentSettings.model, fresh.message, fresh.source);
        return fresh.message;
      },
      onSkip: async () => {
        await markSkip(enrichedItem.urn, 'review skipped by user');
        if (NS.Overlay && NS.Overlay.remove) NS.Overlay.remove();
        await NS.setRunState({ running: true, phase: 'next', currentUrn: null });
        drive();
      },
    });
  }

  // One step of the machine. Returns 'continue' | 'stop' | 'navigated'.
  async function step() {
    await NS.resetDailyCountersIfNeeded();
    const s = await NS.getAll();
    NS.setMockMode(!!s.settings.mockMode);
    const settings = s.settings;

    if (!s.runState.running) return 'stop';
    const phase = s.runState.phase;
    if (phase === 'paused' || phase === 'done' || phase === 'idle' || phase === 'coffee_break' || phase === 'delay_wait') return 'stop';

    // ---- awaiting review guard ----
    if (phase === 'awaiting_review') {
      const currentUrn = s.runState.currentUrn;
      const item = (s.queue || []).find((q) => q && q.urn === currentUrn);
      if (item && item.status === 'awaiting_review' && !item.approved) {
        // If overlay was removed or not mounted yet (e.g. reload), re-mount for review
        if (NS.Overlay && !NS.Overlay.isVisible() && pageUrnMatches(item)) {
          const cache = (NS.getMsgCache ? await NS.getMsgCache() : null) || {};
          const key = msgCacheKey(item.urn, settings.model);
          const draft = (cache[key] && cache[key].message) || '';
          renderReviewOverlay(item, draft, settings);
        }
        return 'stop';
      }
    }

    // ---- scrape phase (search page only) ----
    if (phase === 'scrape_queue') {
      if (pageType() !== 'search') {
        log('scrape_queue: waiting on the connections search page (open it, attach, Start).');
        return 'stop';
      }
      await NS.setRunState({ phase: 'scrape_queue', currentUrn: null });
      const res = await NS.scrapeConnectionsList();
      if (!res.ok || !res.items || !res.items.length) {
        await pauseRun('scrape failed: ' + ((res && res.reason) || 'no items'), null);
        return 'stop';
      }
      const merged = await NS.buildQueue(res.items, s.sentLog);
      log('scraped', res.items.length, 'added', merged.added, 'total', merged.total);
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }

    // ---- global gates before item work ----
    if (s.stats.sentToday >= settings.dailyCap) {
      await pauseRun('daily cap reached (' + s.stats.sentToday + '/' + settings.dailyCap + ')', s.runState.currentUrn);
      return 'stop';
    }
    if (!withinWorkHours(settings)) {
      await pauseRun('outside working hours', s.runState.currentUrn);
      return 'stop';
    }
    if (consecutiveFailures(s.queue) >= 3) {
      await pauseRun('3 consecutive failures', s.runState.currentUrn);
      return 'stop';
    }

    const pick = pickNext(s.queue);
    if (!pick) {
      const awaiting = (s.queue || []).filter((q) => q && q.status === 'awaiting_review').length;
      await NS.setRunState({ running: false, phase: 'done', currentUrn: null });
      log('queue drained. awaiting review: ' + awaiting);
      return 'stop';
    }
    const item = pick.item;

    // ---- queue-walk filters ----
    const bl = NS.blacklistHit(item, settings);
    if (bl) {
      await markSkip(item.urn, 'blacklisted ' + bl);
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }
    if (!NS.matchesTarget(item, settings)) {
      await markSkip(item.urn, 'no match');
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }
    if (NS.hasLocalHistory(s.sentLog, item.urn)) {
      await markSkip(item.urn, 'already messaged');
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }

    // ---- need the profile page? ----
    if (pageType() !== 'profile' || !pageUrnMatches(item)) {
      if (!item.profileUrl) {
        await markFailed(item.urn, 'missing profile URL');
        await NS.setRunState({ phase: 'next', currentUrn: null });
        return 'continue';
      }
      if (item.status === 'pending') {
        await NS.setQueue(
          updateItem(s.queue, item.urn, {
            status: 'in_progress',
            reason: item.reason || '',
            approved: !!(item.approved || item.reason === 'approved by user'),
          }),
        );
      }
      await NS.setRunState({ running: true, phase: 'open_profile', currentUrn: item.urn });
      log('navigating to', item.profileUrl);
      location.href = item.profileUrl; // reload resumes via boot()
      return 'navigated';
    }

    // ---- on the profile page ----
    await NS.setRunState({ running: true, phase: 'extract_info', currentUrn: item.urn });
    const ex = NS.extractProfileInfo();
    if (!ex.ok) {
      await markFailed(item.urn, 'extract failed: ' + ex.reason);
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }
    const enrichedRole = ex.role || item.role || '';
    const enrichedCompany = ex.company || item.company || '';
    await NS.setQueue(
      updateItem(await NS.getQueue(), item.urn, { name: ex.name, role: enrichedRole, company: enrichedCompany }),
    );
    const enriched = Object.assign({}, item, { name: ex.name, role: enrichedRole, company: enrichedCompany });

    if (!NS.matchesTarget(enriched, settings)) {
      await markSkip(item.urn, 'no match');
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }
    const fresh = await NS.getAll();
    if (NS.hasLocalHistory(fresh.sentLog, item.urn)) {
      await markSkip(item.urn, 'already messaged');
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }

    const abort = NS.detectAbortSignals();
    if (abort.captcha || abort.warning || abort.checkpoint || abort.any) {
      const why = abort.captcha
        ? 'captcha/verification wall'
        : abort.checkpoint
        ? 'security checkpoint / verification'
        : 'unusual-activity warning';
      await NS.setQueue(updateItem(await NS.getQueue(), item.urn, { reason: 'aborted: ' + why }));
      if (NS.Overlay && NS.Overlay.showEmergencyAlert) {
        NS.Overlay.showEmergencyAlert(why);
      }
      await pauseRun(why, item.urn);
      return 'stop';
    }

    await NS.setRunState({ running: true, phase: 'open_message_modal', currentUrn: item.urn });
    const modal = await NS.openMessageModal();
    if (!modal.ok) {
      await markSkip(item.urn, 'no message button');
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }
    const thread = await NS.hasLiveThread();
    if (thread.ok && thread.exists) {
      await NS.backfillSentLog(item.urn, enriched.name, enriched.company);
      await markSkip(item.urn, 'prior thread');
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }

    // ---- generate ----
    await NS.setRunState({ running: true, phase: 'generate_message', currentUrn: item.urn });
    const gen = await generateFor(enriched, settings);
    if (!gen.cached) {
      const stats = await NS.getStats();
      if (gen.source === 'ai') stats.aiUsed = (stats.aiUsed || 0) + 1;
      else stats.fallbackUsed = (stats.fallbackUsed || 0) + 1;
      await NS.setStats(stats);
    }
    await parkDraft(item.urn, settings.model, gen.message, gen.source);

    const isApproved = !!(item.approved || item.reason === 'approved by user');
    if (settings.reviewMode && !isApproved) {
      await NS.setQueue(
        updateItem(await NS.getQueue(), item.urn, { status: 'awaiting_review', reason: 'draft parked for review' }),
      );
      await NS.setRunState({ running: true, phase: 'awaiting_review', currentUrn: item.urn });
      renderReviewOverlay(enriched, gen.message, settings);
      log('parked draft for review with in-page overlay:', item.urn);
      return 'stop';
    }

    if (settings.dryRun) {
      const logData = await NS.getSentLog();
      logData[item.urn] = {
        name: enriched.name,
        company: enriched.company,
        dateISO: new Date().toISOString(),
        source: gen.source,
        messageText: gen.message,
      };
      await NS.setSentLog(logData);
      await NS.setQueue(updateItem(await NS.getQueue(), item.urn, { status: 'done(dry)', reason: 'dry-run (not sent)' }));
      const dryStats = await NS.getStats();
      dryStats.sendsSinceBreak = (dryStats.sendsSinceBreak || 0) + 1;
      await NS.setStats(dryStats);

      if (NS.Overlay && NS.Overlay.setStatus) NS.Overlay.setStatus('Dry-Run Verified (Simulated)');
      log('dry-run logged (NOT sent):', item.urn);

      // Check coffee break pacing after sends
      if (dryStats.sendsSinceBreak >= (settings.coffeeBreakInterval || 5)) {
        dryStats.sendsSinceBreak = 0;
        await NS.setStats(dryStats);
        log('☕ Coffee break triggered after ' + (settings.coffeeBreakInterval || 5) + ' sends.');
        await NS.setRunState({ running: true, phase: 'coffee_break', currentUrn: null });
        const breakSec = settings.mockMode ? 2 : (settings.coffeeBreakDurationSec || 900);
        if (NS.Overlay && NS.Overlay.runCountdown) {
          await NS.Overlay.runCountdown(breakSec, '☕ 15-min Coffee Break: {time} remaining', 'Resume Now');
        } else {
          await NS.sleep(breakSec * 1000);
        }
      }

      await NS.setRunState({ running: true, phase: 'delay_wait', currentUrn: null });
      const delaySec = settings.mockMode ? 1 : (NS.naturalRandomSec ? NS.naturalRandomSec(settings.delayMinSec, settings.delayMaxSec) : 45);
      if (NS.Overlay && NS.Overlay.runCountdown) {
        await NS.Overlay.runCountdown(delaySec, '⏱️ Next profile in {time}', 'Skip Delay');
        if (NS.Overlay.remove) NS.Overlay.remove();
      } else {
        await NS.sleep(delaySec * 1000);
      }
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }

    // ---- real send ----
    if ((await NS.getStats()).sentToday >= settings.dailyCap) {
      await pauseRun('daily cap reached', item.urn);
      return 'stop';
    }
    await NS.setRunState({ running: true, phase: 'typing', currentUrn: item.urn });
    if (NS.Overlay && NS.Overlay.setStatus) NS.Overlay.setStatus('Typing message...');
    const typed = await NS.typeMessage(gen.message);
    if (!typed.ok) {
      await markFailed(item.urn, 'typing failed: ' + typed.reason);
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }
    await NS.setRunState({ running: true, phase: 'sending', currentUrn: item.urn });
    if (NS.Overlay && NS.Overlay.setStatus) NS.Overlay.setStatus('Sending...');
    const sent = await NS.clickSend(settings); // refuses when dryRun (defense in depth)
    if (!sent.ok) {
      await markFailed(item.urn, 'send failed: ' + sent.reason);
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }
    await NS.setRunState({ running: true, phase: 'verify', currentUrn: item.urn });
    if (NS.Overlay && NS.Overlay.setStatus) NS.Overlay.setStatus('Verifying send in thread...');
    const ver = await NS.verifySent(gen.message);
    if (!ver.ok) {
      await markFailed(item.urn, 'verify failed: ' + ver.reason);
      await NS.setRunState({ phase: 'next', currentUrn: null });
      return 'continue';
    }
    const logData2 = await NS.getSentLog();
    logData2[item.urn] = {
      name: enriched.name,
      company: enriched.company,
      dateISO: new Date().toISOString(),
      source: gen.source,
      messageText: gen.message,
    };
    await NS.setSentLog(logData2);
    const stats2 = await NS.getStats();
    stats2.sentToday = (stats2.sentToday || 0) + 1;
    stats2.sentTotal = (stats2.sentTotal || 0) + 1;
    stats2.sendsSinceBreak = (stats2.sendsSinceBreak || 0) + 1;
    await NS.setStats(stats2);
    await NS.setQueue(updateItem(await NS.getQueue(), item.urn, { status: 'done', reason: '' }));
    if (NS.Overlay && NS.Overlay.setStatus) NS.Overlay.setStatus('Verified & Sent');
    log('sent + verified:', item.urn);

    // Check coffee break pacing after sends
    if (stats2.sendsSinceBreak >= (settings.coffeeBreakInterval || 5)) {
      stats2.sendsSinceBreak = 0;
      await NS.setStats(stats2);
      log('☕ Coffee break triggered after ' + (settings.coffeeBreakInterval || 5) + ' sends.');
      await NS.setRunState({ running: true, phase: 'coffee_break', currentUrn: null });
      const breakSec = settings.mockMode ? 2 : (settings.coffeeBreakDurationSec || 900);
      if (NS.Overlay && NS.Overlay.runCountdown) {
        await NS.Overlay.runCountdown(breakSec, '☕ 15-min Coffee Break: {time} remaining', 'Resume Now');
      } else {
        await NS.sleep(breakSec * 1000);
      }
    }

    await NS.setRunState({ running: true, phase: 'delay_wait', currentUrn: null });
    const delaySecReal = settings.mockMode ? 1 : (NS.naturalRandomSec ? NS.naturalRandomSec(settings.delayMinSec, settings.delayMaxSec) : 45);
    if (NS.Overlay && NS.Overlay.runCountdown) {
      await NS.Overlay.runCountdown(delaySecReal, '⏱️ Next profile in {time}', 'Skip Delay');
      if (NS.Overlay.remove) NS.Overlay.remove();
    } else {
      await NS.sleep(delaySecReal * 1000);
    }
    const after = await NS.getAll();
    if (!after.runState.running) return 'stop';
    await NS.setRunState({ phase: 'next', currentUrn: null });
    return 'continue';
  }

  async function drive() {
    if (BUSY.drive) return;
    BUSY.drive = true;
    try {
      for (let i = 0; i < MAX_STEPS_PER_DRIVE; i++) {
        let r;
        try {
          r = await step();
        } catch (e) {
          log('step error:', (e && e.message) || e);
          try {
            const s = await NS.getAll();
            if (s.runState.currentUrn) await markFailed(s.runState.currentUrn, 'error: ' + String((e && e.message) || e));
            await NS.setRunState({ phase: 'next', currentUrn: null });
          } catch (inner) {
            log('recovery failed:', (inner && inner.message) || inner);
            return;
          }
          r = 'continue';
        }
        if (r === 'stop' || r === 'navigated') return;
      }
    } finally {
      BUSY.drive = false;
    }
  }

  async function handleCommand(cmd) {
    const c = typeof cmd === 'string' ? { cmd: cmd } : cmd || {};
    if (c.cmd === 'pause') {
      await NS.setRunState({ running: false });
      return { ok: true };
    }
    if (c.cmd === 'start') {
      const s = await NS.getAll();
      const actionable = (s.queue || []).some((q) => q && (q.status === 'pending' || q.status === 'in_progress'));
      await NS.setRunState({
        running: true,
        phase: actionable ? 'next' : 'scrape_queue',
        startedAt: new Date().toISOString(),
        currentUrn: null,
      });
      drive();
      return { ok: true };
    }
    if ((c.cmd === 'approve' || c.cmd === 'skip') && c.urn) {
      const queue = await NS.getQueue();
      if (c.cmd === 'skip') {
        await NS.setQueue(updateItem(queue, c.urn, { status: 'skipped', reason: 'review skipped by user' }));
        const stats = await NS.getStats();
        stats.skipped = (stats.skipped || 0) + 1;
        await NS.setStats(stats);
      } else {
        // Approve: back to pending with approved flag. The generated draft is served from msgCache
        // (cache hit), so approval never regenerates or duplicates.
        await NS.setQueue(updateItem(queue, c.urn, { status: 'pending', reason: 'approved by user', approved: true }));
        const cur = await NS.getRunState();
        if (!cur.running) {
          await NS.setRunState({ running: true, phase: 'next', startedAt: new Date().toISOString(), currentUrn: null });
          drive();
        }
      }
      return { ok: true };
    }
    return { ok: false, error: 'unknown command' };
  }

  let booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    try {
      if (NS.initStorage) await NS.initStorage();
      const state = NS.getAll ? await NS.getAll() : null;
      if (state && NS.setMockMode) NS.setMockMode(!!state.settings.mockMode);
      if (state && state.runState && state.runState.running) {
        log('resuming run at phase', state.runState.phase);
        drive(); // resume-after-reload: continue from persisted phase/currentUrn
      } else {
        log('ready (idle).');
      }
      setInterval(async () => {
        try {
          const cur = NS.getAll ? await NS.getAll() : null;
          if (cur && cur.runState && cur.runState.running && !BUSY.drive) drive();
        } catch (e) {
          /* poller never throws */
        }
      }, POLL_MS);
    } catch (err) {
      console.error('[AutoRef] boot failed:', err);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    void sender;
    if (msg && msg.type === 'AUTOREF_CMD') {
      handleCommand(msg.cmd).then(
        (r) => sendResponse(r),
        (e) => sendResponse({ ok: false, error: String((e && e.message) || e) }),
      );
      return true;
    }
    return false;
  });

  NS.PHASES = PHASES;
  NS.TERMINAL_ITEM = TERMINAL_ITEM;
  NS.withinWorkHours = withinWorkHours;
  NS.consecutiveFailures = consecutiveFailures;
  NS.pickNext = pickNext;
  NS.boot = boot;
  NS.drive = drive;
  NS.handleCommand = handleCommand;
  NS.pageUrnMatches = pageUrnMatches;
  NS.renderReviewOverlay = renderReviewOverlay;
  NS.step = step;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
