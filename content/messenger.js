/* AutoRef content/messenger.js — plain script, window.AutoRef namespace.
   Compose → fill → send → verify (P6/P8). All DOM via selectors.js S().
   SAFETY: clickSend() refuses when settings.dryRun is true — the extension is
   physically incapable of clicking Send in dry-run mode (defense in depth;
   main.js additionally never calls clickSend on the dry-run path). */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  function sleepMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function getComposeBox() {
    return (NS.findComposeBox ? NS.findComposeBox() : null) || document.querySelector(NS.S().composeBox);
  }
  function getSendButton() {
    return (NS.findSendButton ? NS.findSendButton() : null) || document.querySelector(NS.S().sendButton);
  }
  function getMessageButton() {
    return (NS.findMessageButton ? NS.findMessageButton() : null) || document.querySelector(NS.S().messageButton);
  }

  async function openMessageModal() {
    const btn = getMessageButton();
    if (!btn) return { ok: false, reason: 'no message button' };
    if (NS.smoothScrollTo) await NS.smoothScrollTo(btn);
    btn.click();
    await sleepMs(800);
    return { ok: true };
  }

  async function typeMessage(text, signal) {
    const box = getComposeBox();
    if (!box) return { ok: false, reason: 'compose box missing' };
    try {
      await NS.humanTyping(box, text, signal);
      await sleepMs(300);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  }

  async function clickSend(settings) {
    if (!settings || settings.dryRun !== false) {
      return { ok: false, reason: 'dry-run: send blocked, Send was not clicked' };
    }
    const btn = getSendButton();
    if (!btn) return { ok: false, reason: 'send button missing' };
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
      return { ok: false, reason: 'send button disabled' };
    }
    if (NS.smoothScrollTo) await NS.smoothScrollTo(btn);
    btn.click();
    await sleepMs(900);
    return { ok: true };
  }

  async function verifySent(expectedText) {
    try {
      const want = String(expectedText || '').trim();
      if (!want) return { ok: false, reason: 'empty expected text' };
      await sleepMs(500);
      const S = NS.S();
      const scope = document.querySelector(S.threadContainer) || document;
      const bubbles = Array.from(scope.querySelectorAll(S.threadBubble));
      const texts = bubbles.map((b) => (b.innerText || b.textContent || '').trim());
      const probe = want.slice(0, 60);
      const found = texts.some((t) => {
        if (!t) return false;
        if (t.indexOf(probe) !== -1) return true;
        if (t.length >= 3 && want.indexOf(t.slice(0, 60)) !== -1) return true;
        return false;
      });
      return found
        ? { ok: true, count: bubbles.length }
        : { ok: false, reason: 'sent text not found in thread', count: bubbles.length };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  }

  // Abort-signal detection (P10): captcha / verification checkpoints / unusual-activity warnings
  function detectAbortSignals() {
    try {
      const S = NS.S();
      const captcha = !!(
        document.querySelector(S.captcha) ||
        document.querySelector('iframe[src*="captcha" i], iframe[title*="recaptcha" i]') ||
        document.querySelector('#captcha-internal, form#captcha-challenge, .checkpoint-challenge') ||
        document.querySelector('[data-testid*="captcha" i]') ||
        (document.title && /captcha/i.test(document.title))
      );
      const checkpoint = !!(
        document.querySelector('[data-testid*="checkpoint" i], input[name="pin"], #email-pin-challenge, form[action*="checkpoint"]') ||
        (document.title && /security verification|checkpoint/i.test(document.title))
      );
      const warning = !!(
        document.querySelector(S.activityWarning) ||
        document.querySelector('[data-testid="unusual-activity"], .artdeco-global-alert--error') ||
        document.querySelector('.account-restricted-alert, [data-testid*="restricted"]')
      );
      return {
        captcha: captcha,
        checkpoint: checkpoint,
        warning: warning,
        any: captcha || checkpoint || warning,
      };
    } catch (e) {
      return { captcha: false, checkpoint: false, warning: false, any: false };
    }
  }

  NS.getComposeBox = getComposeBox;
  NS.getSendButton = getSendButton;
  NS.getMessageButton = getMessageButton;
  NS.openMessageModal = openMessageModal;
  NS.typeMessage = typeMessage;
  NS.clickSend = clickSend;
  NS.verifySent = verifySent;
  NS.detectAbortSignals = detectAbortSignals;
})();
