import { createWriteStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ensureDir } from './files.mjs';

export async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function downloadUrl(url, outputFile, { headers = {}, skipExisting = true } = {}) {
  if (!url || !/^https?:\/\//.test(url)) return false;
  if (skipExisting && await exists(outputFile)) return true;

  await ensureDir(path.dirname(outputFile));
  const response = await fetch(url, {
    headers: {
      Accept: '*/*',
      ...headers,
    },
    redirect: 'follow',
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status} ${response.statusText}: ${url}`);
  }

  await new Promise((resolve, reject) => {
    const file = createWriteStream(outputFile);
    response.body.pipeTo(new WritableStream({
      write(chunk) {
        file.write(Buffer.from(chunk));
      },
      close() {
        file.end(resolve);
      },
      abort(error) {
        file.destroy(error);
        reject(error);
      },
    })).catch(reject);
  });

  const info = await stat(outputFile);
  return info.size > 0;
}

export async function runFfmpeg(args, { quiet = true } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      stdio: quiet ? ['ignore', 'ignore', 'pipe'] : 'inherit',
    });
    let stderr = '';
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

export async function ffprobeJson(file) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      file,
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(stderr || `ffprobe exited with code ${code}`));
      else resolve(JSON.parse(stdout || '{}'));
    });
  });
}

export async function convertToMp3(inputFile, outputFile) {
  if (await exists(outputFile)) return;
  await ensureDir(path.dirname(outputFile));
  await runFfmpeg(['-y', '-i', inputFile, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', outputFile]);
}

export async function extractThreeFrames(inputFile, frameDir) {
  await ensureDir(frameDir);
  const probe = await ffprobeJson(inputFile);
  const duration = Number(probe.format?.duration || 0);
  const times = duration > 3
    ? [Math.max(0.5, duration * 0.15), duration * 0.5, Math.max(0.5, duration * 0.85)]
    : [0, Math.max(0, duration * 0.5), Math.max(0, duration - 0.1)];

  for (let index = 0; index < 3; index += 1) {
    const output = path.join(frameDir, `frame-${String(index + 1).padStart(2, '0')}.jpg`);
    if (await exists(output)) continue;
    await runFfmpeg([
      '-y',
      '-ss',
      String(times[index].toFixed(2)),
      '-i',
      inputFile,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      output,
    ]);
  }
}
