// scripts/launch-edge.mjs
// Launch Microsoft Edge with remote-debugging-port=9222 and the user's default profile
// so Douyin login cookies are preserved. User must close Edge first.

import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE_PATHS = [
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const edgePath = EDGE_PATHS.find(existsSync);
if (!edgePath) {
  console.error('msedge.exe not found in standard locations');
  process.exit(1);
}

const port = 9222;
const profileDir = process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\User Data';
if (!existsSync(profileDir)) {
  console.error('Edge profile dir missing: ' + profileDir);
  process.exit(1);
}

const shouldKill = process.argv.includes('--kill');
if (shouldKill) {
  console.log('[launch-edge] killing existing msedge processes...');
  try {
    execSync('taskkill /IM msedge.exe /F /T', { stdio: 'inherit' });
  } catch (e) {
    console.log('[launch-edge] taskkill failed: ' + e.message);
  }
  await sleep(2000);
} else {
  console.log('[launch-edge] pass --kill to auto-close existing Edge, or close it manually first');
}

const args = [
  '--remote-debugging-port=' + port,
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=' + profileDir,
  'about:blank',
];

console.log('[launch-edge] starting msedge on port ' + port);
console.log('  binary:  ' + edgePath);
console.log('  profile: ' + profileDir);
const p = spawn(edgePath, args, { detached: true, stdio: 'ignore' });
p.unref();
console.log('[launch-edge] msedge pid=' + p.pid);

for (let i = 0; i < 30; i++) {
  await sleep(500);
  try {
    const r = await fetch('http://localhost:' + port + '/json/version');
    if (r.ok) {
      const j = await r.json();
      console.log('[launch-edge] CDP ready: ' + j.Browser);
      process.exit(0);
    }
  } catch {}
}
console.error('[launch-edge] CDP did not become ready in 15s');
process.exit(1);
