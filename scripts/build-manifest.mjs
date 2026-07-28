import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ensureDir, csvEscape, readJson } from '../lib/files.mjs';
import { readCsv } from '../lib/csv.mjs';
import { exists } from '../lib/media.mjs';
import { extractTags, parseCount, withinDays } from '../lib/parse.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'collect', todaySlug()));
const detailsFile = path.resolve(args.details || path.join(outDir, 'details.json'));
const minLikes = Number(args.minLikes || args['min-likes'] || 1000);
const maxFollowers = Number(args.maxFollowers || args['max-followers'] || 50000);
const days = Number(args.days || 90);
const limit = Number(args.limit || 50);
const includeTitle = String(args.includeTitle || args['include-title'] || args.requireTitle || args['require-title'] || '').trim();
const excludeTitle = String(args.excludeTitle || args['exclude-title'] || '').trim();

const details = await loadRows(detailsFile, outDir);
const selected = selectRows(details)
  .slice(0, limit)
  .map((item, index) => ({ ...item, rank: index + 1 }));

await ensureDir(outDir);
await writeManifest(outDir, selected);
for (const item of selected) {
  await writeItemTextFiles(outDir, item, selected.length);
}
await writeIndex(outDir, selected, details.length);

console.log(JSON.stringify({ outDir, candidates: details.length, selected: selected.length }, null, 2));

function selectRows(rows) {
  return rows
    .map((item) => ({
      ...item,
      href: item.href || item.share_url,
      like_count: parseCount(item.like_count),
      follower_count: parseCount(item.follower_count),
      comment_count: parseCount(item.comment_count),
      collect_count: parseCount(item.collect_count),
      share_count: parseCount(item.share_count),
    }))
    .filter((item) => item.aweme_id)
    .filter((item) => item.like_count >= minLikes)
    .filter((item) => item.follower_count === 0 || item.follower_count < maxFollowers)
    .filter((item) => withinDays(item.publish_time, days) || (args.allowUnknownDate && !isKnownDate(item.publish_time)))
    .filter((item) => matchesInclude(item.title || ''))
    .filter((item) => !matchesExclude(item.title || ''))
    .sort((a, b) => b.like_count - a.like_count);
}

function matchesInclude(title) {
  if (!includeTitle) return true;
  return splitTerms(includeTitle).some((term) => String(title || '').includes(term));
}

function matchesExclude(title) {
  if (!excludeTitle) return false;
  return splitTerms(excludeTitle).some((term) => String(title || '').includes(term));
}

function splitTerms(value) {
  return String(value || '')
    .split(/[,，|｜]/u)
    .map((term) => term.trim())
    .filter(Boolean);
}

function isKnownDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

async function loadRows(file, root) {
  const rows = await readJson(file, null).catch(() => null);
  if (Array.isArray(rows) && rows.length) return rows;
  const manifestRows = await readCsv(path.join(root, 'manifest.csv')).catch(() => []);
  return manifestRows.map((row) => ({
    ...row,
    href: row.share_url,
    media_type: row.image_local_path ? 'image' : 'video',
  }));
}

async function writeManifest(root, rows) {
  const headers = [
    'rank',
    'aweme_id',
    'share_url',
    'title',
    'author',
    'follower_count',
    'publish_time',
    'like_count',
    'comment_count',
    'collect_count',
    'share_count',
    'duration',
    'content_type',
    'visual_style',
    'content_angle',
    'reuse_priority',
    'video_local_path',
    'cover_local_path',
    'analysis_path',
    'exclusion_reason',
    'image_local_path',
    'audio_local_path',
  ];
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    const dir = path.join(root, row.aweme_id);
    const videoFile = path.join(dir, `${row.aweme_id}.mp4`);
    const imageDir = path.join(dir, 'images');
    const audioFile = path.join(dir, 'audio.mp3');
    const hasVideo = await exists(videoFile);
    const hasImages = await exists(imageDir);
    const hasAudio = await exists(audioFile);
    const style = inferStyle(row.title || '');
    const values = {
      rank: row.rank,
      aweme_id: row.aweme_id,
      share_url: row.href || `https://www.douyin.com/video/${row.aweme_id}`,
      title: row.title,
      author: row.author,
      follower_count: row.follower_count,
      publish_time: row.publish_time,
      like_count: row.like_count,
      comment_count: row.comment_count || '',
      collect_count: row.collect_count || '',
      share_count: row.share_count || '',
      duration: row.duration || '',
      content_type: hasImages ? '图文+音频' : '视频',
      visual_style: style.theme,
      content_angle: style.angle,
      reuse_priority: reusePriority(row),
      video_local_path: hasVideo ? rel(root, videoFile) : '',
      cover_local_path: '',
      analysis_path: rel(root, path.join(dir, 'analysis.txt')),
      exclusion_reason: hasImages ? '图文+音频已保存' : '已核验有效',
      image_local_path: hasImages ? rel(root, imageDir) : '',
      audio_local_path: hasAudio ? rel(root, audioFile) : '',
    };
    lines.push(headers.map((header) => csvEscape(values[header])).join(','));
  }
  await writeFile(path.join(root, 'manifest.csv'), `${lines.join('\n')}\n`, 'utf8');
}

async function writeItemTextFiles(root, item, total) {
  const itemDir = path.join(root, item.aweme_id);
  await ensureDir(itemDir);
  const isImage = await exists(path.join(itemDir, 'images'));
  const hasAudio = await exists(path.join(itemDir, 'audio.mp3'));
  const videoFile = path.join(itemDir, `${item.aweme_id}.mp4`);
  const hasVideo = await exists(videoFile);
  const mediaStatus = isImage ? '图文+音频已保存' : '已核验有效';

  const info = [
    `视频ID：${item.aweme_id}`,
    `点赞优先排名：${item.rank}/${total}`,
    `链接：${item.href || `https://www.douyin.com/video/${item.aweme_id}`}`,
    `标题：${item.title || ''}`,
    `点赞数：${item.like_count}`,
    `评论数：${item.comment_count || ''}`,
    `收藏数：${item.collect_count || ''}`,
    `转发数：${item.share_count || ''}`,
    `作者：${item.author || ''}`,
    `粉丝数：${item.follower_count || ''}`,
    `发布时间：${item.publish_time || ''}`,
    `内容类型：${isImage ? '图文' : '视频'}`,
    `保存状态：${mediaStatus}`,
    `视频路径：${hasVideo ? rel(root, videoFile) : ''}`,
    `图片路径：${isImage ? rel(root, path.join(itemDir, 'images')) : ''}`,
    `音频路径：${hasAudio ? rel(root, path.join(itemDir, 'audio.mp3')) : ''}`,
    `拆解路径：${rel(root, path.join(itemDir, 'analysis.txt'))}`,
  ].join('\n');
  await writeFile(path.join(itemDir, 'video-info.txt'), `${info}\n`, 'utf8');

  const analysis = buildAnalysis(root, item, { total, isImage, hasAudio, hasVideo });
  await writeFile(path.join(itemDir, 'analysis.txt'), `${analysis}\n`, 'utf8');
}

function buildAnalysis(root, item, { total, isImage, hasAudio, hasVideo }) {
  const tags = extractTags(item.title || '');
  const tagText = tags.join('、') || '无明确标签';
  const fanRatio = item.follower_count ? Number((item.like_count / item.follower_count).toFixed(2)) : '';
  const style = inferStyle(item.title || '');
  const hook = inferHook(item.title || '', style);
  const mediaLine = isImage
    ? `图片序列：images/；配套音频：${hasAudio ? 'audio.mp3' : '未捕获'}`
    : `视频：${hasVideo ? `${item.aweme_id}.mp4` : '未捕获'}；关键帧：frames/frame-01.jpg、frame-02.jpg、frame-03.jpg`;

  return [
    `# ${item.aweme_id} 运营拆解`,
    '',
    '## 1. 基础数据',
    `- 点赞优先排名：${item.rank}/${total}`,
    `- 标题：${item.title || ''}`,
    `- 标签：${tagText}`,
    `- 点赞：${item.like_count}`,
    `- 评论：${item.comment_count || '未稳定获取'}`,
    `- 收藏：${item.collect_count || '未稳定获取'}`,
    `- 转发：${item.share_count || '未稳定获取'}`,
    `- 粉丝：${item.follower_count || '未稳定获取'}`,
    `- 传播效率：${fanRatio === '' ? '粉丝数未稳定获取，暂不计算点赞/粉丝比。' : `点赞/粉丝比 ${fanRatio}，适合判断小账号可复制性。`}`,
    `- 发布时间：${item.publish_time || '未稳定获取'}`,
    `- 本地素材：${mediaLine}`,
    '',
    '## 2. 为什么它可能爆',
    `- 核心卖点：${style.angle}`,
    `- 视觉主题：${style.theme}`,
    `- 色系质感：${style.palette}`,
    `- 目标人群：${style.audience}`,
    `- 使用场景：${style.scene}`,
    `- 低粉账号可复用点：${style.reusable}`,
    '',
    '## 3. 首屏和前 3 秒拆解',
    `- 首屏必须出现：${hook.firstFrame}`,
    `- 0-1 秒：${hook.second0}`,
    `- 1-3 秒：${hook.second3}`,
    `- 文字钩子：${hook.textHook}`,
    `- 情绪触发：${hook.emotion}`,
    `- 购买动机：${hook.intent}`,
    '',
    '## 4. 镜头脚本复拍版',
    `- 镜头 1：手部成品正面近景，画面占比 70% 以上，背景保持干净，直接交代 ${style.theme}。`,
    `- 镜头 2：手指轻微转动或换角度，让 ${style.palette} 的光泽变化被看见。`,
    `- 镜头 3：拉近拍甲面细节，突出钻、猫眼、法式边、蝴蝶、克罗心等识别点。`,
    `- 镜头 4：给一个生活化佩戴场景，如拿杯子、翻书、拎包、摸衣料，证明它不是只在棚拍里好看。`,
    `- 镜头 5：用标题同款关键词收尾，提示收藏、同款、显白、通勤或夏日搭配。`,
    '',
    '## 5. 拍摄参数建议',
    '- 画幅：9:16 竖屏，1080p 或 4K，手部居中偏下，顶部留 15% 给标题字幕。',
    '- 光线：窗边自然光或一盏 45 度柔光灯，爆闪/猫眼款可加一段手机补光灯扫光。',
    '- 背景：白色、灰色、浅木纹、丝绸、毛呢或包包局部，背景纹理不能抢甲面。',
    '- 手势：慢转、轻捏、搭杯沿、扣包链、拨头发、翻书页，动作幅度小，避免抖。',
    '- 剪辑：每个镜头 0.7-1.5 秒，前 3 秒至少给 2 个角度，不要先铺垫故事。',
    '',
    '## 6. 标题和标签复用',
    `- 标题公式 1：${style.theme} + 显白/显贵/通勤 + 场景，例如“这套${style.theme}真的太显白了”。`,
    `- 标题公式 2：人群 + 痛点 + 款式，例如“短手也能戴的${style.angle}”。`,
    `- 标题公式 3：情绪 + 细节，例如“谁懂这个${style.palette}转光有多绝”。`,
    `- 标签优先级：#穿戴甲、#美甲、#显白美甲、#氛围感美甲，再叠加款式词如 #猫眼美甲、#法式美甲、#蝴蝶美甲。`,
    '',
    '## 7. AI 图文复用方法',
    `- 图文主图提示词：一只女性手部佩戴${style.theme}穿戴甲，${style.palette}，干净高级背景，真实产品摄影，柔和自然光，浅景深，竖版 9:16，甲面细节清晰。`,
    `- 细节图提示词：穿戴甲甲面微距特写，突出${style.angle}，可见光泽、钻饰和边缘做工，真实摄影，不要卡通，不要夸张手指。`,
    `- 场景图提示词：女性手部佩戴${style.theme}穿戴甲，拿着咖啡杯或小包，生活方式摄影，画面干净，适合小红书/抖音图文封面。`,
    '- 生成后处理：只保留手型自然、甲片数量和位置正确、没有畸形手指的图；再用真实样品补拍 1-2 张，避免全 AI 图导致信任感不足。',
    '',
    '## 8. 你的账号复用动作',
    '- 不直接搬运原视频，复用结构、镜头语言、标题公式和款式方向。',
    `- 先拍 3 条同风格变体：一条强首屏特写、一条上手生活场景、一条图文+音频。`,
    '- 每条只测试一个变量：款式、标题、首帧、价格感、场景，不要一次全改。',
    '- 发布后 2 小时看完播率、5 秒留存、收藏率；播放仍在 1000 左右时，优先改首帧和标题，不先怀疑账号。',
  ].join('\n');
}

async function writeIndex(root, selected, candidateCount) {
  const videoCount = selected.filter((item) => item.media_type !== 'image').length;
  const imageCount = selected.length - videoCount;
  const content = [
    '# 抖音穿戴甲采集结果',
    '',
    `- 候选数量：${candidateCount}`,
    `- 有效样本：${selected.length}`,
    `- 视频样本：${videoCount}`,
    `- 图文+音频样本：${imageCount}`,
    '- 排序规则：点赞数降序',
    `- 筛选规则：近 ${days} 天、点赞不少于 ${minLikes}、作者粉丝少于 ${maxFollowers}`,
    '- 拆解口径：围绕低粉账号复用，覆盖首屏、镜头、标题、拍摄、AI 图文和账号测试动作。',
    '',
    '结构化清单见 [manifest.csv](./manifest.csv)，原始详情见 [details.json](./details.json)。',
  ].join('\n');
  await writeFile(path.join(root, '_index.md'), `${content}\n`, 'utf8');
}

function inferStyle(title) {
  const text = title || '';
  const theme = /蝴蝶/.test(text) ? '蝴蝶仙气款'
    : /猫眼/.test(text) ? '猫眼光泽款'
      : /克罗心|甜酷|辣妹|酷/.test(text) ? '甜酷金属款'
        : /法式|白开水|裸色|温柔|通勤/.test(text) ? '温柔通勤款'
          : /钻|爆闪|闪|碎钻/.test(text) ? '高闪钻饰款'
            : /新中式|国风|玉|青花/.test(text) ? '新中式氛围款'
              : '显白氛围款';
  const palette = /蓝|海|绿|祖母绿|冰透/.test(text) ? '冷色、冰透、猫眼或水光质感'
    : /粉|裸|白|奶|白开水/.test(text) ? '浅色、低饱和、柔和显白'
      : /黑|银|克罗心|金属/.test(text) ? '暗色或金属装饰，偏甜酷'
        : /钻|闪|爆闪|碎钻/.test(text) ? '亮片、碎钻、反光强刺激'
          : '以成品首屏的显白和氛围为主';
  const angle = /显白/.test(text) ? '显白'
    : /贵|千金|高奢|高级/.test(text) ? '显贵和高级感'
      : /夏|海|冰透/.test(text) ? '夏日清透感'
        : /通勤|温柔|裸/.test(text) ? '日常好搭配'
          : /闪|钻|猫眼/.test(text) ? '强光泽和强细节'
            : '好看、精致、适合收藏';
  const audience = /辣妹|甜酷|克罗心/.test(text) ? '喜欢个性、拍照出片、偏年轻的用户'
    : /通勤|温柔|裸|法式/.test(text) ? '上班、约会、日常通勤用户'
      : /长甲|爆闪|钻/.test(text) ? '喜欢强存在感和拍照效果的用户'
        : '想低成本变精致的穿戴甲用户';
  const scene = /夏|海|冰透/.test(text) ? '夏日穿搭、旅行、清爽氛围'
    : /通勤|温柔|裸/.test(text) ? '通勤、约会、日常穿搭'
      : /千金|高奢|贵/.test(text) ? '聚会、拍照、节日礼物'
        : '日常上手展示和同款搜索';
  const reusable = /显白/.test(text) ? '显白卖点、上手对比、自然光特写'
    : /温柔|通勤|裸/.test(text) ? '干净背景、低饱和色系、生活化手势'
      : /钻|闪|猫眼/.test(text) ? '扫光、慢转、近距离闪点特写'
        : '成品首屏、关键词标题、细节近景';
  return { theme, palette, angle, audience, scene, reusable };
}

function inferHook(title, style) {
  const emotion = /仙|温柔/.test(title) ? '仙气、温柔、干净'
    : /贵|千金|高奢|高级/.test(title) ? '显贵、高级、被夸'
      : /辣妹|甜酷|克罗心/.test(title) ? '个性、甜酷、吸睛'
        : /闪|钻|猫眼/.test(title) ? '惊艳、亮眼、强视觉刺激'
          : '好看、显白、有氛围';
  const intent = /显白/.test(title) ? '解决手部显黑和搭配不精致的问题'
    : /夏|通勤|约会/.test(title) ? '匹配具体场景，降低选择成本'
      : /穿戴甲/.test(title) ? '强调可直接佩戴、低成本试错'
        : '激发收藏、试戴和同款搜索';
  return {
    firstFrame: `${style.theme}成品上手，甲面细节清楚，不能先出现包装或空镜。`,
    second0: '直接给最好看的成品角度，字幕不超过 12 个字。',
    second3: '迅速切到第二个角度或扫光，让用户看到它不是单一静态好看。',
    textHook: `围绕“${style.angle}”写一句强判断，比如“这套真的显白/显贵/太适合夏天”。`,
    emotion,
    intent,
  };
}

function reusePriority(item) {
  const ratio = item.follower_count ? item.like_count / item.follower_count : item.like_count / 1000;
  if (item.rank <= 10 || ratio >= 10) return 'S';
  if (item.rank <= 25 || ratio >= 3) return 'A';
  return 'B';
}

function rel(root, file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
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
