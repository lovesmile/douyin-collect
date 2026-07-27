import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectToPage, sleep } from '../lib/cdp.mjs';
import { ensureDir } from '../lib/files.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || '../outputs/ai-image-test/2026-07-26-doubao-flow');
await ensureDir(outDir);

const cdp = await connectToPage();
try {
  await cdp.command('Page.bringToFront');
  await focusTextarea(cdp);
  await ctrlV(cdp);
  await sleep(2500);

  const screenshot = await cdp.command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outDir, 'doubao-after-paste.png'), Buffer.from(screenshot.data, 'base64'));

  const state = await cdp.evaluate(`(() => ({
    text: (document.body?.innerText || '').slice(-1800),
    images: [...document.images].map((img) => {
      const rect = img.getBoundingClientRect();
      return {
        src: img.currentSrc || img.src,
        w: img.naturalWidth,
        h: img.naturalHeight,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        rw: Math.round(rect.width),
        rh: Math.round(rect.height),
      };
    }).filter((img) => img.w >= 100 && img.h >= 100),
  }))()`);
  await writeFile(path.join(outDir, 'doubao-after-paste.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outDir, pasted: true, images: state.images.length }, null, 2));
} finally {
  cdp.close();
}

async function focusTextarea(cdp) {
  const rect = await cdp.evaluate(`(() => {
    const element = document.querySelector('[role="textbox"].ProseMirror, [contenteditable=true], textarea');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.x + Math.min(50, rect.width / 2), y: rect.y + rect.height / 2 };
  })()`);
  if (!rect) throw new Error('No editable input found.');
  await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}

async function ctrlV(cdp) {
  await cdp.command('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Control',
    code: 'ControlLeft',
    windowsVirtualKeyCode: 17,
    modifiers: 2,
  });
  await cdp.command('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
    modifiers: 2,
  });
  await cdp.command('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
    modifiers: 2,
  });
  await cdp.command('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Control',
    code: 'ControlLeft',
    windowsVirtualKeyCode: 17,
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) parsed[key] = true;
    else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}
