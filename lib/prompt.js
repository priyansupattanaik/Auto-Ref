/* AutoRef lib/prompt.js — plain script, shares window.AutoRef namespace. No imports. */
(function () {
  'use strict';
  const NS = (window.AutoRef = window.AutoRef || {});

  const SYSTEM_PROMPT = `You write short LinkedIn referral-request messages for a real human.
Rules:
- Max 90 words. Warm, professional, specific. Never salesy, no emojis, no hashtags.
- Naturally mention the recipient's role and company.
- Weave in the sender's background and custom note where relevant.
- Every message must be uniquely worded; never use template-sounding phrases like "I hope this message finds you well".
- Output ONLY valid JSON: {"message": "<the message text>"}`;

  const TONE_LINES = {
    formal: 'Style: formal and respectful, complete sentences, no contractions.',
    friendly: 'Style: warm, friendly and conversational while staying professional.',
    concise: 'Style: brief and to the point, under 60 words, no small talk.',
  };

  function buildUserPrompt(profile, settings) {
    const p = profile || {};
    const s = settings || {};
    const toneKey = String(s.tone || 'friendly').toLowerCase();
    const toneLine = TONE_LINES[toneKey] || TONE_LINES.friendly;
    const lines = [
      'Recipient: ' + (p.name || 'unknown'),
      'Role: ' + (p.role || 'unknown'),
      'Company: ' + (p.company || 'unknown'),
      'Profile: ' + (p.profileUrl || 'unknown'),
      'Sender background: ' + (s.aboutMe || '(not provided)'),
      'Custom note to weave in: ' + (s.customNote || '(none)'),
      'Target role context: ' + ((s.targetRoles || []).join(', ') || '(general)'),
      toneLine,
      'Write the referral-request message JSON now.',
    ];
    return lines.join('\n');
  }

  NS.SYSTEM_PROMPT = SYSTEM_PROMPT;
  NS.TONE_LINES = TONE_LINES;
  NS.buildUserPrompt = buildUserPrompt;
})();
