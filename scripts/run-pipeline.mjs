import path from 'node:path';
import { spawn } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const keyword = args.keyword || '穿戴甲';
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'collect', `${todaySlug()}-douyin-collect`));
const candidates = path.join(outDir, 'candidates.json');
const targetCandidates = args.target || 120;
const limit = args.limit || 50;

await run('scripts/collect-search.mjs', [
  '--keyword',
  keyword,
  '--out',
  candidates,
  '--target',
  String(targetCandidates),
  ...(args.append ? ['--append'] : []),
]);
await run('scripts/collect-details.mjs', [
  '--in',
  candidates,
  '--out',
  outDir,
  ...(args['details-limit'] ? ['--limit', String(args['details-limit'])] : []),
]);
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
  String(args.days || 90),
  ...(args.allowUnknownDate ? ['--allowUnknownDate'] : []),
]);
await run('scripts/extract-frames.mjs', ['--out', outDir]);
await run('scripts/validate-output.mjs', ['--out', outDir, '--expected', String(limit)]);

console.log(JSON.stringify({ outDir, candidates, limit }, null, 2));

function run(script, scriptArgs) {
  return new Promise((resolve, reject) => {
    console.log(`[pipeline] node ${script} ${scriptArgs.join(' ')}`);
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
