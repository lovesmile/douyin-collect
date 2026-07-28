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
    '- 30 秒只适合讲一个钩子和一个卖点；单本书默认建议 60 秒；书单/卖书方法类默认建议 90 秒以上，最好拆成系列。',
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
    '- 30-50 秒：单本书补适合/不适合人群、1 个观点拆解、1 个使用场景。',
    '- 50-60 秒：单本书给轻行动引导，但不要虚假限时、虚假低价、虚假库存。',
    '- 60-90 秒：书单/方法类才展开：讲选书标准、为什么不要一次买一堆、最后落到实际挂车的 1 本书。',
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
  const profile = {
    recommendedSeconds: 60,
    durationReason: '单本书可以用 60 秒讲清一个人群、一个问题和一个购买理由；不要试图讲完整本书。',
    ...inferBookProfile(row),
  };
  const label = profile.isSpecificBook ? `《${name}》` : name;
  const full60 = buildVoiceover60({ name, label, profile });
  const long90 = profile.recommendedSeconds >= 90 ? buildVoiceover90({ label, profile }) : '';
  const short30 = buildVoiceover30({ label, profile });
  const visualPlan = buildVoiceoverVisualPlan({ label, profile });
  const targetLabel = profile.isSpecificBook ? '具体商品' : '对标结构';
  const mainVersion = totalSeconds <= 30 ? '30秒短版' : `${profile.recommendedSeconds || 60}秒推荐版`;
  return [
    `# ${name} 解说词`,
    '',
    `- 类型：${targetLabel}`,
    `- 建议主版本：${mainVersion}`,
    `- 核心人群：${profile.audience}`,
    `- 核心卖点：${profile.sellingPoint}`,
    `- 画面锚点：${profile.visualAnchor}`,
    `- 时长判断：${profile.durationReason}`,
    ...(long90 ? [
      '',
      '## 90秒长版口播（书单/方法类推荐）',
      '',
      long90,
    ] : []),
    '',
    '## 60秒完整版口播',
    '',
    full60,
    '',
    '## 30秒压缩版口播',
    '',
    short30,
    '',
    '## 逐段画面对应',
    '',
    visualPlan,
    '',
    '## 使用提醒',
    '',
    `- ${profile.sourceNote}`,
    '- 口播里不要说“我亲测、我读完、用了一个月、一定有效、看完必改变”。',
    '- 如果你拿到了真实目录/商品详情页，再把“核心卖点”和“适合人群”改得更具体；没有证据就不要编书中章节、作者背书或销量评价。',
  ].join('\n');
}

function buildVoiceover90({ label, profile }) {
  return [
    '0-10s：',
    `${profile.hook}如果你也是${profile.audience}，先别急着收藏一堆，这条先把选择逻辑讲明白。`,
    '',
    '10-20s：',
    `${label}这个方向不能只用一句“好书推荐”带过。真正影响转化的，是观众能不能马上判断：这是不是解决我现在问题的书。`,
    '',
    '20-30s：',
    `所以开头画面必须给到${profile.visualAnchor}，同时用中文便签写清“${profile.keywordCard}”。不要空拍书桌，也不要让 AI 随机生成英文内页。`,
    '',
    '30-40s：',
    `${profile.explain}这里不要一次讲很多本，先讲一个筛选标准，让观众知道你不是在随便堆书名。`,
    '',
    '40-50s：',
    `第一个标准：先看自己现在的问题。是情绪、亲子、学习、表达，还是行动力？问题不同，应该点开的书也不同。`,
    '',
    '50-60s：',
    `第二个标准：看目录和商品详情有没有对应你的场景。只被标题打动，但目录对不上，就先别急着下单。`,
    '',
    '60-70s：',
    `${profile.suitLine}这一步是降低硬广感的关键：适合谁讲清楚，不适合谁也要讲清楚。`,
    '',
    '70-80s：',
    `${profile.longScene || '如果你要复刻这类内容，最好把书单拆成系列：一条视频只讲一个问题、一类人群或者一本重点书。'} `,
    '',
    '80-90s：',
    `${profile.cta}如果你决定挂车，最后一定回到具体书名、商品卡和目录，不要让观众听完还不知道你推荐的到底是哪一本。`,
  ].join('\n');
}

function buildVoiceover60({ label, profile }) {
  return [
    '0-10s：',
    `${profile.hook}如果你也是${profile.audience}，先别急着刷下一个，这条只讲一个很具体的问题。`,
    '',
    '10-20s：',
    `${label}最适合拿来切入的点，不是“它有多神”，而是：${profile.sellingPoint}。${profile.pain}`,
    '',
    '20-30s：',
    `所以画面这里一定要给到${profile.visualAnchor}，旁边放一张中文便签，写清楚“${profile.keywordCard}”。观众要一眼知道你讲的是哪本书、哪类问题，不是随便拿一本书配音。`,
    '',
    '30-40s：',
    `${profile.explain}这段不要讲太满，越像朋友提醒，越不像硬广。`,
    '',
    '40-50s：',
    `${profile.suitLine}如果你只是被标题情绪打动，但目录和详情对不上你的问题，就先别急着买。`,
    '',
    '50-60s：',
    `${profile.cta}重点是先确认它是不是解决你现在的问题，而不是为了“好书推荐”四个字冲动下单。`,
  ].join('\n');
}

function buildVoiceover30({ label, profile }) {
  return [
    `${profile.hook}如果你是${profile.audience}，可以先了解一下${label}。`,
    `这条不讲完整内容，只讲一个点：${profile.sellingPoint}。`,
    `画面一定给到${profile.visualAnchor}，再配一张中文便签写“${profile.keywordCard}”，让观众知道声音和商品是同一个东西。`,
    `${profile.cta}`,
  ].join('\n');
}

function buildVoiceoverVisualPlan({ label, profile }) {
  const lines = [
    `- 0-10s：${profile.openingVisual}；字幕放“${profile.keywordCard}”。`,
    `- 10-20s：展示${label}的商品锚点，优先真实封面/商品卡截图；不要让 AI 生成英文内页。`,
    `- 20-30s：手写或摆放 2-3 个中文关键词：${profile.visualKeywords.join('、')}。`,
    `- 30-40s：用便签解释核心卖点，不照读原文，不伪造章节页码。`,
    `- 40-50s：两张便签写“适合：${profile.suitedFor}”“不适合：${profile.notFor}”。`,
    '- 50-60s：回到商品卡/封面定帧，底部和顶部留水印安全区，做轻 CTA。',
  ];
  if (profile.recommendedSeconds >= 90) {
    lines.push('- 60-70s：补一张“选书标准”便签，只讲一个标准，不要罗列十本。');
    lines.push('- 70-80s：展示实际准备挂车的 1 本书或商品卡，告诉观众为什么先从它开始。');
    lines.push('- 80-90s：回到商品卡/封面/目录截图，收束为“先看目录，再决定”。');
  }
  return lines.join('\n');
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
      hook: '很多人一听图书带货，就以为是随便找几本书、配一段鸡汤文案。其实真正难的是：你讲的内容，必须和商品卡里的书对得上。',
      pain: '新手最容易翻车的地方，就是画面很好看，口播也顺，但观众完全不知道你到底在卖哪本书。',
      explain: '这类样本最值得拆的不是具体话术，而是结构：先用一个真实痛点开头，再让书名或商品卡出现，最后只讲一个可以被理解的卖点。',
      suitLine: '这个选题更适合先拿来学习内容结构、商品锚点和合规表达，不适合直接照搬成发布稿。',
      cta: '正式发布前，先替换成你真实要挂车的书，再按那本书的目录和详情重写口播。',
      keywordCard: '选题-商品-卖点要对上',
      visualAnchor: '真实商品卡截图、目标书名、中文卖点便签',
      visualKeywords: ['选题', '商品锚点', '合规表达'],
      openingVisual: '先给商品卡截图或书名单，不要空拍书桌',
      recommendedSeconds: 90,
      durationReason: '方法类不是卖单本书，60 秒只能讲概念；90 秒才够讲清选题、商品锚点、合规表达和替换成真实挂车书的动作。',
      longScene: '这类视频最适合做成系列：第一条讲选题和商品怎么对上，第二条讲具体书的目录，第三条讲画面和口播怎么同步。',
      sourceNote: '这是图书带货方法类对标，不是具体单本书；只能学结构，发布前必须替换成真实挂车商品。',
    };
  }
  if (/允许一切发生/.test(title)) {
    return {
      isSpecificBook: /《[^》]+》/.test(title),
      audience: '最近焦虑、内耗、总想控制结果但又很累的人',
      sellingPoint: '把内耗从“对抗发生”转成“先接纳已经发生的事”',
      scene: '当你反复后悔一个选择、反复比较价格、反复猜别人态度时',
      suitedFor: '想慢慢理清情绪、减少反复拉扯的人',
      notFor: '只想看一句鸡血口号、立刻改变人生的人',
      hook: '买完东西还要反复比价，做完选择又开始后悔，关系散了还忍不住复盘，这种消耗其实很常见。',
      pain: '它戳中的不是“我要变得多厉害”，而是很多人每天都在经历的那种拉扯：事情已经发生了，心里却一直不肯放过自己。',
      explain: '这本书适合切成一个温柔但具体的角度：不是劝你什么都无所谓，而是先停止和已经发生的事情硬碰硬。',
      suitLine: '这本书更适合情绪敏感、容易后悔、容易把小事想很久的人。',
      cta: '如果你最近正处在这种状态，可以先点商品卡看目录和详情，确认它是不是你需要的表达方式。',
      keywordCard: '允许发生，不等于放弃选择',
      visualAnchor: '《允许一切发生》的真实封面、商品卡截图或书名便签',
      visualKeywords: ['接纳', '内耗', '选择'],
      openingVisual: '封面或商品卡先入镜，旁边放“越想控制越累？”的中文便签',
      recommendedSeconds: 60,
      durationReason: '这是单本情绪成长书，60 秒只讲一个核心情绪卖点刚好；如果扩到更长，需要真实目录或商品详情支撑。',
      sourceNote: '这段依据采集标题和情绪方向生成；如果有真实目录/详情页，可继续补充具体章节卖点，但不要编造亲测经历。',
    };
  }
  if (/妈妈|当妈|孩子|育儿|童书|亲子|教辅|成绩|学习/.test(title)) {
    return {
      isSpecificBook: /《[^》]+》/.test(title),
      audience: '想给孩子选书、做亲子阅读，或者在家庭和自我之间找回一点秩序的人',
      sellingPoint: '先按年龄段、使用场景和具体问题选书，而不是被“必读书单”带着买',
      scene: '当你一边照顾孩子，一边又觉得自己的时间和状态被掏空时',
      suitedFor: '愿意先看目录、年龄段和使用方式的家长',
      notFor: '期待一本书立刻改变孩子成绩或习惯的人',
      hook: '当妈以后，很多人的时间都给了孩子和家庭，但自己的心里反而越来越空。',
      pain: '这类书单真正能打动人的，不是“十本都要买”，而是它把一个很隐秘的状态说出来了：你也需要被照顾，也需要重新整理自己。',
      explain: '所以这条视频不要像清单报菜名，要只挑一个场景讲：深夜哄睡以后，为什么你会刷手机越刷越空。',
      suitLine: '这个方向更适合想慢慢恢复阅读节奏、重新照顾自己的人。',
      cta: '如果你准备挂具体书，先把其中一本拿出来讲清楚目录和适合场景，再引导点商品卡。',
      keywordCard: '不是买一堆书，是先找回自己',
      visualAnchor: '真实书单截图、具体书封、商品卡截图或中文书名便签',
      visualKeywords: ['当妈后', '内耗', '重新开始'],
      openingVisual: '夜晚书桌、台灯、书封或商品卡同框，便签写“当妈后，心里那片地荒了？”',
      recommendedSeconds: 90,
      durationReason: '妈妈/书单场景需要先共情、再讲选书标准、最后落到具体一本；60 秒容易只剩情绪，讲不清商品。',
      longScene: '如果是妈妈成长书单，建议一条视频只选一个场景：深夜哄睡后、通勤路上、孩子写作业旁边，而不是十本一起报菜名。',
      sourceNote: '这是由书单标题和妈妈场景推导的口播，发布时应选择具体挂车书名，不要泛泛挂一堆无关商品。',
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
      hook: '看到“这几本书让我脱胎换骨”，很多人第一反应是收藏，但收藏完往往还是不知道先看哪一本。',
      pain: '书单内容最容易空，是因为它只告诉你“这些书好”，却没有告诉你“哪一本适合现在的你”。',
      explain: '所以复刻这类选题时，不要一上来堆很多书名，先给一个筛选标准：你现在要解决的是情绪、表达、学习，还是行动力。',
      suitLine: '这个选题更适合想建立选书标准的人。',
      cta: '正式挂车时，建议只选其中一本重点讲清楚，再让观众点商品卡看目录。',
      keywordCard: '先选问题，再选书',
      visualAnchor: '书单封面、3本书同框、商品卡截图或中文筛选便签',
      visualKeywords: ['适合谁', '解决什么', '先看哪本'],
      openingVisual: '三本书或书单截图同框，便签写“别一口气全买”',
      recommendedSeconds: 90,
      durationReason: '书单类至少 90 秒：前 30 秒讲为什么不要乱买，中间 30 秒讲筛选标准，最后 30 秒落到实际挂车的一本书。',
      longScene: '书单最好拆成系列：第一条讲选书标准，第二条讲其中一本适合谁，第三条讲不适合谁和替代选择。',
      sourceNote: '这是书单类样本，适合拆结构；如果要发布带货，请把口播聚焦到实际挂车的一本书。',
    };
  }
  if (/内耗|拧巴|焦虑|情绪|接纳|人生|选择/.test(title)) {
    return {
      isSpecificBook: /《[^》]+》/.test(title),
      audience: '最近焦虑、内耗、总想控制结果但又很累的人',
      sellingPoint: '把内耗从“反复对抗”转成“先看清自己真正卡在哪里”',
      scene: '当你反复后悔一个选择、关系结束后还在复盘，或者越想控制越累时',
      suitedFor: '想慢慢理清情绪、减少反复拉扯的人',
      notFor: '只想看一句鸡血口号、立刻改变人生的人',
      hook: '有些人不是不努力，是太容易把一件已经发生的事，在脑子里反复重演。',
      pain: '这类内容能打动人，是因为它不是在卖成功学，而是在替观众说出那种说不清的累。',
      explain: '复刻时不要把话说成玄学，也不要承诺改变人生，只需要把一个小情绪讲具体。',
      suitLine: '这个方向更适合情绪敏感、容易后悔、容易把小事想很久的人。',
      cta: '正式发布时，先替换成具体挂车书名，再点出它和这个情绪问题的关系。',
      keywordCard: '先看清卡点，再选书',
      visualAnchor: '具体书封、商品卡截图或中文情绪关键词便签',
      visualKeywords: ['内耗', '接纳', '选择'],
      openingVisual: '真实书封/商品卡截图先入镜，便签写“为什么总是放不过自己？”',
      recommendedSeconds: 60,
      durationReason: '泛情绪成长方向如果没有具体书名，最多先做 60 秒种草结构；正式发布要落到具体商品。',
      sourceNote: '这是情绪成长类方向推导稿；发布时必须落到具体书名和商品详情，不要泛泛挂车。',
    };
  }
  return {
    isSpecificBook: /《[^》]+》/.test(title),
    audience,
    sellingPoint: '先判断它解决的问题是否和你当前需求匹配',
    scene: '当你被标题种草但还不确定是否真的需要',
    suitedFor: '愿意先看目录、详情和适合人群的人',
    notFor: '只看情绪标题就冲动下单的人',
    hook: '很多书籍视频的问题不是不漂亮，而是你听完仍然不知道它到底解决什么问题。',
    pain: '如果画面只有书桌、咖啡和翻书，观众会觉得像氛围素材，商品记不住，也不敢点。',
    explain: '所以这条内容要先把问题讲窄，再让商品出现，最后只给一个购买理由。',
    suitLine: '这个方向更适合想先理清需求的人。',
    cta: '可以先点商品卡看目录和详情，确认适合再下单。',
    keywordCard: '先看问题，再看目录',
    visualAnchor: '真实书封、商品卡截图或中文卖点便签',
    visualKeywords: ['问题', '目录', '适合谁'],
    openingVisual: '真实书封/商品卡截图先入镜，旁边放中文问题便签',
    sourceNote: '这是按标题方向生成的通用书籍带货稿；拿到商品详情后应继续细化。',
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
