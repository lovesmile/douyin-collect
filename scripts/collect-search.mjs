import path from 'node:path';
import { connectToPage, sleep } from '../lib/cdp.mjs';
import { readJson, writeJson } from '../lib/files.mjs';
import { parseRawSearchCard } from '../lib/parse.mjs';

const args = parseArgs(process.argv.slice(2));
const keywords = String(args.keyword || args.keywords || '穿戴甲')
  .split(',')
  .map((keyword) => keyword.trim())
  .filter(Boolean);
const output = path.resolve(args.out || args.output || 'candidates.json');
const targetCount = Number(args.target || args.count || 120);
const maxPasses = Number(args.passes || 25);
const append = Boolean(args.append);

const existing = append ? await readJson(output, []) : [];
const collected = new Map(existing.map((item) => [item.aweme_id, item]));
const cdp = await connectToPage();

try {
  await cdp.command('Page.enable');
  await cdp.command('Runtime.enable');

  for (const keyword of keywords) {
    const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=general`;
    console.log(`[collect-search] keyword=${keyword}`);
    await cdp.navigate(searchUrl, { waitMs: 3000 });

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const cardCount = await cdp.evaluate("document.querySelectorAll('.search-result-card').length").catch(() => 0);
      if (cardCount >= targetCount) break;
      await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
      await sleep(1200);
    }

    const cards = await cdp.evaluate(`(() => [...document.querySelectorAll('.search-result-card')]
      .map((element, index) => ({
        index,
        text: element.innerText,
        hasVideoImage: Boolean(element.querySelector('.videoImage, a[href*="/video/"], a[href*="modal_id="]')),
      }))
      .filter((card) => card.text && card.hasVideoImage))()`);

    for (const card of cards.slice(0, targetCount)) {
      const detail = await openCardAndGetId(cdp, card.index);
      if (!detail.aweme_id) continue;
      const rawInfo = parseRawSearchCard(card.text);
      collected.set(detail.aweme_id, {
        aweme_id: detail.aweme_id,
        href: `https://www.douyin.com/video/${detail.aweme_id}`,
        keyword,
        raw: card.text,
        ...rawInfo,
      });
      if (collected.size >= targetCount && keywords.length === 1) break;
    }
  }
} finally {
  cdp.close();
}

const unique = [...collected.values()];
await writeJson(output, unique);
console.log(JSON.stringify({ output, collected: unique.length }, null, 2));

async function openCardAndGetId(cdp, index) {
  await cdp.evaluate(`(() => {
    const card = document.querySelectorAll('.search-result-card')[${index}];
    const link = card?.querySelector('a[href*="/video/"], a[href*="modal_id="]');
    if (link) link.click();
    else card?.querySelector('.videoImage')?.click();
  })()`);
  await sleep(500);

  const href = await cdp.evaluate('location.href').catch(() => '');
  const awemeId = extractAwemeId(href);
  await cdp.pressEscape().catch(() => {});
  await sleep(250);
  return { aweme_id: awemeId, href };
}

function extractAwemeId(href) {
  try {
    const url = new URL(href);
    const modalId = url.searchParams.get('modal_id');
    if (modalId) return modalId;
    const match = url.pathname.match(/\/video\/(\d+)/);
    return match?.[1] || '';
  } catch {
    return '';
  }
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
