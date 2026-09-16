// Test suite for AutoRef server, .env, sidebar config, and agent model
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

console.log('--- 1. Syntax Check on All Project Files ---');
const files = [
  'server.js',
  'background/ai-client.js',
  'background/service-worker.js',
  'lib/thinking-orb.js',
  'lib/delay.js',
  'lib/prompt.js',
  'lib/storage.js',
  'lib/template.js',
  'content/history-check.js',
  'content/main.js',
  'content/messenger.js',
  'content/overlay-widget.js',
  'content/scrapers.js',
  'content/selectors.js',
  'options/options.js',
  'popup/popup.js',
  'native-host/host.js',
  'test/harness.mjs',
];

for (const f of files) {
  const full = path.join(ROOT, f);
  if (!existsSync(full)) {
    throw new Error('Missing expected file: ' + f);
  }
  execSync(`node --check "${full}"`, { stdio: 'inherit' });
  console.log('✓ Syntax OK:', f);
}

console.log('\n--- 2. Manifest V3 & Sidebar Checks ---');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
if (!manifest.side_panel || manifest.side_panel.default_path !== 'popup/popup.html') {
  throw new Error('Manifest missing side_panel or incorrect default_path');
}
if (!manifest.permissions.includes('sidePanel')) {
  throw new Error('Manifest missing sidePanel permission');
}
if (!manifest.permissions.includes('nativeMessaging')) {
  throw new Error('Manifest missing nativeMessaging permission');
}
if (manifest.action.default_popup) {
  throw new Error('Action must not define default_popup so side_panel opens on click');
}
if (!manifest.web_accessible_resources || !manifest.web_accessible_resources.some((r) => r.resources.includes('icons/icon32.png'))) {
  throw new Error('Manifest missing web_accessible_resources for extension icons');
}
console.log('✓ Manifest side_panel configured correctly:', manifest.side_panel);
console.log('✓ Manifest permissions include sidePanel and nativeMessaging');
console.log('✓ Manifest web_accessible_resources includes extension icons');

console.log('\n--- 3. Native Host Manifest & Executable Checks ---');
const hostManifest = JSON.parse(readFileSync(path.join(ROOT, 'native-host/com.autoref.server.json'), 'utf8'));
if (hostManifest.name !== 'com.autoref.server') {
  throw new Error('Native host manifest name mismatch');
}
if (!hostManifest.allowed_origins.some((o) => o.includes('geaooppdjbbaellehbjoiobiegdljoad'))) {
  throw new Error('Native host manifest missing deterministic extension ID');
}
if (!hostManifest.path.endsWith('.exe')) {
  throw new Error('Native host manifest path must point to an .exe binary for Chrome on Windows: ' + hostManifest.path);
}
if (!existsSync(hostManifest.path)) {
  throw new Error('Native host executable does not exist: ' + hostManifest.path);
}

// Test stdio protocol via host.exe
const { spawn } = await import('node:child_process');
const nativeTest = await new Promise((resolve, reject) => {
  const proc = spawn(hostManifest.path, [], { shell: false });
  const payload = JSON.stringify({ action: 'ping' });
  const buf = Buffer.alloc(4 + Buffer.byteLength(payload));
  buf.writeUInt32LE(Buffer.byteLength(payload), 0);
  buf.write(payload, 4);
  proc.stdin.write(buf);
  proc.stdout.once('data', (d) => {
    if (d.length >= 4) {
      const len = d.readUInt32LE(0);
      const json = JSON.parse(d.subarray(4, 4 + len).toString());
      proc.kill();
      resolve(json);
    }
  });
  proc.on('error', reject);
  setTimeout(() => { proc.kill(); reject(new Error('Native host timeout')); }, 3000);
});

if (!nativeTest || !nativeTest.ok) {
  throw new Error('Native host stdio protocol failed: ' + JSON.stringify(nativeTest));
}
console.log('✓ Native host manifest and host.exe stdio protocol verified OK');

console.log('\n--- 4. Server & .env Integration Test ---');
const serverModule = await import('../server.js');
const testPort = 8799;
const server = serverModule.startServer(testPort, '127.0.0.1');

await new Promise((r) => setTimeout(r, 400));

try {
  // Health check
  const healthRes = await fetch(`http://127.0.0.1:${testPort}/api/health`);
  const healthData = await healthRes.json();
  if (!healthData.ok || healthData.status !== 'running') {
    throw new Error('Health check failed: ' + JSON.stringify(healthData));
  }
  if (!healthData.model.includes('nemotron')) {
    throw new Error('Default model is not agent model (nemotron): ' + healthData.model);
  }
  console.log('✓ Server health endpoint OK, model:', healthData.model);

  // Config check
  const configRes = await fetch(`http://127.0.0.1:${testPort}/api/config`);
  const configData = await configRes.json();
  if (!configData.ok) {
    throw new Error('Config check failed: ' + JSON.stringify(configData));
  }
  console.log('✓ Server config endpoint OK, port:', configData.port);

  // Generate check without key -> 400 fallback
  const genRes = await fetch(`http://127.0.0.1:${testPort}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: { name: 'Test' } }),
  });
  const genData = await genRes.json();
  if (genData.ok !== false || genData.source !== 'fallback') {
    throw new Error('Expected fallback when API key is missing');
  }
  console.log('✓ Generate endpoint correctly handles missing key fallback');
} finally {
  server.close();
}

console.log('\n--- 5. Storage Default Agent Model Check ---');
const storageContent = readFileSync(path.join(ROOT, 'lib/storage.js'), 'utf8');
if (!storageContent.includes('nvidia/llama-3.1-nemotron-70b-instruct')) {
  throw new Error('storage.js missing default agent model nvidia/llama-3.1-nemotron-70b-instruct');
}
console.log('✓ storage.js default model is nvidia/llama-3.1-nemotron-70b-instruct');

console.log('\nALL VERIFICATION CHECKS PASSED!');
