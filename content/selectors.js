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

  NS.SELECTORS = SELECTORS;
  NS.S = S;
  NS.setMockMode = setMockMode;
})();
