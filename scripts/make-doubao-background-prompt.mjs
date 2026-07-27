import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ensureDir } from '../lib/files.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || '../outputs/ai-image-test/2026-07-26-doubao-flow/backgrounds');
await ensureDir(outDir);

const prompts = {
  'silk-pearl': '生成一张9:16竖版高级穿戴甲图文背景。只要空背景，不要手，不要指甲，不要人物，不要甲片。画面为浅米色丝绸、珍珠、小包局部、柔和自然光、浅景深、真实产品摄影氛围，中间留出放置手部主体的干净区域。',
  'cafe-table': '生成一张9:16竖版高级生活方式产品摄影背景。只要空背景，不要手，不要指甲，不要人物。浅色咖啡桌、玻璃杯、白色小包、自然窗光、浅景深，中间留空，适合后期叠加穿戴甲手部主体。',
  'soft-magazine': '生成一张9:16竖版美甲图文封面背景。只要空背景，不要手，不要指甲，不要人物，不要文字。高级杂志感，米白渐变、柔光、珍珠、丝绸褶皱、干净留白，中间区域干净。',
};

for (const [name, prompt] of Object.entries(prompts)) {
  await writeFile(path.join(outDir, `${name}.txt`), `${prompt}\n`, 'utf8');
}
console.log(JSON.stringify({ outDir, prompts: Object.keys(prompts) }, null, 2));

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
