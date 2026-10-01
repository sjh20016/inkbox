#!/usr/bin/env node
// 玩家启动器（M2-B）。
//
// 为什么要有它：`启动水墨沙盒.bat` 原先只做三件事——起服务器、盲等 2 秒、打开 `/`。
// 于是有三个实际问题：
//   ① 端口被占用时窗口直接报错，玩家看到的是「闪退」；
//   ② 服务还没监听就开浏览器 ⇒ 第一个页面是「无法连接」；
//   ③ 玩家落到 Canvas 主线，**没有任何入口能进 3D 立体沙盘或 Strata 界缘试验**，
//      而那正是 M2-B 要人实际测的东西。
//
// 现在把「模式 → URL 的映射 / 就绪轮询 / 复用已在跑的服务器 / 打开浏览器 / 打印测试指引」
// 全部收在这一处，`.bat` 只负责传参——批处理的引号地狱不值得写第二遍。
//
// ⚠️ 这个文件被 `scripts/inkbox-startup-check.mjs` import 来做断言，
//    所以**纯函数必须可导出、且 import 时不得执行 main()**。

import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PORT = 4180;

/**
 * 四种启动模式。`path` 是相对仓库根的入口（服务器 `/` 会解析到 `inkbox.html`）。
 *
 * `strata` 用的 `?boundary=strata` 是 M2-B 的**调试开关**（委托书 §54：
 * 正式 UI 不把它与玩家功能并列），所以它只能从地址栏或本启动器进入。
 */
export const LAUNCH_MODES = Object.freeze({
  canvas: {
    key: 'canvas', label: '凡间水墨（Canvas 主线 · 完整游戏）', path: 'inkbox.html',
    guide: [
      '左栏是神力与工具（抬山 / 沉陆 / 平整 / 皴石…），底部是速度、存档与「立体」按钮',
      '想观察另一界：左栏「观察」里选视界工具，在地图上拖出一块形状',
    ],
  },
  '3d': {
    key: '3d', label: '3D 立体沙盘（Render3D M2-B）', path: 'inkbox.html?renderer=3d',
    guide: [
      '工具下拉选「上界视界」或「幽冥视界」，然后在**凡间地形上按住左键拖一圈**，松手开窗',
      '开窗后看三件事：窗外凡间仍有水 / 树 / 村落；窗内是另一界；两者交界处是一道「界缘」断面',
      '中键旋转 · 右键平移 · 滚轮缩放；关窗：工具切回「检视」，或点开着的调试探针里的「关窗」',
      '雕刻只在凡间、且未开窗时可用（工具切「抬山 / 压地 / 平整 / 平滑」后左键拖动，Ctrl+Z 撤销）',
    ],
  },
  strata: {
    key: 'strata', label: '3D 立体沙盘 + Strata 界缘试验', path: 'inkbox.html?renderer=3d&boundary=strata',
    guide: [
      '本模式额外启用了 **Strata 垂直表现**：上界窗口被抬起、幽冥窗口被沉下，四周出现竖直断面',
      '同上：工具选「上界视界」，在凡间地形上拖一圈松手',
      '要对比 Raw：把地址栏里的 boundary=strata 改成 boundary=raw 再回车（同一世界、不重载）',
      '这一项正是 M2-B 需要人眼裁决的地方：Strata 是否一眼读得出「另一界」，还是像被抬起来的一块地',
    ],
  },
  server: {
    key: 'server', label: '只起服务器（不自动开浏览器）', path: 'inkbox.html',
    guide: [
      '服务器已就绪。想把地址发给别人 / 自己挑页面，用上面打印的地址即可。',
      '切 3D 加 ?renderer=3d；再叠 Strata 加 &boundary=strata。',
    ],
  },
});

const ALIASES = Object.freeze({
  '': 'canvas', '1': 'canvas', canvas: 'canvas', game: 'canvas', mortal: 'canvas',
  '2': '3d', '3d': '3d', sandbox: '3d', render3d: '3d',
  '3': 'strata', strata: 'strata', boundary: 'strata',
  '4': 'server', server: 'server', only: 'server', headless: 'server',
});

/**
 * 把玩家输入（序号或名字）解析成模式键。
 * @returns {{mode: string, recognized: boolean}} 无法识别时回落到 `canvas`，但如实报 `recognized: false`
 *   ——静默回落会让「我明明输了 3」变成一个查不出来的怪现象。
 */
export function resolveMode(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  const mode = ALIASES[key];
  return mode ? { mode, recognized: true } : { mode: 'canvas', recognized: false };
}

/** 模式 + 端口 → 完整入口地址。 */
export function buildUrl(mode, port = DEFAULT_PORT) {
  const entry = LAUNCH_MODES[mode]?.path ?? LAUNCH_MODES.canvas.path;
  return `http://127.0.0.1:${port}/${entry}`;
}

/** 端口收敛：非法值回落默认端口（与 `inkbox-server.mjs` 同款判据）。 */
export function normalizePort(raw, fallback = DEFAULT_PORT) {
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) && value >= 0 && value < 65536 ? value : fallback;
}

/** 探一次服务器是否已经在跑（短超时，用于「复用已在跑的实例」）。 */
export async function probeServer(port, timeoutMs = 800) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch (error) {
    // 设 INKBOX_LAUNCH_DEBUG=1 可以看到每一次探测为什么失败——现场排查「起不来」时先开它。
    if (process.env.INKBOX_LAUNCH_DEBUG) {
      const cause = error?.cause ? ` (cause: ${error.cause.code || error.cause.message || error.cause})` : '';
      console.error(`  [probe ${port}] ${error?.name || 'Error'}: ${error?.message || error}${cause}`);
    }
    return false;
  }
}

/**
 * 轮询等到服务器就绪。
 *
 * ⚠️ 这是替代原先「盲等 2 秒」的关键：冷启动时服务器可能 200 ms 就绪、
 * 也可能要 3 秒，固定等待两头都不对。
 *
 * @param {number} port
 * @param {{attempts?: number, intervalMs?: number, aborted?: () => boolean}} [options]
 * @returns {Promise<boolean>}
 */
export async function waitForServer(port, options = {}) {
  const attempts = options.attempts ?? 80;
  const intervalMs = options.intervalMs ?? 250;
  for (let i = 0; i < attempts; i += 1) {
    if (options.aborted?.()) return false;
    if (await probeServer(port, 600)) return true;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** 各平台「用默认浏览器打开 URL」的命令（纯函数，便于测试）。 */
export function browserCommand(url, platform = process.platform) {
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

/** 真正去打开浏览器；失败只提示、不阻断（服务器已经起来了，玩家可以手动开）。 */
export function openBrowser(url, platform = process.platform) {
  try {
    const { command, args } = browserCommand(url, platform);
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) { out[body.slice(0, eq)] = body.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[body] = next; i += 1; } else { out[body] = 'true'; }
  }
  return out;
}

/** 菜单里展示的顺序（序号 → 模式）。 */
const MENU = Object.freeze([['1', 'canvas'], ['2', '3d'], ['3', 'strata'], ['4', 'server']]);

function printMenu() {
  console.log('');
  console.log('  坐天观井 · Inkbox 1.0.0');
  console.log('  ──────────────────────────────────────────────');
  for (const [index, mode] of MENU) console.log(`   ${index}. ${LAUNCH_MODES[mode].label}`);
  console.log('');
  console.log('   直接回车 = 1（凡间水墨）');
  console.log('');
}

/**
 * 交互式选择模式。
 *
 * ⚠️ 菜单**必须**在这里（Node / UTF-8），不能写在 `.bat` 里：cmd.exe 按**字节偏移**
 *    重读批处理文件，UTF-8 中文配上 `chcp 65001` 会让解析器错位，
 *    `if errorlevel 1 ( ... )` 这种块会开始执行乱码——这是实测到的真实现象，
 *    原版启动脚本就是这么崩的（根本没跑到 node）。
 *
 * 管道输入（`echo 3|`）与 TTY 都能用；stdin 关闭时回落默认。
 */
export async function promptMode() {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (settled) return; settled = true; try { rl.close(); } catch { /* 已关 */ } resolve(value); };
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => finish(''));
    rl.question('  请输入序号后回车：', answer => finish(String(answer ?? '').trim()));
  });
}

function printGuide(mode, url) {
  const spec = LAUNCH_MODES[mode] ?? LAUNCH_MODES.canvas;
  console.log('');
  console.log('  ── 怎么测 ──────────────────────────────────────────');
  for (const line of spec.guide) console.log(`   · ${line}`);
  console.log('');
  console.log(`  地址：${url}`);
  console.log('  停止：在这个窗口按 Ctrl+C，或直接关掉它。');
  console.log('');
}

async function main(argv) {
  const args = parseArgs(argv);

  // 给脚本 / 测试用的纯输出模式：不探测、不起服务、不开浏览器、不提问。
  if (args['print-url']) {
    console.log(buildUrl(resolveMode(args.mode).mode, normalizePort(args.port)));
    return 0;
  }

  // 没给 --mode ⇒ 出菜单（`.bat` 因此可以保持纯 ASCII）。
  let modeInput = args.mode;
  if (modeInput === undefined) {
    printMenu();
    modeInput = (await promptMode()) || '1';
  }

  const { mode, recognized } = resolveMode(modeInput);
  const port = normalizePort(args.port);
  const url = buildUrl(mode, port);

  const spec = LAUNCH_MODES[mode];
  console.log('');
  console.log('  坐天观井 · Inkbox 1.0.0');
  console.log(`  模式：${spec.label}`);
  if (!recognized) console.log(`  ⚠️ 没看懂「${modeInput}」，已按默认的凡间水墨启动。`);
  console.log('');

  // ① 已经在跑就直接用——原脚本的第二份会以 EADDRINUSE 崩掉。
  if (await probeServer(port)) {
    console.log(`  端口 ${port} 上已有服务器在跑，直接打开浏览器（不再起第二个）。`);
    if (!args['no-open'] && mode !== 'server') openBrowser(url);
    printGuide(mode, url);
    return 0;
  }

  // ② 起服务器。stdio 继承 ⇒ 玩家看得到服务器日志，Ctrl+C 也能一起停。
  const child = spawn(process.execPath, ['scripts/inkbox-server.mjs', `--port=${port}`], {
    cwd: ROOT, stdio: 'inherit', windowsHide: false,
  });
  let exited = false;
  let exitCode = 0;
  child.on('exit', code => { exited = true; exitCode = code ?? 0; process.exitCode = exitCode; });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { try { child.kill(); } catch { /* 已经退出了 */ } });
  }

  // ③ 等**真的**就绪再开浏览器（端口占用之类的错误会由服务器自己打印，这里只等它退出）。
  const ready = await waitForServer(port, { aborted: () => exited });
  if (exited) return exitCode;   // 服务器自己退了（EADDRINUSE 等），错误已在它那一侧打印
  if (!ready) {
    // ⚠️ 探测失败**不等于**服务器没起来：实测出现过「服务器已经 HTTP 200、探测却连续失败」
    //    的假阴性。所以这里**不杀服务器**、也不当作失败——照常给出地址让玩家自己试。
    //    想查原因：INKBOX_LAUNCH_DEBUG=1 会打印每一次探测的失败原因。
    console.error(`  [警告] 未能在预期时间内确认服务器就绪（端口 ${port}）。`);
    console.error('  · 服务器进程仍在运行——直接在浏览器打开下面的地址试试。');
    console.error('  · 想排查：设 INKBOX_LAUNCH_DEBUG=1 再运行一次。');
  }
  if (!args['no-open'] && mode !== 'server') openBrowser(url);
  printGuide(mode, url);
  return null;   // 保持运行：服务器子进程还在，事件循环不会空
}

// 只有直接运行时才进 main；被 import（启动检查要断言纯函数）时保持静默。
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  const code = await main(process.argv.slice(2));
  if (code !== null) process.exit(code);
}
