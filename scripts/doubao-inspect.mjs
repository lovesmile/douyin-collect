import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectToPage } from '../lib/cdp.mjs';
import { ensureDir } from '../lib/files.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || '../outputs/ai-image-test/2026-07-26-doubao-flow');
await ensureDir(outDir);

const cdp = await connectToPage();
try {
  await cdp.command('Page.bringToFront');
  await cdp.command('Page.enable');
  const screenshot = await cdp.command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outDir, 'doubao-page.png'), Buffer.from(screenshot.data, 'base64'));

  const info = await cdp.evaluate(`(() => ({
    title: document.title,
    url: location.href,
    text: (document.body?.innerText || '').slice(0, 3000),
    controls: [...document.querySelectorAll('textarea,input,[contenteditable=true],button,[role=button]')]
      .slice(0, 120)
      .map((element, index) => ({
        index,
        tag: element.tagName,
        role: element.getAttribute('role'),
        type: element.getAttribute('type'),
        aria: element.getAttribute('aria-label'),
        title: element.getAttribute('title'),
        text: (element.innerText || element.value || element.placeholder || '').slice(0, 100),
        className: String(element.className || '').slice(0, 120),
        rect: (() => {
          const rect = element.getBoundingClientRect();
          return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
        })(),
      })),
    fileInputs: [...document.querySelectorAll('input[type=file]')].map((element, index) => ({
      index,
      accept: element.accept,
      multiple: element.multiple,
      className: String(element.className || '').slice(0, 120),
    })),
  }))()`);

  await writeFile(path.join(outDir, 'doubao-dom.json'), `${JSON.stringify(info, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    screenshot: path.join(outDir, 'doubao-page.png'),
    dom: path.join(outDir, 'doubao-dom.json'),
    title: info.title,
    url: info.url,
    controls: info.controls.length,
    fileInputs: info.fileInputs.length,
  }, null, 2));
} finally {
  cdp.close();
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
