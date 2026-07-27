import path from 'node:path';
import { readdir, rm } from 'node:fs/promises';
import { exists } from '../lib/media.mjs';
import { readCsv } from '../lib/csv.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'collect'));
const manifestFile = path.join(outDir, 'manifest.csv');

if (!await exists(manifestFile)) {
  throw new Error(`缺少 manifest.csv，拒绝清理：${manifestFile}`);
}

const rows = await readCsv(manifestFile);
const selectedIds = new Set(rows.map((row) => row.aweme_id).filter(Boolean));
if (!selectedIds.size && !args['allow-empty']) {
  throw new Error('manifest.csv 没有入选 aweme_id，拒绝清理。若确认要清空数字目录，请显式传 --allow-empty。');
}

const entries = await readdir(outDir, { withFileTypes: true });
const numericDirs = entries
  .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

const removed = [];
const kept = [];

for (const id of numericDirs) {
  if (selectedIds.has(id)) {
    kept.push(id);
    continue;
  }
  const target = path.join(outDir, id);
  if (args['dry-run']) {
    removed.push({ id, target, dryRun: true });
    continue;
  }
  await rm(target, { recursive: true, force: true });
  removed.push({ id, target });
}

console.log(JSON.stringify({
  outDir,
  selected: selectedIds.size,
  numericDirs: numericDirs.length,
  kept: kept.length,
  removed: removed.length,
  dryRun: Boolean(args['dry-run']),
  removedItems: removed,
}, null, 2));

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
