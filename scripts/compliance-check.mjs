import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const args = parseArgs(process.argv.slice(2));
const inputText = await loadInput();
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'ecommerce', 'compliance', todaySlug()));
await mkdir(outDir, { recursive: true });

const { report, riskCount } = buildReport(inputText);
const output = path.join(outDir, 'compliance-report.md');
await writeFile(output, `${report}\n`, 'utf8');
console.log(JSON.stringify({ output, riskCount }, null, 2));

async function loadInput() {
  if (args.file) return readFile(path.resolve(args.file), 'utf8');
  if (args.text) return String(args.text);
  return '';
}

function buildReport(text) {
  const rules = [
    {
      name: '虚假个人体验',
      patterns: ['亲测', '我读完', '我用了', '用了一个月', '真实测评', '实测有效', '自用'],
      advice: '没购买/没读完时，改成“从目录/商品信息看”“这本主打”“适合了解”。',
    },
    {
      name: '绝对化效果承诺',
      patterns: ['100%有效', '必逆袭', '一定改变', '立刻改变', '保证有效', '看完就会', '彻底解决'],
      advice: '改成“可能更适合”“可以帮助你了解”“提供一个思路”。',
    },
    {
      name: '虚假价格/稀缺',
      patterns: ['全网最低', '最后一天', '只剩', '限时最后', '亏本', '闭眼入', '不买后悔'],
      advice: '只有商品页真实显示且可证明时才可使用；否则改成“先看详情再决定”。',
    },
    {
      name: '伪造背书/数据',
      patterns: ['销量第一', '全网爆卖', '专家推荐', '央视推荐', '名人都在看', '好评率100%'],
      advice: '没有明确证据不要写；可改成“近期讨论度高”“很多人会关注这个问题”。',
    },
    {
      name: '医疗/教育夸大',
      patterns: ['治愈', '根治', '孩子立刻变自律', '成绩马上提升', '包会', '包过', '包上岸'],
      advice: '书本/教辅只能说“辅助理解、提供方法、适合练习”，不要承诺结果。',
    },
  ];

  const hits = [];
  for (const rule of rules) {
    const found = rule.patterns.filter((pattern) => text.includes(pattern));
    if (found.length) hits.push({ ...rule, found });
  }

  const report = [
    '# 带货内容合规检查报告',
    '',
    `检查时间：${new Date().toISOString()}`,
    '',
    hits.length ? '## 发现风险' : '## 未发现明显高风险词',
    '',
    ...(hits.length
      ? hits.flatMap((hit) => [
        `- ${hit.name}：命中 ${hit.found.map((item) => `“${item}”`).join('、')}`,
        `  - 建议：${hit.advice}`,
      ])
      : ['- 仍需人工确认：是否存在虚假体验、伪造销量、搬运对标画面、侵犯他人素材。']),
    '',
    '## 推荐安全表达',
    '',
    '- “从目录/商品信息看，它更适合……”',
    '- “如果你正在解决这个问题，可以先了解这本。”',
    '- “别急着买，先看目录是不是你需要的。”',
    '- “我会按公开信息拆一下它适合谁。”',
    '- “确认适合再下单。”',
  ].join('\n');

  return { report, riskCount: hits.length };
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
