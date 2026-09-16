/* AutoRef server.js — Local companion server for AutoRef Chrome extension.
   Loads API key and agent model from .env file.
   Zero external npm dependencies required (runs on standard Node.js). */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_PORT = 8787;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_MODEL = 'nvidia/llama-3.1-nemotron-70b-instruct';
export const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

export function loadEnv(envPath = path.join(__dirname, '.env')) {
  if (fs.existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      }
    } catch (_) {
      /* Fall back to manual parser */
    }
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        }
      }
    } catch (e) {
      console.warn('[AutoRef Server] Could not read .env file:', e.message);
    }
  }
}

export function getConfig() {
  loadEnv();
  const apiKey = process.env.API_KEY || process.env.NVIDIA_API_KEY || '';
  const model = process.env.MODEL || DEFAULT_MODEL;
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const host = process.env.HOST || DEFAULT_HOST;
  return { apiKey, model, port, host, hasApiKey: Boolean(apiKey) };
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function createServer(options = {}) {
  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;

    // Health check
    if ((pathname === '/' || pathname === '/api/health') && req.method === 'GET') {
      const config = getConfig();
      sendJson(res, 200, {
        ok: true,
        service: 'auto-ref-server',
        status: 'running',
        model: config.model,
        hasApiKey: config.hasApiKey,
        port: config.port,
      });
      return;
    }

    // Config endpoint for extension sync
    if (pathname === '/api/config' && req.method === 'GET') {
      const config = getConfig();
      sendJson(res, 200, {
        ok: true,
        apiKey: config.apiKey,
        model: config.model,
        hasApiKey: config.hasApiKey,
        port: config.port,
      });
      return;
    }

    // Generate endpoint using .env API key and agent model
    if (pathname === '/api/generate' && req.method === 'POST') {
      let bodyStr = '';
      req.on('data', (chunk) => { bodyStr += chunk; });
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr || '{}');
          const config = getConfig();
          const apiKey = body.apiKey || config.apiKey;
          const model = body.model || config.model;

          if (!apiKey) {
            sendJson(res, 400, {
              ok: false,
              source: 'fallback',
              reason: 'No API key configured in .env file',
            });
            return;
          }

          const profile = body.profile || {};
          const settings = body.settings || {};
          const tone = String(settings.tone || 'friendly').toLowerCase();

          const toneDescriptions = {
            formal: 'Style: formal and respectful, complete sentences, no contractions.',
            friendly: 'Style: warm, friendly and conversational while staying professional.',
            concise: 'Style: brief and to the point, under 60 words, no small talk.',
          };
          const toneLine = toneDescriptions[tone] || toneDescriptions.friendly;

          const prompt = [
            'Recipient: ' + (profile.name || 'unknown'),
            'Role: ' + (profile.role || 'unknown'),
            'Company: ' + (profile.company || 'unknown'),
            'Profile: ' + (profile.profileUrl || 'unknown'),
            'Sender background: ' + (settings.aboutMe || '(not provided)'),
            'Custom note to weave in: ' + (settings.customNote || '(none)'),
            'Target role context: ' + ((settings.targetRoles || []).join(', ') || '(general)'),
            toneLine,
            'Write the referral-request message JSON now.',
          ].join('\n');

          const systemPrompt = `You write short LinkedIn referral-request messages for a real human.
Rules:
- Max 90 words. Warm, professional, specific. Never salesy, no emojis, no hashtags.
- Naturally mention the recipient's role and company.
- Weave in the sender's background and custom note where relevant.
- Every message must be uniquely worded; never use template-sounding phrases like "I hope this message finds you well".
- Output ONLY valid JSON: {"message": "<the message text>"}`;

          const payload = {
            model: model,
            temperature: settings.temperature != null ? settings.temperature : 0.8,
            max_tokens: 300,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
          };

          const upstreamResp = await fetch(NVIDIA_ENDPOINT, {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (!upstreamResp.ok) {
            const errText = await upstreamResp.text().catch(() => '');
            sendJson(res, upstreamResp.status, {
              ok: false,
              source: 'fallback',
              reason: 'Upstream HTTP ' + upstreamResp.status + ': ' + errText,
            });
            return;
          }

          const data = await upstreamResp.json();
          const content = data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : '';

          let msg = '';
          try {
            const parsed = JSON.parse(content.trim());
            if (parsed && typeof parsed.message === 'string') msg = parsed.message.trim();
          } catch (_) {
            const match = content.match(/\{[\s\S]*?\}/);
            if (match) {
              try {
                const parsed = JSON.parse(match[0]);
                if (parsed && typeof parsed.message === 'string') msg = parsed.message.trim();
              } catch (_) {}
            }
          }

          if (msg) {
            sendJson(res, 200, { ok: true, source: 'ai', message: msg, model: model });
          } else {
            sendJson(res, 200, {
              ok: false,
              source: 'fallback',
              reason: 'Unparseable response from AI model',
              rawContent: content,
            });
          }
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Endpoint not found' });
  });

  return server;
}

export function startServer(port, host) {
  loadEnv();
  const config = getConfig();
  const targetPort = port || config.port;
  const targetHost = host || config.host;

  const server = createServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[AutoRef Server] Port ${targetPort} is already in use.`);
      // Check if it's already an AutoRef server instance
      http.get(`http://${targetHost}:${targetPort}/api/health`, (res) => {
        if (res.statusCode === 200) {
          console.log(`[AutoRef Server] An instance is already active and healthy on port ${targetPort}.`);
          process.exit(0);
        } else {
          console.error(`[AutoRef Server] Port ${targetPort} is occupied by another process.`);
          process.exit(1);
        }
      }).on('error', () => {
        console.error(`[AutoRef Server] Port ${targetPort} is occupied.`);
        process.exit(1);
      });
    } else {
      console.error('[AutoRef Server] Error:', err);
      process.exit(1);
    }
  });

  server.listen(targetPort, targetHost, () => {
    console.log(`========================================`);
    console.log(`  AutoRef Local Companion Server`);
    console.log(`========================================`);
    console.log(`Status:  Running at http://${targetHost}:${targetPort}`);
    console.log(`Model:   ${config.model}`);
    console.log(`API Key: ${config.hasApiKey ? 'Loaded from .env (Active)' : 'NOT SET in .env (add API_KEY to .env)'}`);
    console.log(`========================================`);
  });

  return server;
}

// If invoked directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
