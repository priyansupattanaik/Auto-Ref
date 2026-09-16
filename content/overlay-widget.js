/* AutoRef content/overlay-widget.js — Floating In-Page Overlay Widget.
   Renders directly on webpage above active LinkedIn compose area in mock & live pages.
   Features:
   - Recipient info (name, role, company)
   - Editable draft textarea with live word count
   - Action buttons: "Approve & Send", "Regenerate", "Skip"
   - Next-profile delay countdown timer with manual skip
   - Coffee break pacing countdown timer with resume button
   - Emergency halt visual modal + Web Audio alarm on captchas/checkpoints/warnings
   Plain script, shares window.AutoRef namespace. */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  const WIDGET_ID = 'autoref-inpage-overlay';
  const EMERGENCY_ID = 'autoref-emergency-halt';
  const STYLE_ID = 'autoref-overlay-styles';

  const STYLES = `
    #${WIDGET_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 380px;
      max-width: calc(100vw - 32px);
      background: #ffffff;
      color: #1f2328;
      border: 2px solid #0a66c2;
      border-radius: 12px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.28);
      font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      z-index: 2147483647;
      overflow: hidden;
      box-sizing: border-box;
      transition: box-shadow 0.2s ease, transform 0.2s ease;
    }
    #${WIDGET_ID} * {
      box-sizing: border-box;
    }
    #${WIDGET_ID} .autoref-header {
      background: #0a66c2;
      color: #ffffff;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
    }
    #${WIDGET_ID} .autoref-header-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      font-weight: 700;
    }
    #${WIDGET_ID} .autoref-header-title img.autoref-logo {
      width: 20px;
      height: 20px;
      object-fit: contain;
      display: inline-block;
      vertical-align: middle;
    }
    #${WIDGET_ID} .autoref-badge {
      background: rgba(255, 255, 255, 0.25);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    #${WIDGET_ID} .autoref-status-container {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #${WIDGET_ID} .autoref-header-orb {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
    }
    #${WIDGET_ID} .autoref-status-tag {
      font-size: 11px;
      opacity: 0.92;
      font-weight: 500;
    }
    #${WIDGET_ID} .autoref-body {
      padding: 14px;
    }
    #${WIDGET_ID} .autoref-recipient {
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e1e4e8;
    }
    #${WIDGET_ID} .autoref-recipient-name {
      font-size: 15px;
      font-weight: 700;
      color: #1f2328;
    }
    #${WIDGET_ID} .autoref-recipient-meta {
      font-size: 12px;
      color: #57606a;
      margin-top: 2px;
    }
    #${WIDGET_ID} .autoref-draft-container {
      margin-bottom: 12px;
    }
    #${WIDGET_ID} .autoref-draft-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    #${WIDGET_ID} .autoref-draft-label {
      font-weight: 600;
      color: #333333;
      font-size: 12px;
    }
    #${WIDGET_ID} .autoref-word-count {
      font-size: 11px;
      color: #0a66c2;
      font-weight: 600;
    }
    #${WIDGET_ID} .autoref-draft-textarea {
      width: 100%;
      min-height: 90px;
      max-height: 180px;
      padding: 8px 10px;
      border: 1px solid #c9d1d9;
      border-radius: 6px;
      font-family: inherit;
      font-size: 12.5px;
      line-height: 1.45;
      color: #24292f;
      background: #fdfdfd;
      resize: vertical;
    }
    #${WIDGET_ID} .autoref-draft-textarea:focus {
      outline: none;
      border-color: #0a66c2;
      box-shadow: 0 0 0 2px rgba(10, 102, 194, 0.2);
    }
    #${WIDGET_ID} .autoref-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    #${WIDGET_ID} .autoref-btn {
      cursor: pointer;
      font-weight: 600;
      border-radius: 6px;
      padding: 7px 12px;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid transparent;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    #${WIDGET_ID} .autoref-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #${WIDGET_ID} .autoref-btn-approve {
      background: #0a66c2;
      color: #ffffff;
      flex: 1.2;
    }
    #${WIDGET_ID} .autoref-btn-approve:hover:not(:disabled) {
      background: #084e96;
    }
    #${WIDGET_ID} .autoref-btn-regenerate {
      background: #f6f8fa;
      color: #0a66c2;
      border-color: #0a66c2;
      flex: 1;
    }
    #${WIDGET_ID} .autoref-btn-regenerate:hover:not(:disabled) {
      background: #eef3f8;
    }
    #${WIDGET_ID} .autoref-btn-skip {
      background: #f6f8fa;
      color: #57606a;
      border-color: #d0d7de;
    }
    #${WIDGET_ID} .autoref-btn-skip:hover:not(:disabled) {
      background: #eaeef2;
      color: #24292f;
    }
    #${WIDGET_ID} .autoref-countdown-section {
      background: #f0f7ff;
      border: 1px dashed #0a66c2;
      border-radius: 6px;
      padding: 8px 10px;
      margin-top: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
    }
    #${WIDGET_ID} .autoref-countdown-text {
      color: #0a66c2;
      font-weight: 600;
    }
    #${WIDGET_ID} .autoref-btn-skip-delay {
      cursor: pointer;
      background: #ffffff;
      border: 1px solid #0a66c2;
      color: #0a66c2;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
    }
    #${WIDGET_ID} .autoref-btn-skip-delay:hover {
      background: #0a66c2;
      color: #ffffff;
    }

    /* Emergency Alert Modal */
    #${EMERGENCY_ID} {
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      width: 520px;
      max-width: calc(100vw - 32px);
      background: #fff0f0;
      color: #d11124;
      border: 3px solid #d11124;
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(209, 17, 36, 0.35);
      z-index: 2147483647;
      padding: 16px 20px;
      font-family: system-ui, -apple-system, sans-serif;
      animation: autoref-pulse 1.8s infinite;
      box-sizing: border-box;
    }
    @keyframes autoref-pulse {
      0% { box-shadow: 0 0 0 0 rgba(209, 17, 36, 0.4); }
      70% { box-shadow: 0 0 0 14px rgba(209, 17, 36, 0); }
      100% { box-shadow: 0 0 0 0 rgba(209, 17, 36, 0); }
    }
    #${EMERGENCY_ID} .autoref-em-title {
      font-size: 17px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    #${EMERGENCY_ID} .autoref-em-desc {
      font-size: 13px;
      color: #4b1014;
      line-height: 1.45;
      margin-bottom: 12px;
    }
    #${EMERGENCY_ID} .autoref-em-btn {
      cursor: pointer;
      background: #d11124;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-weight: 700;
      font-size: 13px;
    }
  `;

  function ensureStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    (document.head || document.documentElement || document.body || document).appendChild(style);
  }

  function countWords(str) {
    if (!str) return 0;
    const matches = String(str).trim().match(/\S+/g);
    return matches ? matches.length : 0;
  }

  function playAlertSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.01, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.01, ctx.currentTime + 0.38);
      osc.stop(ctx.currentTime + 0.4);
    } catch (_) {
      /* fail quietly if audio is restricted */
    }
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0 ? m + ':' + String(rem).padStart(2, '0') : rem + 's';
  }

  // Calculate and align widget position directly above active compose area
  function positionAboveCompose(card) {
    if (!card || typeof card.getBoundingClientRect !== 'function') return;
    try {
      const compose = NS.findComposeBox ? NS.findComposeBox() : null;
      if (compose && typeof compose.getBoundingClientRect === 'function') {
        const rect = compose.getBoundingClientRect();
        // If element has a layout on screen
        if (rect && (rect.width > 0 || rect.height > 0)) {
          const cardHeight = card.offsetHeight || 300;
          const spaceAbove = rect.top;
          if (spaceAbove >= cardHeight + 16) {
            // Fits directly above compose box
            card.style.bottom = Math.max(16, window.innerHeight - rect.top + 8) + 'px';
            card.style.right = Math.max(16, window.innerWidth - rect.right) + 'px';
            return;
          }
        }
      }
    } catch (_) {
      /* fall back to default fixed positioning */
    }
    card.style.bottom = '24px';
    card.style.right = '24px';
  }

  // Active widget instance state
  let currentCard = null;
  let activeCountdownTimer = null;
  let overlayOrb = null;

  function setOrbState(state) {
    if (overlayOrb && typeof ThinkingOrb !== 'undefined') {
      overlayOrb.update({ state: state, paused: false });
    }
  }

  function render(options) {
    ensureStyles();
    if (typeof document === 'undefined') return null;

    const opts = options || {};
    const profile = opts.profile || {};
    const draft = String(opts.draft || '');
    const status = opts.status || 'Awaiting Review';

    remove();

    const card = document.createElement('div');
    card.id = WIDGET_ID;

    // Header
    const header = document.createElement('div');
    header.className = 'autoref-header';
    const title = document.createElement('div');
    title.className = 'autoref-header-title';

    let logoMarkup = '<span>⚡</span>';
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        const logoSrc = chrome.runtime.getURL('icons/icon32.png');
        if (logoSrc) {
          logoMarkup = `<img src="${logoSrc}" class="autoref-logo" alt="AutoRef Logo" />`;
        }
      }
    } catch (_) {}

    title.innerHTML = `${logoMarkup}<span>AutoRef</span><span class="autoref-badge">Review Queue</span>`;

    const statusContainer = document.createElement('div');
    statusContainer.className = 'autoref-status-container';

    const orbSlot = document.createElement('div');
    orbSlot.id = 'autoref-header-orb';
    orbSlot.className = 'autoref-header-orb';

    const statusTag = document.createElement('div');
    statusTag.className = 'autoref-status-tag';
    statusTag.id = 'autoref-status-text';
    statusTag.textContent = status;

    statusContainer.appendChild(orbSlot);
    statusContainer.appendChild(statusTag);

    header.appendChild(title);
    header.appendChild(statusContainer);
    card.appendChild(header);

    if (typeof ThinkingOrb !== 'undefined') {
      overlayOrb = ThinkingOrb.mount(orbSlot, { state: 'breathing', size: 20, dark: true });
    }

    // Body
    const body = document.createElement('div');
    body.className = 'autoref-body';

    // Recipient Info
    const recDiv = document.createElement('div');
    recDiv.className = 'autoref-recipient';
    const nameEl = document.createElement('div');
    nameEl.className = 'autoref-recipient-name';
    nameEl.id = 'autoref-recipient-name';
    nameEl.textContent = profile.name || 'Connection';
    const metaEl = document.createElement('div');
    metaEl.className = 'autoref-recipient-meta';
    metaEl.id = 'autoref-recipient-meta';
    const rolePart = profile.role ? profile.role : '';
    const companyPart = profile.company ? ' at ' + profile.company : '';
    metaEl.textContent = rolePart + companyPart || 'LinkedIn Connection';
    recDiv.appendChild(nameEl);
    recDiv.appendChild(metaEl);
    body.appendChild(recDiv);

    // Draft Textarea + Word Count
    const draftContainer = document.createElement('div');
    draftContainer.className = 'autoref-draft-container';
    const draftHeader = document.createElement('div');
    draftHeader.className = 'autoref-draft-header';
    const draftLabel = document.createElement('span');
    draftLabel.className = 'autoref-draft-label';
    draftLabel.textContent = 'Message Draft:';
    const wordCountBadge = document.createElement('span');
    wordCountBadge.className = 'autoref-word-count';
    wordCountBadge.id = 'autoref-word-count';
    wordCountBadge.textContent = countWords(draft) + ' words';
    draftHeader.appendChild(draftLabel);
    draftHeader.appendChild(wordCountBadge);
    draftContainer.appendChild(draftHeader);

    const textarea = document.createElement('textarea');
    textarea.className = 'autoref-draft-textarea';
    textarea.id = 'autoref-draft-input';
    textarea.value = draft;
    textarea.placeholder = 'Draft your referral reachout message here...';
    textarea.addEventListener('input', () => {
      wordCountBadge.textContent = countWords(textarea.value) + ' words';
    });
    draftContainer.appendChild(textarea);
    body.appendChild(draftContainer);

    // Action Buttons
    const actions = document.createElement('div');
    actions.className = 'autoref-actions';

    const btnApprove = document.createElement('button');
    btnApprove.type = 'button';
    btnApprove.className = 'autoref-btn autoref-btn-approve';
    btnApprove.id = 'autoref-btn-approve';
    btnApprove.textContent = 'Approve & Send';
    btnApprove.addEventListener('click', async () => {
      setBusy(true, 'Approving & Sending...');
      if (typeof opts.onApprove === 'function') {
        await opts.onApprove(textarea.value);
      }
    });

    const btnRegen = document.createElement('button');
    btnRegen.type = 'button';
    btnRegen.className = 'autoref-btn autoref-btn-regenerate';
    btnRegen.id = 'autoref-btn-regenerate';
    btnRegen.textContent = 'Regenerate';
    btnRegen.addEventListener('click', async () => {
      setBusy(true, 'Regenerating AI draft...');
      if (typeof opts.onRegenerate === 'function') {
        try {
          const fresh = await opts.onRegenerate();
          if (fresh) updateDraft(fresh);
        } catch (_) {}
      }
      setBusy(false);
    });

    const btnSkip = document.createElement('button');
    btnSkip.type = 'button';
    btnSkip.className = 'autoref-btn autoref-btn-skip';
    btnSkip.id = 'autoref-btn-skip';
    btnSkip.textContent = 'Skip';
    btnSkip.addEventListener('click', async () => {
      setBusy(true, 'Skipping profile...');
      if (typeof opts.onSkip === 'function') {
        await opts.onSkip();
      }
    });

    actions.appendChild(btnApprove);
    actions.appendChild(btnRegen);
    actions.appendChild(btnSkip);
    body.appendChild(actions);

    // Countdown container (hidden initially)
    const countdownDiv = document.createElement('div');
    countdownDiv.className = 'autoref-countdown-section';
    countdownDiv.id = 'autoref-countdown-section';
    countdownDiv.style.display = 'none';
    const cdText = document.createElement('span');
    cdText.className = 'autoref-countdown-text';
    cdText.id = 'autoref-countdown-text';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'autoref-btn-skip-delay';
    skipBtn.id = 'autoref-btn-skip-delay';
    skipBtn.textContent = 'Skip Delay';
    countdownDiv.appendChild(cdText);
    countdownDiv.appendChild(skipBtn);
    body.appendChild(countdownDiv);

    card.appendChild(body);
    document.body.appendChild(card);
    currentCard = card;

    positionAboveCompose(card);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => positionAboveCompose(card));
    }

    return card;
  }

  function getDraftText() {
    const ta = document.getElementById('autoref-draft-input');
    return ta ? ta.value : '';
  }

  function updateDraft(newText) {
    const ta = document.getElementById('autoref-draft-input');
    const wc = document.getElementById('autoref-word-count');
    if (ta) {
      ta.value = String(newText || '');
      if (wc) wc.textContent = countWords(ta.value) + ' words';
    }
  }

  function setStatus(text) {
    const el = document.getElementById('autoref-status-text');
    if (el) el.textContent = String(text || '');
  }

  function setBusy(isBusy, message) {
    const card = currentCard || document.getElementById(WIDGET_ID);
    if (!card) return;
    const btns = card.querySelectorAll('button, textarea');
    btns.forEach((b) => (b.disabled = !!isBusy));
    if (message) setStatus(message);
    if (overlayOrb) {
      if (isBusy) {
        overlayOrb.update({ state: 'composing', paused: false });
      } else {
        overlayOrb.update({ state: 'breathing', paused: false });
      }
    }
  }

  function ensureCountdownSection() {
    if (typeof document === 'undefined') return null;
    let section = document.getElementById('autoref-countdown-section');
    if (section) return section;

    let card = document.getElementById(WIDGET_ID);
    if (!card) {
      card = render({
        profile: { name: 'Safety Guard Pacing', role: 'LinkedIn Automation', company: 'AutoRef' },
        draft: '',
        status: 'Active Pacing',
      });
      if (card) {
        const draftContainer = card.querySelector ? card.querySelector('.autoref-draft-container') : null;
        if (draftContainer) draftContainer.style.display = 'none';
        const actions = card.querySelector ? card.querySelector('.autoref-actions') : null;
        if (actions) actions.style.display = 'none';
        const rec = card.querySelector ? card.querySelector('.autoref-recipient') : null;
        if (rec) rec.style.display = 'none';
      }
    }
    return document.getElementById('autoref-countdown-section');
  }

  function showCountdown(durationSec, labelTemplate, onSkip) {
    let section = ensureCountdownSection();
    let textEl = typeof document !== 'undefined' ? document.getElementById('autoref-countdown-text') : null;
    let skipBtn = typeof document !== 'undefined' ? document.getElementById('autoref-btn-skip-delay') : null;

    if (overlayOrb) {
      overlayOrb.update({ state: 'searching', paused: false });
    }

    if (!section || !textEl) {
      // If DOM unavailable (e.g. headless / stubbed test environment), resolve safely without hanging
      setTimeout(() => {
        if (typeof onSkip === 'function') onSkip();
      }, Math.min(Math.max(0, (durationSec || 0) * 1000), 50));
      return;
    }

    if (activeCountdownTimer) {
      clearInterval(activeCountdownTimer);
      activeCountdownTimer = null;
    }

    section.style.display = 'flex';
    let remaining = Math.max(0, Math.round(durationSec));

    const update = () => {
      const tmpl = labelTemplate || '⏱️ Next profile in {time}';
      textEl.textContent = tmpl.replace('{time}', formatTime(remaining));
    };
    update();

    let finished = false;
    let backupTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (overlayOrb) {
        overlayOrb.update({ state: 'breathing', paused: false });
      }
      if (activeCountdownTimer) {
        clearInterval(activeCountdownTimer);
        activeCountdownTimer = null;
      }
      if (backupTimer) {
        clearTimeout(backupTimer);
        backupTimer = null;
      }
      section.style.display = 'none';
      if (typeof onSkip === 'function') onSkip();
    };

    if (skipBtn) {
      skipBtn.onclick = finish;
    }

    if (remaining <= 0) {
      finish();
      return;
    }

    backupTimer = setTimeout(finish, Math.max(10, remaining * 1000));

    activeCountdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        finish();
      } else {
        update();
      }
    }, 1000);
  }

  function runCountdown(durationSec, labelTemplate, skipBtnText) {
    return new Promise((resolve) => {
      ensureCountdownSection();
      const skipBtn = typeof document !== 'undefined' ? document.getElementById('autoref-btn-skip-delay') : null;
      if (skipBtn && skipBtnText) skipBtn.textContent = skipBtnText;
      showCountdown(durationSec, labelTemplate, resolve);
    });
  }

  function remove() {
    if (overlayOrb) {
      overlayOrb.destroy();
      overlayOrb = null;
    }
    if (activeCountdownTimer) {
      clearInterval(activeCountdownTimer);
      activeCountdownTimer = null;
    }
    const card = document.getElementById(WIDGET_ID);
    if (card && card.parentNode) card.parentNode.removeChild(card);
    currentCard = null;
  }

  function isVisible() {
    return !!document.getElementById(WIDGET_ID);
  }

  // Emergency Halt Visual & Audio Alert
  function showEmergencyAlert(reason, onDismiss) {
    ensureStyles();
    playAlertSound();

    const existing = document.getElementById(EMERGENCY_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const alert = document.createElement('div');
    alert.id = EMERGENCY_ID;

    const title = document.createElement('div');
    title.className = 'autoref-em-title';
    title.innerHTML = '<span>🚨</span><span>AutoRef Emergency Halt</span>';

    const desc = document.createElement('div');
    desc.className = 'autoref-em-desc';
    desc.innerHTML =
      '<strong>Safety Guard Triggered:</strong> ' +
      (reason || 'Verification checkpoint or unusual activity detected.') +
      '<br />AutoRef halted all automation immediately to protect your LinkedIn account. ' +
      'Please solve any challenges manually before restarting.';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'autoref-em-btn';
    btn.textContent = 'Acknowledge & Dismiss';
    btn.addEventListener('click', () => {
      if (alert.parentNode) alert.parentNode.removeChild(alert);
      if (typeof onDismiss === 'function') onDismiss();
    });

    alert.appendChild(title);
    alert.appendChild(desc);
    alert.appendChild(btn);

    (document.body || document.documentElement).appendChild(alert);
    return alert;
  }

  NS.Overlay = {
    render: render,
    remove: remove,
    isVisible: isVisible,
    getDraftText: getDraftText,
    updateDraft: updateDraft,
    setStatus: setStatus,
    setBusy: setBusy,
    setOrbState: setOrbState,
    getOrb: () => overlayOrb,
    countWords: countWords,
    formatTime: formatTime,
    showCountdown: showCountdown,
    runCountdown: runCountdown,
    showEmergencyAlert: showEmergencyAlert,
    playAlertSound: playAlertSound,
    positionAboveCompose: positionAboveCompose,
  };
})();
