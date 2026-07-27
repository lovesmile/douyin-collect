import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || '../outputs/ai-image-test/doubao-45-prompts');
const style = String(args.style || '温柔显白穿戴甲');
const scene = String(args.scene || '浅米色丝绸、珍珠、小包局部、杂志纸、咖啡杯、柔和自然窗光、浅景深');
const title = publicText(String(args.title || '这套真的显白到发光'));

await mkdir(outDir, { recursive: true });

const directPrompt = [
  '操作前确认：进入豆包「图片生成」模式，模型选择默认模型 4.5。',
  '',
  '我已经上传了一张真实穿戴甲上手图。请基于上传图生成一张 9:16 竖版图文封面。',
  '',
  '核心要求：',
  `- 款式方向：${style}`,
  '- 严格保留原图手部主体，不改变手型、手指数量、指甲数量、甲型长度。',
  '- 手部呈商业手模状态：皮肤白皙干净、细腻通透，指节匀净，关节皱纹少、干纹少、泛红少；可以轻度美化手指皮肤，淡化关节皱纹、指节暗沉、干纹、倒刺、泛红和小瑕疵；但必须保留真实皮肤纹理、自然骨节起伏、手型和手部轮廓。',
  '- 严格保留甲片设计，不改变甲面颜色、图案、钻饰、蝴蝶结、金属件、珍珠、边缘位置和反光关系。',
  '- 只允许优化背景、光线、构图和氛围；不要重画甲片，不要替换甲片，不要新增甲面装饰。',
  `- 背景只能是产品摄影静物背景：${scene}。`,
  '- 背景衣物/布料/道具必须有高级真实材质：细腻针织、真丝/缎面、柔软羊毛、干净棉质、轻奢皮革、精致蕾丝、金属链条、珍珠/水晶配饰；布料要有真实纹理、垂坠、光泽和自然褶皱，不要廉价塑料感、粗糙脏乱布料或劣质配饰。',
  '- 背景中不要出现人物、模特、脸、身体、手臂、第二只手、其他手部、人体轮廓、虚幻人像或自拍房间。',
  '- 画面必须像真实产品摄影，不要像把手贴到虚拟模特或虚幻人物背景上。',
  '- 图片上不要出现任何文字、logo、水印、边框、贴纸或“AI”字样。',
  '',
  '负面要求：',
  '不要多手指、不要少手指、不要畸形手、不要卡通、不要过度磨皮、不要塑料感、不要把关节全部磨平、不要过度拉长手指、不要改变甲片款式、不要改变甲片边缘、不要改变钻饰位置、不要人物、不要模特、不要脸、不要身体、不要手臂、不要第二只手、不要虚幻人像背景。',
  '',
  `如果必须加封面字，封面字只用：${title}`,
].join('\n');

const fallbackBackgroundPrompt = [
  '请只生成一张 9:16 竖版空背景，作为穿戴甲真实手部后期合成用。',
  '',
  '硬性要求：',
  '- 只要空背景，不要手、不要指甲、不要人物、不要模特、不要脸、不要身体、不要手臂、不要人体轮廓、不要甲片、不要文字、不要水印。',
  `- 背景只能包含静物道具：${scene}。`,
  '- 中间留出干净区域，适合后期叠加真实穿戴甲手部主体。',
  '- 真实产品摄影质感，柔和自然光，浅景深，高级但生活化；布料、珍珠、金属、水晶和小包都要有真实高级质感，不要廉价塑料感。',
  '',
  '负面要求：不要虚幻模特，不要美女背景，不要自拍房间，不要手部，不要指甲，不要人体，不要文字，不要 logo，不要水印。',
].join('\n');

const qaChecklist = [
  '# 豆包 4.5 穿戴甲图文质检清单',
  '',
  '生成后逐张检查，任意一项不通过就不用直出图，改走“空背景 + 本地合成”流程。',
  '',
  '- 手指数量是否与原图一致？',
  '- 每个甲片的甲型、长度、弧度是否一致？',
  '- 甲面颜色、渐变、猫眼/钻饰/蝴蝶结/金属件是否一致？',
  '- 钻饰位置、数量、大小是否明显变化？',
  '- 手部是否达到商业手模状态：皮肤白皙干净、细腻通透、关节皱纹少、干纹少、泛红少？是否仍保留真实皮肤纹理和自然骨节？',
  '- 背景衣物/布料/配饰是否有真实高级质感？是否出现廉价塑料感、粗糙脏乱布料或劣质配饰？',
  '- 是否出现畸形手、粘连手指、皮肤塑料感？',
  '- 背景里是否出现人物、模特、脸、身体、手臂、第二只手或虚幻人像？',
  '- 手部和背景透视、光线、比例是否匹配？是否像硬贴上去的？',
  '- 图片上是否出现文字、logo、水印或 AI 字样？',
  '',
  '推荐发布结构：第 1 张用通过质检的氛围封面，第 2 张放原始真实上手图，第 3 张放甲面微距，第 4 张放生活静物场景，第 5 张放选款理由。',
].join('\n');

await writeFile(path.join(outDir, 'doubao-45-direct-preserve-prompt.txt'), `${directPrompt}\n`, 'utf8');
await writeFile(path.join(outDir, 'fallback-empty-background-prompt.txt'), `${fallbackBackgroundPrompt}\n`, 'utf8');
await writeFile(path.join(outDir, 'qa-checklist.md'), `${qaChecklist}\n`, 'utf8');

console.log(JSON.stringify({
  outDir,
  files: [
    'doubao-45-direct-preserve-prompt.txt',
    'fallback-empty-background-prompt.txt',
    'qa-checklist.md',
  ],
}, null, 2));

function publicText(text) {
  return text
    .replaceAll('AI', '')
    .replaceAll('ai', '')
    .replaceAll('人工智能', '')
    .replace(/\s+/g, ' ')
    .trim();
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
