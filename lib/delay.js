/* AutoRef lib/delay.js — plain script, shares window.AutoRef namespace. No imports. */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Box-Muller transform for Gaussian (normal) distribution.
  // Clamped within [minSec, maxSec], centered at mean with ~3 std deviations.
  function naturalRandomSec(minSec, maxSec) {
    const lo = Number(minSec);
    const hi = Number(maxSec);
    const a = Number.isFinite(lo) ? lo : 45;
    const b = Number.isFinite(hi) && hi >= a ? hi : 120;
    if (a === b) return a;

    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    const mean = (a + b) / 2;
    const stdDev = (b - a) / 6;
    const val = mean + z * stdDev;
    return Math.max(a, Math.min(b, val));
  }

  function randomDelaySec(minSec, maxSec) {
    return naturalRandomSec(minSec, maxSec);
  }

  function randomDelay(minSec, maxSec) {
    return sleep(randomDelaySec(minSec, maxSec) * 1000);
  }

  // Ticks down second by second for UI countdown displays with early abort capability
  async function countdownDelay(durationSec, onTick, signal) {
    const total = Math.max(0, Math.round(Number(durationSec) || 0));
    for (let rem = total; rem >= 0; rem--) {
      if (signal && signal.aborted) break;
      if (typeof onTick === 'function') onTick(rem, total);
      if (rem > 0) {
        await sleep(1000);
      }
    }
  }

  // Smooth scroll easing helper before clicking buttons
  async function smoothScrollTo(el) {
    if (!el) return;
    try {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        await sleep(300 + Math.random() * 150);
      }
    } catch (_) {
      /* ignore smooth scrolling errors in test stubs or unsupported environments */
    }
  }

  // QWERTY adjacent keys map for human-like typos
  const NEARBY_KEYS = {
    a: 'sqzw', b: 'vghn', c: 'xdfv', d: 'ersfxc', e: 'wsdr', f: 'rtgdvc',
    g: 'tyhfvb', h: 'yujgbn', i: 'ujko', j: 'uikhmn', k: 'ijolm', l: 'kop',
    m: 'njk', n: 'bhjm', o: 'iklp', p: 'ol', q: 'wa', r: 'edft', s: 'awedxz',
    t: 'rfgy', u: 'yhji', v: 'cfgb', w: 'qase', x: 'zsdc', y: 'tghu', z: 'asx'
  };

  function insertChar(el, ch) {
    let inserted = false;
    try {
      if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
        inserted = document.execCommand('insertText', false, ch);
      }
    } catch (_) {
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
    return inserted;
  }

  function deleteLastChar(el) {
    let deleted = false;
    try {
      if (document.queryCommandSupported && document.queryCommandSupported('delete')) {
        deleted = document.execCommand('delete', false, null);
      }
    } catch (_) {
      deleted = false;
    }
    if (!deleted) {
      if ('value' in el && el.tagName !== 'DIV') {
        el.value = (el.value || '').slice(0, -1);
      } else {
        el.textContent = (el.textContent || '').slice(0, -1);
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    }
    return deleted;
  }

  // Types text into a contenteditable/input/textarea with natural typing jitter (40–110ms)
  // and occasional realistic typo/backspace corrections.
  async function humanTyping(el, text, optsOrSignal) {
    if (!el) throw new Error('humanTyping: missing element');
    const s = String(text == null ? '' : text);
    const signal = optsOrSignal && optsOrSignal.aborted !== undefined ? optsOrSignal : (optsOrSignal && optsOrSignal.signal);
    const fast = !!(optsOrSignal && optsOrSignal.fast);
    const typoChance = (optsOrSignal && typeof optsOrSignal.typoChance === 'number') ? optsOrSignal.typoChance : 0.02;

    el.focus();
    for (let i = 0; i < s.length; i++) {
      if (signal && signal.aborted) throw new Error('humanTyping: aborted');
      const ch = s[i];
      const lower = ch.toLowerCase();

      // Occasional typo simulation on letters (2% chance)
      const canTypo = !fast && typoChance > 0 && NEARBY_KEYS[lower] && Math.random() < typoChance;
      if (canTypo) {
        const options = NEARBY_KEYS[lower];
        const wrongCh = options[Math.floor(Math.random() * options.length)];
        insertChar(el, ch === ch.toUpperCase() ? wrongCh.toUpperCase() : wrongCh);
        // Notice typo pause: 120-220ms
        await sleep(120 + Math.random() * 100);
        // Backspace to delete incorrect character
        deleteLastChar(el);
        // Pause before typing correct character: 70-130ms
        await sleep(70 + Math.random() * 60);
      }

      insertChar(el, ch);

      if (!fast) {
        // Natural typing jitter: 40–110ms
        const jitter = 40 + Math.random() * 70;
        await sleep(jitter);
        // Occasional pause between words or punctuation
        if (ch === ' ' && Math.random() < 0.12) {
          await sleep(140 + Math.random() * 180);
        } else if (Math.random() < 0.015) {
          await sleep(200 + Math.random() * 250);
        }
      }
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  NS.sleep = sleep;
  NS.naturalRandomSec = naturalRandomSec;
  NS.randomDelaySec = randomDelaySec;
  NS.randomDelay = randomDelay;
  NS.countdownDelay = countdownDelay;
  NS.smoothScrollTo = smoothScrollTo;
  NS.humanTyping = humanTyping;
})();
