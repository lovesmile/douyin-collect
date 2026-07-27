import http from 'node:http';
import { WebSocket } from 'ws';

const DEFAULT_CDP_URL = 'http://127.0.0.1:9222';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

export async function connectToPage({ cdpUrl = DEFAULT_CDP_URL } = {}) {
  const targets = await getJson(`${cdpUrl}/json`);
  const page = targets.find((target) => target.type === 'page');
  if (!page) {
    throw new Error(`No CDP page target found at ${cdpUrl}. Run scripts/launch-edge.mjs first.`);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }

    const callbacks = listeners.get(message.method);
    if (!callbacks) return;
    for (const callback of callbacks) callback(message.params || {});
  });

  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  function on(method, callback) {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(callback);
    return () => listeners.get(method)?.delete(callback);
  }

  async function evaluate(expression, options = {}) {
    const result = await command('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...options,
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.exception?.description || details.text || 'Runtime.evaluate failed');
    }
    return result.result.value;
  }

  async function navigate(url, { waitMs = 2500 } = {}) {
    await command('Page.navigate', { url });
    if (waitMs > 0) await sleep(waitMs);
  }

  async function pressEscape() {
    await command('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await command('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
  }

  async function getBrowserHeaders({ referer = 'https://www.douyin.com/' } = {}) {
    const userAgent = await evaluate('navigator.userAgent').catch(() => '');
    const cookieResult = await command('Network.getAllCookies').catch(() => ({ cookies: [] }));
    const cookies = (cookieResult.cookies || [])
      .filter((cookie) => /douyin\.com|snssdk\.com|byteimg\.com|bytedance/.test(cookie.domain))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
    return {
      'User-Agent': userAgent,
      Referer: referer,
      ...(cookies ? { Cookie: cookies } : {}),
    };
  }

  function close() {
    ws.close();
  }

  return { command, on, evaluate, navigate, pressEscape, getBrowserHeaders, close };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
