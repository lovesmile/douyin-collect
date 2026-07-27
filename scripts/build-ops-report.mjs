import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { readJson } from '../lib/files.mjs';
import { readCsv } from '../lib/csv.mjs';
import { parseCount, extractTags } from '../lib/parse.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'collect', '2026-07-25-wearable-nail-trial'));
const details = await loadRows(outDir);
const rows = details
  .map((item) => ({
    ...item,
    like_count: parseCount(item.like_count),
    follower_count: parseCount(item.follower_count),
    tags: extractTags(item.title || item.raw || ''),
  }))
  .filter((item) => item.aweme_id)
  .sort((a, b) => b.like_count - a.like_count);

const report = buildReport(rows);
const output = path.join(outDir, 'account-ops-plan.md');
await writeFile(output, `${report}\n`, 'utf8');
console.log(JSON.stringify({ output, samples: rows.length }, null, 2));

function buildReport(rows) {
  const top = rows.slice(0, 50);
  const tagStats = countFlat(top.flatMap((item) => item.tags));
  const styleStats = countFlat(top.map((item) => inferBucket(item.title || item.raw || '')));
  const topTags = tagStats.slice(0, 12).map(([tag, count]) => `${tag}(${count})`).join('、') || '样本标签不足';
  const topStyles = styleStats.slice(0, 8).map(([tag, count]) => `${tag}(${count})`).join('、') || '样本风格不足';

  return [
    '# 穿戴甲账号运营方案',
    '',
    '## 1. 当前问题判断',
    '账号播放量在 1000 左右，通常不是“账号废了”，而是内容还没有让系统在小流量池里看到足够强的继续分发信号。穿戴甲赛道最关键的三个信号是：首屏停留、3 秒留存、收藏/评论意愿。',
    '',
    '你现在要做的不是泛泛学习爆款，而是把爆款拆成可复拍变量：款式、首帧、标题、光线、手势、场景、图文封面、BGM，然后每次只测试一个变量。',
    '',
    '## 2. 样本库观察',
    `- 样本数量：${rows.length}`,
    `- 高频标签：${topTags}`,
    `- 高频风格：${topStyles}`,
    '- 优先复用方向：显白、猫眼、爆闪、温柔通勤、夏日清透、蝴蝶仙气、甜酷克罗心。',
    '',
    '## 3. 账号定位',
    '建议账号不要做“什么美甲都发”，而是做一个更窄的账号心智：低成本、可直接佩戴、显白出片的穿戴甲选款号。',
    '',
    '- 一句话定位：每天帮普通女生挑一套不翻车的显白穿戴甲。',
    '- 人群：手不够白、不会选款、想低成本变精致、想拍照出片的女生。',
    '- 内容承诺：不用去美甲店，也能快速找到适合自己的款。',
    '',
    '## 4. 内容栏目',
    '- 爆款复拍：按样本库 TOP 款式复刻镜头结构，不搬运素材。',
    '- 显白测评：同一只手、同一光线，展示戴前戴后或不同色系对比。',
    '- 场景种草：通勤、约会、旅行、见家长、拍照、夏日穿搭。',
    '- 低价避坑：便宜但不廉价、哪些款显脏、哪些钻容易土。',
    '- AI 选款图文：用 AI 生成风格封面，再配真实样品细节图增强信任。',
    '',
    '## 5. 视频拍摄 SOP',
    '每条视频控制在 7-15 秒，前 3 秒不讲废话，直接给成品。',
    '',
    '1. 首帧：手戴成品，甲面占画面 60%-75%，标题 8-12 字。',
    '2. 第二镜：手指慢转或扫光，展示猫眼、钻饰、冰透、法式边。',
    '3. 第三镜：微距细节，突出做工、厚薄、贴合度。',
    '4. 第四镜：生活场景，拿杯子、拎包、翻书、摸衣服。',
    '5. 结尾：一句选择理由，不要硬广，例如“短手也能戴”“黄皮很友好”。',
    '',
    '拍摄配置：手机后摄，4K/30fps 或 1080p/60fps；窗边自然光加小补光；背景用白桌、灰布、丝绸、浅木纹；每条只拍一个主卖点。',
    '手部处理：拍摄前擦护手霜或少量护甲油，按商业手模状态优化——皮肤白皙干净、细腻通透，指节匀净，关节皱纹少、干纹少、泛红少；后期只做轻度商业修图，淡化关节皱纹、指节暗沉、干纹、倒刺和泛红；保留真实皮肤纹理、自然骨节、手型和甲片边缘，不要磨成塑料手。',
    '服装/道具处理：衣物、袖口、包和配饰要有高级真实材质，例如细腻针织、真丝/缎面、柔软羊毛、干净棉质、轻奢皮革、精致蕾丝、金属链条、珍珠/水晶配饰；布料要有真实纹理、垂坠、光泽和自然褶皱，不要廉价塑料感。',
    '',
    '## 6. 标题公式',
    '- 显白型：黄皮戴这套真的显白，不是滤镜骗你。',
    '- 场景型：通勤也能戴的温柔穿戴甲，干净但不寡淡。',
    '- 情绪型：谁懂这个转光，低头看手会开心一整天。',
    '- 人群型：短手短甲也能戴，不会显笨重。',
    '- 决策型：想买穿戴甲先看这 3 个细节。',
    '',
    '## 7. AI 图文生成方法',
    'AI 图文适合做封面、风格预览、系列化选题，不建议完全替代真实样品。穿戴甲的信任感来自真实上手和细节。',
    '',
    '通用主图提示词：',
    '',
    '```text',
    '真实产品摄影，一只女性手部佩戴穿戴甲，甲面显白高级，干净浅色背景，柔和自然光，9:16 竖图，甲面细节清晰，手型自然，手部呈商业手模状态：皮肤白皙干净、细腻通透，指节匀净，关节皱纹少、干纹少、泛红少；允许轻度淡化关节皱纹、指节暗沉、干纹、倒刺和泛红，但保留真实皮肤纹理、自然骨节、甲片边缘和贴合关系，不要畸形手指，不要卡通，不要过度磨皮，不要塑料手；背景衣物/布料/道具要有真实高级质感，不要廉价塑料感',
    '```',
    '',
    '猫眼款提示词：',
    '',
    '```text',
    '女性手部佩戴猫眼穿戴甲，冷色冰透质感，光线扫过甲面，有细腻转光，真实微距产品摄影，干净背景，高级感，9:16',
    '```',
    '',
    '通勤款提示词：',
    '',
    '```text',
    '女性手部佩戴裸色法式穿戴甲，温柔通勤风，拿着咖啡杯，浅色针织背景，自然光，干净高级，真实生活方式摄影，9:16',
    '```',
    '',
    '甜酷款提示词：',
    '',
    '```text',
    '女性手部佩戴克罗心风格穿戴甲，银色金属装饰，甜酷风，黑白灰干净背景，真实产品摄影，甲面细节清晰，9:16',
    '```',
    '',
    'AI 图文发布结构：第 1 张 AI 氛围封面，第 2 张真实上手，第 3 张甲面微距，第 4 张佩戴场景，第 5 张购买/选款理由。',
    '',
    '## 8. 30 天执行节奏',
    '- 第 1 周：每天 3 条，重点测首帧。每个款式拍“特写版、场景版、图文版”。',
    '- 第 2 周：保留播放最高的 3 个风格，继续测标题和标签。',
    '- 第 3 周：围绕高收藏款做系列，例如“黄皮显白 7 套”“通勤不翻车 7 套”。',
    '- 第 4 周：把表现最好的款式做直播/橱窗/私信承接脚本。',
    '',
    '## 9. 每日 TOP10 更新机制',
    '每天采集当天或近 2 天热门穿戴甲内容 TOP10，按点赞优先保存到 daily-top10 日期目录。你每天只做三件事：看 TOP10 首帧、抄镜头结构、改成自己的款式。',
    '',
    '## 10. 关键指标',
    '- 500 播以内看首帧点击和 3 秒留存。',
    '- 1000 播左右看完播率和收藏率。',
    '- 收藏率高但播放低，继续换标题和封面。',
    '- 播放高但收藏低，说明好看但购买理由弱，要补显白、场景、价格、佩戴便利。',
  ].join('\n');
}

async function loadRows(root) {
  const details = await readJson(path.join(root, 'details.json'), null).catch(() => null);
  if (Array.isArray(details) && details.length) return details;
  const manifest = await readCsv(path.join(root, 'manifest.csv')).catch(() => []);
  if (manifest.length) return manifest.map((row) => ({ ...row, href: row.share_url }));
  return readJson(path.join(root, 'candidates.json'), []);
}

function inferBucket(text) {
  if (/猫眼/.test(text)) return '猫眼';
  if (/显白/.test(text)) return '显白';
  if (/闪|钻|爆闪/.test(text)) return '爆闪钻饰';
  if (/温柔|裸|法式|通勤/.test(text)) return '温柔通勤';
  if (/蝴蝶/.test(text)) return '蝴蝶仙气';
  if (/克罗心|甜酷|辣妹/.test(text)) return '甜酷';
  if (/夏|冰透|海/.test(text)) return '夏日清透';
  if (/新中式|国风|玉/.test(text)) return '新中式';
  return '氛围感';
}

function countFlat(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
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
