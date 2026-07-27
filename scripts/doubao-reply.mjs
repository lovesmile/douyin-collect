import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectToPage, sleep } from '../lib/cdp.mjs';
import { ensureDir } from '../lib/files.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || '../outputs/ai-image-test/2026-07-26-doubao-flow');
const text = args['text-file']
  ? await readFile(path.resolve(args['text-file']), 'utf8')
  : args.text || '确认：就用我刚上传的穿戴甲手部图片作为保留底图。只需要生成 9:16 竖版图文封面。请严格保留手部、甲片、甲型、甲面装饰、钻饰位置、颜色和反光，不改变指甲数量，不改变甲片细节；只重绘背景和氛围为高级浅色丝绸、珍珠、小包、柔和自然光、浅景深、真实产品摄影。请直接生成图片，不要再询问。';

await ensureDir(outDir);
const cdp = await connectToPage();
try {
  await cdp.command('Page.bringToFront');
  await focusTextarea(cdp);
  await cdp.command('Input.insertText', { text });
  await sleep(500);
  const beforeSend = await cdp.command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outDir, 'doubao-before-send.png'), Buffer.from(beforeSend.data, 'base64'));
  await clickSendButton(cdp);
  await waitAndCapture(cdp, outDir);
  console.log(JSON.stringify({ outDir, replied: true }, null, 2));
} finally {
  cdp.close();
}

async function waitAndCapture(cdp, outDir) {
  for (let index = 0; index < 80; index += 1) {
    await sleep(3000);
    const screenshot = await cdp.command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(path.join(outDir, 'doubao-after-reply.png'), Buffer.from(screenshot.data, 'base64'));
    const state = await cdp.evaluate(`(() => ({
      text: (document.body?.innerText || '').slice(-2500),
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
      }).filter((img) => img.w >= 256 && img.h >= 256),
    }))()`);
    await writeFile(path.join(outDir, 'doubao-after-reply.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    if (/生成|图片/.test(state.text) && state.images.some((img) => img.y > 80 && img.x > 250 && img.rw > 200 && img.rh > 200)) return;
  }
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

async function clickSendButton(cdp) {
  const rect = await cdp.evaluate(`(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 12 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const candidates = [...document.querySelectorAll('button, [role=button]')]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '';
        const bg = getComputedStyle(element).backgroundColor;
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, text, bg };
      })
      .filter((item) => item.y > window.innerHeight * 0.72 && item.x > window.innerWidth * 0.72)
      .sort((a, b) => (b.x + b.y) - (a.x + a.y));
    const item = candidates[0] || { x: window.innerWidth - 54, y: window.innerHeight - 54, w: 40, h: 40 };
    return { x: item.x + item.w / 2, y: item.y + item.h / 2, candidates };
  })()`);
  if (!rect) throw new Error('No send button candidate found.');
  await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}

async function pressEnter(cdp) {
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
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
