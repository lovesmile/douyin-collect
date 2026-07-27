import path from 'node:path';
import { spawn } from 'node:child_process';
import { readCsv } from '../lib/csv.mjs';

const args = parseArgs(process.argv.slice(2));
const date = args.date || todaySlug();
const keyword = args.keyword || '穿戴甲,显白美甲,猫眼穿戴甲,短甲穿戴甲,夏日美甲,新中式穿戴甲';
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'collect', 'daily-top10', date));
const candidates = path.join(outDir, 'candidates.json');
const limit = Number(args.limit || 5);
const strictDays = Number(args.days || 3);
const fallbackDays = Number(args['fallback-days'] || 30);

await run('scripts/collect-search.mjs', [
  '--keyword',
  keyword,
  '--out',
  candidates,
  '--target',
  String(args.target || 80),
]);

await run('scripts/collect-details.mjs', [
  '--in',
  candidates,
  '--out',
  outDir,
  '--limit',
  String(args['details-limit'] || 80),
]);

await buildManifest(strictDays);
let selected = await manifestCount();
let selectedWindow = strictDays;

if (selected < limit && fallbackDays > strictDays) {
  console.log(`[daily-top10] strict ${strictDays}d selected ${selected}/${limit}; fallback to ${fallbackDays}d.`);
  await buildManifest(fallbackDays);
  selected = await manifestCount();
  selectedWindow = fallbackDays;
}

await run('scripts/cleanup-unselected.mjs', ['--out', outDir]);
await run('scripts/extract-frames.mjs', ['--out', outDir]);
await run('scripts/validate-output.mjs', ['--out', outDir, '--expected', String(Math.min(limit, selected)), '--warn-only']);
await run('scripts/build-ops-report.mjs', ['--out', outDir]);
await run('scripts/build-daily-brief.mjs', ['--out', outDir]);

console.log(JSON.stringify({ outDir, limit, selected, selectedWindowDays: selectedWindow }, null, 2));

async function buildManifest(days) {
  await run('scripts/build-manifest.mjs', [
    '--out',
    outDir,
    '--limit',
    String(limit),
    '--min-likes',
    String(args['min-likes'] || 1000),
    '--max-followers',
    String(args['max-followers'] || 50000),
    '--days',
    String(days),
    ...(args.allowUnknownDate ? ['--allowUnknownDate'] : []),
  ]);
}

async function manifestCount() {
  const rows = await readCsv(path.join(outDir, 'manifest.csv')).catch(() => []);
  return rows.length;
}

function run(script, scriptArgs) {
  return new Promise((resolve, reject) => {
    console.log(`[daily-top10] node ${script} ${scriptArgs.join(' ')}`);
    const child = spawn(process.execPath, [script, ...scriptArgs], {
      cwd: path.resolve(import.meta.dirname, '..'),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

function todaySlug() {
  return new Date().toISOString().slice(0, 10);
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
