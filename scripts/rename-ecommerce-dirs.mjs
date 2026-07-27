import path from 'node:path';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { exists } from '../lib/media.mjs';
import { csvEscape } from '../lib/files.mjs';
import { parseCsv } from '../lib/csv.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'ecommerce', 'daily-top10'));
const manifestFile = path.join(outDir, 'manifest.csv');

if (!await exists(manifestFile)) {
  throw new Error(`缺少 manifest.csv，无法重命名：${manifestFile}`);
}

const text = await readFile(manifestFile, 'utf8');
const csvRows = parseCsv(text);
if (csvRows.length < 2) {
  throw new Error(`manifest.csv 没有入选内容：${manifestFile}`);
}

const headers = csvRows[0];
const rows = csvRows.slice(1)
  .filter((row) => row.some((cell) => cell !== ''))
  .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));

const renamed = [];
const skipped = [];

for (const row of rows) {
  const id = row.aweme_id;
  if (!id) continue;

  const targetDirName = uniqueDirName(`${inferBookName(row.title)}-${id}`);
  const targetDir = path.join(outDir, targetDirName);
  const currentDir = await findCurrentDir(row, id);

  if (!currentDir) {
    skipped.push({ id, reason: '目录不存在' });
    row.video_local_path = rewriteManifestPath(row.video_local_path, targetDirName, id);
    row.image_local_path = rewriteManifestPath(row.image_local_path, targetDirName, id);
    row.audio_local_path = rewriteManifestPath(row.audio_local_path, targetDirName, id);
    row.analysis_path = rewriteManifestPath(row.analysis_path || `${id}/analysis.txt`, targetDirName, id);
    continue;
  }

  if (path.resolve(currentDir) !== path.resolve(targetDir)) {
    if (await exists(targetDir)) {
      throw new Error(`目标目录已存在，拒绝覆盖：${targetDir}`);
    }
    await rename(currentDir, targetDir);
    renamed.push({ id, from: currentDir, to: targetDir });
  } else {
    skipped.push({ id, reason: '已是目标目录' });
  }

  row.video_local_path = row.video_local_path ? `${targetDirName}/${id}.mp4` : '';
  row.image_local_path = row.image_local_path ? `${targetDirName}/images` : '';
  row.audio_local_path = row.audio_local_path ? `${targetDirName}/audio.mp3` : '';
  row.analysis_path = `${targetDirName}/analysis.txt`;
}

await writeManifest(headers, rows);

console.log(JSON.stringify({
  outDir,
  rows: rows.length,
  renamed: renamed.length,
  skipped: skipped.length,
  renamedItems: renamed,
  skippedItems: skipped,
}, null, 2));

async function findCurrentDir(row, id) {
  const candidates = [
    path.join(outDir, id),
    row.video_local_path ? path.join(outDir, row.video_local_path.split(/[\\/]/)[0]) : '',
    row.image_local_path ? path.join(outDir, row.image_local_path.split(/[\\/]/)[0]) : '',
    row.analysis_path ? path.join(outDir, row.analysis_path.split(/[\\/]/)[0]) : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

function inferBookName(title) {
  const text = String(title || '').replace(/\s+/g, ' ').trim();
  const bracket = text.match(/《([^》]{1,40})》/);
  if (bracket) return bracket[1];

  const quoted = text.match(/[“「『]([^”」』]{1,40})[”」』]/);
  if (quoted) return quoted[1];

  if (/三本|3本/.test(text)) return '三本好书';
  if (/10本|十本/.test(text)) return '十本书单';
  if (/教辅/.test(text)) return '教辅图书';
  if (/卖书|图书带货|书单号|读书号/.test(text)) return '图书带货';

  return text
    .replace(/#.*$/u, '')
    .replace(/[，。！？、|｜].*$/u, '')
    .slice(0, 18) || '书本';
}

function uniqueDirName(value) {
  return String(value || 'book')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function rewriteManifestPath(value, targetDirName, id) {
  if (!value) return '';
  const parts = String(value).split(/[\\/]/);
  if (!parts.length) return value;
  if (parts[0] === id || parts[0].includes(id)) {
    parts[0] = targetDirName;
    return parts.join('/');
  }
  return `${targetDirName}/${parts.slice(1).join('/') || value}`;
}

async function writeManifest(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header] || '')).join(','));
  }
  await writeFile(manifestFile, `${lines.join('\n')}\n`, 'utf8');
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
