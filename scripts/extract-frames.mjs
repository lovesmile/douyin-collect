import path from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { exists, extractThreeFrames } from '../lib/media.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'collect'));

const entries = await readdir(outDir, { withFileTypes: true });
let processed = 0;
let skipped = 0;
const errors = [];

for (const entry of entries) {
  if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
  const itemDir = path.join(outDir, entry.name);
  const videoFile = path.join(itemDir, `${entry.name}.mp4`);
  if (!await exists(videoFile)) {
    skipped += 1;
    continue;
  }
  try {
    await extractThreeFrames(videoFile, path.join(itemDir, 'frames'));
    processed += 1;
  } catch (error) {
    errors.push({
      aweme_id: entry.name,
      video: videoFile,
      error: error.message,
    });
    skipped += 1;
    console.warn(`[extract-frames] skip ${entry.name}: ${error.message}`);
  }
}

if (errors.length) {
  await writeFile(path.join(outDir, 'frame-errors.json'), `${JSON.stringify(errors, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ outDir, processed, skipped, errors: errors.length }, null, 2));

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
