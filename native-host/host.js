/* AutoRef native-host/host.js — Chrome Native Messaging Host.
   Allows the AutoRef Chrome extension to automatically start and monitor
   the local Node companion server on extension click / sidebar opening. */

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(ROOT, 'server.js');
const PORT = 8787;
const HOST = '127.0.0.1';

// Protocol: Chrome sends 4-byte length prefix (uint32 LE), then JSON payload.
function sendMessage(msg) {
  const json = JSON.stringify(msg);
  const len = Buffer.byteLength(json, 'utf8');
  const buf = Buffer.alloc(4 + len);
  buf.writeUInt32LE(len, 0);
  buf.write(json, 4, len, 'utf8');
  process.stdout.write(buf);
}

function checkServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/api/health`, { timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function startServerProcess() {
  const isRunning = await checkServerRunning();
  if (isRunning) {
    return { ok: true, status: 'already_running', port: PORT };
  }

  try {
    const child = spawn(process.execPath, [SERVER_PATH], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    // Wait briefly and verify server started
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await checkServerRunning()) {
        return { ok: true, status: 'started', port: PORT };
      }
    }
    return { ok: true, status: 'spawning', port: PORT };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

let buffer = Buffer.alloc(0);

process.stdin.on('data', async (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const msgLen = buffer.readUInt32LE(0);
    if (buffer.length < 4 + msgLen) break;

    const jsonStr = buffer.toString('utf8', 4, 4 + msgLen);
    buffer = buffer.subarray(4 + msgLen);

    let parsed = {};
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      sendMessage({ ok: false, error: 'Invalid JSON: ' + e.message });
      continue;
    }

    const action = parsed.action || parsed.type || 'status';
    if (action === 'start') {
      const res = await startServerProcess();
      sendMessage(res);
    } else if (action === 'ping' || action === 'status') {
      const running = await checkServerRunning();
      sendMessage({ ok: true, running, port: PORT });
    } else {
      sendMessage({ ok: false, error: 'Unknown action: ' + action });
    }
  }
});
