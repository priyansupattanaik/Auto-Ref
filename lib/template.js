/* AutoRef lib/template.js — plain script, shares window.AutoRef namespace. No imports. */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  // Replaces {{var}} / {{ var }} tokens. Missing keys -> empty string.
  function renderTemplate(template, vars) {
    const tpl = String(template == null ? '' : template);
    const v = vars && typeof vars === 'object' ? vars : {};
    return tpl.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, key) => {
      const val = v[key];
      return val === undefined || val === null ? '' : String(val);
    }).replace(/[ \t]{2,}/g, ' ').replace(/\s+\./g, '.').trim();
  }

  function templateVarsFor(profile, settings) {
    const p = profile || {};
    const s = settings || {};
    const name = String(p.name || '').trim();
    const firstName = name.split(/\s+/)[0] || '';
    return {
      firstName: firstName,
      name: name,
      role: p.role || '',
      company: p.company || '',
      profileUrl: p.profileUrl || '',
      customNote: s.customNote || '',
      aboutMe: s.aboutMe || '',
      tone: s.tone || 'friendly',
    };
  }

  NS.renderTemplate = renderTemplate;
  NS.templateVarsFor = templateVarsFor;
})();
