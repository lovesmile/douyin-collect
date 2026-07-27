import path from 'node:path';
import { rm } from 'node:fs/promises';
import { connectToPage, sleep } from '../lib/cdp.mjs';
import { ensureDir, readJson, writeJson } from '../lib/files.mjs';
import { downloadUrl, convertToMp3 } from '../lib/media.mjs';
import { parseCount, parsePublishDate, parseRawSearchCard } from '../lib/parse.mjs';

const args = parseArgs(process.argv.slice(2));
const input = path.resolve(args.in || args.input || 'candidates.json');
const outDir = path.resolve(args.out || args.output || path.join('..', 'outputs', 'collect', todaySlug()));
const detailsFile = path.join(outDir, 'details.json');
const limit = Number(args.limit || 0);
const skipExisting = args.force ? false : true;

const candidates = await readJson(input, []);
const previous = await readJson(detailsFile, []);
const detailMap = new Map(previous.map((item) => [item.aweme_id, item]));
const queue = limit > 0 ? candidates.slice(0, limit) : candidates;
const cdp = await connectToPage();
const network = [];

cdp.on('Network.responseReceived', (event) => {
  const response = event.response || {};
  const url = response.url || '';
  if (!/^https?:\/\//.test(url)) return;
  const mime = response.mimeType || '';
  if (/video|audio|image/.test(mime) || /tos-cn|douyinpic|byteimg|aweme|mime_type=audio/.test(url)) {
    network.push({ url, mime, status: response.status, type: event.type });
  }
});

try {
  await cdp.command('Page.enable');
  await cdp.command('Runtime.enable');
  await cdp.command('Network.enable');

  for (let index = 0; index < queue.length; index += 1) {
    const candidate = queue[index];
    if (!candidate.aweme_id) continue;
    console.log(`[collect-details] ${index + 1}/${queue.length} ${candidate.aweme_id}`);
    network.length = 0;

    const url = candidate.href || `https://www.douyin.com/video/${candidate.aweme_id}`;
    await cdp.navigate(url, { waitMs: 3500 });
    await sleep(1500);

    const pageInfo = await extractPageInfo(cdp);
    const rawInfo = parseRawSearchCard(candidate.raw || '');
    const merged = normalizeDetail(candidate, rawInfo, pageInfo, network);
    await saveMedia(cdp, merged, outDir, { skipExisting });
    detailMap.set(merged.aweme_id, merged);
    await writeJson(detailsFile, [...detailMap.values()]);
  }
} finally {
  cdp.close();
}

console.log(JSON.stringify({ output: detailsFile, details: detailMap.size }, null, 2));

async function extractPageInfo(cdp) {
  return cdp.evaluate(`(() => {
    const text = document.body?.innerText || '';
    const metaDescription = document.querySelector('meta[name="description"], meta[property="og:description"]')?.content || '';
    const title = document.title || '';
    const images = [...document.querySelectorAll('img')]
      .filter((image) => image.naturalWidth > 500)
      .map((image) => image.currentSrc || image.src)
      .filter((src) => src && src.includes('biz_tag=aweme_images'));
    const videos = [...document.querySelectorAll('video')]
      .map((video) => ({
        currentSrc: video.currentSrc || video.src || '',
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        videoWidth: video.videoWidth || 0,
        videoHeight: video.videoHeight || 0,
      }));
    const resourceUrls = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => /^https?:\\/\\//.test(url));
    return { text, metaDescription, title, images, videos, resourceUrls, href: location.href };
  })()`);
}

function normalizeDetail(candidate, rawInfo, pageInfo, networkRows) {
  const text = [pageInfo.metaDescription, pageInfo.title, pageInfo.text, candidate.raw].filter(Boolean).join('\n');
  const likeText = text.match(/收获了?([0-9.]+万?)个喜欢/)?.[1]
    || text.match(/([0-9.]+万?)\s*(?:赞|喜欢)/)?.[1]
    || '';
  const followerText = text.match(/粉丝\s*([0-9.]+万?)/)?.[1] || '';
  const publishText = text.match(/(\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日|\d+天前|\d+周前|昨天|今天)/)?.[1] || rawInfo.publish_text || '';
  const title = cleanupTitle(pageInfo.metaDescription || rawInfo.title || candidate.title || pageInfo.title || '');
  const images = unique(pageInfo.images);
  const videoUrls = selectUrls(pageInfo, networkRows, 'video');
  const audioUrls = selectUrls(pageInfo, networkRows, 'audio');

  return {
    ...candidate,
    aweme_id: candidate.aweme_id,
    href: candidate.href || `https://www.douyin.com/video/${candidate.aweme_id}`,
    title,
    author: candidate.author || rawInfo.author || extractAuthor(text),
    follower_count: parseCount(candidate.follower_count || followerText),
    publish_time: candidate.publish_time || parsePublishDate(publishText),
    like_count: parseCount(candidate.like_count || rawInfo.like_count || likeText),
    comment_count: parseCount(candidate.comment_count || text.match(/([0-9.]+万?)\s*评论/)?.[1]),
    collect_count: parseCount(candidate.collect_count || text.match(/([0-9.]+万?)\s*收藏/)?.[1]),
    share_count: parseCount(candidate.share_count || text.match(/([0-9.]+万?)\s*分享/)?.[1]),
    duration: rawInfo.duration || formatDuration(Math.max(...pageInfo.videos.map((video) => video.duration || 0), 0)),
    media_type: images.length > 0 ? 'image' : 'video',
    image_urls: images,
    video_url: videoUrls[0] || '',
    audio_url: audioUrls[0] || (images.length > 0 ? videoUrls[0] || '' : ''),
    captured_media_urls: unique([...videoUrls, ...audioUrls, ...networkRows.map((row) => row.url)]).slice(0, 40),
  };
}

async function saveMedia(cdp, detail, outDir, { skipExisting }) {
  const itemDir = path.join(outDir, detail.aweme_id);
  await ensureDir(itemDir);
  const headers = await cdp.getBrowserHeaders({ referer: detail.href });

  if (detail.media_type === 'image') {
    const imageDir = path.join(itemDir, 'images');
    await ensureDir(imageDir);
    for (let index = 0; index < detail.image_urls.length; index += 1) {
      const imageFile = path.join(imageDir, `image-${String(index + 1).padStart(2, '0')}.webp`);
      await downloadUrl(detail.image_urls[index], imageFile, { headers, skipExisting });
    }
    if (detail.audio_url) {
      const tempAudio = path.join(itemDir, '_audio-source');
      await downloadUrl(detail.audio_url, tempAudio, { headers, skipExisting: false });
      await convertToMp3(tempAudio, path.join(itemDir, 'audio.mp3'));
      await rm(tempAudio, { force: true });
    }
    detail.image_local_path = rel(outDir, imageDir);
    detail.audio_local_path = rel(outDir, path.join(itemDir, 'audio.mp3'));
    return;
  }

  if (detail.video_url) {
    const videoFile = path.join(itemDir, `${detail.aweme_id}.mp4`);
    await downloadUrl(detail.video_url, videoFile, { headers, skipExisting });
    detail.video_local_path = rel(outDir, videoFile);
  }
}

function selectUrls(pageInfo, networkRows, kind) {
  const fromVideoTags = pageInfo.videos
    .map((video) => video.currentSrc)
    .filter((url) => /^https?:\/\//.test(url));
  const resources = pageInfo.resourceUrls || [];
  const rows = networkRows.filter((row) => {
    if (kind === 'video') return /video/.test(row.mime) || /mime_type=video|\/video\/|\.mp4|playwm|play_url/.test(row.url);
    return /audio/.test(row.mime) || /mime_type=audio|\.mp3|\.m4a|music|audio/.test(row.url);
  }).map((row) => row.url);
  return unique([...fromVideoTags, ...rows, ...resources.filter((url) => kind === 'audio' ? /audio|music|mime_type=audio/.test(url) : /play|video|mime_type=video|\.mp4/.test(url))]);
}

function extractAuthor(text) {
  return text.match(/@([^\n·]+)/)?.[1]?.trim() || '';
}

function cleanupTitle(text) {
  return String(text)
    .replace(/\s+-\s+.+?于\d{4}.+$/, '')
    .replace(/抖音.+$/, '')
    .trim();
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const rounded = Math.round(seconds);
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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
