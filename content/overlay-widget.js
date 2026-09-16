/* AutoRef content/overlay-widget.js — Apple macOS HIG Frosted Glassmorphism In-Page Overlay.
   Renders directly on webpage above active LinkedIn compose area in mock & live pages.
   Features:
   - Translucent frosted glass island with squircle corners & specular borders
   - Draggable title bar (can be positioned anywhere on screen)
   - Minimize-to-pill mode toggle
   - Recipient info (name, role, company)
   - Editable draft textarea with live word count
   - Spring-animated action buttons with embedded Lucide SVG icons: "Approve & Send", "Regenerate", "Skip"
   - Next-profile delay countdown timer with manual skip
   - Coffee break pacing countdown timer with resume button
   - Emergency halt visual modal + Web Audio alarm on captchas/checkpoints/warnings
   Plain script, shares window.AutoRef namespace. Compatible with headless FakeNode harness. */
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
      width: 390px;
      max-width: calc(100vw - 32px);
      background: rgba(28, 28, 30, 0.88);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      color: #f5f5f7;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      z-index: 2147483647;
      overflow: hidden;
      box-sizing: border-box;
      transition: box-shadow 0.2s ease, width 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease;
      -webkit-font-smoothing: antialiased;
    }
    #${WIDGET_ID}.autoref-minimized {
      width: 290px;
      border-radius: 9999px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    #${WIDGET_ID} * {
      box-sizing: border-box;
    }
    #${WIDGET_ID} .autoref-header {
      background: rgba(255, 255, 255, 0.06);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      color: #ffffff;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      cursor: grab;
      user-select: none;
    }
    #${WIDGET_ID} .autoref-header:active {
      cursor: grabbing;
    }
    #${WIDGET_ID} .autoref-header-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      font-weight: 700;
      letter-spacing: -0.2px;
    }
    #${WIDGET_ID} .autoref-drag-grip {
      color: rgba(255, 255, 255, 0.35);
      display: inline-flex;
      align-items: center;
    }
    #${WIDGET_ID} .autoref-header-title img.autoref-logo {
      width: 20px;
      height: 20px;
      object-fit: contain;
      display: inline-block;
      vertical-align: middle;
      filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3));
    }
    #${WIDGET_ID} .autoref-badge {
      background: rgba(10, 132, 255, 0.25);
      color: #70baff;
      border: 1px solid rgba(10, 132, 255, 0.4);
      font-size: 9.5px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    #${WIDGET_ID} .autoref-header-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #${WIDGET_ID} .autoref-status-container {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 3px 8px;
      border-radius: 9999px;
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
      letter-spacing: -0.1px;
    }
    #${WIDGET_ID} .autoref-btn-minimize {
      cursor: pointer;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f5f5f7;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.18s ease;
      flex-shrink: 0;
    }
    #${WIDGET_ID} .autoref-btn-minimize:hover {
      background: rgba(255, 255, 255, 0.22);
      transform: scale(1.08);
    }
    #${WIDGET_ID} .autoref-body {
      padding: 14px;
    }
    #${WIDGET_ID} .autoref-recipient {
      margin-bottom: 12px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
    }
    #${WIDGET_ID} .autoref-recipient-name {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.2px;
    }
    #${WIDGET_ID} .autoref-recipient-meta {
      font-size: 11.5px;
      color: #98989d;
      margin-top: 2px;
    }
    #${WIDGET_ID} .autoref-draft-container {
      margin-bottom: 12px;
    }
    #${WIDGET_ID} .autoref-draft-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    #${WIDGET_ID} .autoref-draft-label {
      font-weight: 600;
      color: #98989d;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    #${WIDGET_ID} .autoref-word-count {
      font-size: 11px;
      color: #2997ff;
      font-weight: 700;
    }
    #${WIDGET_ID} .autoref-draft-textarea {
      width: 100%;
      min-height: 90px;
      max-height: 180px;
      padding: 10px 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      font-family: inherit;
      font-size: 12.5px;
      line-height: 1.45;
      color: #f5f5f7;
      background: rgba(0, 0, 0, 0.35);
      resize: vertical;
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
    }
    #${WIDGET_ID} .autoref-draft-textarea:focus {
      outline: none;
      border-color: #0a84ff;
      box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.35);
    }
    #${WIDGET_ID} .autoref-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    #${WIDGET_ID} .autoref-btn {
      cursor: pointer;
      font-weight: 600;
      border-radius: 9999px;
      padding: 8px 14px;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid transparent;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }
    #${WIDGET_ID} .autoref-btn:active {
      transform: scale(0.96);
    }
    #${WIDGET_ID} .autoref-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }
    #${WIDGET_ID} .autoref-btn-approve {
      background: linear-gradient(135deg, #2997ff 0%, #0a84ff 100%);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      flex: 1.3;
      box-shadow: 0 4px 14px rgba(10, 132, 255, 0.35);
    }
    #${WIDGET_ID} .autoref-btn-approve:hover:not(:disabled) {
      filter: brightness(1.08);
      box-shadow: 0 6px 20px rgba(10, 132, 255, 0.45);
    }
    #${WIDGET_ID} .autoref-btn-regenerate {
      background: rgba(255, 255, 255, 0.08);
      color: #70baff;
      border: 1px solid rgba(10, 132, 255, 0.3);
      flex: 1;
    }
    #${WIDGET_ID} .autoref-btn-regenerate:hover:not(:disabled) {
      background: rgba(10, 132, 255, 0.15);
    }
    #${WIDGET_ID} .autoref-btn-skip {
      background: rgba(255, 255, 255, 0.06);
      color: #98989d;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    #${WIDGET_ID} .autoref-btn-skip:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
      color: #f5f5f7;
    }
    #${WIDGET_ID} .autoref-countdown-section {
      background: rgba(10, 132, 255, 0.12);
      border: 1px dashed rgba(10, 132, 255, 0.45);
      border-radius: 10px;
      padding: 9px 12px;
      margin-top: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
    }
    #${WIDGET_ID} .autoref-countdown-text {
      color: #70baff;
      font-weight: 600;
    }
    #${WIDGET_ID} .autoref-btn-skip-delay {
      cursor: pointer;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(10, 132, 255, 0.4);
      color: #ffffff;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      transition: all 0.15s ease;
    }
    #${WIDGET_ID} .autoref-btn-skip-delay:hover {
      background: #0a84ff;
    }

    /* Emergency Alert Modal */
    #${EMERGENCY_ID} {
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      width: 520px;
      max-width: calc(100vw - 32px);
      background: rgba(36, 12, 14, 0.94);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      color: #ff453a;
      border: 2px solid #ff453a;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(255, 69, 58, 0.4);
      z-index: 2147483647;
      padding: 18px 22px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      animation: autoref-pulse 1.8s infinite;
      box-sizing: border-box;
    }
    @keyframes autoref-pulse {
      0% { box-shadow: 0 0 0 0 rgba(255, 69, 58, 0.5); }
      70% { box-shadow: 0 0 0 16px rgba(255, 69, 58, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 69, 58, 0); }
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
      color: #ffb4af;
      line-height: 1.45;
      margin-bottom: 14px;
    }
    #${EMERGENCY_ID} .autoref-em-btn {
      cursor: pointer;
      background: #ff453a;
      color: #ffffff;
      border: none;
      border-radius: 9999px;
      padding: 8px 16px;
      font-weight: 700;
      font-size: 13px;
      transition: all 0.15s ease;
    }
    #${EMERGENCY_ID} .autoref-em-btn:hover {
      background: #ff6961;
      box-shadow: 0 4px 14px rgba(255, 69, 58, 0.4);
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

  let hasBeenDragged = false;

  function positionAboveCompose(card) {
    if (!card || hasBeenDragged || typeof card.getBoundingClientRect !== 'function') return;
    card.style.left = 'auto';
    card.style.top = 'auto';
    try {
      const compose = NS.findComposeBox ? NS.findComposeBox() : null;
      if (compose && typeof compose.getBoundingClientRect === 'function') {
        const rect = compose.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0)) {
          const cardHeight = card.offsetHeight || 300;
          const spaceAbove = rect.top;
          if (spaceAbove >= cardHeight + 16) {
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
  let isMinimized = false;

  function setOrbState(state) {
    if (overlayOrb && typeof ThinkingOrb !== 'undefined') {
      overlayOrb.update({ state: state, paused: false, dark: true });
    }
  }

  // Draggable logic for window positioning
  function attachDragHandler(card, handle) {
    if (!card || !handle) return;
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    const onMouseDown = (e) => {
      if (!e) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA' || (e.target.closest && e.target.closest('button')))) {
        return;
      }
      if (typeof e.preventDefault === 'function') e.preventDefault();
      isDragging = true;
      startX = e.clientX || 0;
      startY = e.clientY || 0;

      const rect = card.getBoundingClientRect ? card.getBoundingClientRect() : { left: 100, top: 100 };
      initialLeft = rect.left;
      initialTop = rect.top;

      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    };

    const onMouseMove = (e) => {
      if (!isDragging || !e) return;
      hasBeenDragged = true;
      const dx = (e.clientX || 0) - startX;
      const dy = (e.clientY || 0) - startY;

      card.style.bottom = 'auto';
      card.style.right = 'auto';

      const maxW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const maxH = typeof window !== 'undefined' ? window.innerHeight : 800;
      const cardW = card.offsetWidth || 390;
      const cardH = card.offsetHeight || 200;

      const newLeft = Math.max(8, Math.min(maxW - cardW - 8, initialLeft + dx));
      const newTop = Math.max(8, Math.min(maxH - cardH - 8, initialTop + dy));

      card.style.left = newLeft + 'px';
      card.style.top = newTop + 'px';
    };

    const onMouseUp = () => {
      isDragging = false;
      if (typeof document !== 'undefined' && document.removeEventListener) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }
    };

    handle.addEventListener('mousedown', onMouseDown);
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

    const gripIcon = `<span class="autoref-drag-grip"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="15" cy="15" r="1"/></svg></span>`;

    title.innerHTML = `${gripIcon}${logoMarkup}<span>AutoRef</span><span class="autoref-badge">Review Queue</span>`;

    const controls = document.createElement('div');
    controls.className = 'autoref-header-controls';

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

    // Minimize / Expand Pill Mode Button
    const btnMin = document.createElement('button');
    btnMin.type = 'button';
    btnMin.className = 'autoref-btn-minimize';
    btnMin.title = 'Minimize / Expand';
    btnMin.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" x2="19" y1="12" y2="12"/></svg>`;

    controls.appendChild(statusContainer);
    controls.appendChild(btnMin);

    header.appendChild(title);
    header.appendChild(controls);
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

    // Draft Textarea + Live Word Count
    const draftContainer = document.createElement('div');
    draftContainer.className = 'autoref-draft-container';
    const draftHeader = document.createElement('div');
    draftHeader.className = 'autoref-draft-header';
    const draftLabel = document.createElement('span');
    draftLabel.className = 'autoref-draft-label';
    draftLabel.textContent = 'Message Draft';
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

    // Spring-Animated Action Buttons with Embedded Lucide SVGs
    const actions = document.createElement('div');
    actions.className = 'autoref-actions';

    const btnApprove = document.createElement('button');
    btnApprove.type = 'button';
    btnApprove.className = 'autoref-btn autoref-btn-approve';
    btnApprove.id = 'autoref-btn-approve';
    btnApprove.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg><span>Approve &amp; Send</span>`;
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
    btnRegen.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg><span>Regenerate</span>`;
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
    btnSkip.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg><span>Skip</span>`;
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

    // Minimize toggle click
    btnMin.addEventListener('click', (e) => {
      e.stopPropagation();
      isMinimized = !isMinimized;
      if (isMinimized) {
        body.style.display = 'none';
        if (card.classList) card.classList.add('autoref-minimized');
        else card.className = (card.className + ' autoref-minimized').trim();
        btnMin.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>`;
      } else {
        body.style.display = '';
        if (card.classList) card.classList.remove('autoref-minimized');
        else card.className = card.className.replace(/\s*autoref-minimized\b/, '');
        btnMin.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" x2="19" y1="12" y2="12"/></svg>`;
      }
    });

    // Attach dragging to header
    attachDragHandler(card, header);

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
    let btns = [];
    try {
      btns = Array.from(card.querySelectorAll('button, textarea'));
    } catch (_) {
      try {
        btns = (card.querySelectorAll('button') || []).concat(card.querySelectorAll('textarea') || []);
      } catch (_) {}
    }
    const ta = document.getElementById('autoref-draft-input');
    if (ta) ta.disabled = !!isBusy;
    btns.forEach((b) => (b.disabled = !!isBusy));
    if (message) setStatus(message);
    if (overlayOrb) {
      if (isBusy) {
        overlayOrb.update({ state: 'composing', paused: false, dark: true });
      } else {
        overlayOrb.update({ state: 'breathing', paused: false, dark: true });
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
      overlayOrb.update({ state: 'searching', paused: false, dark: true });
    }

    if (!section || !textEl) {
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
    const prevStatus = (document.getElementById('autoref-status-text') || {}).textContent || '';

    const update = () => {
      const tmpl = labelTemplate || '⏱️ Next profile in {time}';
      const formatted = tmpl.replace('{time}', formatTime(remaining));
      textEl.textContent = formatted;
      if (isMinimized) {
        setStatus(formatted);
      }
    };
    update();

    let finished = false;
    let backupTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (isMinimized && prevStatus) {
        setStatus(prevStatus);
      }
      if (overlayOrb) {
        overlayOrb.update({ state: 'breathing', paused: false, dark: true });
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
    isMinimized = false;
    hasBeenDragged = false;
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
