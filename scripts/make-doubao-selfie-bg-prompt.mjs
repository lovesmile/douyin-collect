import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || '../outputs/ai-image-test/selfie-bokeh-prompts');
const outfit = String(args.outfit || '白色露肩针织上衣、灰色短裤、黑色棒球帽');
const room = String(args.room || '暖色室内房间、米色墙面、木门、柔和顶灯');

await mkdir(outDir, { recursive: true });

const backgroundPrompt = [
  '生成一张 9:16 竖版低机位自拍风格背景图，用于后期叠加真实穿戴甲手部前景。',
  '',
  '画面要求：',
  `- 背景是一位年轻女生站在 ${room} 中，穿 ${outfit}。`,
  '- 女生位于中后景，整体明显虚化，脸部和身体都不是主体，只提供自拍氛围。',
  '- 镜头像手机低机位广角自拍，背景有轻微随手拍感、室内暖光、浅景深、轻微噪点。',
  '- 画面前景必须留出大面积空位，方便后期叠加一只真实手部和穿戴甲。',
  '- 背景人物的手臂和手不要伸到前景，不要出现清晰手部。',
  '- 不要出现指甲、甲片、美甲、前景大手、第二只手、清晰手指。',
  '- 不要文字、logo、水印、贴纸或“AI”字样。',
  '',
  '构图：',
  '- 背景人物在画面上半部或中后景，前景下半部留空。',
  '- 背景人物必须虚焦，前景留给真实穿戴甲手部。',
  '- 整体像真实手机拍摄，不要写真棚拍，不要过度精修。',
].join('\n');

const foregroundGuide = [
  '# 真实手部前景拍摄要求',
  '',
  '这类图能不能真，关键不是背景，是前景手部透视。',
  '',
  '- 手机 0.5x 或 1x，竖屏。',
  '- 手离镜头 10-20cm，甲片必须清晰对焦。',
  '- 手指往镜头方向伸，做“展示甲片”的姿势。',
  '- 背景可以简单，最好白墙/灰布/纯色板，方便抠图。',
  '- 光线从手部正前方或侧前方来，手部不能太暗。',
  '- 不要让袖子、头发、杂物压住手指边缘。',
  '- 每个款式拍 5 张：张开手、食指伸出、两指伸出、侧面弧度、甲面微距。',
].join('\n');

const composeCommand = [
  '生成豆包背景后，下载背景图，然后运行：',
  '',
  '```powershell',
  'python scripts\\compose-selfie-bokeh.py --hand "C:\\path\\to\\real-hand.png" --background "C:\\path\\to\\doubao-bg.png" --out "C:\\path\\to\\out" --title "这套真的显白到发光"',
  '```',
].join('\n');

await writeFile(path.join(outDir, 'doubao-selfie-background-prompt.txt'), `${backgroundPrompt}\n`, 'utf8');
await writeFile(path.join(outDir, 'foreground-shooting-guide.md'), `${foregroundGuide}\n`, 'utf8');
await writeFile(path.join(outDir, 'compose-command.md'), `${composeCommand}\n`, 'utf8');

console.log(JSON.stringify({
  outDir,
  files: [
    'doubao-selfie-background-prompt.txt',
    'foreground-shooting-guide.md',
    'compose-command.md',
  ],
}, null, 2));

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
