/* AutoRef content/scrapers.js — plain script, window.AutoRef namespace. No imports.
   P3 queue scraper (mock + live) + P4 profile extraction and match helpers.
   All DOM access uses selectors from selectors.js via S(). */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  const LIVE_SEARCH_URL =
    'https://www.linkedin.com/search/results/people/?network=%5B%22U%22%5D&origin=GLOBAL_SEARCH_HEADER';
  const MAX_QUEUE = 500;

  function slugFromProfileUrl(url) {
    const m = String(url || '').match(/\/in\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]).replace(/\/$/, '') : '';
  }

  function urnFromMockUrl(url) {
    try {
      const u = new URL(String(url || ''), 'http://localhost/');
      return u.searchParams.get('urn') || '';
    } catch (e) {
      return '';
    }
  }

  // "Senior SWE at Acme" / "Designer @ Foo" / "PM - Bar" / "Dev · Baz" / "Lead | Corp"
  function parseHeadline(headline) {
    const h = String(headline || '').trim();
    if (!h) return { role: '', company: '' };
    const seps = [' at ', ' @ ', ' - ', ' · ', ' | ', ' — ', ' – '];
    const lower = h.toLowerCase();
    for (const s of seps) {
      const i = lower.lastIndexOf(s);
      if (i > 0 && i + s.length < h.length) {
        return { role: h.slice(0, i).trim(), company: h.slice(i + s.length).trim() };
      }
    }
    return { role: h, company: '' };
  }

  function textOf(root, sel) {
    if (!root) return '';
    const el = root.querySelector(sel);
    return el ? (el.innerText || el.textContent || '').trim() : '';
  }

  function collectConnectionsFromDOM() {
    const S = NS.S();
    const nodes = Array.from(document.querySelectorAll(S.searchResultItem));
    const out = [];
    const seen = new Set();
    for (const n of nodes) {
      let urn = '';
      let profileUrl = '';
      let name = '';
      let headline = '';
      if (n.hasAttribute && n.hasAttribute('data-urn')) {
        // MOCK card
        urn = n.getAttribute('data-urn') || '';
        name = n.getAttribute('data-name') || textOf(n, S.searchResultName);
        headline = n.getAttribute('data-headline') || textOf(n, S.searchResultHeadline);
        const a = n.querySelector(S.searchResultLink);
        if (a && a.href) profileUrl = a.href;
      } else {
        // LIVE card
        const a = n.querySelector(S.searchResultLink);
        if (a && a.href) {
          profileUrl = a.href;
          urn = slugFromProfileUrl(a.href);
        }
        name = textOf(n, S.searchResultName) || textOf(a, 'span');
        headline = textOf(n, S.searchResultHeadline);
      }
      if (!urn || seen.has(urn)) continue;
      seen.add(urn);
      const parsed = parseHeadline(headline);
      out.push({
        urn: urn,
        profileUrl: profileUrl,
        name: name,
        role: parsed.role,
        company: parsed.company,
        status: 'pending',
        reason: '',
      });
    }
    return out;
  }

  function sleepMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function scrollAndCollect(maxStable) {
    const S = NS.S();
    const stableNeed = maxStable || 3;
    let scroller = document.querySelector(S.searchScroller);
    if (!scroller && S.searchScroller === 'main') scroller = document.scrollingElement;
    let last = -1;
    let stable = 0;
    for (let i = 0; i < 40; i++) {
      const items = collectConnectionsFromDOM();
      if (items.length === last) stable++;
      else stable = 0;
      last = items.length;
      if (stable >= stableNeed) break;
      try {
        if (scroller && scroller !== document.scrollingElement) scroller.scrollTop = scroller.scrollHeight;
        else window.scrollTo(0, document.body.scrollHeight);
      } catch (e) {
        /* ignore */
      }
      await sleepMs(700);
    }
    return collectConnectionsFromDOM();
  }

  // P3: scrape the connections/search page into raw items (dedupe by urn).
  async function scrapeConnectionsList() {
    try {
      const items = await scrollAndCollect(3);
      return { ok: true, items: items };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  }

  // Merge scraped items into the stored queue: preserve existing entries,
  // backfill already-messaged urns as skipped, cap at MAX_QUEUE.
  async function buildQueue(items, sentLog) {
    const stored = await NS.getQueue();
    const byUrn = new Map(stored.map((q) => [q.urn, q]));
    let added = 0;
    let skippedKnown = 0;
    for (const it of items || []) {
      if (!it.urn || byUrn.has(it.urn)) continue;
      if (stored.length + added >= MAX_QUEUE) break;
      if (sentLog && sentLog[it.urn]) {
        byUrn.set(it.urn, Object.assign({}, it, { status: 'skipped', reason: 'already messaged' }));
        skippedKnown++;
      } else {
        byUrn.set(it.urn, Object.assign({}, it, { status: 'pending', reason: '' }));
        added++;
      }
    }
    const queue = Array.from(byUrn.values()).slice(0, MAX_QUEUE);
    await NS.setQueue(queue);
    return { ok: true, added: added, skippedKnown: skippedKnown, total: queue.length };
  }

  // P4: extract profile info from an open profile page (mock or live DOM).
  function extractProfileInfo() {
    const S = NS.S();
    const href = location.href;
    let urn = urnFromMockUrl(href) || slugFromProfileUrl(href);
    const nameEl = document.querySelector(S.profileName);
    const hlEl = document.querySelector(S.profileHeadline);
    const name = nameEl ? (nameEl.innerText || nameEl.textContent || '').trim() : '';
    const headline = hlEl ? (hlEl.innerText || hlEl.textContent || '').trim() : '';
    const parsed = parseHeadline(headline);
    if (!urn) return { ok: false, reason: 'no urn on profile page' };
    if (!name) return { ok: false, reason: 'no name on profile page' };
    return {
      ok: true,
      urn: urn,
      profileUrl: href,
      name: name,
      role: parsed.role,
      company: parsed.company,
    };
  }

  const norm = (s) => String(s || '').trim().toLowerCase();

  // P4: target match — empty target lists match everything.
  function matchesTarget(profile, settings) {
    const p = profile || {};
    const s = settings || {};
    const companies = Array.isArray(s.targetCompanies) ? s.targetCompanies : [];
    const roles = Array.isArray(s.targetRoles) ? s.targetRoles : [];
    if (companies.length && !companies.some((c) => norm(p.company) === norm(c))) return false;
    if (roles.length && !roles.some((r) => norm(p.role).indexOf(norm(r)) !== -1)) return false;
    return true;
  }

  // P4: blacklist check at queue-walk time. Returns '' or 'profile' | 'company'.
  function blacklistHit(item, settings) {
    const it = item || {};
    const s = settings || {};
    const profs = Array.isArray(s.blacklistProfiles) ? s.blacklistProfiles : [];
    const cos = Array.isArray(s.blacklistCompanies) ? s.blacklistCompanies : [];
    if (profs.some((p) => (it.urn && norm(p) === norm(it.urn)) || (it.name && norm(p) === norm(it.name)))) {
      return 'profile';
    }
    if (cos.some((c) => c && it.company && norm(it.company).indexOf(norm(c)) !== -1)) return 'company';
    return '';
  }

  NS.LIVE_SEARCH_URL = LIVE_SEARCH_URL;
  NS.MAX_QUEUE = MAX_QUEUE;
  NS.slugFromProfileUrl = slugFromProfileUrl;
  NS.urnFromMockUrl = urnFromMockUrl;
  NS.parseHeadline = parseHeadline;
  NS.collectConnectionsFromDOM = collectConnectionsFromDOM;
  NS.scrollAndCollect = scrollAndCollect;
  NS.scrapeConnectionsList = scrapeConnectionsList;
  NS.buildQueue = buildQueue;
  NS.extractProfileInfo = extractProfileInfo;
  NS.matchesTarget = matchesTarget;
  NS.blacklistHit = blacklistHit;
})();
