#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LAUNCH_MODES, buildUrl, normalizePort, resolveMode } from './inkbox-launch.mjs';

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
// ⚠️ 服务器输出**写文件**而不是走管道：`stdio: ['ignore','pipe','pipe']` 需要开命名管道，
//    在受限沙箱里必定 EPERM（文档写明的边界），整条 `npm test` 会因此中断。
//    写文件两边都能跑，诊断信息也没丢。日志落在 reports/ci/（已被 .gitignore 覆盖）。
const logPath = path.join(ROOT, 'reports', 'ci', 'startup-server.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const logFd = fs.openSync(logPath, 'w');
const server = spawn(process.execPath, ['scripts/inkbox-server.mjs', `--port=${port}`], {
  cwd: ROOT,
  stdio: ['ignore', logFd, logFd],
  windowsHide: true,
});
fs.closeSync(logFd);
const serverOutput = () => {
  try { return fs.readFileSync(logPath, 'utf8').trim(); } catch { return '(日志不可读)'; }
};

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
    throw new Error(`Inkbox server did not start: ${lastError?.message || serverOutput()}`);
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

  // ── 玩家启动器（M2-B）的纯函数断言 ──────────────────────────────────
  // 启动器是玩家唯一的入口，它的「模式 → URL」映射写错了，玩家就进不去 3D / Strata。
  // 这里在同一个门禁里钉住它——顺带证明 `.bat` 依赖的那几个入口文件真的在磁盘上。
  const EXPECT = {
    canvas: '/inkbox.html',
    '3d': '/inkbox.html?renderer=3d',
    strata: '/inkbox.html?renderer=3d&boundary=strata',
    server: '/inkbox.html',
  };
  for (const [mode, suffix] of Object.entries(EXPECT)) {
    const spec = LAUNCH_MODES[mode];
    if (!spec) throw new Error(`启动器缺少模式：${mode}`);
    const url = buildUrl(mode, 4180);
    if (url !== `http://127.0.0.1:4180${suffix}`) throw new Error(`模式 ${mode} 的地址不对：${url}`);
    // 入口文件必须真的存在（比对时去掉查询串）
    const entry = spec.path.split('?')[0];
    if (!fs.existsSync(path.join(ROOT, entry))) throw new Error(`模式 ${mode} 指向不存在的入口：${entry}`);
  }
  if (!buildUrl('strata', 4180).includes('boundary=strata')) {
    throw new Error('Strata 试验模式的调试开关丢了');
  }
  // 序号与名字都要认；认不出来要如实报 recognized:false，不许静默装作成功。
  for (const [input, mode] of [['1', 'canvas'], ['2', '3d'], ['3', 'strata'], ['4', 'server'], ['canvas', 'canvas'], ['strata', 'strata']]) {
    const parsed = resolveMode(input);
    if (parsed.mode !== mode || !parsed.recognized) throw new Error(`启动器把「${input}」解析错了：${JSON.stringify(parsed)}`);
  }
  const bogus = resolveMode('这不是一个模式');
  if (bogus.recognized || bogus.mode !== 'canvas') throw new Error('无法识别的输入应当回落 canvas 并如实报 recognized:false');
  // 端口收敛：非法值回落，合法值原样
  for (const [input, expected] of [[undefined, 4180], ['4181', 4181], ['abc', 4180], ['70000', 4180], ['-1', 4180]]) {
    if (normalizePort(input) !== expected) throw new Error(`端口解析错：${input} → ${normalizePort(input)}`);
  }

  console.log(`Inkbox startup OK · / → v1.0.0 · ${ENTRY_FILES.length} 个入口资源可加载 · 启动器 ${Object.keys(LAUNCH_MODES).length} 个模式映射正确`);
} finally {
  if (server.exitCode === null) server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    sleep(1500),
  ]);
  if (server.exitCode === null) server.kill();
}
