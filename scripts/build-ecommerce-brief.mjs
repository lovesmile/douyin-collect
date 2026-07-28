import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readCsv } from '../lib/csv.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'ecommerce', 'daily-top10', todaySlug()));
const category = String(args.category || 'books');
const keyword = String(args.keyword || '书单推荐,图书带货,好书推荐');
const product = String(args.product || '待定书本/书单商品');
const audience = String(args.audience || '想自我提升、育儿、学习或解决具体问题的人群');
const duration = Number(args.duration || 60);

const rows = (await readCsv(path.join(outDir, 'manifest.csv')).catch(() => []))
  .map((row) => ({ ...row, like: Number(row.like_count || 0) }))
  .sort((a, b) => b.like - a.like);

if (!rows.length) throw new Error(`No manifest rows found in ${outDir}`);

const output = path.join(outDir, 'ecommerce-content-plan.md');
await writePerItemVoiceovers(rows);
await writeFile(output, `${buildPlan(rows)}\n`, 'utf8');
console.log(JSON.stringify({ output, rows: rows.length, category, duration }, null, 2));

function buildPlan(items) {
  const top = items.slice(0, 10);
  return [
    '# 今日带货内容制作方案',
    '',
    '## 模块边界',
    '',
    '- 本文件属于 `ecommerce` 带货模块，不影响穿戴甲 `daily:top10` / `daily:brief` 任务。',
    '- 默认类目先做书本/书单/教辅/知识类商品，因为它不强依赖你已购买实物。',
    '- 不做搬运，不复刻原视频；只拆结构、钩子、卖点表达和镜头节奏，再生成原创达人带货方案。',
    '- 如果你没有购买实物，不要说“我亲测、我读完、我用了一个月”。可以说“这本书主打……”“从目录/卖点看更适合……”“如果你正在解决这个问题，可以先了解这本”。',
    '- 书籍带货不能只做氛围画面：每段都必须有书名/封面/书脊/商品卡截图/中文卖点便签等商品锚点，否则会出现音画不匹配、货不对板。',
    '- 30 秒只适合讲一个钩子和一个卖点；想讲清“这本书适合谁、解决什么问题、为什么值得看”，默认建议 60 秒。',
    '',
    '## 今日采集参数',
    '',
    `- 类目：${category}`,
    `- 关键词：${keyword}`,
    `- 默认生成时长：${duration} 秒，每段豆包视频固定 10 秒。`,
    `- 目标商品：${product}`,
    `- 目标人群：${audience}`,
    '',
    `## 今日对标 TOP${top.length}`,
    '',
    buildReferenceTable(top),
    '',
    '## 带货视频拆解口径',
    '',
    '- 前 3 秒：痛点钩子，不要先讲品牌和废话。',
    '- 3-10 秒：商品锚点必须出现，展示书名、封面、书脊、商品卡截图或中文问题便签。',
    '- 10-30 秒：只讲一个核心问题和一个卖点，不要泛泛讲完整书籍内容。',
    '- 30-50 秒：如果做 60 秒，再增加适合/不适合人群、1 个观点拆解、1 个使用场景。',
    '- 50-60 秒：给轻行动引导，但不要虚假限时、虚假低价、虚假库存。',
    '- 禁止 AI 随机生成英文内页、英文书名、外文段落或与目标商品无关的书；没有真实内页素材时，用中文目录便签/关键词卡替代，或让书页模糊不可读。',
    '',
    '## 今日可做选题',
    '',
    ...buildIdeas(top),
    '## 每本书/每个对标样本解说词',
    '',
    ...buildVoiceoverBlocks(top),
    '## 豆包 10 秒分段视频生成策略',
    '',
    ...buildSegmentStrategy(duration),
    '## 今日原创脚本模板',
    '',
    '```text',
    buildScript(duration),
    '```',
    '',
    '## 豆包/Seedance 分段提示词',
    '',
    '如果你今天已经确定商品，建议用下面命令生成更精确的分段提示词：',
    '',
    '```powershell',
    `npm run ecommerce:segments -- --product "${product}" --audience "${audience}" --duration ${duration} --sellingPoint "只讲一个具体卖点"`,
    '```',
    '',
    '## 合规质检',
    '',
    buildComplianceChecklist(),
  ].join('\n');
}

async function writePerItemVoiceovers(items) {
  for (const row of items) {
    const dirName = dirFromPath(row.analysis_path || row.video_local_path || row.image_local_path);
    if (!dirName) continue;
    const itemDir = path.join(outDir, dirName);
    await mkdir(itemDir, { recursive: true });
    await writeFile(path.join(itemDir, 'voiceover.txt'), `${buildVoiceoverText(row, duration)}\n`, 'utf8');
  }
}

function buildReferenceTable(items) {
  const lines = [
    ['排名', '类型', '点赞', '作者/粉丝', '标题', '查看'],
    ...items.map((row, index) => [
      row.rank || String(index + 1),
      row.content_type || '',
      row.like_count || '',
      `${row.author || '未知'} / ${row.follower_count || '-'}粉`,
      compact(row.title || ''),
      `[抖音](${row.share_url || ''}) / ${row.aweme_id || ''}`,
    ]),
  ];
  return lines.map((line, index) => {
    const row = `| ${line.map(escapeTableCell).join(' | ')} |`;
    if (index === 0) return `${row}\n| --- | --- | --- | --- | --- | --- |`;
    return row;
  }).join('\n');
}

function buildIdeas(items) {
  const seedTitles = items.slice(0, 5).map((row) => compact(row.title || '热门带货样本', 28));
  const ideas = [
    ['痛点型', '“最近总是焦虑/迷茫/管不住孩子，可以先看这类书”', '适合知识类、成长类、育儿类书籍。'],
    ['人群型', '“这本更适合刚开始自我提升的人，不适合想看爽文的人”', '用适合/不适合降低广告感。'],
    ['场景型', '“睡前 10 分钟翻两页，比刷短视频更容易安静下来”', '用生活场景带入购买理由。'],
    ['清单型', '“如果你只想选一本入门书，先看目录里的这 3 点”', '适合教辅、工具书、成长书。'],
    ['观点型', '“它不是让你变自律，而是先帮你看见问题在哪”', '适合从书中观点做二创解读。'],
  ];
  return [
    ...ideas.map(([type, hook, note], index) => [
      `### 选题 ${index + 1}：${type}`,
      '',
      `- 钩子：${hook}`,
      `- 用法：${note}`,
      `- 参考样本：${seedTitles[index] || '看今日 TOP10 首帧和标题'}`,
      '',
    ].join('\n')),
  ];
}

function buildVoiceoverBlocks(items) {
  return items.map((row, index) => {
    const name = inferBookName(row);
    const voiceoverPath = dirFromPath(row.analysis_path)
      ? `${dirFromPath(row.analysis_path)}/voiceover.txt`
      : '';
    return [
      `### ${index + 1}. ${name}`,
      '',
      `- 对标标题：${compact(row.title || '', 80)}`,
      `- 建议口播时长：${duration} 秒`,
      voiceoverPath ? `- 单独文件：${voiceoverPath}` : '',
      '',
      '```text',
      buildVoiceoverText(row, duration),
      '```',
      '',
    ].filter((line) => line !== '').join('\n');
  });
}

function buildVoiceoverText(row, totalSeconds) {
  const name = inferBookName(row);
  const profile = inferBookProfile(row);
  const label = profile.isSpecificBook ? `《${name}》` : name;
  const subject = profile.isSpecificBook ? '这本书' : '这个选题';
  const entryLine = profile.isSpecificBook
    ? '你可以把它当成一个解决问题的入口：先看目录，再看它有没有覆盖你现在最卡的那个问题。'
    : '你可以把这个样本当成结构参考：先看它怎么做钩子、怎么给商品锚点、怎么把卖点讲成一个具体问题。';
  const ctaLine = profile.isSpecificBook
    ? '如果目录和详情确实对得上你的阶段，再点商品卡了解；如果不对，就先收藏这个选书思路，不要为了情绪冲动下单。'
    : '正式发布前，先替换成你实际要挂车的具体书名，再按那本书的目录、商品详情和适合人群改写画面和口播。';
  const sourceNote = profile.isSpecificBook
    ? `这段只基于当前采集到的标题和商品方向写，不编造具体页码、作者背书或亲测经历；如果你有目录/商品详情页，可以再把卖点补得更准。`
    : `这个样本更像“书单/卖书方法/图书带货对标”，不是单本书；正式发布时要先替换成你实际要挂车的具体书名。`;

  if (totalSeconds <= 30) {
    return [
      `【${name}｜30秒解说词】`,
      `如果你是${profile.audience}，可以先了解一下${label}。`,
      `这条我不把它讲成“神书”，只讲一个点：${profile.sellingPoint}。`,
      `${profile.scene}的时候，很多人不是缺方法，而是缺一个能让自己慢下来、重新整理问题的入口。`,
      ctaLine,
      '',
      `备注：${sourceNote}`,
    ].join('\n');
  }

  return [
    `【${name}｜60秒解说词】`,
    `如果你是${profile.audience}，可以先了解一下${label}。`,
    `我建议这条视频不要贪多，不要试图把整本书讲完，只讲一个核心点：${profile.sellingPoint}。`,
    `很多时候，大家刷到书籍推荐会觉得“又是在卖书”，所以画面一定要先给到书名、封面或者商品卡，再配中文卖点便签，别只拍咖啡和书桌。`,
    `${subject}更适合${profile.suitedFor}，不太适合${profile.notFor}。`,
    entryLine,
    ctaLine,
    '',
    `备注：${sourceNote}`,
  ].join('\n');
}

function inferBookProfile(row) {
  const title = String(row.title || '');
  if (/卖书|带货|读书号|书单号|自媒体|副业|达人|流程|拆解/.test(title)) {
    return {
      isSpecificBook: false,
      audience: '想做图书带货、书单号或知识类内容的新手',
      sellingPoint: '拆清楚图书带货内容怎么选题、怎么讲、怎么挂商品',
      scene: '当你想做带货但还分不清内容价值和硬广的边界',
      suitedFor: '想先学习内容结构和合规表达的新手',
      notFor: '期待照搬别人视频就能稳定出单的人',
    };
  }
  if (/三本|3本|十本|10本|书单|好书|不得不看|脱胎换骨/.test(title)) {
    return {
      isSpecificBook: /《[^》]+》/.test(title),
      audience: '想快速筛选一组书、但不想盲目跟风买书的人',
      sellingPoint: '先按人群和问题筛选，而不是看到“好书”两个字就下单',
      scene: '当你收藏了很多书单却一直不知道先看哪一本',
      suitedFor: '想先建立选书标准的人',
      notFor: '想一次买一堆但没有阅读计划的人',
    };
  }
  if (/允许一切发生|内耗|拧巴|焦虑|情绪|接纳|人生|选择/.test(title)) {
    return {
      isSpecificBook: /《[^》]+》/.test(title),
      audience: '最近焦虑、内耗、想让自己慢下来的人',
      sellingPoint: '帮你把内耗从对抗变成接纳',
      scene: '当你越想控制越累、越比较越后悔',
      suitedFor: '想慢慢理清情绪和选择的人',
      notFor: '只想立刻被鸡血打满、马上看到结果的人',
    };
  }
  if (/妈妈|当妈|孩子|育儿|童书|亲子|教辅|成绩|学习/.test(title)) {
    return {
      isSpecificBook: /《[^》]+》/.test(title),
      audience: '想给孩子选书、做亲子阅读或解决学习陪伴问题的人',
      sellingPoint: '帮你判断这类书是否适合当前年龄段和具体学习场景',
      scene: '当你不知道该买故事书、教辅还是习惯养成书',
      suitedFor: '愿意先看目录、年龄段和使用场景的家长',
      notFor: '期待一本书立刻改变成绩或习惯的人',
    };
  }
  return {
    isSpecificBook: /《[^》]+》/.test(title),
    audience,
    sellingPoint: '先判断它解决的问题是否和你当前需求匹配',
    scene: '当你被标题种草但还不确定是否真的需要',
    suitedFor: '愿意先看目录、详情和适合人群的人',
    notFor: '只看情绪标题就冲动下单的人',
  };
}

function buildSegmentStrategy(totalSeconds) {
  const count = Math.max(1, Math.ceil(totalSeconds / 10));
  const segmentNames = [
    '痛点钩子 + 场景代入',
    '商品/书本出现 + 适合谁',
    '核心卖点 + 轻 CTA',
    '目录/观点细节',
    '适合/不适合人群',
    '总结 + 点击引导',
  ];
  const lines = [];
  for (let index = 0; index < count; index += 1) {
    lines.push(`- 第 ${index + 1} 段 10 秒：${segmentNames[index] || '补充证明和行动引导'}。上一段最后 1 秒的画面要作为下一段开头参考，保持同一书桌、同一光线、同一人物局部、同一镜头质感；本段必须保留书名/封面/书脊/商品卡截图/中文卖点便签中的至少一种商品锚点。`);
  }
  lines.push('- 每段都不要出现平台水印、AI 字样、虚假销量、虚假价格、虚假测评截图。');
  lines.push('- 9:16 竖版，顶部 12%-15% 和底部 12%-15% 留作水印/按钮安全区，不放书名重点、人物主体、手和关键字幕。');
  lines.push('- 不要让 AI 生成随机英文内页；需要翻书时，书页内容模糊不可读，或改用中文目录便签/中文关键词卡。');
  lines.push('- 配音脚本必须和画面同步：讲书名时画面给书名/封面，讲卖点时画面给中文关键词，讲购买引导时画面给商品卡或封面定帧。');
  return lines;
}

function buildScript(totalSeconds) {
  if (totalSeconds <= 30) {
    return [
      '0-3s：镜头给书名/封面/商品卡。如果你最近正被一个具体问题卡住，可以先看这本。',
      '3-10s：画面给中文问题便签。它不是泛泛鸡血，更适合想把这个问题慢慢理清楚的人。',
      '10-20s：画面展示书封和 2-3 个中文关键词，只讲一个核心卖点，不讲完整书籍内容。',
      '20-30s：画面回到商品卡或封面定帧。如果你正好在这个阶段，可以点商品卡先看目录和详情。',
    ].join('\n');
  }
  return [
    '0-10s：痛点钩子：书名/封面或商品卡先出现，提出一个具体问题，不要空拍书桌。',
    '10-20s：商品出现：展示书封/书脊/中文关键词便签，说明它主打的问题。',
    '20-30s：卖点 1：只讲一个适用场景，画面同步给中文卖点卡。',
    '30-40s：观点拆解：挑 1 个观点做二创解释，不照读原文，不生成英文内页。',
    '40-50s：适合/不适合：两张中文便签放在书旁边，降低硬广感。',
    '50-60s：CTA：回到商品卡/封面定帧，可以点商品卡看目录和详情，确认适合再下单。',
  ].join('\n');
}

function buildComplianceChecklist() {
  return [
    '- 没买/没读完时，不说“我亲测、我读完、我用了一个月、效果立刻变好”。',
    '- 不承诺结果：不要写“看完必逆袭、一定改变人生、100%有效”。',
    '- 不伪造稀缺：不要写“最后一天、全网最低、只剩几单”，除非商品页真实存在且可证明。',
    '- 不伪造数据：不要编销量、评论、好评率、专家背书。',
    '- 不搬运对标视频的人脸、口播、字幕、音乐、画面；只学习结构。',
  ].join('\n');
}

function inferBookName(row) {
  const title = String(row.title || '').replace(/\s+/g, ' ').trim();
  const bracket = title.match(/《([^》]{1,40})》/);
  if (bracket) return bracket[1];

  const quoted = title.match(/[“「『]([^”」』]{1,40})[”」』]/);
  if (quoted) return quoted[1];

  const dir = dirFromPath(row.analysis_path || row.video_local_path || row.image_local_path);
  if (dir) {
    const name = dir.replace(/-\d{16,22}$/u, '').trim();
    if (name && !/图书带货|书本|book/i.test(name)) return name;
  }

  if (/三本|3本/.test(title)) return '三本好书';
  if (/10本|十本/.test(title)) return '十本书单';
  if (/卖书|带货|读书号|书单号|自媒体/.test(title)) return '图书带货方法';
  return compact(title.replace(/#.*$/u, '').replace(/[，。！？、|｜].*$/u, ''), 18) || product;
}

function dirFromPath(value) {
  if (!value) return '';
  return String(value).split(/[\\/]/)[0] || '';
}

function compact(text, max = 42) {
  const value = String(text || '').replace(/\s+/g, ' ').replaceAll('|', '/').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeTableCell(text) {
  return String(text || '').replace(/\s+/g, ' ').replaceAll('|', '\\|').trim();
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
