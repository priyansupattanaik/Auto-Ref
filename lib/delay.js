/* AutoRef lib/delay.js — plain script, shares window.AutoRef namespace. No imports. */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomDelaySec(minSec, maxSec) {
    const lo = Number(minSec);
    const hi = Number(maxSec);
    const a = Number.isFinite(lo) ? lo : 0;
    const b = Number.isFinite(hi) && hi >= a ? hi : a;
    return a + Math.random() * (b - a);
  }

  function randomDelay(minSec, maxSec) {
    return sleep(randomDelaySec(minSec, maxSec) * 1000);
  }

  // Types text into a contenteditable/input/textarea with human-like timing.
  // Uses per-char delay 30–80ms with an occasional ~300ms pause.
  async function humanTyping(el, text, signal) {
    if (!el) throw new Error('humanTyping: missing element');
    const s = String(text == null ? '' : text);
    el.focus();
    for (let i = 0; i < s.length; i++) {
      if (signal && signal.aborted) throw new Error('humanTyping: aborted');
      const ch = s[i];
      // Prefer execCommand for contenteditable so framework listeners fire;
      // fall back to direct mutation + input events.
      let inserted = false;
      try {
        if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
          inserted = document.execCommand('insertText', false, ch);
        }
      } catch (e) {
        inserted = false;
      }
      if (!inserted) {
        if ('value' in el && el.tagName !== 'DIV') {
          el.value = (el.value || '') + ch;
        } else {
          el.textContent = (el.textContent || '') + ch;
        }
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch }));
      }
      const base = 30 + Math.random() * 50; // 30–80ms
      await sleep(base);
      if (Math.random() < 0.03) await sleep(300); // occasional pause
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  NS.sleep = sleep;
  NS.randomDelay = randomDelay;
  NS.randomDelaySec = randomDelaySec;
  NS.humanTyping = humanTyping;
})();
