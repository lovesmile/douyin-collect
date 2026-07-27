import path from 'node:path';
import { spawn } from 'node:child_process';
import { readCsv } from '../lib/csv.mjs';

const args = parseArgs(process.argv.slice(2));
const date = args.date || todaySlug();
const category = String(args.category || 'books');
const keyword = args.keyword || defaultKeyword(category);
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'ecommerce', 'daily-top10', date));
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
  String(args.target || 100),
]);

await run('scripts/collect-details.mjs', [
  '--in',
  candidates,
  '--out',
  outDir,
  '--limit',
  String(args['details-limit'] || 100),
]);

await buildManifest(strictDays);
let selected = await manifestCount();
let selectedWindow = strictDays;

if (selected < limit && fallbackDays > strictDays) {
  console.log(`[ecommerce-top10] strict ${strictDays}d selected ${selected}/${limit}; fallback to ${fallbackDays}d.`);
  await buildManifest(fallbackDays);
  selected = await manifestCount();
  selectedWindow = fallbackDays;
}

await run('scripts/cleanup-unselected.mjs', ['--out', outDir]);
await run('scripts/rename-ecommerce-dirs.mjs', ['--out', outDir]);
await run('scripts/extract-frames.mjs', ['--out', outDir]);
await run('scripts/validate-output.mjs', ['--out', outDir, '--expected', String(Math.min(limit, selected)), '--warn-only']);
await run('scripts/build-ecommerce-brief.mjs', [
  '--out',
  outDir,
  '--category',
  category,
  '--keyword',
  keyword,
  '--duration',
  String(args.duration || 60),
]);

console.log(JSON.stringify({ outDir, category, keyword, limit, selected, selectedWindowDays: selectedWindow }, null, 2));

async function buildManifest(days) {
  await run('scripts/build-manifest.mjs', [
    '--out',
    outDir,
    '--limit',
    String(limit),
    '--min-likes',
    String(args['min-likes'] || 500),
    '--max-followers',
    String(args['max-followers'] || 200000),
    '--days',
    String(days),
    ...(args.allowUnknownDate ? ['--allowUnknownDate'] : []),
  ]);
}

async function manifestCount() {
  const rows = await readCsv(path.join(outDir, 'manifest.csv')).catch(() => []);
  return rows.length;
}

function defaultKeyword(categoryName) {
  if (/book|书|图书|童书|教辅/.test(categoryName)) {
    return '书单推荐,图书带货,好书推荐,童书推荐,教辅推荐,女性成长书单,自我提升书籍';
  }
  return `${categoryName}带货,${categoryName}种草,${categoryName}测评,${categoryName}推荐`;
}

function run(script, scriptArgs) {
  return new Promise((resolve, reject) => {
    console.log(`[ecommerce-top10] node ${script} ${scriptArgs.join(' ')}`);
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
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
