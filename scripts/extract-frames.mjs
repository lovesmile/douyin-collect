import path from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { exists, extractThreeFrames } from '../lib/media.mjs';
import { readCsv } from '../lib/csv.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'collect'));

const itemDirs = await listItemDirs(outDir);
let processed = 0;
let skipped = 0;
const errors = [];

for (const item of itemDirs) {
  const itemDir = path.join(outDir, item.dirName);
  const videoFile = item.videoPath ? path.join(outDir, item.videoPath) : path.join(itemDir, `${item.id}.mp4`);
  if (!await exists(videoFile)) {
    skipped += 1;
    continue;
  }
  try {
    await extractThreeFrames(videoFile, path.join(itemDir, 'frames'));
    processed += 1;
  } catch (error) {
    errors.push({
      aweme_id: item.id,
      video: videoFile,
      error: error.message,
    });
    skipped += 1;
    console.warn(`[extract-frames] skip ${item.id}: ${error.message}`);
  }
}

if (errors.length) {
  await writeFile(path.join(outDir, 'frame-errors.json'), `${JSON.stringify(errors, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ outDir, processed, skipped, errors: errors.length }, null, 2));

async function listItemDirs(root) {
  const manifestRows = await readCsv(path.join(root, 'manifest.csv')).catch(() => []);
  if (manifestRows.length) {
    return manifestRows
      .map((row) => {
        const dirName = dirFromPath(row.video_local_path || row.image_local_path || row.analysis_path) || row.aweme_id;
        return {
          id: row.aweme_id,
          dirName,
          videoPath: row.video_local_path,
        };
      })
      .filter((item) => item.id && item.dirName);
  }

  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => ({ id: entry.name, dirName: entry.name, videoPath: `${entry.name}/${entry.name}.mp4` }));
}

function dirFromPath(value) {
  if (!value) return '';
  return String(value).split(/[\\/]/)[0] || '';
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
