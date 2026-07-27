const COUNT_UNITS = new Map([
  ['万', 10000],
  ['w', 10000],
  ['W', 10000],
  ['k', 1000],
  ['K', 1000],
]);

export function parseCount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).trim().replaceAll(',', '');
  if (!text) return 0;

  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*([万wWkK]?)/);
  if (!match) return 0;
  const number = Number(match[1]);
  const unit = COUNT_UNITS.get(match[2]) || 1;
  return Math.round(number * unit);
}

export function parseRawSearchCard(raw = '') {
  const lines = String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const duration = lines.find((line) => /^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(line)) || '';
  const likeLine = lines.find((line) => /万|^\d{3,}$/.test(line) && !line.includes('#')) || '';
  const authorLine = lines.find((line) => line.startsWith('@')) || '';
  const publishLine = lines.find((line) => /^·/.test(line))?.replace(/^·\s*/, '') || '';
  const title = lines.find((line) => !line.startsWith('@') && !line.startsWith('·') && line !== duration && line !== likeLine) || '';

  return {
    title,
    author: authorLine.replace(/^@/, ''),
    publish_text: publishLine,
    duration,
    like_count: parseCount(likeLine),
  };
}

export function parsePublishDate(value, { now = new Date() } = {}) {
  const text = String(value || '').trim();
  if (!text) return '';

  const full = text.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  if (full) return formatDate(Number(full[1]), Number(full[2]), Number(full[3]));

  const monthDay = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (monthDay) {
    let year = now.getFullYear();
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    const candidate = new Date(year, month - 1, day);
    if (candidate.getTime() > now.getTime() + 86400000) year -= 1;
    return formatDate(year, month, day);
  }

  const daysAgo = text.match(/(\d+)\s*天前/);
  if (daysAgo) {
    const date = new Date(now.getTime() - Number(daysAgo[1]) * 86400000);
    return formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  const weeksAgo = text.match(/(\d+)\s*周前/);
  if (weeksAgo) {
    const date = new Date(now.getTime() - Number(weeksAgo[1]) * 7 * 86400000);
    return formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  if (/昨天/.test(text)) {
    const date = new Date(now.getTime() - 86400000);
    return formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  if (/今天|刚刚|小时前|分钟前/.test(text)) {
    return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  return text;
}

export function withinDays(dateText, days, { now = new Date() } = {}) {
  if (!dateText) return false;
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = new Date(now.getTime() - days * 86400000);
  return date >= cutoff && date <= now;
}

export function extractTags(text = '') {
  return [...String(text).matchAll(/#[^\s#]+/g)].map((match) => match[0]);
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
