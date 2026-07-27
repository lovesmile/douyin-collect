import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { exists, ffprobeJson } from '../lib/media.mjs';
import { readCsv } from '../lib/csv.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'collect'));
const expected = Number(args.expected || args.limit || 50);
const issues = [];

const manifestFile = path.join(outDir, 'manifest.csv');
if (!await exists(manifestFile)) issues.push('缺少 manifest.csv');

const manifestRows = await readCsv(manifestFile).catch(() => []);
const selectedIds = new Set(manifestRows.map((row) => row.aweme_id).filter(Boolean));
const itemDirs = (await readdir(outDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
  .filter((entry) => !selectedIds.size || selectedIds.has(entry.name))
  .map((entry) => entry.name)
  .sort();

const validDirs = [];
for (const id of itemDirs) {
  const itemDir = path.join(outDir, id);
  const videoFile = path.join(itemDir, `${id}.mp4`);
  const imageDir = path.join(itemDir, 'images');
  const audioFile = path.join(itemDir, 'audio.mp3');
  const infoFile = path.join(itemDir, 'video-info.txt');
  const analysisFile = path.join(itemDir, 'analysis.txt');
  const hasVideo = await exists(videoFile);
  const hasImages = await exists(imageDir);
  const hasAudio = await exists(audioFile);

  if (!hasVideo && !hasImages) issues.push(`${id} 缺少视频或正文图片`);
  if (hasImages && !hasAudio) issues.push(`${id} 是图文但缺少 audio.mp3`);
  if (!await exists(infoFile)) issues.push(`${id} 缺少 video-info.txt`);
  if (!await exists(analysisFile)) issues.push(`${id} 缺少 analysis.txt`);

  if (await exists(analysisFile)) {
    const analysis = await readFile(analysisFile, 'utf8');
    if (/待补|待逐帧|待识别|TODO|音频 0 秒/.test(analysis)) {
      issues.push(`${id} analysis.txt 含占位词或错误音频字段`);
    }
  }

  if (hasVideo) {
    const frameDir = path.join(itemDir, 'frames');
    for (const frame of ['frame-01.jpg', 'frame-02.jpg', 'frame-03.jpg']) {
      if (!await exists(path.join(frameDir, frame))) issues.push(`${id} 缺少关键帧 ${frame}`);
    }
  }

  if (hasAudio) {
    try {
      const probe = await ffprobeJson(audioFile);
      const duration = Number(probe.format?.duration || 0);
      if (!duration) issues.push(`${id} audio.mp3 时长为 0`);
    } catch (error) {
      issues.push(`${id} audio.mp3 无法 ffprobe：${error.message}`);
    }
  }

  if (hasVideo || hasImages) validDirs.push(id);
}

if (expected > 0 && validDirs.length < expected) {
  issues.push(`有效目录 ${validDirs.length} 条，少于期望 ${expected} 条`);
}

const summary = {
  outDir,
  expected,
  validItems: validDirs.length,
  issues,
};
console.log(JSON.stringify(summary, null, 2));
if (issues.length && !args['warn-only']) process.exit(1);

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
