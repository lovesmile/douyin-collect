import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectToPage, sleep } from '../lib/cdp.mjs';
import { ensureDir } from '../lib/files.mjs';
import { downloadUrl } from '../lib/media.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || '../outputs/ai-image-test/2026-07-26-doubao-flow');
const imageFile = path.resolve(args.image || path.join(outDir, 'input-nail-subject.png'));
const prompt = args.prompt || [
  '基于上传图片生成一张穿戴甲图文封面。',
  '严格保留原图中的手部、甲片、甲型、甲面装饰、钻饰位置、颜色和反光，不改变指甲数量，不改变甲片细节。',
  '手部呈商业手模状态：皮肤白皙干净、细腻通透，指节匀净，关节皱纹少、干纹少、泛红少；可以轻度美化手指皮肤，淡化关节皱纹、指节暗沉、干纹、倒刺、泛红和小瑕疵；但保留真实皮肤纹理、自然骨节、手型和甲片边缘。',
  '只重绘背景和氛围：高级浅色丝绸、珍珠、小包、柔和自然光、浅景深、真实产品摄影；布料、珍珠、金属、水晶和小包都要有真实高级质感，不要廉价塑料感。',
  '画幅为9:16竖图，甲面细节清晰，手型自然，真实皮肤纹理。',
  '不要新增手指，不要改变甲片，不要重画甲面图案，不要改变钻饰位置，不要畸形手，不要卡通，不要塑料感，不要过度磨皮，不要把关节全部磨平。',
].join('\n');

await ensureDir(outDir);
await writeFile(path.join(outDir, 'prompt.txt'), `${prompt}\n`, 'utf8');

const cdp = await connectToPage();
try {
  await cdp.command('Page.bringToFront');
  await cdp.command('Page.enable');
  await cdp.command('DOM.enable');

  await clickByText(cdp, '图像生成');
  await sleep(800);

  const doc = await cdp.command('DOM.getDocument', { depth: -1, pierce: true });
  const fileInput = await cdp.command('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'input[type=file]',
  });
  if (!fileInput.nodeId) throw new Error('No input[type=file] found on Doubao page.');
  await cdp.command('DOM.setFileInputFiles', {
    nodeId: fileInput.nodeId,
    files: [imageFile],
  });
  await sleep(2500);

  await focusTextarea(cdp);
  await cdp.command('Input.insertText', { text: prompt });
  await sleep(500);
  await pressEnter(cdp);

  await waitForGeneration(cdp, outDir);
  const imageUrls = await collectImageUrls(cdp, outDir);
  const headers = await cdp.getBrowserHeaders({ referer: 'https://www.doubao.com/' });
  let downloaded = 0;
  for (const url of imageUrls.slice(0, 8)) {
    try {
      const ext = url.includes('.webp') ? 'webp' : url.includes('.png') ? 'png' : 'jpg';
      const output = path.join(outDir, `doubao-result-${String(downloaded + 1).padStart(2, '0')}.${ext}`);
      await downloadUrl(url, output, { headers, skipExisting: false });
      downloaded += 1;
    } catch {}
  }
  console.log(JSON.stringify({ outDir, imageFile, imageUrls: imageUrls.length, downloaded }, null, 2));
} finally {
  cdp.close();
}

async function waitForGeneration(cdp, outDir) {
  for (let index = 0; index < 60; index += 1) {
    await sleep(3000);
    const screenshot = await cdp.command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(path.join(outDir, 'doubao-after-submit.png'), Buffer.from(screenshot.data, 'base64'));

    const state = await cdp.evaluate(`(() => {
      const text = document.body?.innerText || '';
      const imgs = [...document.images].map((img) => ({
        src: img.currentSrc || img.src,
        w: img.naturalWidth,
        h: img.naturalHeight,
        x: Math.round(img.getBoundingClientRect().x),
        y: Math.round(img.getBoundingClientRect().y),
      })).filter((img) => img.w >= 300 && img.h >= 300);
      return { text: text.slice(-1200), imageCount: imgs.length, imgs };
    })()`);
    await writeFile(path.join(outDir, 'doubao-after-submit.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    if (state.imageCount >= 2 && !/生成中|排队中|正在/.test(state.text)) return;
  }
}

async function collectImageUrls(cdp, outDir) {
  const urls = await cdp.evaluate(`(() => [...document.images]
    .map((img) => ({
      src: img.currentSrc || img.src,
      w: img.naturalWidth,
      h: img.naturalHeight,
      area: img.naturalWidth * img.naturalHeight,
      top: img.getBoundingClientRect().top,
    }))
    .filter((img) => img.src && img.w >= 512 && img.h >= 512)
    .sort((a, b) => b.area - a.area)
    .map((img) => img.src))()`);
  await writeFile(path.join(outDir, 'doubao-image-urls.json'), `${JSON.stringify(urls, null, 2)}\n`, 'utf8');
  return urls;
}

async function clickByText(cdp, text) {
  const rect = await cdp.evaluate(`(() => {
    const elements = [...document.querySelectorAll('button,[role=button],div')];
    const element = elements.find((el) => (el.innerText || '').trim().includes(${JSON.stringify(text)}));
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  if (!rect) throw new Error(`No clickable element containing text: ${text}`);
  await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}

async function focusTextarea(cdp) {
  const rect = await cdp.evaluate(`(() => {
    const element = document.querySelector('textarea');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.x + Math.min(50, rect.width / 2), y: rect.y + rect.height / 2 };
  })()`);
  if (!rect) throw new Error('No textarea found.');
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
