#!/usr/bin/env node
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY_FILES = [
  '/src/inkbox/main.js',
  '/src/inkbox/sim/worldEvents.js',
  '/src/inkbox/sim/interventionFeedback.js',
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['scripts/inkbox-server.mjs', `--port=${port}`], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += String(chunk); });
server.stderr.on('data', (chunk) => { serverOutput += String(chunk); });

try {
  let rootResponse = null;
  let lastError = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      rootResponse = await fetch(`${baseUrl}/`);
      break;
    } catch (error) {
      lastError = error;
      if (server.exitCode !== null) break;
      await sleep(100);
    }
  }
  if (!rootResponse?.ok) {
    throw new Error(`Inkbox server did not start: ${lastError?.message || serverOutput}`);
  }
  const html = await rootResponse.text();
  if (!html.includes('<html lang="zh-CN" data-app="inkbox"')) {
    throw new Error('根入口没有返回 Inkbox 页面');
  }
  if (!html.includes('data-app-version="1.0.0"') || !html.includes('./src/inkbox/main.js')) {
    throw new Error('Inkbox HTML 缺少统一版本号或模块入口');
  }

  for (const file of ENTRY_FILES) {
    const response = await fetch(`${baseUrl}${file}`);
    if (!response.ok) throw new Error(`入口资源无法加载：${file} (${response.status})`);
  }
  const indexResponse = await fetch(`${baseUrl}/index.html`);
  const index = await indexResponse.text();
  if (!index.includes("window.location.replace('./inkbox.html')")) {
    throw new Error('index.html 没有转到 Inkbox 主线');
  }
  console.log(`Inkbox startup OK · / → v1.0.0 · ${ENTRY_FILES.length} 个入口资源可加载`);
} finally {
  if (server.exitCode === null) server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    sleep(1500),
  ]);
  if (server.exitCode === null) server.kill();
}
