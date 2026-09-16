/* AutoRef content/selectors.js — SINGLE SOURCE OF TRUTH for all LinkedIn CSS selectors.
   Plain script, shares window.AutoRef namespace. No other file may hardcode selectors.
   LIVE = real LinkedIn (aria-label / data-testid anchored, UNVERIFIED — see P11).
   MOCK = test/mock-linkedin pages. Toggle via settings.mockMode. */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  const SELECTORS = {
    LIVE: {
      // Connections search results page
      searchResultItem: 'div[data-testid="search-result"], li.reusable-search__result-container',
      searchResultLink: 'a.app-aware-link[href*="/in/"]',
      searchResultName: '.entity-result__title-text span[aria-hidden="true"]',
      searchResultHeadline: '.entity-result__primary-subtitle',
      searchScroller: 'main',
      // Profile page
      profileName: 'h1',
      profileHeadline: '.text-body-medium.break-words',
      messageButton: 'button[aria-label^="Message"]',
      // Messaging overlay / thread
      threadContainer: 'div.msg-thread, div[data-testid="msg-thread"]',
      threadBubble: 'li.msg-s-message-list__event p, div.msg-s-event-listitem__body',
      composeBox: 'div[role="textbox"][contenteditable="true"], div.msg-form__contenteditable[contenteditable="true"]',
      sendButton: 'button[aria-label="Send now"], button.msg-form__send-button',
      // Safety / abort detection
      captcha: 'iframe[aria-label*="captcha" i], div#captcha-internal, form#captcha-challenge',
      activityWarning: 'div[data-testid="unusual-activity"], .artdeco-global-alert--error',
    },
    MOCK: {
      searchResultItem: '.mock-connection',
      searchResultLink: 'a.mock-connection-link',
      searchResultName: '.mock-connection-name',
      searchResultHeadline: '.mock-connection-headline',
      searchScroller: '#mock-scroll-container',
      profileName: '#mock-profile-name',
      profileHeadline: '#mock-profile-headline',
      messageButton: '#mock-message-btn, [aria-label="Message"]',
      threadContainer: '#mock-thread',
      threadBubble: '.mock-bubble',
      composeBox: '#mock-compose[contenteditable="true"], div[role="textbox"][contenteditable="true"]',
      sendButton: '#mock-send, [aria-label="Send now"]',
      captcha: '#mock-captcha',
      activityWarning: '#mock-activity-warning',
    },
  };

  // Cached mockMode flag; refreshed by main.js on startup. Defaults to MOCK-safe read.
  let _mockMode = false;
  function setMockMode(v) {
    _mockMode = !!v;
  }
  function S() {
    return _mockMode ? SELECTORS.MOCK : SELECTORS.LIVE;
  }

  function safeQuery(scope, selector) {
    try {
      return (scope || document).querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  function safeQueryAll(scope, selector) {
    try {
      const s = scope || document;
      return s.querySelectorAll ? Array.from(s.querySelectorAll(selector)) : [];
    } catch (_) {
      return [];
    }
  }

  // Locates the active message container:
  // Supports both bottom-right docked chat window and modal popup dialog.
  function findActiveMessageContainer(doc) {
    const root = doc || document;
    // 1. Docked chat window in bottom-right corner
    const docked =
      safeQuery(root, '.msg-overlay-conversation-bubble--is-active') ||
      safeQuery(root, '.msg-overlay-conversation-bubble') ||
      safeQuery(root, '.msg-convo-wrapper') ||
      safeQuery(root, 'aside.msg-overlay-container');
    if (docked) return docked;

    // 2. Modal popup dialog
    const modal =
      safeQuery(root, 'div[role="dialog"][aria-label*="message" i]') ||
      safeQuery(root, 'div.artdeco-modal[role="dialog"]') ||
      safeQuery(root, 'div[role="dialog"]') ||
      safeQuery(root, 'div.msg-modal');
    if (modal) return modal;

    // 3. Mock LinkedIn thread container
    const mock = safeQuery(root, '#mock-thread');
    if (mock) return mock.parentElement || mock;

    return null;
  }

  // Multi-Tiered Compose Box Resolver:
  // Tier 1: ARIA labels and data-testid attributes
  // Tier 2: Visible text & placeholder matching
  // Tier 3: Contextual contenteditable inside active message container
  function findComposeBox(scope) {
    const root = scope || document;
    if (_mockMode) {
      const mockBox = safeQuery(root, SELECTORS.MOCK.composeBox);
      if (mockBox) return mockBox;
    }

    // Tier 1: ARIA labels & data-testid
    const t1 =
      safeQuery(root, 'div[role="textbox"][contenteditable="true"][aria-label*="message" i]') ||
      safeQuery(root, 'div[role="textbox"][contenteditable="true"]') ||
      safeQuery(root, '[data-testid*="compose" i][contenteditable="true"]') ||
      safeQuery(root, '[data-testid*="msg-form" i] [contenteditable="true"]') ||
      safeQuery(root, 'div.msg-form__contenteditable[contenteditable="true"]');
    if (t1) return t1;

    // Tier 2: Visible text & placeholder attributes
    const t2 =
      safeQuery(root, '[data-placeholder*="message" i][contenteditable="true"]') ||
      safeQuery(root, '[aria-placeholder*="message" i][contenteditable="true"]') ||
      safeQuery(root, 'p[data-placeholder*="Write a message" i]');
    if (t2) return t2;

    // Tier 3: Contextual contenteditable inside active message container (docked or modal)
    const container = findActiveMessageContainer(root);
    if (container) {
      const t3 =
        safeQuery(container, '[contenteditable="true"]') ||
        safeQuery(container, 'textarea') ||
        safeQuery(container, 'div[role="textbox"]');
      if (t3) return t3;
    }

    return safeQuery(root, S().composeBox);
  }

  // Multi-Tiered Send Button Resolver:
  // Tier 1: ARIA labels and data-testid attributes
  // Tier 2: Visible text & SVG iconography matching
  // Tier 3: Contextual primary action inside active message container
  function findSendButton(scope) {
    const root = scope || document;
    if (_mockMode) {
      const mockBtn = safeQuery(root, SELECTORS.MOCK.sendButton);
      if (mockBtn) return mockBtn;
    }

    // Tier 1: ARIA labels & data-testid
    const t1 =
      safeQuery(root, 'button[aria-label="Send now"]') ||
      safeQuery(root, 'button[aria-label*="Send" i]') ||
      safeQuery(root, 'button[data-testid*="send" i]') ||
      safeQuery(root, 'button.msg-form__send-button');
    if (t1) return t1;

    // Tier 2: Visible text & SVG iconography
    const buttons = safeQueryAll(root, 'button');
    for (const b of buttons) {
      const text = (b.innerText || b.textContent || '').trim();
      if (/^send$/i.test(text)) return b;
      if (safeQuery(b, 'svg[data-test-icon*="send" i]')) return b;
      const aria = (b.getAttribute && b.getAttribute('aria-label')) || '';
      if (/send/i.test(aria)) return b;
    }

    // Tier 3: Contextual button inside active container
    const container = findActiveMessageContainer(root);
    if (container) {
      const t3 =
        safeQuery(container, '.msg-form__right-actions button:not([disabled])') ||
        safeQuery(container, 'footer button[type="submit"]') ||
        safeQuery(container, 'footer button.artdeco-button--primary');
      if (t3) return t3;
    }

    return safeQuery(root, S().sendButton);
  }

  // Multi-Tiered Message Button Resolver (on profile page):
  // Tier 1: ARIA labels and data-testid attributes
  // Tier 2: Visible text & SVG iconography matching
  // Tier 3: Contextual actions in profile header
  function findMessageButton(scope) {
    const root = scope || document;
    if (_mockMode) {
      const mockBtn = safeQuery(root, SELECTORS.MOCK.messageButton);
      if (mockBtn) return mockBtn;
    }

    // Tier 1: ARIA labels & data-testid
    const t1 =
      safeQuery(root, 'button[aria-label^="Message"]') ||
      safeQuery(root, 'button[aria-label*="Message" i]') ||
      safeQuery(root, 'a[aria-label*="Message" i]') ||
      safeQuery(root, 'button[data-testid*="message" i]');
    if (t1) return t1;

    // Tier 2: Visible text & SVG iconography
    const candidates = safeQueryAll(root, 'button, a.artdeco-button');
    for (const c of candidates) {
      const text = (c.innerText || c.textContent || '').trim();
      if (/^message$/i.test(text)) return c;
      if (safeQuery(c, 'svg[data-test-icon="send-privately-small"]') || safeQuery(c, 'li-icon[type="send-privately"]')) {
        return c;
      }
    }

    // Tier 3: Contextual CTA in profile top card
    const t3 =
      safeQuery(root, '.pv-top-card-v2-ctas button') ||
      safeQuery(root, '.pvs-profile-actions button');
    if (t3) return t3;

    return safeQuery(root, S().messageButton);
  }

  NS.SELECTORS = SELECTORS;
  NS.S = S;
  NS.setMockMode = setMockMode;
  NS.findActiveMessageContainer = findActiveMessageContainer;
  NS.findComposeBox = findComposeBox;
  NS.findSendButton = findSendButton;
  NS.findMessageButton = findMessageButton;
})();
