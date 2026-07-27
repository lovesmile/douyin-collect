import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const args = parseArgs(process.argv.slice(2));
const product = String(args.product || args.title || '待定书本');
const category = String(args.category || 'books');
const audience = String(args.audience || '想自我提升、学习或解决具体问题的人');
const duration = Number(args.duration || 30);
const style = String(args.style || '真实书桌生活方式摄影，温暖自然光，轻微手持感');
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'ecommerce', 'content-jobs', `${todaySlug()}-${slug(product)}`));
const segmentCount = Math.max(1, Math.ceil(duration / 10));

await mkdir(outDir, { recursive: true });
await mkdir(path.join(outDir, 'segments'), { recursive: true });

const segments = buildSegments(segmentCount);
for (const segment of segments) {
  await writeFile(
    path.join(outDir, 'segments', `segment-${String(segment.index).padStart(2, '0')}-doubao-prompt.txt`),
    `${buildPrompt(segment)}\n`,
    'utf8',
  );
}

await writeFile(path.join(outDir, 'stitching-guide.md'), `${buildStitchingGuide(segments)}\n`, 'utf8');
await writeFile(path.join(outDir, 'publish-script.md'), `${buildPublishScript(segments)}\n`, 'utf8');
await writeFile(path.join(outDir, 'compliance-check.md'), `${buildComplianceCheck()}\n`, 'utf8');
await writeFile(path.join(outDir, 'job.json'), `${JSON.stringify({ product, category, audience, duration, style, outDir, segmentCount }, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  outDir,
  product,
  category,
  audience,
  duration,
  segmentCount,
  files: [
    'segments/segment-xx-doubao-prompt.txt',
    'stitching-guide.md',
    'publish-script.md',
    'compliance-check.md',
    'job.json',
  ],
}, null, 2));

function buildSegments(count) {
  const templates = [
    {
      title: '痛点钩子',
      action: '镜头从书桌上的手机、便签和一杯温水慢慢推近，画面有轻微手持感，人物只出现手部或肩颈局部，正在把手机扣在桌面上，准备翻开书。',
      text: '最近脑子很乱，不知道从哪本书开始看？',
      end: '最后一秒停在手指刚碰到书封、书本位于画面中心的位置。',
    },
    {
      title: '商品出现',
      action: '从上一段最后一帧继续，手指自然翻开书封或目录页，镜头保持同一书桌、同一光线、同一人物局部，不换场景。',
      text: `这本「${product}」更适合${audience}。`,
      end: '最后一秒停在目录页或关键词便签旁边，便于下一段继续讲卖点。',
    },
    {
      title: '核心卖点',
      action: '镜头切到书页、便签、荧光笔和手部轻轻划过目录关键词，强调它解决的具体问题。',
      text: '先看目录是不是你需要的，再决定要不要入手。',
      end: '最后一秒停在便签上的 3 个关键词位置。',
    },
    {
      title: '观点拆解',
      action: '延续上一段便签画面，手写或摆放 1 个观点关键词，不照搬原文，只做生活化解释。',
      text: '它不是让你立刻改变，而是先帮你看清问题。',
      end: '最后一秒停在书本半开、便签和咖啡杯同框。',
    },
    {
      title: '适合/不适合',
      action: '人物手部把两张便签放到桌面：适合谁、不适合谁，画面干净克制，不硬广。',
      text: '适合想慢慢理清问题的人，不适合只想看爽文的人。',
      end: '最后一秒停在两张便签旁，书本仍在画面主体安全区。',
    },
    {
      title: '购买引导',
      action: '镜头轻轻拉远，书本、便签、温水和台灯形成完整生活方式画面，人物手部把书合上。',
      text: '可以点商品卡先看目录和详情，确认适合再下单。',
      end: '最后一秒保持干净静物封面构图，可作为结尾定帧。',
    },
  ];

  const result = [];
  for (let index = 0; index < count; index += 1) {
    result.push({ index: index + 1, ...templates[index % templates.length] });
  }
  return result;
}

function buildPrompt(segment) {
  const previousRule = segment.index === 1
    ? '本段是第 1 段，从干净书桌氛围开始。'
    : `本段是第 ${segment.index} 段，必须接续上一段最后一帧：保持同一本书、同一书桌、同一灯光、同一人物手部/肩颈局部、同一镜头焦段和色调，不要突变场景。`;

  return [
    '视频生成参数确认',
    `主体：${product} 的书本/书单带货生活方式展示`,
    `主题：${segment.title}`,
    '尺寸：9:16',
    '时长：10 秒',
    '模型：豆包视频 / Seedance 10 秒片段',
    `风格：${style}`,
    '',
    '接续规则：',
    previousRule,
    '如果上传了上一段最后一帧，请以它作为画面连续性参考；如果没有上传，则严格按文字保持同一场景和动作连续。',
    '',
    '画面主线：',
    segment.action,
    '',
    '人物规则：',
    '只出现非可识别人物局部，例如手部、袖口、肩颈、发丝、背影或帽檐；不要正脸，不要清晰五官，不要可识别人脸。',
    '手部干净自然，像商业手模状态；衣物、袖口和道具有真实高级质感，不要廉价塑料感。',
    '',
    '商品规则：',
    `商品是书本/书单类：${product}。如果没有真实商品图，不要生成过于具体的版权封面细节；可以用“同类书本/空白书封/书脊/目录页/便签关键词”表达，不要伪造品牌授权和真实封面。`,
    '如果你提供了商品封面或商品链接截图，则以提供素材为准，不要改书名、封面主色、版式和核心信息。',
    '',
    '字幕/画面文字：',
    segment.text,
    '文字只放在中间主体安全区内，顶部 12%-15% 和底部 12%-15% 留作水印/按钮安全区，不放重要文字、书名、手、人物或商品主体。',
    '',
    '声音：无口播或轻柔氛围音乐；如果后期配口播，本段只保留自然翻书声/环境声。',
    '',
    '结尾衔接：',
    segment.end,
    '',
    '负面要求：',
    '不要说亲测、读完、用了一个月；不要虚假销量、虚假价格、全网最低、100%有效、必逆袭；不要平台水印、logo、AI 字样、贴纸；不要搬运对标视频画面；不要突然换人、换衣服、换场景；不要正脸或可识别人脸。',
  ].join('\n');
}

function buildStitchingGuide(segments) {
  return [
    '# 10 秒分段拼接说明',
    '',
    `商品：${product}`,
    `总时长：${duration} 秒，分 ${segments.length} 段，每段 10 秒。`,
    '',
    '## 生成顺序',
    '',
    ...segments.map((segment) => `1. 先生成第 ${segment.index} 段：${segment.title}。生成后截取最后 1 帧，作为第 ${segment.index + 1} 段的参考图。`),
    '',
    '## 剪辑衔接',
    '',
    '- 每段最后 0.5-1 秒尽量保持动作变慢或静止，方便下一段接续。',
    '- 拼接时优先使用硬切，不要花哨转场；如果画面有轻微跳变，用 4-6 帧交叉溶解。',
    '- 全片统一色温、颗粒、锐化和字幕样式。',
    '- 字幕不要贴近顶部和底部，避开平台水印和按钮。',
    '',
    '## 不可做',
    '',
    '- 不要伪造自己买过、读完或亲测。',
    '- 不要伪造真实封面、品牌授权、销量、评论或低价。',
    '- 不要让每段都重新生成不同人物/场景，否则长视频接不上。',
  ].join('\n');
}

function buildPublishScript(segments) {
  return [
    '# 发布脚本',
    '',
    `商品：${product}`,
    `目标人群：${audience}`,
    '',
    '## 口播/字幕',
    '',
    ...segments.map((segment) => `- 第 ${segment.index} 段：${segment.text}`),
    '',
    '## 标题备选',
    '',
    `- 如果你最近不知道看什么书，可以先了解这本`,
    `- 这本更适合${audience}，先看目录再决定`,
    `- 别急着买书，先看它是不是解决你的问题`,
    '',
    '## 评论区引导',
    '',
    '- 你最近更想解决学习、情绪，还是自我管理的问题？',
    '- 想看我按人群整理一版书单吗？',
  ].join('\n');
}

function buildComplianceCheck() {
  return [
    '# 合规检查',
    '',
    '- 没购买/没读完时，不能说：我亲测、我读完、我用了一个月、真的改变了我。',
    '- 不能承诺结果：必逆袭、100%有效、看完就改变人生、孩子立刻变自律。',
    '- 不能伪造交易信息：全网最低、最后一天、只剩几单、销量第一，除非有商品页证据。',
    '- 不能伪造评价截图、专家背书、名人推荐。',
    '- 可以说：适合了解、可以先看目录、从商品信息看、主打解决某类问题、确认适合再下单。',
  ].join('\n');
}

function slug(text) {
  return String(text || 'job')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 48);
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
