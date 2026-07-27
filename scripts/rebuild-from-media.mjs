import path from 'node:path';
import { readdir, readFile, rm } from 'node:fs/promises';
import { readJson, writeJson } from '../lib/files.mjs';
import { exists } from '../lib/media.mjs';
import { parseRawSearchCard, parseCount, parsePublishDate } from '../lib/parse.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output);
if (!outDir) throw new Error('Missing --out');

const candidates = await readJson(path.join(outDir, 'candidates.json'), []);
const candidateMap = new Map(candidates.map((item) => [item.aweme_id, item]));
const dirs = await readdir(outDir, { withFileTypes: true });
const rows = [];
const emptyDirs = [];

for (const dir of dirs) {
  if (!dir.isDirectory() || !/^\d+$/.test(dir.name)) continue;
  const itemDir = path.join(outDir, dir.name);
  const videoFile = path.join(itemDir, `${dir.name}.mp4`);
  const imageDir = path.join(itemDir, 'images');
  const hasVideo = await exists(videoFile);
  const hasImages = await exists(imageDir);
  if (!hasVideo && !hasImages) {
    emptyDirs.push(itemDir);
    continue;
  }

  const candidate = candidateMap.get(dir.name) || {};
  const rawInfo = parseRawSearchCard(candidate.raw || '');
  const oldInfo = await readFile(path.join(itemDir, 'video-info.txt'), 'utf8').catch(() => '');
  const oldLike = oldInfo.match(/点赞数：?([0-9]+)/)?.[1] || oldInfo.match(/鐐硅禐鏁帮細([0-9]+)/)?.[1] || '';
  const oldFollower = oldInfo.match(/粉丝数：?([0-9.万]+)/)?.[1] || oldInfo.match(/绮変笣鏁帮細([0-9.万]+)/)?.[1] || '';
  const oldPublish = oldInfo.match(/发布时间：?([^\n]+)/)?.[1] || '';

  rows.push({
    aweme_id: dir.name,
    href: candidate.href || `https://www.douyin.com/video/${dir.name}`,
    title: rawInfo.title || candidate.title || cleanupTitle(candidate.raw || '') || dir.name,
    author: rawInfo.author || candidate.author || '',
    follower_count: parseCount(candidate.follower_count || oldFollower),
    publish_time: candidate.publish_time || parsePublishDate(rawInfo.publish_text || oldPublish),
    like_count: parseCount(candidate.like_count || rawInfo.like_count || oldLike),
    comment_count: parseCount(candidate.comment_count),
    collect_count: parseCount(candidate.collect_count),
    share_count: parseCount(candidate.share_count),
    duration: rawInfo.duration || '',
    media_type: hasImages ? 'image' : 'video',
  });
}

rows.sort((a, b) => b.like_count - a.like_count);
await writeJson(path.join(outDir, 'details.json'), rows);

if (args.pruneEmpty) {
  for (const dir of emptyDirs) {
    await rm(dir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  outDir,
  mediaRows: rows.length,
  emptyDirs: emptyDirs.length,
  pruned: Boolean(args.pruneEmpty),
}, null, 2));

function cleanupTitle(raw) {
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('@') && !line.startsWith('·') && !/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(line) && !/^[0-9.]+万?$/.test(line))
    || '';
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
