/* AutoRef content/history-check.js — plain script, window.AutoRef namespace.
   Two layers (BRIEF §6.3): Layer 1 sentLog[urn], Layer 2 live thread bubbles.
   NOTE (schema-constrained): sentLog entries require source "ai"|"fallback".
   Backfilled threads (sent from phone/other tools) are tagged source "fallback"
   with the detected last-bubble text, and never touch aiUsed/fallbackUsed stats. */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  function hasLocalHistory(sentLog, urn) {
    return !!(sentLog && urn && sentLog[urn]);
  }

  function countThreadBubbles() {
    try {
      const S = NS.S();
      const scope = document.querySelector(S.threadContainer) || document;
      return scope.querySelectorAll(S.threadBubble).length;
    } catch (e) {
      return 0;
    }
  }

  function lastBubbleText() {
    try {
      const S = NS.S();
      const scope = document.querySelector(S.threadContainer) || document;
      const bubbles = scope.querySelectorAll(S.threadBubble);
      if (!bubbles.length) return '';
      const el = bubbles[bubbles.length - 1];
      return (el.innerText || el.textContent || '').trim().slice(0, 500);
    } catch (e) {
      return '';
    }
  }

  // Layer 2: call AFTER opening the message modal. count > 0 => prior thread.
  async function hasLiveThread() {
    try {
      const count = countThreadBubbles();
      return { ok: true, exists: count > 0, count: count };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  }

  async function backfillSentLog(urn, name, company) {
    const log = await NS.getSentLog();
    if (log[urn]) return log;
    log[urn] = {
      name: name || '',
      company: company || '',
      dateISO: new Date().toISOString(),
      source: 'fallback', // schema-constrained tag; see header note
      messageText: lastBubbleText(),
    };
    await NS.setSentLog(log);
    return log;
  }

  NS.hasLocalHistory = hasLocalHistory;
  NS.countThreadBubbles = countThreadBubbles;
  NS.lastBubbleText = lastBubbleText;
  NS.hasLiveThread = hasLiveThread;
  NS.backfillSentLog = backfillSentLog;
})();
