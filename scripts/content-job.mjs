import path from 'node:path';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const projectRoot = process.cwd();
const jobName = String(args.name || args.title || '穿戴甲内容任务');
const mode = String(args.mode || 'selfie-bokeh');
const outDir = path.resolve(args.job || args.out || args.output || path.join('..', 'outputs', 'content-jobs', `${todaySlug()}-${slug(jobName)}`));
const title = String(args.title || '这套真的显白到发光');
const outfit = String(args.outfit || '白色露肩针织上衣、灰色短裤、黑色棒球帽');
const room = String(args.room || '暖色室内房间、米色墙面、木门、柔和顶灯');
const scene = String(args.scene || '浅米色丝绸、珍珠、小包局部、杂志纸、咖啡杯、柔和自然窗光、浅景深');

const dirs = {
  raw: path.join(outDir, '00-raw'),
  hand: path.join(outDir, '00-raw', 'hand-foreground'),
  detail: path.join(outDir, '00-raw', 'nail-detail'),
  video: path.join(outDir, '00-raw', 'video-clips'),
  backgrounds: path.join(outDir, '01-doubao-backgrounds'),
  output: path.join(outDir, '02-output'),
  prompts: path.join(outDir, '03-prompts'),
  publish: path.join(outDir, '04-publish-pack'),
};

await ensureJobDirs();
await copyInputIfProvided();
await writePromptsAndGuides();

const hands = await listImages(dirs.hand);
const backgrounds = await listImages(dirs.backgrounds);
const details = await listImages(dirs.detail);
const videos = await listMedia(dirs.video);
const outputs = await maybeCompose(hands, backgrounds);

const report = buildReport({ hands, backgrounds, details, videos, outputs });
await writeFile(path.join(outDir, 'next-steps.md'), `${report}\n`, 'utf8');
await writeFile(path.join(outDir, 'content-job.json'), `${JSON.stringify({
  jobName,
  mode,
  title,
  outDir,
  dirs,
  counts: {
    handForegrounds: hands.length,
    detailImages: details.length,
    videoClips: videos.length,
    doubaoBackgrounds: backgrounds.length,
    outputs: outputs.length,
  },
  outputs,
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  outDir,
  mode,
  handForegrounds: hands.length,
  doubaoBackgrounds: backgrounds.length,
  outputs: outputs.length,
  nextSteps: path.join(outDir, 'next-steps.md'),
}, null, 2));

async function ensureJobDirs() {
  for (const dir of Object.values(dirs)) await mkdir(dir, { recursive: true });
}

async function copyInputIfProvided() {
  if (!args.input && !args.hand && !args.background) return;
  if (args.input) {
    const input = path.resolve(args.input);
    if (existsSync(input)) {
      const files = await listImages(input);
      for (const file of files) await cp(file, path.join(dirs.hand, path.basename(file)), { force: false }).catch(() => {});
    }
  }
  if (args.hand) {
    const hand = path.resolve(args.hand);
    if (existsSync(hand)) await cp(hand, path.join(dirs.hand, path.basename(hand)), { force: false }).catch(() => {});
  }
  if (args.background) {
    const bg = path.resolve(args.background);
    if (existsSync(bg)) await cp(bg, path.join(dirs.backgrounds, path.basename(bg)), { force: false }).catch(() => {});
  }
}

async function writePromptsAndGuides() {
  const selfiePrompt = [
    '生成一张 9:16 竖版低机位自拍风格背景图，用于后期叠加真实穿戴甲手部前景。',
    '',
    '画面要求：',
    '- 不要上传或引用固定模特图片、四视图、装扮变体图或真人照。人物直接按文字设定生成。',
    `- 背景只生成一位 20 岁左右年轻亚洲女性氛围的装扮局部，场景在 ${room} 中，穿 ${outfit}；可出现深黑棕色长卷发局部、自然大波浪发丝、宝蓝色缎面小蝴蝶结、肩颈、锁骨、袖口、衣服材质、包、首饰、帽檐或模糊背影。`,
    '- 不要出现正脸，不要清晰五官，不要可识别人脸；如果脸部边缘入镜，必须被手机、帽檐、发丝、裁切或浅景深完全遮挡。',
    '- 衣物、袖口、包和配饰必须有高级真实材质：细腻针织、真丝/缎面、柔软羊毛、干净棉质、轻奢皮革、精致蕾丝、金属链条、珍珠/水晶配饰；布料要有真实纹理、垂坠、光泽和自然褶皱，不要廉价塑料感、粗糙脏乱布料或劣质配饰。',
    '- 装扮局部位于中后景，整体明显虚化，脸部和身体都不是主体，只提供自拍氛围。',
    '- 镜头像手机低机位广角自拍，背景有轻微随手拍感、室内暖光、浅景深、轻微噪点。',
    '- 画面前景必须留出大面积空位，方便后期叠加一只真实手部和穿戴甲。',
    '- 如果这张图后续用于图生视频，顶部 12%-15% 和底部 12%-15% 必须是水印/按钮安全留边，只放干净背景或虚化光影，不要放人物、手、手指、甲片或关键道具。',
    '- 背景人物的手臂和手不要伸到前景，不要出现清晰手部。',
    '- 不要出现指甲、甲片、美甲、前景大手、第二只手、清晰手指。',
    '- 不要文字、logo、水印、贴纸或“AI”字样。',
  ].join('\n');

  const staticPrompt = [
    '生成一张 9:16 竖版穿戴甲图文空背景，用于后期叠加真实手部前景。',
    '',
    '硬性要求：',
    '- 只要空背景，不要手、不要指甲、不要人物、不要模特、不要脸、不要身体、不要手臂、不要人体轮廓、不要甲片、不要文字、不要水印。',
    `- 背景只能包含静物道具：${scene}。`,
    '- 中间留出干净区域，适合后期叠加真实穿戴甲手部主体。',
    '- 如果这张图后续用于图生视频，顶部 12%-15% 和底部 12%-15% 必须是水印/按钮安全留边，只放干净背景或虚化光影，不要放手、甲片、文字或关键道具。',
    '- 真实产品摄影质感，柔和自然光，浅景深，高级但生活化；布料、珍珠、金属、水晶和小包都要有真实高级质感，不要廉价塑料感。',
  ].join('\n');

  const materialGuide = [
    '# 原始素材投放要求',
    '',
    '你只需要把素材放进对应文件夹，然后重新运行 `npm run content:job -- --job 当前任务目录`。',
    '',
    '## 必放',
    '',
    `- 前景手部图：放入 \`${dirs.hand}\``,
    `- 豆包背景图：放入 \`${dirs.backgrounds}\``,
    '',
    '## 建议补充',
    '',
    `- 甲面微距/细节图：放入 \`${dirs.detail}\``,
    `- 原始视频片段：放入 \`${dirs.video}\``,
    '',
    '## 前景手部拍摄要求',
    '',
    '- 手机竖屏，0.5x 或 1x。',
    '- 手离镜头 10-20cm，甲片必须清晰对焦。',
    '- 手部可以先擦护手霜；拍摄和后期都按商业手模状态优化：皮肤白皙干净、细腻通透，指节匀净，关节皱纹少、干纹少、泛红少；后期只做轻度修图，淡化关节皱纹、指节暗沉、干纹、倒刺和泛红，保留真实皮肤纹理、自然骨节、手型和甲片边缘。',
    '- 背景尽量白墙、灰布、纯色板，方便抠图。',
    '- 手指往镜头方向伸，模仿“把甲片怼到镜头前”的透视。',
    '- 每个款式至少拍 5 张：张开手、食指伸出、两指伸出、侧面弧度、甲面微距。',
  ].join('\n');

  await writeFile(path.join(dirs.prompts, 'doubao-selfie-background-prompt.txt'), `${selfiePrompt}\n`, 'utf8');
  await writeFile(path.join(dirs.prompts, 'doubao-static-background-prompt.txt'), `${staticPrompt}\n`, 'utf8');
  await writeFile(path.join(outDir, '素材投放说明.md'), `${materialGuide}\n`, 'utf8');
}

async function maybeCompose(hands, backgrounds) {
  const outputs = [];
  if (!hands.length || !backgrounds.length) return outputs;

  for (const hand of hands) {
    for (const bg of backgrounds) {
      const target = path.join(dirs.output, `${slug(path.basename(hand, path.extname(hand)))}__${slug(path.basename(bg, path.extname(bg)))}`);
      await mkdir(target, { recursive: true });
      const script = mode === 'static-scene' ? 'scripts/compose-ai-scene.py' : 'scripts/compose-selfie-bokeh.py';
      const commandArgs = mode === 'static-scene'
        ? [script, '--subject', hand, '--background', bg, '--out', target, '--title', title]
        : [script, '--hand', hand, '--background', bg, '--out', target, '--title', title];
      await run('python', commandArgs);
      outputs.push(target);
    }
  }
  return outputs;
}

function buildReport({ hands, backgrounds, details, videos, outputs }) {
  const lines = [
    `# ${jobName} 自动化任务`,
    '',
    `- 模式：${mode}`,
    `- 任务目录：${outDir}`,
    `- 前景手部图：${hands.length} 张`,
    `- 豆包背景图：${backgrounds.length} 张`,
    `- 甲面细节图：${details.length} 张`,
    `- 视频片段：${videos.length} 个`,
    `- 已合成输出：${outputs.length} 组`,
    '',
    '## 你下一步做什么',
    '',
  ];

  if (!hands.length) {
    lines.push(`1. 先把真实手部前景图放进：${dirs.hand}`);
  }
  if (!backgrounds.length) {
    lines.push(`2. 打开豆包，复制提示词生成背景：${path.join(dirs.prompts, mode === 'static-scene' ? 'doubao-static-background-prompt.txt' : 'doubao-selfie-background-prompt.txt')}`);
    lines.push(`3. 把豆包下载的背景图放进：${dirs.backgrounds}`);
  }
  if (hands.length && backgrounds.length) {
    lines.push('1. 已自动合成。请打开下面输出目录质检：');
    for (const item of outputs) lines.push(`   - ${item}`);
    lines.push('2. 质检重点：甲片是否保真、手部边缘是否自然、手部是否达到商业手模状态且没有塑料感、背景衣物/配饰是否有高级真实质感、背景有没有清晰手/指甲/水印/AI字样。');
  }

  lines.push(
    '',
    '## 重新运行',
    '',
    '```powershell',
    `cd ${projectRoot}`,
    `npm run content:job -- --job "${outDir}" --mode ${mode}`,
    '```',
  );
  return lines.join('\n');
}

async function listImages(root) {
  return listByExt(root, ['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
}

async function listMedia(root) {
  return listByExt(root, ['.mp4', '.mov', '.m4v', '.avi', '.webm']);
}

async function listByExt(root, exts) {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && exts.includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(root, entry.name))
    .sort();
}

async function run(command, commandArgs) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: projectRoot, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

function slug(text) {
  const cleaned = String(text || 'job')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 60) || 'nail-job';
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
