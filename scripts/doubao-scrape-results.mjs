import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectToPage, sleep } from '../lib/cdp.mjs';
import { ensureDir } from '../lib/files.mjs';
import { downloadUrl } from '../lib/media.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || '../outputs/ai-image-test/2026-07-26-doubao-flow');
await ensureDir(outDir);

const cdp = await connectToPage();
try {
  await cdp.command('Page.bringToFront');
  await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  await sleep(Number(args.wait || 12000));

  const screenshot = await cdp.command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outDir, 'doubao-late.png'), Buffer.from(screenshot.data, 'base64'));

  const elements = await cdp.evaluate(`(() => {
    const nodes = [...document.querySelectorAll('img, picture, source, canvas, [style]')];
    return nodes.map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const attrs = {};
      for (const attr of element.getAttributeNames?.() || []) {
        if (/src|url|image|data|origin|thumb|large|href/i.test(attr)) attrs[attr] = element.getAttribute(attr);
      }
      return {
        index,
        tag: element.tagName,
        src: element.currentSrc || element.src || '',
        srcset: element.srcset || '',
        styleBg: style.backgroundImage && style.backgroundImage !== 'none' ? style.backgroundImage : '',
        attrs,
        w: element.naturalWidth || element.width || Math.round(rect.width),
        h: element.naturalHeight || element.height || Math.round(rect.height),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        rw: Math.round(rect.width),
        rh: Math.round(rect.height),
        text: (element.innerText || '').slice(0, 80),
      };
    }).filter((item) => item.src || item.srcset || item.styleBg || Object.keys(item.attrs).length || item.rw > 150 || item.rh > 150);
  })()`);
  await writeFile(path.join(outDir, 'doubao-late-elements.json'), `${JSON.stringify(elements, null, 2)}\n`, 'utf8');

  const urls = collectUrls(elements).filter((url) => /^https?:\/\//.test(url));
  await writeFile(path.join(outDir, 'doubao-real-urls.json'), `${JSON.stringify(urls, null, 2)}\n`, 'utf8');
  const headers = await cdp.getBrowserHeaders({ referer: 'https://www.doubao.com/' });
  let downloaded = 0;
  for (const url of urls.slice(0, 12)) {
    try {
      const ext = url.includes('.webp') ? 'webp' : url.includes('.png') ? 'png' : 'jpg';
      await downloadUrl(url, path.join(outDir, `doubao-real-${String(downloaded + 1).padStart(2, '0')}.${ext}`), {
        headers,
        skipExisting: false,
      });
      downloaded += 1;
    } catch {}
  }
  console.log(JSON.stringify({ outDir, elements: elements.length, urls: urls.length, downloaded }, null, 2));
} finally {
  cdp.close();
}

function collectUrls(elements) {
  const urls = [];
  for (const element of elements) {
    for (const value of [element.src, element.srcset, element.styleBg, ...Object.values(element.attrs || {})]) {
      if (!value) continue;
      for (const match of String(value).matchAll(/https?:\/\/[^"',)\s]+/g)) urls.push(match[0]);
    }
  }
  return [...new Set(urls)];
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
