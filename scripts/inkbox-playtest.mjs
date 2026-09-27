#!/usr/bin/env node
// 水墨沙盒 · 端到端试玩测试
//
// 和 inkbox-smoke.mjs 的分工：
//   smoke   —— 直接调模块，验证「物理与数据」对不对（世界生成、侵蚀、存读档逐格一致）
//   playtest—— 走真实浏览器事件，验证「界面与交互」通不通
//              （点工具按钮、在画布上按真实坐标落笔、滚轮缩放、Ctrl+Z、存读档按钮）
//
// 之所以要分开：冒烟测试永远发现不了「滚轮缩放后第一笔落在错误的格子上」这类问题，
// 因为它根本不过 pointerdown / pointermove 这条链路。
//
// 复用本机 Edge（CDP），零依赖。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TOOLS, TOOL_GROUPS } from '../src/inkbox/ui/tools.js';
// 境界横条的期望值**从境界表现算**，不写死条数与标签（理由见第 6b 节那条注释）。
import { REALMS } from '../src/inkbox/core/cultivation.js';
// 三界面板（10e 节）要的两样：五路的中文名与「夺舍」这个名册专有值。
// **从模块读、不在断言里手抄五个词**——那五个词是考古定名（06 册 §5.2），
// 手抄一份就等于给自己造第二个真相，将来改名时断言会指着旧名字绿着。
import { ROUTE_LABEL, SOUL_ROUTES, SOUL_ROUTE_POSSESS } from '../src/inkbox/sim/reincarnation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 分组数与工具总数直接从工具表里读，不写死。
// 之前这里硬编码「六组 25 个」，加了仙道九式之后立刻变成假失败——
// 断言该守的是「界面渲染出来的工具集与工具表一致」，不是某个具体数字。
const EXPECT_GROUPS = TOOL_GROUPS.length;
const EXPECT_TOOLS = TOOLS.length;

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].filter(Boolean);
const BROWSER = EDGE_CANDIDATES.find((candidate) => fs.existsSync(candidate));

function arg(name, fallback) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const URL_TARGET = arg('url', 'http://127.0.0.1:4180/inkbox.html');
const PORT = Number(arg('port', '9344'));
const WIDTH = Number(arg('width', '1500'));
const HEIGHT = Number(arg('height', '940'));
const SHOT_DIR = path.resolve(ROOT, arg('shots', 'reports/inkbox/playtest'));

if (!BROWSER) {
  console.error('找不到 Edge / Chrome，可执行文件均不存在。');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function waitForDevTools(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const version = await response.json();
        if (version.webSocketDebuggerUrl) return version;
      }
    } catch { /* 浏览器的调试 HTTP 服务仍在启动 */ }
    await sleep(200);
  }
  return null;
}

async function createDevToolsTarget(port) {
  const url = `http://127.0.0.1:${port}/json/new?about:blank`;
  // 新版 Chromium 要求 PUT；旧版可能接受 GET。两种都按响应状态和目标形状判断，
  // 不能把 HTTP 405 的 JSON 错误对象误当成已创建的 target。
  let response = await fetch(url);
  if (response.ok) {
    const target = await response.json();
    if (target.webSocketDebuggerUrl) return target;
  }
  response = await fetch(url, { method: 'PUT' });
  if (!response.ok) throw new Error(`创建浏览器页面失败：HTTP ${response.status}`);
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) throw new Error('浏览器没有返回页面调试地址');
  return target;
}

async function stopBrowser(child) {
  if (process.platform === 'win32') {
    // Edge 启动器可能把真正的 browser process 作为子进程再拉起；
    // child.pid 有时只指向已退出的启动器。按这次唯一的临时 profile 找根进程，
    // 再让 taskkill 结束其整棵进程树。
    try {
      const powershell = path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe',
      );
      const script = [
        '$targetDir = $env:INKBOX_PLAYTEST_PROFILE',
        '$processes = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object { $_.Name -eq \'msedge.exe\' -and $_.CommandLine -like (\'*\' + $targetDir + \'*\') })',
        '$ids = @($processes | ForEach-Object { [int]$_.ProcessId })',
        '$roots = @($processes | Where-Object { $ids -notcontains [int]$_.ParentProcessId })',
        'foreach ($root in $roots) { & "$env:SystemRoot\\System32\\taskkill.exe" /PID $root.ProcessId /T /F | Out-Null }',
      ].join('\n');
      execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
        env: { ...process.env, INKBOX_PLAYTEST_PROFILE: userDataDir },
        stdio: 'ignore',
        timeout: 15000,
      });
    } catch { /* PowerShell/WMI unavailable; still try the direct process handle */ }
    try { child.kill(); } catch { /* ignore */ }
  } else {
    try { child.kill(); } catch { /* ignore */ }
  }

  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      resolve();
    }, 5000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      this.events.push(message);
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 30000);
    });
  }

  async js(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(`页面内脚本抛错: ${detail}`);
    }
    return result.result.value;
  }

  errors() {
    return this.events
      .filter((e) => e.method === 'Runtime.exceptionThrown'
        || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
      .map((e) => (e.method === 'Runtime.exceptionThrown'
        ? (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
        : e.params.entry.text));
  }
}

// ── 输入辅助 ──────────────────────────────────────────────
async function mouseMove(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await sleep(30);
}

async function mouseDown(cdp, x, y, button = 'left') {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button,
    buttons: button === 'left' ? 1 : button === 'right' ? 2 : 4,
    clickCount: 1,
  });
}

async function mouseUp(cdp, x, y, button = 'left') {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1,
  });
}

async function click(cdp, x, y, button = 'left') {
  await mouseMove(cdp, x, y);
  await mouseDown(cdp, x, y, button);
  await sleep(60);
  await mouseUp(cdp, x, y, button);
  await sleep(120);
}

async function wheel(cdp, x, y, deltaY) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x, y, deltaX: 0, deltaY, button: 'none', buttons: 0,
  });
  await sleep(120);
}

const KEYS = {
  v: { key: 'v', code: 'KeyV', vk: 86 },
  g: { key: 'g', code: 'KeyG', vk: 71 },
  h: { key: 'h', code: 'KeyH', vk: 72 },
  z: { key: 'z', code: 'KeyZ', vk: 90 },
  bracketLeft: { key: '[', code: 'BracketLeft', vk: 219 },
  bracketRight: { key: ']', code: 'BracketRight', vk: 221 },
  digit1: { key: '1', code: 'Digit1', vk: 49 },
  digit6: { key: '6', code: 'Digit6', vk: 54 },
  space: { key: ' ', code: 'Space', vk: 32 },
};

async function key(cdp, name, modifiers = 0) {
  const spec = KEYS[name];
  if (!spec) throw new Error(`未定义的按键: ${name}`);
  const base = {
    key: spec.key, code: spec.code,
    windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk,
    modifiers,
  };
  await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' });
  await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
  await sleep(90);
}

// Ctrl 在 CDP 里是 bit 2
const CTRL = 2;

async function shot(cdp, name) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), Buffer.from(result.data, 'base64'));
}

// 在同一台机器、同一次运行里量一段真实帧间隔的**中位数**。
// 刻意不用 s.fps（那是 EMA）：本项目的教训是绝对帧率阈值会乱红——
// 同一段代码四次测量是 18452 / 23167 / 31161 / 45995 ms，2.5 倍抖动
// （INKBOX.md §五.11）。所以这里只拿它做「开/关视界」的**相对**比较，
// 两个绝对值一并打印供人判断。
async function measureFps(cdp, frames = 45) {
  const deltas = await cdp.js(`
    return new Promise((resolve) => {
      const out = [];
      let last = performance.now();
      const tick = (ts) => {
        out.push(ts - last);
        last = ts;
        if (out.length >= ${frames}) resolve(out);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  `);
  const sorted = deltas.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { median, fps: median > 0 ? 1000 / median : 0, frames: deltas.length };
}

// 有界地等一个提示文本出现。
// ⚠️ 存读档在 codec 迁移后变成**异步**（saveToStorage 返回 Promise），
// 按钮的 notify 要过若干毫秒才落到 #inkHint 上。点完立刻读 = 测「谁先跑完」，
// 会把「存档其实成功了」误判成失败（也曾把上一条的提示读成下一条的）。
// 所以这里轮询等待；超时则返回最后读到的文本，让断言带着实际内容变红。
async function waitForHint(cdp, pattern, timeoutMs = 3000) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    last = await cdp.js(`return (document.getElementById('inkHint') || {}).textContent || '';`);
    if (pattern.test(last)) return last;
    await sleep(120);
  }
  return last;
}

// ── 主流程 ────────────────────────────────────────────────
async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkbox-play-'));
  const child = spawn(BROWSER, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-extensions',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  let ws;
  try {
    const devtools = await waitForDevTools(PORT);
    if (!devtools) throw new Error('调试 HTTP 端点未就绪');
    const target = await createDevToolsTarget(PORT);
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    const cdp = new Cdp(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url: URL_TARGET });

    // ── 0. 启动 ───────────────────────────────────────────
    section('0. 启动与界面骨架');
    let booted = false;
    for (let i = 0; i < 40; i += 1) {
      await sleep(300);
      try {
        booted = await cdp.js('return !!(window.inkbox && window.inkbox.world && window.inkbox.terrain);');
      } catch { /* 还在加载 */ }
      if (booted) break;
    }
    check('页面启动并挂载 window.inkbox', booted);
    if (!booted) throw new Error('启动失败，后续用例无法进行');

    const skeleton = await cdp.js(`
      const s = window.inkbox;
      const canvas = document.getElementById('inkCanvas');
      const rect = canvas.getBoundingClientRect();
      return {
        groups: document.querySelectorAll('.group').length,
        tools: document.querySelectorAll('.ink-tool').length,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        dpr: s.dpr,
        canvasPx: [canvas.width, canvas.height],
        hudTime: (document.getElementById('inkTimePill') || {}).textContent || '',
        hudPeople: (document.getElementById('inkStatPeople') || {}).textContent || '',
        seed: s.seed,
        preset: s.presetKey,
        tool: s.toolId,
      };
    `);
    check(`${EXPECT_GROUPS} 个神力分组已渲染`, skeleton.groups === EXPECT_GROUPS, `${skeleton.groups} 组`);
    // 工具列表一次只渲染当前分组，所以这里只校验「当前组有按钮」，
    // 全量 ${EXPECT_TOOLS} 个的校验放在第 9 节（逐组遍历）。
    check('当前分组工具按钮已渲染', skeleton.tools >= 1, `${skeleton.tools} 个（当前分组）`);
    check('画布尺寸有效', skeleton.rect.width > 200 && skeleton.rect.height > 200,
      `${Math.round(skeleton.rect.width)}×${Math.round(skeleton.rect.height)} @${skeleton.dpr}x`);
    check('HUD 已填充', /仙历/.test(skeleton.hudTime), skeleton.hudTime);
    await shot(cdp, '01-boot');

    const { left, top, width, height } = skeleton.rect;
    const cx = left + width / 2;
    const cy = top + height / 2;

    // 先暂停，避免水文在断言期间继续改地形，让比较结果干净
    await cdp.js('window.inkbox.setSpeed(0); return true;');

    // ── 1. 工具分组切换 ───────────────────────────────────
    section('1. 神力分组与工具选择');
    const groupKeys = await cdp.js(`
      return Array.from(document.querySelectorAll('.group')).map((el) => el.dataset.group);
    `);
    let allGroupsHaveTools = true;
    const perGroup = {};
    for (const key of groupKeys) {
      await cdp.js(`
        const tab = Array.from(document.querySelectorAll('.group')).find((el) => el.dataset.group === ${JSON.stringify(key)});
        tab.click();
        return true;
      `);
      const count = await cdp.js(`return document.querySelectorAll('.ink-tool').length;`);
      perGroup[key] = count;
      if (count === 0) allGroupsHaveTools = false;
    }
    check('每个分组都有工具', allGroupsHaveTools,
      Object.entries(perGroup).map(([k, v]) => `${k}:${v}`).join(' '));

    // 点击「山形」里的抬山
    await cdp.js(`
      const tab = Array.from(document.querySelectorAll('.group')).find((el) => el.dataset.group === 'terrain');
      if (tab) tab.click();
      return true;
    `);
    const clickedTool = await cdp.js(`
      const btn = document.querySelector('.ink-tool[data-tool="raise"]');
      if (!btn) return null;
      btn.click();
      return { tool: window.inkbox.toolId, on: btn.classList.contains('on') };
    `);
    check('点选工具按钮生效', clickedTool && clickedTool.tool === 'raise' && clickedTool.on,
      clickedTool ? clickedTool.tool : '按钮不存在');

    // ── 2. 在画布上真实落笔抬山 ───────────────────────────
    section('2. 画布落笔（真实指针事件）');
    await cdp.js('window.inkbox.setBrush(1); return window.inkbox.brushRadius;');
    await mouseMove(cdp, cx, cy);

    const before = await cdp.js(`
      const s = window.inkbox;
      const t = s.camera.pick(${cx - left}, ${cy - top}, s.world);
      const i = s.world.idx(t.x, t.y);
      return { tile: t, h: s.world.height[i], inside: s.world.inside(t.x, t.y), type: s.world.type[i] };
    `);
    check('光标拾取到合法格', before.inside, `格 (${before.tile.x}, ${before.tile.y})`);

    await mouseDown(cdp, cx, cy);
    await sleep(400);           // 让主循环的限速笔刷跑几轮
    await mouseUp(cdp, cx, cy);
    await sleep(200);

    const after = await cdp.js(`
      const s = window.inkbox;
      const i = s.world.idx(${before.tile.x}, ${before.tile.y});
      return { h: s.world.height[i], undoDepth: s.history.stack.length };
    `);
    check('抬山笔刷抬高了地形', after.h > before.h + 0.02,
      `${before.h.toFixed(3)} → ${after.h.toFixed(3)}`);
    await shot(cdp, '02-raise');

    // ── 2b. 最小笔刷不能是空操作（回归用例）──────────────
    // brushIndices 原先拿整数格号去减 x+0.5 的笔刷中心，有效中心落在四格交角，
    // 半径 1 时 r=0.5、四格距离都是 √0.5>0.5，一个格子都画不出来。
    section('2b. 最小笔刷有效性');
    const tiny = await cdp.js(`
      const s = window.inkbox;
      s.setBrush(0);                       // brushSizes[0] = 1
      const t = s.camera.pick(${cx - left}, ${cy - top}, s.world);
      const i = s.world.idx(t.x, t.y);
      const before = s.world.height[i];
      s.hoverTile = t;
      s.history.begin();
      s.applyTool(true);
      const changed = s.history.end('抬山');
      return { radius: s.brushRadius, before, after: s.world.height[i], changed };
    `);
    check('半径 1 的笔刷确实画得动', tiny.changed && tiny.after > tiny.before + 0.001,
      `半径 ${tiny.radius} · ${tiny.before.toFixed(4)} → ${tiny.after.toFixed(4)}`);
    await key(cdp, 'z', CTRL);
    await cdp.js('window.inkbox.setBrush(1); return true;');

    // ── 3. 相机移动后落笔位置必须重算（回归用例）─────────
    // 冒烟测试抓不到这条：hoverTile 平时靠 pointermove 维护，
    // 但相机可以在鼠标一动不动的情况下变化——按 H 回全图、点右侧势力行、
    // 切立体视图（拾取公式本身随投影改变）。若 pointerdown 不重新 pick，
    // 笔就会落在「相机移动前」的旧格子上，用户会看到山长在别处。
    section('3. 相机移动后落笔位置重算');
    await cdp.js('window.inkbox.setSpeed(0); return true;');
    const probe = { x: left + width * 0.45, y: top + height * 0.45 };

    await cdp.js(`
      const s = window.inkbox;
      s.camera.zoom = 11;
      s.camera.clamp();
      s.dirty = true;
      return s.camera.zoom;
    `);
    await sleep(250);
    await mouseMove(cdp, probe.x, probe.y);
    const zoomedTile = await cdp.js(`
      const s = window.inkbox;
      return s.camera.pick(${probe.x - left}, ${probe.y - top}, s.world);
    `);
    // 按 H 回全图，鼠标全程不动
    await key(cdp, 'h');
    await sleep(250);
    const fitted = await cdp.js(`
      const s = window.inkbox;
      return {
        tile: s.camera.pick(${probe.x - left}, ${probe.y - top}, s.world),
        zoom: s.camera.zoom,
        inside: s.world.inside(s.camera.pick(${probe.x - left}, ${probe.y - top}, s.world).x, s.camera.pick(${probe.x - left}, ${probe.y - top}, s.world).y),
      };
    `);
    const moved = zoomedTile.x !== fitted.tile.x || zoomedTile.y !== fitted.tile.y;
    check('回全图后同一屏幕点对应到不同的格', moved,
      `zoom ${Number(fitted.zoom).toFixed(2)} · (${zoomedTile.x},${zoomedTile.y}) → (${fitted.tile.x},${fitted.tile.y})`);
    check('落点在全图视图下仍在世界内', fitted.inside,
      `(${fitted.tile.x},${fitted.tile.y})`);

    if (moved && fitted.inside) {
      const idxTarget = await cdp.js(`
        const s = window.inkbox;
        const t = s.camera.pick(${probe.x - left}, ${probe.y - top}, s.world);
        return s.world.idx(t.x, t.y);
      `);
      const idxStale = await cdp.js(`
        const s = window.inkbox;
        return s.world.idx(${zoomedTile.x}, ${zoomedTile.y});
      `);
      const beforeH = await cdp.js(`
        const w = window.inkbox.world;
        return { target: w.height[${idxTarget}], stale: w.height[${idxStale}] };
      `);
      await mouseDown(cdp, probe.x, probe.y);
      await sleep(350);
      await mouseUp(cdp, probe.x, probe.y);
      await sleep(200);
      const afterH = await cdp.js(`
        const w = window.inkbox.world;
        return { target: w.height[${idxTarget}], stale: w.height[${idxStale}] };
      `);
      check('笔落在回全图后的光标格上', afterH.target > beforeH.target + 0.02,
        `${beforeH.target.toFixed(3)} → ${afterH.target.toFixed(3)}`);
      check('回全图前的旧格未被误伤', Math.abs(afterH.stale - beforeH.stale) < 0.005,
        `${beforeH.stale.toFixed(3)} → ${afterH.stale.toFixed(3)}`);
    }
    await cdp.js('window.inkbox.camera.fit(window.inkbox.world); window.inkbox.dirty = true; return true;');

    // ── 4. 撤销 ───────────────────────────────────────────
    section('4. 撤销与快捷键');
    await cdp.js('window.inkbox.setBrush(1); return true;');
    const undoProbe = { x: left + width * 0.5, y: top + height * 0.5 };
    await mouseMove(cdp, undoProbe.x, undoProbe.y);
    const pre = await cdp.js(`
      const s = window.inkbox;
      const t = s.camera.pick(${undoProbe.x - left}, ${undoProbe.y - top}, s.world);
      const i = s.world.idx(t.x, t.y);
      return { t, h: s.world.height[i] };
    `);
    await mouseDown(cdp, undoProbe.x, undoProbe.y);
    await sleep(320);
    await mouseUp(cdp, undoProbe.x, undoProbe.y);
    await sleep(200);
    const raised = await cdp.js(`
      const s = window.inkbox;
      return s.world.height[s.world.idx(${pre.t.x}, ${pre.t.y})];
    `);
    check('快捷键前地形已改变', raised > pre.h + 0.02, `${pre.h.toFixed(3)} → ${raised.toFixed(3)}`);

    await key(cdp, 'z', CTRL);
    const undone = await cdp.js(`
      const s = window.inkbox;
      return s.world.height[s.world.idx(${pre.t.x}, ${pre.t.y})];
    `);
    check('Ctrl+Z 撤销还原地形', Math.abs(undone - pre.h) < 0.02,
      `${raised.toFixed(3)} → ${undone.toFixed(3)}（原 ${pre.h.toFixed(3)}）`);

    const reliefBefore = await cdp.js('return window.inkbox.camera.relief;');
    await key(cdp, 'v');
    const reliefAfter = await cdp.js('return window.inkbox.camera.relief;');
    check('V 切换立体视图', reliefBefore !== reliefAfter, `${reliefBefore} → ${reliefAfter}`);

    await key(cdp, 'g');
    const gridOn = await cdp.js('return window.inkbox.showGrid;');
    check('G 切换网格', gridOn === true);

    await key(cdp, 'bracketRight');
    const brushUp = await cdp.js('return window.inkbox.brushIndex;');
    await key(cdp, 'bracketLeft');
    const brushDown = await cdp.js('return window.inkbox.brushIndex;');
    check('[/] 调整笔刷半径', brushUp > brushDown, `${brushDown} ← ${brushUp}`);

    await key(cdp, 'digit6');
    const speedFast = await cdp.js('return window.inkbox.speedIndex;');
    await key(cdp, 'digit1');
    const speedSlow = await cdp.js('return window.inkbox.speedIndex;');
    check('数字键切换倍速', speedFast === 5 && speedSlow === 0, `6→${speedFast} 1→${speedSlow}`);

    // ── 5. 暂停必须真的冻结世界 ───────────────────────────
    section('5. 暂停语义');
    await cdp.js('window.inkbox.setSpeed(0); return true;');
    const checksumA = await cdp.js(`
      const w = window.inkbox.world;
      let water = 0; let heightSum = 0;
      for (let i = 0; i < w.size; i += 1) { water += w.water[i]; heightSum += w.height[i]; }
      return { water, heightSum, day: w.day };
    `);
    await sleep(1600);
    const checksumB = await cdp.js(`
      const w = window.inkbox.world;
      let water = 0; let heightSum = 0;
      for (let i = 0; i < w.size; i += 1) { water += w.water[i]; heightSum += w.height[i]; }
      return { water, heightSum, day: w.day };
    `);
    check('暂停时日期不再推进', Math.abs(checksumB.day - checksumA.day) < 1e-6,
      `day ${checksumA.day.toFixed(2)} → ${checksumB.day.toFixed(2)}`);
    check('暂停时水量不再变化', Math.abs(checksumB.water - checksumA.water) < 1e-4,
      `${checksumA.water.toFixed(4)} → ${checksumB.water.toFixed(4)}`);
    check('暂停时高程不再变化', Math.abs(checksumB.heightSum - checksumA.heightSum) < 1e-3,
      `${checksumA.heightSum.toFixed(3)} → ${checksumB.heightSum.toFixed(3)}`);

    // ── 6. 观察工具（只读）与信息面板 ─────────────────────
    section('6. 只读观察与信息面板');
    await cdp.js(`
      const tab = Array.from(document.querySelectorAll('.group')).find((el) => el.dataset.group === 'view');
      if (tab) tab.click();
      return true;
    `);
    const readonlyTool = await cdp.js(`
      const btn = document.querySelector('.ink-tool[data-tool="inspect"]');
      if (!btn) return null;
      btn.click();
      return window.inkbox.toolId;
    `);
    check('存在观察工具', readonlyTool === 'inspect', String(readonlyTool));
    const obs = { x: left + width * 0.5, y: top + height * 0.5 };
    await click(cdp, obs.x, obs.y);
    const panel = await cdp.js(`
      const p = document.getElementById('inkInspect');
      return { on: p.classList.contains('on'), rows: p.querySelectorAll('.inspect-row').length, text: p.textContent.slice(0, 60), all: p.textContent };
    `);
    check('点选后弹出格信息面板', panel.on && panel.rows >= 8, `${panel.rows} 行`);
    // 修仙层接进检视面板后，格信息里必须出现「灵气」——它是地图地气与修炼速度的
    // 共同来源，也是玩家判断「这里该不该立山门」的唯一依据。
    check('格信息含灵气行', /灵气/.test(panel.all), panel.all.replace(/\s+/g, ' ').slice(0, 40));
    await shot(cdp, '03-inspect');

    // ── 6b. 仙道面板 ──────────────────────────────────────
    section('6b. 仙道面板与图例');
    await cdp.js('window.inkbox.setSpeed(3); return true;');
    await sleep(1400);
    const daoHud = await cdp.js(`
      const el = (id) => (document.getElementById(id) || {}).textContent || '';
      const bars = Array.from(document.querySelectorAll('#inkRealmBars .dao-realm'));
      // ⚠️ 锚点必须**锁在「图例」那一节里**，不能写 querySelector('.legend')。
      //    后者假设「全页只有一处 .legend」——2026-09-23 加「门道」区时，
      //    那一块排在「图例」**前面**，于是这个选择器取到了它，
      //    「图例已补上灵脉与宗门地盘」当场变红，而**图例本身一个字都没改**。
      //    断言的本意是「图例那块补上了灵脉与宗门地盘」，所以按语义定位到那一节：
      //    先找到 sec-title 文本为「图例」的标题，再在它后面的 .sec-body 里取。
      //    这样以后**任何位置**再插别的 .legend 都不会误伤（也不再依赖唯一性）。
      // ⚠️ 本段在 cdp.js 的模板串里，注释里**不许出现反引号**（会截断模板串，已踩过 3 次）。
      const legendTitle = Array.from(document.querySelectorAll('.rail.right .sec-title'))
        .find((t) => (t.textContent || '').includes('图例'));
      // 折叠机制会把标题之后的兄弟元素包进 .sec-body（main.js 的 setupSectionToggles），
      // 所以 .legend 就是标题的下一个兄弟里的第一个。折叠状态下 textContent 照读。
      const legendEl = legendTitle && legendTitle.nextElementSibling
        ? legendTitle.nextElementSibling.querySelector('.legend')
        : null;
      const legend = (legendEl || document.body).textContent || '';
      const w = window.inkbox.world;
      return {
        cultivators: el('inkStatCultivators'),
        mortals: el('inkStatMortals'),
        peak: el('inkStatPeakCultivator'),
        leylines: el('inkStatLeylines'),
        sites: el('inkStatSites'),
        ascended: el('inkStatAscended'),
        clans: el('inkStatClans'),
        clansEl: !!document.getElementById('inkStatClans'),
        wars: el('inkStatWars'),
        warsEl: !!document.getElementById('inkStatWars'),
        chronicleBtn: !!document.getElementById('inkBtnChronicle'),
        barCount: bars.length,
        barLabels: bars.map((b) => b.querySelector('span').textContent).join('/'),
        barValues: bars.map((b) => Number(b.querySelector('b').textContent)),
        liveLeylines: w.leylines.length,
        liveSites: w.sites.length,
        liveClans: (w.clans || []).length,
        legend,
      };
    `);
    check('仙道面板已填充修士与凡人数',
      /^\d+$/.test(daoHud.cultivators.trim()) && /^\d+$/.test(daoHud.mortals.trim()),
      `修士 ${daoHud.cultivators} · 凡人 ${daoHud.mortals}`);
    check('当世之巅已给出', daoHud.peak.trim().length > 0, daoHud.peak);
    // ⚠️ 这里原来写死的是「共 6 条」+ 六个标签。2026-09-19 境界表追加第 7 档
    // 「大乘」（上界境界）之后它**假红**了：面板改渲染 7 条，而「6 条」测的从此
    // 不是「面板渲染对不对」，而是「境界表有没有长大」——后者没有任何人要保证。
    // **写死长度的断言会随表长大而腐烂**（同一轮里 `_necropolisprobe.mjs` 的
    // `row.length <= 60` 栽的是同一个坑）。所以期望值从 `REALMS` **现算**。
    const expectRealmLabels = REALMS.map((r) => r.name).join('/');
    check('境界横条逐档渲染、标签与境界表对齐（并集表：凡间六阶 + 上界大乘）',
      daoHud.barCount === REALMS.length && daoHud.barLabels === expectRealmLabels,
      `${daoHud.barCount} 条（期望 ${REALMS.length}） · ${daoHud.barLabels}`);
    // 反向断言：**凡间**到不了大乘。
    // 什么故障会让它变红：突破天花板被写回境界上限常量（`REALM_CAP`），或
    //   `ceilingFor(world.plane)` 的按世界分流被删 → 凡间真的有人突破到 61+，
    //   面板上就会出现「大乘 1」。那正是 INKBOX §九.14 点名的静默漂移。
    check('凡间面板上「大乘」恒为 0（凡间天花板 60，合体大圆满即飞升）',
      daoHud.barValues[REALMS.length - 1] === 0,
      `大乘 ${daoHud.barValues[REALMS.length - 1]} 人 · 各档 ${daoHud.barValues.join('/')}`);
    check('灵脉/地点计数与世界上限一致',
      Number(daoHud.leylines) === daoHud.liveLeylines && Number(daoHud.sites) === daoHud.liveSites,
      `面板 灵脉${daoHud.leylines}·地点${daoHud.sites} / 实际 ${daoHud.liveLeylines}·${daoHud.liveSites}`);
    check('图例已补上灵脉与宗门地盘',
      /灵脉/.test(daoHud.legend) && /宗门地盘/.test(daoHud.legend));
    // 世家读数：面板上那个数字必须与 `world.clans` 对得上。
    // 这一条守的是「UI 接线」——世家那一整套（立族/世代/断绝/家学）在模拟层
    // 已经全绿了，但完全可能是「算得出来、面板上永远是 0」，
    // 因为读数写错元素 id、或者 updateHud 里根本没接这一行，都不会报错。
    //
    // ⚠️ 这里踩过一个「假通过」的陷阱，值得写下来：
    // 第一版写的是 `Number((el('inkStatClans').match(/^\d+/) || ['0'])[0]) === liveClans`。
    // 元素 id 写错时 `el()` 返回空串 → 匹配失败 → 兜底成 `'0'` → 而这个世界
    // 此刻恰好就是 0 家 → **两边都是 0，判据绿了，元素其实根本不在页面上**。
    // 两条修法：① 兜底值改成 `-1`（任何「没读到」都不可能等于真实的 0）；
    // ② 先单独判「元素存在且文本非空」，再判数值。
    // 这也是这一支测试存在的理由：`inkbox-smoke` 里那条同名的断言只调模块，
    // 永远发现不了「页面上没有这个元素」。
    check('世家读数的元素真的在页面上（否则下面的数值比对会假通过）',
      daoHud.clansEl && daoHud.clans.trim().length > 0,
      `元素${daoHud.clansEl ? '在' : '不在'} · 文本「${daoHud.clans}」`);
    check('世家读数与世上家数一致',
      Number((daoHud.clans.match(/^\d+/) || ['-1'])[0]) === daoHud.liveClans,
      `面板「${daoHud.clans}」/ 实际 ${daoHud.liveClans} 家`);
    check('世家读数在有世家时报得出世代',
      daoHud.liveClans === 0 || /第\d+代/.test(daoHud.clans),
      daoHud.clans);
    // 大战读数与编年史导出按钮：同一类「算得出来、界面上没有」的坑。
    // 大战那一整套（触发/交锋/结算/灭门）在模拟层再绿，玩家看不见也是白做；
    // 而编年史是 400 条的滚动窗口，导出是**唯一**能把早年的记录留下来的出口。
    check('大战读数的元素真的在页面上', daoHud.warsEl && daoHud.wars.trim().length > 0,
      `元素${daoHud.warsEl ? '在' : '不在'} · 文本「${daoHud.wars}」`);
    check('编年史导出按钮在页面上', daoHud.chronicleBtn);

    // ── A. 大战读数必须与页面内世界的实际账本一致 ─────────────
    // 与上面「世家读数」是同一个坑：元素在、但数字是错的，等于给玩家看假读数。
    // 兜底值取 `-1`——它不可能等于真实读数（只可能是 `0` / `N 场` / `灭 N` 三者之一），
    // 所以元素被删、id 写错、或文本为空时这条会红，而不是「两边都是 0」地绿过去。
    // 先把时间停住再读：世界边跑边改的话，DOM 里的数字与这一瞬间的世界可能对不上。
    await cdp.js('window.inkbox.setSpeed(0); return true;');
    const warDom = await cdp.js(`
      const node = document.getElementById('inkStatWars');
      const w = window.inkbox.world;
      const wars = w.wars || [];
      // 与 sim/war.js 的 warStats 逐字同式：
      //   ongoing   = phase 不是 'ended' 的场数
      //   destroyed = warLog 累计账本（world.wars 有 400 条上限，会被裁剪，
      //               所以灭门数只能从账本取，数数组长度会少算）
      let ongoing = 0;
      for (let i = 0; i < wars.length; i += 1) {
        if (wars[i].phase !== 'ended') ongoing += 1;
      }
      const destroyed = (w.warLog && w.warLog.destroyed) || 0;
      // 期望文本照抄 main.js updateHud 里的三元表达式，含那两个空格。
      const expect = ongoing ? (ongoing + ' 场') : (destroyed ? ('灭 ' + destroyed) : '0');
      return { text: node ? node.textContent : '-1', expect, ongoing, destroyed, total: wars.length };
    `);
    check('大战读数与进行中/灭门账本一致',
      warDom.text === warDom.expect,
      `面板「${warDom.text}」/ 期望「${warDom.expect}」`
      + `（进行中 ${warDom.ongoing} · 灭门 ${warDom.destroyed} · 战报 ${warDom.total} 条）`);

    // 上面那条在「世界此刻 0 场大战」时会**假通过**：HTML 里 inkStatWars 的初值就是 0，
    // 哪怕 updateHud 根本没接这一行，面板也照样是 0、期望也是 0。
    // 所以再塞一场假大战进去（与 6d 塞假宗门同一手法），看读数会不会自己变成「N 场」——
    // 这条守的是「DOM 真的由世界状态驱动」，而不是「两边恰好都是 0」。
    const warProbe = await cdp.js(`
      const w = window.inkbox.world;
      if (!Array.isArray(w.wars)) w.wars = [];
      const node = document.getElementById('inkStatWars');
      const before = node ? node.textContent : '-1';
      const idx = w.wars.length;
      // 形状够 warStats 用即可：ongoing 只看 phase，其余字段走 || 兜底
      w.wars.push({ phase: 'mobilizing', casualties: [], clashCount: 0, outcome: null });
      let ongoing = 0;
      for (let i = 0; i < w.wars.length; i += 1) {
        if (w.wars[i].phase !== 'ended') ongoing += 1;
      }
      return { before, idx, expect: ongoing + ' 场' };
    `);
    await sleep(500);   // updateHud 每 0.25 秒刷一次
    const warInjected = await cdp.js(`return (document.getElementById('inkStatWars') || {}).textContent || '-1';`);
    check('大战读数会跟着世界状态更新（塞一场进行中的大战）',
      warInjected === warProbe.expect,
      `注入后面板「${warInjected}」/ 期望「${warProbe.expect}」（注入前「${warProbe.before}」）`);
    await cdp.js(`window.inkbox.world.wars.splice(${warProbe.idx}, 1); return true;`);
    await sleep(500);
    const warBack = await cdp.js(`return (document.getElementById('inkStatWars') || {}).textContent || '-1';`);
    check('撤掉假大战后读数回到原样',
      warBack === warProbe.before,
      `${warInjected} → ${warBack}（原 ${warProbe.before}）`);

    // ── B. 编年史导出按钮：真的点一下 ─────────────────────────
    // 「按钮存在」不等于「接上了 handler」。这里点它，看 notify 有没有把提示写进
    // #inkHint（main.js:127 的 notify 就是往这个元素写文本的）。
    // ⚠️ 降级说明：这个按钮会触发一次**文件下载**（Blob + a[download].click()）。
    // 无头浏览器里下载可能被拦、或落到临时目录，断言「文件真的落盘了」既脆又依赖
    // 浏览器版本，所以这里**只验到「点下去不抛错 + 界面给出导出反馈」为止**，
    // 不去验下载产物。导出文本本身（exportChronicle）由 smoke 那支直接调模块来守。
    const chronErrorsBefore = cdp.errors().length;
    const chron = await cdp.js(`
      const btn = document.getElementById('inkBtnChronicle');
      if (!btn) return { clicked: false, hint: '' };
      btn.click();
      return {
        clicked: true,
        hint: (document.getElementById('inkHint') || {}).textContent || '',
      };
    `);
    check('编年史导出按钮可点并给出导出反馈',
      chron.clicked && /已导出/.test(chron.hint),
      chron.clicked ? `提示「${chron.hint}」` : '按钮不存在');
    await sleep(300);
    check('导出编年史不抛运行时报错',
      cdp.errors().length === chronErrorsBefore,
      cdp.errors().slice(chronErrorsBefore).join(' | ') || 'errors: []');

    await shot(cdp, '03b-dao-panel');
    // 还原成暂停：后面第 7 节要存读档比对，世界边跑边改会让断言飘。
    await cdp.js('window.inkbox.setSpeed(0); return true;');

    // ── 6c. 卜算子（天道引路人）────────────────────────────
    section('6c. 卜算子对话条');
    const bz = await cdp.js(`
      const box = document.getElementById('inkBusanzi');
      const lines = Array.from(document.querySelectorAll('#inkBusanziLines .busanzi-line'));
      const w = window.inkbox.world;
      const log = (w.busanzi && w.busanzi.log) || [];
      return {
        exists: !!box,
        on: !!(box && box.classList.contains('on')),
        tier: (document.getElementById('inkBusanziTier') || {}).textContent || '',
        meter: (document.getElementById('inkBusanziMeter') || {}).style.width || '',
        shown: lines.length,
        texts: lines.map((el) => el.textContent),
        logLen: log.length,
        logTexts: log.map((l) => l.text),
        met: !!(w.busanzi && w.busanzi.met),
        marked: Array.from(document.querySelectorAll('.ink-log.is-busanzi')).length,
      };
    `);
    check('卜算子对话条已渲染并浮出', bz.exists && bz.on, `met=${bz.met}`);
    // 登场是「登场词 + 一句自我介绍」= 4 句（见 sim/busanzi.js 的 greetOnBoot）。
    // `>=` 而非 `===`：这局里他后来还会说话，log 只会更长。
    check('登场那几句都进了他自己的 log', bz.logLen >= 4, `${bz.logLen} 句`);
    // 承重的一条：`selfIntro` 在 2026-09-22 之前**全仓零读者**，
    // 玩家在世界初开那一屏根本看不到它——左下角那个自称「小爷我」的人没有来路。
    // 判 `logTexts[3]`（登场序列的第 4 句）而不是「当前对话条里有」：
    // 6c 跑到这里时世界已经过了一段，登场的台词早被后来的话顶出去了
    // （对话条只显示最近 3 句）。而 selfIntro 是登场序列的**最后**一句，
    // 所以「它是第 4 句」等价于「初开那一屏看得见它」。
    check('登场时他自报家门了（`selfIntro` 此前全仓零读者）',
      (bz.logTexts[3] || '').indexOf('说明书') >= 0,
      bz.logTexts.slice(0, 4).map((t) => t.slice(0, 12)).join(' / '));
    check('对话条显示最近几句', bz.shown >= 1 && bz.shown <= 3,
      bz.texts.map((t) => t.slice(0, 12)).join(' / '));
    check('亲缘阶梯已渲染', bz.tier.length > 0, bz.tier);
    check('亲缘进度条有宽度', bz.meter !== '', bz.meter);
    // 编年史里他那些话要能和史实区分开，否则读者分不清哪句是旁白
    check('编年史里他的条目被单独标出', bz.marked >= 3, `${bz.marked} 条`);

    // ── 6d. 宗门地盘（代价洪泛 → 一格一像素的离屏画布）──────
    //
    // 这里最要命的是**对齐**：地盘画布与地形画布必须同尺寸、同 pad，
    // 否则立体视图下地盘会陷进山里、或者浮在山头上。
    //
    // ⚠️ 这一局的试玩世界才跑了一百多天，一家宗门都没有（立宗要二十年一判）。
    // 直接断言「画布上有颜色」会是空断言——世界是空的，画布本来就该是空的，
    // 哪怕渲染整段写坏了也照样通过。所以这里临时塞一个假宗门 + 一小片地盘，
    // 验完立刻撤掉：这样测的是「画布会不会画」，而不是「世界上有没有宗门」。
    section('6d. 宗门地盘渲染');
    const terr = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      // 强制重算一次：年轻世界还没到第一个重算日（每 30 游戏日）
      s.refreshTerritory();
      const owner = w.territory;

      const countPainted = (canvas) => {
        if (!canvas) return -1;
        const g = canvas.getContext('2d');
        const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
        return n;
      };
      const build = () => {
        s.units.terrKey = '';   // 作废缓存，逼它重烘
        return s.units.territoryCanvas(s.camera, w, s.terrain.pad);
      };
      // 不动缓存键：该命中就命中
      const reuse = () => s.units.territoryCanvas(s.camera, w, s.terrain.pad);
      // 模拟读档：读档会换一个全新的 world 对象，terrRev 字段随之消失
      const simulateLoad = () => { w.terrRev = undefined; s.refreshTerritory(); };

      // 一、空世界：画布应当建起来、但什么都不画
      const blank = build();
      const paintedBlank = countPainted(blank);

      // 二、塞一个假宗门 + 一小片地盘。
      //     直接写归属层，**不调重算**——洪泛会 owner.fill(0) 之后重铺，
      //     把这片手涂的地盘整个抹掉，期望值就不成立了。
      const fake = {
        id: 999, name: '试笔宗', color: '#a8493c', accent: '#d98a72',
        villages: [], leylines: [], pop: 0,
      };
      w.factions.push(fake);
      const PX = 144; const PY = 84; const PW = 16;
      for (let y = PY; y < PY + PW; y += 1) {
        for (let x = PX; x < PX + PW; x += 1) owner[y * w.w + x] = fake.id;
      }
      const painted = countPainted(build());
      const keyAfterPaint = s.units.terrKey;

      // 三、缓存：键没变时应当拿到同一张画布
      const cached = reuse();
      const sameObject = cached === s.units.terrCanvas;

      // 四、【回归断言】模拟一次读档：换 world 对象 → terrRev 字段消失 → 重算。
      //     地盘刚刚重算过，缓存里那张必须被判为过期，**缓存键必须更新**。
      //     ⚠️ 修订号若写成 world.terrRev + 1，读档时它从 0 重新数回 1，
      //     正好撞上「新建世界后第一次重算」的键，渲染层就判成「地盘没变」，
      //     直接复用旧画布——读档后地盘整片不显示，暂停时更是永远不显示。
      //     判「键有没有变」而不是判像素数：洪泛铺多少格取决于地形，
      //     拿它当期望值会变成一条依赖地图的脆断言。
      simulateLoad();
      const afterLoad = countPainted(reuse());
      const keyChanged = s.units.terrKey !== keyAfterPaint;

      // 五、撤掉假数据，画布该回到空白（顺便验证地盘画布确实跟着数据走）
      owner.fill(0);
      w.factions.pop();
      const restored = countPainted(build());

      const tcanvas = s.terrain && s.terrain.canvas;
      return {
        size: w.size,
        len: owner ? owner.length : 0,
        sects: w.factions.length,
        cw: blank ? blank.width : 0,
        ch: blank ? blank.height : 0,
        tw: tcanvas ? tcanvas.width : 0,
        th: tcanvas ? tcanvas.height : 0,
        pad: s.terrain ? s.terrain.pad : -1,
        paintedBlank, painted, sameObject, afterLoad, keyChanged, restored,
      };
    `);
    check('地盘层已建立且与世界上限一致', terr.len === terr.size,
      `${terr.len} / ${terr.size} 格`);
    check('地盘画布与地形画布同尺寸（错行才对得上）',
      terr.cw === terr.tw && terr.ch === terr.th && terr.cw > 0,
      `地盘 ${terr.cw}×${terr.ch} / 地形 ${terr.tw}×${terr.th}（pad ${terr.pad}）`);
    check('空世界不画色', terr.paintedBlank === 0, `${terr.paintedBlank} 像素`);
    check('有地盘时画布确实上色',
      terr.painted === 16 * 16,
      `一小片 16×16 的地盘 → 上色 ${terr.painted} 像素`);
    check('画布缓存命中（同一张画布）', terr.sameObject === true);
    // 回归：读档后缓存必须失效。修订号一旦退回「每个世界各自从零数」，
    // 读档那次会数回 1，撞上新建世界那次的键，于是永远复用那张旧画布。
    check('读档后地盘画布会重烘（修订号不能从零重数）',
      terr.keyChanged === true,
      `模拟读档 + 重算后缓存键${terr.keyChanged ? '已更新' : '没变'}`
      + `（此刻画布上色 ${terr.afterLoad} 像素）`);
    check('数据撤掉后画布回到空白', terr.restored === 0, `${terr.restored} 像素`);
    await shot(cdp, '03c-territory');

    // 落一笔灾祸神力，看他会应声
    const bzReact = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      const before = w.busanzi.log.length;
      const actsBefore = w.busanzi.acts;
      // 灾祸类触发概率 0.45，连落 20 次基本必然开口；
      // 但亲缘只计前 30 次，所以这里也顺带验了计数会停在上限。
      s.selectTool('meteor');
      s.hoverTile = { x: Math.floor(w.w * 0.5), y: Math.floor(w.h * 0.5) };
      for (let i = 0; i < 20; i += 1) {
        s.history.begin();
        s.applyTool(true);
        s.history.end('陨石');
      }
      return { before, after: w.busanzi.log.length, actsBefore, actsAfter: w.busanzi.acts };
    `);
    check('玩家落笔时他会应声', bzReact.after > bzReact.before,
      `log ${bzReact.before} → ${bzReact.after} 句`);
    check('每次落笔都记一次亲手拨动',
      bzReact.actsAfter === Math.min(30, bzReact.actsBefore + 20),
      `${bzReact.actsBefore} → ${bzReact.actsAfter}（上限 30）`);

    // ── 7. 存读档按钮 ─────────────────────────────────────
    section('7. 存读档（走界面按钮）');
    // ── 槽位下拉必须有**可选的空槽** ──────────────────────────
    // 2026-09-22 之前下拉里只有 localStorage 里已存在的键（首次打开只有一个空的 auto），
    // 玩家因此**没有办法存第二份**——「存档」永远覆盖 auto。而 INKBOX.md 写着「8 槽」。
    // 这条断言守的是「玩家真的能选到第二个槽」，不是「下拉渲染出来了」。
    const slotOpts = await cdp.js(`
      const sel = document.getElementById('inkSlotSelect');
      return { count: sel.options.length, values: Array.from(sel.options).map((o) => o.value) };
    `);
    check('槽位下拉预置了多份存档位（自动 + 8 个命名槽）',
      slotOpts.count >= 9 && slotOpts.values.includes('auto') && slotOpts.values.includes('slot1'),
      `${slotOpts.count} 个：${slotOpts.values.slice(0, 4).join(', ')} …`);

    const saved = await cdp.js(`
      const s = window.inkbox;
      // 先做一个标记性的地形改动，读档后应被回滚
      s.selectTool('raise');
      const t = s.camera.pick(${obs.x - left}, ${obs.y - top}, s.world);
      const i = s.world.idx(t.x, t.y);
      const before = s.world.height[i];
      s.hoverTile = t;
      s.applyTool(true);
      return { tile: t, before, after: s.world.height[i] };
    `);
    check('标记改动已生效', saved.after > saved.before + 0.02,
      `${saved.before.toFixed(3)} → ${saved.after.toFixed(3)}`);

    await cdp.js(`
      document.getElementById('inkSlotSelect').value = 'auto';
      document.getElementById('inkBtnSave').click();
      return true;
    `);
    // ⚠️ 这条守的是「存档按钮 → saveToStorage → 提示」这条**UI 接线**，
    // **不是**配额：它跑的是默认中堂，实测只占配额 39.9%~53.4%，配额再怎么变
    // 它也永远绿。真正的配额上界由下面 7b 节直接量（二分法），
    // 长卷幅面的存读档由 save-equiv / smoke 那两支守，这里不为了它拉长时长。
    // ⚠️ 但提示要**等**：codec 迁移后存档是异步的，点完立刻读会读到上一条提示。
    const saveResult = await waitForHint(cdp, /已存档/);
    check('存档按钮给出成功反馈', /已存档/.test(saveResult), saveResult);

    // 读档（读的是改动前的自动存档 → 高程应回到改动前）
    await cdp.js(`
      document.getElementById('inkSlotSelect').value = 'auto';
      document.getElementById('inkBtnLoad').click();
      return true;
    `);
    const loadHint = await waitForHint(cdp, /已读取|没有存档/);
    const loadResult = await cdp.js(`
      const s = window.inkbox;
      const i = s.world.idx(${saved.tile.x}, ${saved.tile.y});
      return { h: s.world.height[i], entities: s.world.entities.length };
    `);
    check('读档按钮给出反馈', /已读取|没有存档/.test(loadHint), loadHint);

    // ── 7b. 浏览器侧实测常量：localStorage 配额与 gzip 压缩 ────
    //
    // 这两条常量原先是用「Edge headless + CDP」临时探针量出来的，量完探针被删了，
    // 只剩 Node 侧的合并版——于是「这个数字是怎么来的」没有可复现的手段。
    // 本项目刚立的规矩是「凡是一个数字被写进文档，产生它的探针就必须留着、能跑」，
    // 这里把探针补回来。
    //
    // ⚠️ **不钉死精确值**：下一轮会把存档改成 gzip（长卷从 3,788,047 掉到约
    // 1,287,148 字符），任何「必须等于某个数」都会立刻变成假失败。
    // 所以这里一律写成**性质判据 + 宽松边界**，精确值只打印不断言。
    section('7b. 浏览器侧常量（配额 / 压缩）');

    // ── 压缩：可用性、往返无损、确实变小 ──
    const comp = await cdp.js(`
      return (async () => {
        const hasCS = typeof CompressionStream === 'function';
        const hasDS = typeof DecompressionStream === 'function';
        if (!hasCS || !hasDS) return { available: false, hasCS, hasDS };
        // 样本：**真实世界的数据**摊成明文。
        // ⚠️ 不能直接拿 localStorage 里那条存档来压——codec 已经把它压过一遍了
        // （前缀 INKGZ1: + base64），对高熵的 base64 再 gzip 不会变小（甚至更大），
        // 那会把「压缩有效」测反。所以这里用明文：真实高程序列（地形数据）
        // + 真实中文（编年史与姓名）+ 一段 base64，凑成「中文 + base64 混合」。
        const world = window.inkbox.world;
        const heights = [];
        const N = Math.min(world.size, 120000);
        for (let i = 0; i < N; i += 1) heights.push(world.height[i].toFixed(3));
        const terrain = heights.join(',');
        const zh = (world.chronicle || []).map((r) => r.text).join('；')
          + world.entities.slice(0, 300).map((e) => e.name).join('');
        const b64 = btoa(terrain.slice(0, 2048));
        let src = terrain + '|' + zh + '|' + b64;
        if (src.length < 20000) src += '水墨沙盒'.repeat(5000);
        const bytes = new TextEncoder().encode(src);
        const t0 = performance.now();
        const cs = new CompressionStream('gzip');
        const w = cs.writable.getWriter();
        w.write(bytes);
        w.close();
        const gz = new Uint8Array(await new Response(cs.readable).arrayBuffer());
        const t1 = performance.now();
        const ds = new DecompressionStream('gzip');
        const w2 = ds.writable.getWriter();
        w2.write(gz);
        w2.close();
        const out = new Uint8Array(await new Response(ds.readable).arrayBuffer());
        const t2 = performance.now();
        const back = new TextDecoder().decode(out);
        // 压出来的字节能不能进 localStorage（下一轮压缩存档的前提）。
        // 分块 fromCharCode，别用 ...spread——90 万字节展开会爆栈。
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < gz.length; i += CH) {
          bin += String.fromCharCode.apply(null, gz.subarray(i, i + CH));
        }
        const b64gz = btoa(bin);
        let storeOk = false;
        try {
          localStorage.setItem('__inkbox_gz_probe__', b64gz);
          storeOk = localStorage.getItem('__inkbox_gz_probe__') === b64gz;
          localStorage.removeItem('__inkbox_gz_probe__');
        } catch (err) { storeOk = false; }
        return {
          available: true,
          srcLen: src.length, srcBytes: bytes.length, gzBytes: gz.length,
          lossless: back === src, ratio: gz.length / bytes.length,
          gzipMs: t1 - t0, gunzipMs: t2 - t1, b64Len: b64gz.length, storeOk,
        };
      })();
    `);
    check('CompressionStream / DecompressionStream 都可用（压缩存档的前提）',
      comp.available === true, comp.available ? '' : `CS=${comp.hasCS} DS=${comp.hasDS}`);
    if (comp.available) {
      check('gzip 往返逐字符无损', comp.lossless === true,
        `${comp.srcLen} 码元 → ${comp.gzBytes} 字节 → 解回${comp.lossless ? '相等' : '不等'}`);
      // 宽松上界：只要求「确实变小」，不钉死 3.9× 那种精确比例
      check('gzip 对真实存档片段确实变小', comp.gzBytes < comp.srcBytes,
        `${comp.srcBytes} 字节 → ${comp.gzBytes} 字节（${(comp.ratio * 100).toFixed(1)}%）`);
      check('压缩产物（base64）能写进 localStorage', comp.storeOk === true,
        `${comp.b64Len} 字符`);
      console.log(`  · 实测：gzip ${comp.gzipMs.toFixed(1)} ms · gunzip ${comp.gunzipMs.toFixed(1)} ms`
        + ` · 压缩比 ${(comp.ratio * 100).toFixed(1)}% · base64 ${comp.b64Len} 字符`);
    }

    // ── localStorage 真实配额（二分法）──
    // 测法：把现有键**快照后清空**（配额是 per-origin 共享的，别的键占着地方会
    // 让单键上限量不准），再二分「单键最大能塞多少码元」，测完原样放回。
    // ⚠️ 测的期间 localStorage 会被塞满，任何并发的写（比如自动存档）都会抛错并
    // 污染第 12 节。所以先把 autoSaveAccum 清零推迟下一次自动存档，并且在页面里用
    // try/catch/finally 保证探针键一定被删、快照一定被放回——否则会造出
    // 「跑完 playtest 之后存档就存不下了」的坑。
    const quota = await cdp.js(`
      window.inkbox.autoSaveAccum = 0;   // 推迟自动存档，别在塞满的瞬间写盘
      const KEY1 = 'q';                          // 1 字符键名（量「配额本身」）
      const KEY_LONG = '__inkbox_quota_probe__'; // 22 字符键名（量「键名是否也占配额」）
      const KEY2 = 'r';                          // per-origin 共享用的第二个键
      const saved = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        saved[k] = localStorage.getItem(k);
      }
      const restore = () => {
        const probes = [KEY1, KEY_LONG, KEY2];
        for (let i = 0; i < probes.length; i += 1) {
          try { localStorage.removeItem(probes[i]); } catch (e) { /* ignore */ }
        }
        localStorage.clear();
        for (const k in saved) localStorage.setItem(k, saved[k]);
      };
      let result = { error: null };
      try {
        // 二分「某个键名下单键最大能塞多少码元」：先指数找上界，再二分
        const measure = (key) => {
          const fits = (v) => {
            try { localStorage.setItem(key, v); return true; }
            catch (e) { return false; }
          };
          let hi = 4096;
          while (fits('a'.repeat(hi)) && hi < (1 << 30)) hi *= 2;
          let lo = 0;
          while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (fits('a'.repeat(mid))) lo = mid; else hi = mid;
          }
          return lo;
        };

        localStorage.clear();
        const t0 = performance.now();
        const qMax = measure(KEY1);
        localStorage.clear();
        const longMax = measure(KEY_LONG);
        const measureMs = performance.now() - t0;

        // 中文与 ASCII 同价：同一「码元数」的半中半英串应当也能存下。
        // 若哪天浏览器改成按字节计，中文串会先失败，这条立刻红。
        localStorage.clear();
        const fits1 = (v) => {
          try { localStorage.setItem(KEY1, v); return true; }
          catch (e) { return false; }
        };
        fits1('a'.repeat(qMax));                 // 先把上界本身坐实
        const half = Math.floor(qMax / 2);
        const mixed = '中'.repeat(half) + 'a'.repeat(qMax - half);
        const mixedOk = mixed.length === qMax && fits1(mixed);

        // per-origin 共享：单键已占满后，第二个同大的键应当存不下
        let sharedBlocked = false;
        try {
          localStorage.setItem(KEY2, 'b'.repeat(qMax));
        } catch (e) { sharedBlocked = true; }
        const held = (localStorage.getItem(KEY1) || '').length
          + (localStorage.getItem(KEY2) || '').length;

        result = {
          qMax, longMax, measureMs,
          keyLen1: KEY1.length, keyLenLong: KEY_LONG.length,
          delta: qMax - longMax,
          // 配额按「键名 + 值」一起计费，所以 1 字符键测出的值 + 1 = 配额总量
          total: qMax + KEY1.length,
          mixedOk, sharedBlocked, held,
          originKeys: Object.keys(saved).length,
        };
      } catch (e) {
        result.error = String(e && e.message);
      } finally {
        restore();
      }
      result.restoredKeys = localStorage.length;
      result.restoredSame = Object.keys(saved).every((k) => localStorage.getItem(k) === saved[k]);
      return result;
    `);
    check('localStorage 单键配额落在合理量级（码元）',
      quota.qMax > 4000000 && quota.qMax < 8000000,
      quota.error ? `测量抛错：${quota.error}` : `${quota.qMax} 码元（1 字符键名）`);
    // 「配额到底按什么计费」：**键名也算**，而且计费单位就是「键名长度 + 值长度」的
    // 码元数。实测（Edge headless）：1 字符键能塞 5,242,879，22 字符键只能塞
    // 5,242,858，差 21 = 22-1 —— 说明 5,242,880 = **正好 5 MiB 个 UTF-16 码元**，
    // 而文档里记的 5,242,877 = 5,242,880-3，正是**用 3 字符键名量出来的**。
    // 这条守的是**体积预算的算法**：算「还能塞多少」时若不把键名算进去，
    // 会高估可存体积（键名越长高估越多）。
    // 断言写成「差值恰好等于键名长度差」这个**关系**，不钉死 5,242,880 这个数。
    check('配额按「键名 + 值」计费（差值 = 键名长度差）',
      quota.delta === quota.keyLenLong - quota.keyLen1,
      `1 字符键 ${quota.qMax} · ${quota.keyLenLong} 字符键 ${quota.longMax}`
      + ` · 差 ${quota.delta} 码元（键名长度差 ${quota.keyLenLong - quota.keyLen1}）`
      + ` · 推出配额总量 ${quota.total} 码元`);
    check('配额按码元计：中文与 ASCII 同价',
      quota.mixedOk === true,
      `半中半英 ${quota.qMax} 码元${quota.mixedOk ? '能存下' : '存不下'}`);
    check('配额是 per-origin 共享的（第二个同大键被拒）',
      quota.sharedBlocked === true,
      `单键占满后另一键写入${quota.sharedBlocked ? '失败（符合共享语义）' : '竟然成功'} · 此刻合计 ${quota.held} 码元`);
    check('测完把 localStorage 原样放回（不污染同 origin 的别的测试）',
      quota.restoredSame === true,
      `恢复 ${quota.restoredKeys} 个键 / 快照 ${quota.originKeys} 个`);
    console.log(`  · 实测：单键上限 ${quota.qMax} 码元（1 字符键名，二分法）`
      + ` · ${quota.keyLenLong} 字符键名 ${quota.longMax} 码元（差 ${quota.delta}）`
      + ` · 推出配额总量 ${quota.total} 码元 = ${(quota.total / 1048576).toFixed(3)} MiB`
      + ` · 两次二分共 ${Number(quota.measureMs).toFixed(0)} ms`
      + ` · 半中半英同价 ${quota.mixedOk} · per-origin 共享 ${quota.sharedBlocked}`);

    // ── 8. 平移与视图 ─────────────────────────────────────
    section('8. 平移与视图控制');
    const camBefore = await cdp.js('return { x: window.inkbox.camera.x, y: window.inkbox.camera.y };');
    await mouseMove(cdp, cx, cy);
    await mouseDown(cdp, cx, cy, 'right');
    await mouseMove(cdp, cx - 120, cy - 80);
    await mouseMove(cdp, cx - 200, cy - 140);
    await mouseUp(cdp, cx - 200, cy - 140, 'right');
    await sleep(150);
    const camAfter = await cdp.js('return { x: window.inkbox.camera.x, y: window.inkbox.camera.y };');
    check('右键拖拽可平移视图',
      Math.abs(camAfter.x - camBefore.x) > 1 || Math.abs(camAfter.y - camBefore.y) > 1,
      `(${camBefore.x.toFixed(0)},${camBefore.y.toFixed(0)}) → (${camAfter.x.toFixed(0)},${camAfter.y.toFixed(0)})`);

    const fitResult = await cdp.js(`
      document.getElementById('inkBtnFit').click();
      return window.inkbox.camera.zoom;
    `);
    check('「全图」按钮生效', fitResult > 0, `zoom ${Number(fitResult).toFixed(2)}`);

    const reliefBtn = await cdp.js(`
      const btn = document.getElementById('inkBtnRelief');
      const before = window.inkbox.camera.relief;
      btn.click();
      const after = window.inkbox.camera.relief;
      btn.click();
      return { before, after, restored: window.inkbox.camera.relief };
    `);
    check('「立体」按钮切换并可还原',
      reliefBtn.before !== reliefBtn.after && reliefBtn.restored === reliefBtn.before);

    // ── 9. 天灾与生灵工具全量过一遍 ───────────────────────
    section('9. 全部工具逐一点击（防手滑）');
    const allGroups = await cdp.js(`return Array.from(document.querySelectorAll('.group')).map((el) => el.dataset.group);`);
    check(`分组 tab 共 ${EXPECT_GROUPS} 个且与工具表一致`,
      allGroups.length === EXPECT_GROUPS
        && allGroups.join(',') === TOOL_GROUPS.map((g) => g.key).join(','),
      allGroups.join(','));

    const everyTool = [];
    for (const group of allGroups) {
      await cdp.js(`
        const tab = Array.from(document.querySelectorAll('.group')).find((el) => el.dataset.group === ${JSON.stringify(group)});
        tab.click();
        return true;
      `);
      const ids = await cdp.js(`return Array.from(document.querySelectorAll('.ink-tool')).map((el) => el.dataset.tool);`);
      everyTool.push(...ids);
    }
    check(`遍历 ${EXPECT_GROUPS} 组共收集到 ${EXPECT_TOOLS} 个工具且无重复`,
      everyTool.length === EXPECT_TOOLS && new Set(everyTool).size === EXPECT_TOOLS,
      `累计 ${everyTool.length} / 去重 ${new Set(everyTool).size}`);
    // 光看数量不够：数量和去重都过、但把「传功法」漏渲染成「降禁术」也照样过。
    // 逐 id 对一遍集合，缺哪个、多哪个都能报出来。
    const expectIds = new Set(TOOLS.map((t) => t.id));
    const gotIds = new Set(everyTool);
    const missing = [...expectIds].filter((id) => !gotIds.has(id));
    const extra = [...gotIds].filter((id) => !expectIds.has(id));
    check('界面工具集与工具表逐 id 一致',
      missing.length === 0 && extra.length === 0,
      missing.length || extra.length ? `缺 ${JSON.stringify(missing)} 多 ${JSON.stringify(extra)}` : `${EXPECT_TOOLS}/${EXPECT_TOOLS} 对齐`);

    const toolErrorsBefore = cdp.errors().length;
    const results = await cdp.js(`
      const s = window.inkbox;
      const ids = ${JSON.stringify(everyTool)};
      const out = [];
      for (const id of ids) {
        s.selectTool(id);
        const tool = s.tool;
        s.hoverTile = { x: Math.floor(s.world.w * 0.5), y: Math.floor(s.world.h * 0.5) };
        if (!s.world.inside(s.hoverTile.x, s.hoverTile.y)) out.push([id, 'out-of-bounds']);
        try {
          s.history.begin();
          s.applyTool(true);
          s.history.end(tool.name);
          out.push([id, 'ok']);
        } catch (error) {
          out.push([id, String(error && error.message)]);
        }
      }
      return out;
    `);
    const broken = results.filter(([, status]) => status !== 'ok');
    check(`${results.length} 个工具全部可执行且不抛错`, broken.length === 0,
      broken.length ? JSON.stringify(broken) : `${results.length} 个全部 ok`);

    const toolErrorsAfter = cdp.errors().length;
    check('工具遍历期间无运行时报错', toolErrorsAfter === toolErrorsBefore);

    // ── 10. 世界在时间推进下不崩 ──────────────────────────
    section('10. 快进与稳定性');
    await cdp.js('window.inkbox.setSpeed(5); return true;');
    await sleep(2500);
    const fast = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      const st = w.stats();
      return { day: w.day, fps: s.fps, entities: st.entities, villages: st.villages, factions: st.factions, chronicle: w.chronicle.length };
    `);
    check('快进下世界仍在推进', fast.day > 0, `第 ${fast.day.toFixed(0)} 日`);
    check('快进下帧率仍可用', fast.fps > 20, `${fast.fps.toFixed(0)} FPS`);
    check('生灵/聚落数据合法',
      fast.entities >= 0 && fast.villages >= 0 && fast.factions >= 0,
      `生灵 ${fast.entities} · 聚落 ${fast.villages} · 势力 ${fast.factions}`);
    await shot(cdp, '04-fastforward');

    // ── 10b. 检视面板的传记段 ─────────────────────────────
    // 传记这一整套（写 entity.log → 编译 → 面板出几行）里，最可能悄悄断掉的是
    // **最后一段 UI 接线**：日志记了、行也编出来了，但面板没渲染。这类错不报异常，
    // 只表现为「界面上永远看不到那几行」。所以要真的选中一个人，再看面板。
    //
    // 选人的难点：`inspectAt` 取的是「半径 5 格内 level 最高者，同分取 world.entities
    // 里靠前的」。随便挑一个有日志的人去看，面板上出现的可能是旁边更强的人，
    // 断言就成了「面板里恰好有传记行」的假阳性。这里取**全局 level 最高的第一个**：
    // 它半径 5 内不可能有更高的，同分的也都在它后面（同分取靠前），
    // 所以检视它的格子时，面板显示的一定是它本人。
    section('10b. 检视面板的传记段');
    await cdp.js('window.inkbox.setSpeed(0); return true;');
    const bio = await cdp.js(`
      const w = window.inkbox.world;
      const list = w.entities;
      // 自然跑出来的个人事件流有多少人（只报读数，不做硬断言）。
      // 传记的写侧是 World.record(text, kind, actors) → recordLifeEvent，而带当事人的
      // 世界事件（立族、大战、夺舍…）本身就不频繁：探针实测中堂世界跑到 300 日才 2~3 人。
      // 所以「此刻自然日志为 0」是世界跑到哪一年的问题，不是接线问题，不能拿它判失败。
      let logged = 0;
      for (let i = 0; i < list.length; i += 1) {
        if (Array.isArray(list[i].log) && list[i].log.length) logged += 1;
      }
      // 挑一个「检视它必定被选中」且落在世界内的人
      let target = null;
      for (let i = 0; i < list.length; i += 1) {
        const e = list[i];
        if (!w.inside(Math.floor(e.x), Math.floor(e.y))) continue;
        if (!target || (e.level || 0) > (target.level || 0)) target = e;
      }
      const before = target && Array.isArray(target.log) ? target.log.length : 0;
      // 它身上若还没有日志，就用**生产写入路径**补一条：World.record 带 actors 时，
      // 这条事也会被记到当事人身上（World.js:357-362 的分流）。
      // 这不是「构造假数据」——走的正是立族/大战那些事件用的同一条路，
      // 验的是「entity.log 里有的东西，检视面板会不会渲染出来」。
      // 「自然世界会不会自己写出日志」那一半由上面的 logged 读数报出，不在这里硬凑。
      if (target && before === 0) {
        w.record('【' + (target.name || '无名') + '】事迹一桩，聊备一格。', 'clan', target);
      }
      const after = target && Array.isArray(target.log) ? target.log.length : 0;
      return {
        entities: list.length,
        logged,
        target: target ? {
          id: target.id,
          x: Math.floor(target.x),
          y: Math.floor(target.y),
          level: target.level || 0,
          before,
          after,
          possessed: !!target.possessedBy,
        } : null,
      };
    `);
    check('检视面板有可检视的目标（世界里有落在图内的生灵）',
      !!bio.target,
      `生灵 ${bio.entities} · 自然带日志 ${bio.logged} 人`);

    if (bio.target) {
      const panelBio = await cdp.js(`
        window.inkbox.inspectAt(${bio.target.x}, ${bio.target.y});
        const p = document.getElementById('inkInspect');
        return { on: p.classList.contains('on'), text: p.textContent };
      `);
      // 生平：log 非空就必出；入传：compileEvents 至少编出 1 条就必出。
      // 两个都断言，避免只渲染一半（比如「生平」写了、「入传」漏了）。
      check('检视一个人时面板出现传记段（生平 / 入传）',
        panelBio.on && /生平/.test(panelBio.text) && /入传/.test(panelBio.text),
        `#${bio.target.id}（level ${bio.target.level} · log ${bio.target.before}→${bio.target.after}）`
        + ` · 面板${panelBio.on ? '已弹出' : '未弹出'}`
        + ` · 含生平=${/生平/.test(panelBio.text)} 含入传=${/入传/.test(panelBio.text)}`);
      // 夺舍印记是「恰好有就验」：不为让它出现而构造场景（那会把世界改坏）。
      if (bio.target.possessed) {
        check('被夺舍者的面板有一行夺舍印记', /夺舍/.test(panelBio.text), '');
      } else {
        console.log('  · 被检视者无夺舍印记，跳过印记断言（不构造场景）');
      }
    }

    // ── 10c. 世界可观察性：大事记 / 值得关注 / 人物一生 ────────
    //
    // 这三块是「D2 · Batch 1」的全部产出。它们最容易「静悄悄地断掉」的方式是：
    // 数据层写好了、面板却没接线（或者只接了一半）——不报异常、断言全绿，
    // 只表现为「界面上永远看不到那几行」。所以要真的看 DOM，并且真的点一下。
    //
    // ⚠️ 每块都配一条**反例**（注入的那条必须出现 / 点 × 必须收起），
    //    否则「面板渲染了别的东西」也能让正例变绿（假绿通道）。
    section('10c. 世界可观察性：大事记 / 值得关注 / 人物一生');

    // ① 从检视面板点进「他的一生」——这条线此前是断的：
    //    `compileBiography` 早就写好了，但只服务导出按钮，面板上看不到。
    //    放在最前面做，因为它要用上一节 `10b` 挑出来的那个 target（下一段会换世界）。
    if (bio.target) {
      const inspectBio = await cdp.js(`
        window.inkbox.inspectAt(${bio.target.x}, ${bio.target.y});
        const btn = document.getElementById('inkInspectBio');
        return { has: !!btn };
      `);
      check('检视一个修士时，面板出现「查看他的一生」按钮',
        inspectBio.has === true, `含按钮=${inspectBio.has}`);
      if (inspectBio.has) {
        await cdp.js("document.getElementById('inkInspectBio').click(); return true;");
        const card2 = await cdp.js(`
          const p = document.getElementById('inkPersonDetail');
          return { on: p.classList.contains('on'), len: p.textContent.length };
        `);
        check('从检视面板点进去能摊开同一个人的一生',
          card2.on && card2.len > 40, `${card2.len} 字`);
        await cdp.js('window.inkbox.hidePersonCard(); return true;');
      }
    }

    // ② 换一张**确定性**的世界，再**确定性地**推进它。
    //
    // ⚠️ 这里绝不能靠「setSpeed(5) + sleep(5000)」来攒人口：那样推进多少游戏日
    //    取决于机器忙不忙（实测两次跑出来 2 人 / 1 人，断言跟着翻——正是
    //    本项目最忌讳的「随负载翻转的假红」）。改成直接驱动模拟：
    //    `s.advanceDays(30)`，**与真实游戏（`update()` 的 rAF 循环）同一条路**。
    //    20 游戏年 = 240 步，浏览器里约 1~2 秒，且逐位可复现。
    //
    // ⚠️ **别再写回 `w.day += 30; s.life.step(30)`**（BACKLOG #13）。那串手抄
    //    的推进只驱动凡间，上界 / 幽冥 / 裂缝 / 植被 / 野火**一律不动**——
    //    于是本节的读数「幽冥鬼魂 N」是 60 年累计生成、一只没清过的假数
    //    （实测印 186，而同世界 `soulLog.linger` 只有 60）。`advanceDays`
    //    把六个时钟一次跑齐，读数才代表真实游戏。
    const WARM_YEARS = 20;
    const warm = await cdp.js(`
      const s = window.inkbox;
      s.newWorld('medium', 20260914);
      const w = s.world;
      for (let i = 0; i < ${WARM_YEARS} * 12; i += 1) s.advanceDays(30);
      let cultivators = 0;
      for (let i = 0; i < w.entities.length; i += 1) if ((w.entities[i].level || 0) >= 1) cultivators += 1;
      return { day: w.day, entities: w.entities.length, cultivators, milestones: w.milestones.length };
    `);
    console.log(`  · 确定性推进 ${WARM_YEARS} 年 → 第 ${warm.day} 日 · 生灵 ${warm.entities}`
      + ` · 修士 ${warm.cultivators} · 自然攒出的大事 ${warm.milestones} 条`);
    await sleep(2800); // 面板挂 2.5 秒那个定时器，不在 rAF 里

    // ③ 大事记：账本 → 面板这条线
    const msProbe = await cdp.js(`
      const w = window.inkbox.world;
      // 走**生产写入路径**注入一条（与开宗/飞升同一个入口 World.milestone）。
      // 「自然世界会不会自己攒出大事」那一半由 smoke 的 5r 节断言（跑满 60 年），
      // 这里只验「账本里有的东西，面板会不会渲染出来」。
      const before = w.milestones.length;
      w.milestone('【测试】有人于此时此地做了一件大事。', 'world');
      return { before, after: w.milestones.length };
    `);
    check('World.milestone() 把事写进大事账本',
      msProbe.after === msProbe.before + 1, `${msProbe.before} → ${msProbe.after} 条`);
    await sleep(2800);
    const msPanel = await cdp.js(`
      const box = document.getElementById('inkMilestones');
      if (!box) return null;
      return { rows: box.querySelectorAll('.ink-log').length, text: box.textContent };
    `);
    check('大事记面板渲染出注入的那条（账本 → 面板接线正确）',
      !!msPanel && msPanel.rows > 0 && /做了一件大事/.test(msPanel.text),
      msPanel ? `${msPanel.rows} 行` : '面板不存在');
    check('大事记每行带年份徽标（玩家要能看出「这是哪一年的事」）',
      !!msPanel && /仙历\s*\d+\s*年/.test(msPanel.text),
      msPanel ? msPanel.text.replace(/\s+/g, ' ').slice(0, 46) : '');
    // 反例：面板渲染的行数不能超过账本本身（多出来的行 = 渲染层在编造）
    check('大事记渲染行数不超过账本条数（反例：多出来的行是编造的）',
      !!msPanel && msPanel.rows <= msProbe.after,
      msPanel ? `${msPanel.rows} 行 / 账本 ${msProbe.after} 条` : '');
    await shot(cdp, '10c-observability');

    // ② 值得关注：活人榜
    const notable = await cdp.js(`
      const box = document.getElementById('inkNotables');
      if (!box) return null;
      const rows = box.querySelectorAll('[data-live]');
      return { count: rows.length, text: box.textContent };
    `);
    check('值得关注面板列出了活人（不是空面板）',
      !!notable && notable.count > 0, notable ? `${notable.count} 人` : '面板不存在');
    // ⚠️ 行数 = **当前有候选的规则条数**，不是固定 7 条。
    //    20 年的世界里只有前两条规则有候选（当世之巅 / 最年长）——
    //    法宝要「相伴 50 年」才出器灵、杀名要真打过架、夺舍要幽冥跑起来，
    //    这些在 20 年里本来就未必有。所以门槛压 2：
    //    「至少两条规则各自挑到了人」= 挑人循环真的在跑，而不是只跑通第一条。
    //    那几条规则各自的**数据**由 smoke 的 5g/5h/5j 节在 60~300 年尺度上守着。
    check('活人榜至少两条规则挑到了人（只出 1 行 = 挑人循环只跑通了第一条）',
      !!notable && notable.count >= 2,
      notable ? `${notable.count} 人（修士 ${warm.cultivators}）` : '');
    check('活人榜里每条理由只出现一次（同一条规则重复上榜 = 去重坏了）',
      await cdp.js(`
        const labels = Array.from(document.querySelectorAll('#inkNotables .notable-reason'))
          .map((el) => el.textContent.trim());
        return new Set(labels).size === labels.length && labels.length > 0;
      `) === true, '');
    check('每行都写了「为什么是他」（不是一串没有由来的名字）',
      !!notable && /当世之巅|最年长|名动一方|身怀重宝|血债累累|新晋突破|来历不凡/.test(notable.text),
      notable ? notable.text.replace(/\s+/g, ' ').slice(0, 40) : '');
    check('榜上没有重复的人（同一人占三行会让玩家以为面板坏了）',
      await cdp.js(`
        const ids = Array.from(document.querySelectorAll('#inkNotables [data-live]')).map((el) => el.dataset.live);
        return new Set(ids).size === ids.length;
      `) === true, '');

    // ③ 人物一生：真点一下榜单第一行
    if (notable && notable.count > 0) {
      const spot = await cdp.js(`
        const row = document.querySelector('#inkNotables [data-live]');
        if (!row) return null;
        const id = Number(row.dataset.live);
        // 走真实面板的委托 click handler，避免取坐标后右栏刷新导致点击落空。
        row.click();
        return { id };
      `);
      const card = await cdp.js(`
        const p = document.getElementById('inkPersonDetail');
        return {
          on: p.classList.contains('on'), targetId: window.inkbox.personOpenId,
          len: p.textContent.length, text: p.textContent,
        };
      `);
      check('点一个人能摊开「他的一生」（活人传记面板）',
        !!spot && card.on && card.targetId === spot.id && card.len > 40,
        `#${spot?.id} → #${card.targetId} · ${card.len} 字 · ${card.on ? '已弹出' : '未弹出'}`);
      // 固定段：`compileBiography` 无论谁都会写这两段。
      // 断它而不是断某个具体事迹——事迹有多少取决于世界跑到哪一年（会漂）。
      check('活人传记含固定段「一眼看懂」与「修行轨迹」',
        /一眼看懂/.test(card.text) && /修行轨迹/.test(card.text), '');
      // D7-F：人物卡「查看关系」能摊开一跳关系图（内联 SVG）。
      // 断「有 svg + 按钮翻转成收起」——**不断具体几个人**：关系多少随世界跑的年数漂。
      // 没关系时 SVG 里会写「尚无已知的人际关系」，仍然是一个 svg ⇒ 断言稳。
      const rel = await cdp.js(`
        const btn = document.getElementById('inkBtnPersonRel');
        if (!btn) return null;
        btn.click();
        const box = document.getElementById('inkPersonRel');
        return { hasSvg: !!box && !!box.querySelector('svg'), label: btn.textContent };
      `);
      check('人物卡「查看关系」能摊开一跳关系图（内联 SVG）',
        !!rel && rel.hasSvg && rel.label === '收起关系',
        rel ? `svg=${rel.hasSvg} · 按钮「${rel.label}」` : '未找到关系按钮');
      await shot(cdp, '10c-person-card');
      await cdp.js("document.getElementById('inkPersonClose').click(); return true;");
      const closed = await cdp.js(`
        const panel = document.getElementById('inkPersonDetail');
        return { visible: panel.classList.contains('on'), targetId: window.inkbox.personOpenId };
      `);
      check('点 × 能真的收起人物面板（反例：不然玩家以为按钮坏了）',
        closed.visible === false && closed.targetId === null,
        `visible=${closed.visible} · targetId=${closed.targetId}`);
    }

    // ── 10d. 玩家干预 → 世界反馈（UI 层） ─────────────────────
    //
    // Batch 2 的全部产出。判据只有一句话：「我动了一下世界，历史改变了」，
    // 而它的硬形式是——**操作之后「大事记」面板里多出对应的一笔**。
    //
    // 三条反例，各自堵一条假绿通道：
    //   · 按钮在、点了不选中       → 玩家根本用不上这个工具；
    //   · 通知栏有字、账本没多一条 → 界面在自说自话；
    //   · 账本多了一条、面板没渲染 → 数据层写好了面板没接线（B1 就踩过这个）。
    //
    // ⚠️ 反例「空落一笔不进大事记」**不在这里做**：它需要一个保证无人的落点，
    //    而这里的世界是活着的（生灵在走）。那条由 smoke 的 5s 节确定性断言。
    // ⚠️ 先停表（setSpeed(0)）：不然下面几个 sleep 里世界自己在走，
    //    落点会漂、天数会漂，断言跟着负载翻——正是本项目最忌讳的假红。
    section('10d. 玩家干预 → 世界反馈（降灾 / 天灾 → 大事记）');
    await cdp.js('window.inkbox.setSpeed(0); return true;');

    // ① 「天灾」组里真的多了一个「降灾」按钮，且点它能选中
    await cdp.js(`
      const tab = Array.from(document.querySelectorAll('.group')).find((el) => el.dataset.group === 'disaster');
      if (tab) tab.click();
      return true;
    `);
    const crisisBtn = await cdp.js(`
      const btn = document.querySelector('.ink-tool[data-tool="crisis"]');
      if (!btn) return null;
      btn.click();
      return { tool: window.inkbox.toolId, on: btn.classList.contains('on'), title: btn.title };
    `);
    check('「天灾」组里有「降灾」按钮，点它能选中',
      !!crisisBtn && crisisBtn.tool === 'crisis' && crisisBtn.on,
      crisisBtn ? crisisBtn.title : '按钮不存在');

    // ② 真鼠标在画布上点一座聚落：通知栏要有人话，账本要多一笔 crisis
    const crisisSpot = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      const v = w.villages[0] || null;
      const x = v ? v.x : Math.floor(w.w / 2);
      const y = v ? v.y : Math.floor(w.h / 2);
      s.camera.x = x; s.camera.y = y;      // 把镜头挪过去，保证落点在视口正中
      const r = document.getElementById('inkCanvas').getBoundingClientRect();
      return {
        left: r.left, top: r.top,
        villages: w.villages.length,
        sx: s.camera.toScreenX(x), sy: s.camera.toScreenY(y),
        milestones: w.milestones.length,
      };
    `);
    check('世界里有聚落可降灾（没有聚落这条会红：该换落点，不是改断言）',
      crisisSpot.villages > 0, `${crisisSpot.villages} 座聚落`);
    await click(cdp, crisisSpot.left + crisisSpot.sx, crisisSpot.top + crisisSpot.sy);
    const crisisHint = await waitForHint(cdp, /——|灾祸空悬/, 2500);
    const crisisAfter = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      const last = w.milestones[w.milestones.length - 1] || null;
      return {
        milestones: w.milestones.length,
        active: s.life.events.activeCrises.length,
        byPlayer: s.life.events.activeCrises.filter((c) => c.byPlayer).length,
        lastKind: last ? last.kind : null,
        lastText: last ? last.text : '',
      };
    `);
    check('降灾真的往世界事件表里推了一场灾（不是只弹了个提示）',
      crisisAfter.active > 0 && crisisAfter.byPlayer > 0,
      `${crisisAfter.active} 场在跑（玩家亲手 ${crisisAfter.byPlayer} 场）`);
    check('降灾进大事账本（kind=crisis）',
      crisisAfter.milestones === crisisSpot.milestones + 1 && crisisAfter.lastKind === 'crisis',
      `${crisisSpot.milestones} → ${crisisAfter.milestones} 条 · ${crisisAfter.lastText}`);
    check('通知栏给的是人话（含灾名，不是「降灾 · 落于 (x, y)」）',
      /赤地旱岁|饥岁围城|妖潮压城|地脉覆城/.test(crisisHint), crisisHint);

    // ③ 账本 → 面板：2.5 秒那个定时器挂上去之后，大事记里要看得见
    await sleep(2800);
    const crisisPanel = await cdp.js(`
      const box = document.getElementById('inkMilestones');
      return box ? box.textContent : '';
    `);
    check('大事记面板渲染出玩家刚降下的那场灾（账本 → 面板接线正确）',
      /赤地旱岁|饥岁围城|妖潮压城|地脉覆城/.test(crisisPanel),
      crisisPanel.replace(/\s+/g, ' ').slice(0, 60));

    // ④ 即时天灾同样走这条路：陨石落在人最密的地方 → 文案里要有罹难/受灾
    const meteorSpot = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      const es = w.entities;
      let best = null;
      let bestN = -1;
      const step = Math.max(1, Math.floor(es.length / 40));
      for (let i = 0; i < es.length; i += step) {
        let n = 0;
        for (let j = 0; j < es.length; j += 1) {
          if (Math.hypot(es[j].x - es[i].x, es[j].y - es[i].y) <= 6) n += 1;
        }
        if (n > bestN) { bestN = n; best = [es[i].x, es[i].y]; }
      }
      const btn = document.querySelector('.ink-tool[data-tool="meteor"]');
      if (btn) btn.click();
      s.setBrush(4);                        // 半径 12，落点周围二十来格都算在内
      s.camera.x = best[0]; s.camera.y = best[1];
      const r = document.getElementById('inkCanvas').getBoundingClientRect();
      return {
        tool: s.toolId, n: bestN,
        left: r.left, top: r.top,
        sx: s.camera.toScreenX(best[0]), sy: s.camera.toScreenY(best[1]),
        milestones: w.milestones.length,
      };
    `);
    check('落点上确实有一簇人（不然「罹难」二字无从谈起）',
      meteorSpot.tool === 'meteor' && meteorSpot.n >= 3,
      `工具 ${meteorSpot.tool} · 半径 6 内有 ${meteorSpot.n} 人`);
    await click(cdp, meteorSpot.left + meteorSpot.sx, meteorSpot.top + meteorSpot.sy);
    const meteorHint = await waitForHint(cdp, /罹难|聚落受损/, 2500);
    const meteorAfter = await cdp.js(`
      const w = window.inkbox.world;
      const last = w.milestones[w.milestones.length - 1] || null;
      return { milestones: w.milestones.length, kind: last ? last.kind : null, text: last ? last.text : '' };
    `);
    check('陨石进大事账本（kind=disaster）',
      meteorAfter.milestones === meteorSpot.milestones + 1 && meteorAfter.kind === 'disaster',
      `${meteorSpot.milestones} → ${meteorAfter.milestones} 条`);
    check('天灾文案带地名与后果（玩家看得出自己做了什么）',
      /罹难|聚落受损/.test(meteorHint), meteorHint);
    // 反例：不许用「把撤销提示删掉」的方式让上一条变绿。通知栏只有一行、
    // 后写的赢——pointerup 那句「已记录，可 Ctrl+Z 撤销」曾经把上面这句
    // 人话整个盖掉（实测通知栏只剩「陨石 · 已记录，可 Ctrl+Z 撤销」）。
    check('撤销提示没被删掉，而是接在人话后面（两句都在）',
      /可 Ctrl\+Z 撤销/.test(meteorHint), meteorHint);
    await shot(cdp, '10d-player-feedback');

    // ── 10e. 三界最小闭环（Batch 3）──────────────────────────
    //
    // Batch 3 之前三界在界面上**零命中**：上界只在「上界视界」的画中画里贴地形
    // （**一个人都不画**），幽冥的魂路账本（`soulLog`）与魂池（`souls`）
    // 连一个读者都没有。这一节验两件事，两件都要**对账**：
    //   ① 面板真的把已有的读数摆出来了，而且摆出来的数**等于**世界里的数
    //      —— 只验「有文字」的话，写死一句「魂池 0」也能绿；
    //   ② 「这个人死了之后去哪了」在**按人**那一层查得到（史册行上的「魂归X」），
    //      且条数等于名录窗口里真带魂路的条数。
    section('10e. 三界：上界 / 幽冥 / 魂归何处（Batch 3）');

    // ① 把 10c 那张**确定性**世界接着推到 60 年（不重开，省一次地形生成）。
    //
    //    ⚠️ 三界都要推——**这正是 `s.advanceDays()` 存在的理由**。本节原先在这里
    //    手抄了一份 `update()` 的时钟列表（`s.upperAccum += 30; if (>= 10) …`），
    //    而手抄的副本会腐烂：2026-09-23 把累加器收进 `advanceState` 之后
    //    `s.upperAccum` 变成 `undefined`，`undefined += 30 → NaN`，`NaN >= 10`
    //    恒假 ⇒ **上界从此一步不跑**——而且**没有任何断言会因此变红**：
    //    `up.day` 照旧被赋值、面板照旧有读数，只是上界永远停在开局那一天。
    //    这就是 BACKLOG #13 的形态（测试自己抄一份，迟早与真实游戏脱节）。
    //    现在只调真实入口，六个时钟由 `advanceDays` 一次跑齐。
    //
    //    ⚠️ 为什么不只用 10c 的 20 年：20 年时史册那 30 条窗口里带魂路的只有个位数，
    //    断言会变成看运气的。实测同一颗种子 30 年是 2 条、60 年是 11 条
    //    ——**只加年份，不换判据**（换判据就是拿断言去迁就数据）。
    const realmWarm = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      for (let i = 0; i < 40 * 12; i += 1) s.advanceDays(30);
      return { day: w.day, dead: w.dead.length, upperMs: s.upper.milestones.length };
    `);
    console.log(`  · 接着确定性推进到第 ${realmWarm.day} 日 · 名录 ${realmWarm.dead} 位`
      + ` · 上界大事 ${realmWarm.upperMs} 条`);
    await sleep(2800); // 面板挂在 2.5 秒那个定时器上，不在 rAF 里

    // ② 上界：面板读数与 `world.upper` 对账
    const upperPanel = await cdp.js(`
      const s = window.inkbox;
      const up = s.world.upper;
      const meta = document.getElementById('inkUpperMeta');
      const box = document.getElementById('inkUpperLog');
      return {
        meta: meta ? meta.textContent : null,
        text: box ? box.textContent : '',
        rows: document.querySelectorAll('#inkUpperLog .ink-log').length,
        pop: up.entities.length,
        sect: up.factions.length,
        arrived: (up.popLog || {}).arrived || 0,
        died: (up.popLog || {}).died || 0,
        arrCount: Array.isArray(up.arrivedLog) ? up.arrivedLog.length : 0,
        msCount: Array.isArray(up.milestones) ? up.milestones.length : 0,
      };
    `);
    check('上界面板存在且有读数',
      !!upperPanel.meta, upperPanel.meta);
    check('上界读数与 world.upper 对账（生灵 / 宗门 / 累计飞升上来）',
      !!upperPanel.meta
      && upperPanel.meta.includes(`生灵 ${upperPanel.pop}`)
      && upperPanel.meta.includes(`宗门 ${upperPanel.sect}`)
      && upperPanel.meta.includes(`飞升上来 ${upperPanel.arrived}`),
      `${upperPanel.meta} vs 世界 ${upperPanel.pop}/${upperPanel.sect}/${upperPanel.arrived}`);
    // 这一条**能红**：上界有大事/名册却渲染出 0 行 ⇒ 接线断了；
    // 上界什么都没有时，必须给出那句说明而不是一片空白。
    check('上界那块渲染了内容（有大事/名册行；空的时候给出那句「还没有人飞升」）',
      (upperPanel.msCount > 0 || upperPanel.arrCount > 0)
        ? upperPanel.rows > 0
        : /还没有人飞升/.test(upperPanel.text),
      `名册 ${upperPanel.arrCount} · 大事 ${upperPanel.msCount} · 渲染 ${upperPanel.rows} 行`);

    // ②' 上界**生态账本**（D6-2 工程包 E）：同一行上追加了「生态 生 / 亡」两项。
    //     两件事一起验，缺一不可：
    //       ① 面板印的「亡」== 世界 `popLog.died`（**直接对账**，不经过任何公式）；
    //       ② 面板自己那三个数**自洽**：`生灵 === 生 − 亡`（守恒式是契约，
    //          `died += 1` 与 `removeEntity` 在上界是唯一配对的一条路径）。
    //     ⚠️ 判据**只从 DOM 反读**，不在这里重算 `seeded+arrived+born+bornMortal`
    //        ——重算一份公式就是第二个真相。口径的**故障注入**在 smoke 5x，那里才是它的位置。
    //     ⚠️ 这条**不是空过**：面板漏印生态段 ⇒ 正则不匹配 ⇒ 红；
    //        接线接错（例如「亡」接到「逐」/「魂池」）⇒ 守恒式当场破。
    const upEco = /生灵 (\d+)[\s\S]*?生态 生 (\d+) · 亡 (\d+)/.exec(upperPanel.meta || '');
    check('上界：面板自报「生态 生/亡」，且 生灵 === 生 − 亡（守恒式）',
      !!upEco
      && Number(upEco[1]) === Number(upEco[2]) - Number(upEco[3])
      && Number(upEco[3]) === upperPanel.died,
      upEco
        ? `面板 生灵 ${upEco[1]} / 生 ${upEco[2]} / 亡 ${upEco[3]} vs 账本 died ${upperPanel.died}`
        : `面板无生态栏：${upperPanel.meta}`);

    // ③ 幽冥：五根条的数字之和 == 账本之和，且**按人**那一层也对得上
    const netherPanel = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      const rows = Array.from(document.querySelectorAll('#inkSoulRoutes .realm-soul')).map((el) => ({
        label: el.querySelector('span').textContent.trim(),
        n: Number(el.querySelector('b').textContent.trim()),
        zero: el.dataset.zero,
      }));
      const meta = document.getElementById('inkNetherMeta');
      const necro = document.getElementById('inkNecrology');
      const ledger = Object.assign({}, w.soulLog);
      let ledgerSum = 0;
      Object.keys(ledger).forEach((k) => { ledgerSum += Number(ledger[k]) || 0; });
      // ⚠️ 窗口**从 DOM 反读**（面板上挂着 data-dead 的那些 id），不在这里
      //    重写一遍 necrologyList 的排序规则——重写一份就是第二个真相，
      //    哪天排序改了（按卒年 / 按重要），这里的期望值会**静默**地不再对应。
      const shownIds = Array.from(document.querySelectorAll('#inkNecrology [data-dead]'))
        .map((el) => Number(el.dataset.dead));
      const byId = new Map(w.dead.map((r) => [r.id, r]));
      let routed = 0;
      let possessed = 0;
      for (const id of shownIds) {
        const r = byId.get(id);
        if (!r) continue;
        if (r.soulRoute === '${SOUL_ROUTE_POSSESS}') possessed += 1;
        else if (r.soulRoute) routed += 1;
      }
      const text = necro ? necro.textContent : '';
      // 幽冥生态账本（D6-2 工程包 E）：面板那行追加的「生 / 亡 / 逐」三项，
      // 要与世界里这本账**直接对账**。world.nether 在老档 / 单世界路径下可能缺席，
      // 所以先兜底成空账（面板那边同样会退回原字符串，两边一致）。
      const np = (w.nether && w.nether.popLog) || {};
      return {
        rows, meta: meta ? meta.textContent : null, ledger, ledgerSum,
        souls: w.souls.length,
        reborn: w.entities.filter((e) => e.pastLife).length,
        shown: shownIds.length, routed, possessed,
        ghostDied: np.ghostDied || 0, evicted: np.evicted || 0,
        climbedOut: np.climbedOut || 0,
        // D6-3 工程包 D：**第四条离开路径**——低阶鬼修真夺舍凡间活人后从幽冥消失。
        possessedOut: np.possessedOut || 0,
        fateCount: (text.match(/魂归/g) || []).length,
        possessCount: (text.match(/魂未入幽冥/g) || []).length,
      };
    `);
    check('幽冥：五路各一根条，一根不少（顺序从 SOUL_ROUTES 派生）',
      netherPanel.rows.length === Object.keys(SOUL_ROUTES).length,
      `${netherPanel.rows.length} 根 / 应为 ${Object.keys(SOUL_ROUTES).length}`);
    check('幽冥：五根条上的数字之和 == soulLog 之和（面板 ↔ 账本 对账）',
      netherPanel.rows.reduce((n, r) => n + r.n, 0) === netherPanel.ledgerSum,
      `${netherPanel.rows.map((r) => `${r.label}${r.n}`).join(' ')}`
      + ` vs 账本 ${JSON.stringify(netherPanel.ledger)}`);
    check('幽冥：标签就是考古定名的五路（不另造同义词）',
      netherPanel.rows.map((r) => r.label).join(',')
        === Object.values(SOUL_ROUTES).map((k) => ROUTE_LABEL[k]).join(','),
      netherPanel.rows.map((r) => r.label).join(' '));
    check('幽冥读数与世界的数对账（魂池 / 累计 / 已归来）',
      !!netherPanel.meta
      && netherPanel.meta.includes(`魂池 ${netherPanel.souls}`)
      && netherPanel.meta.includes(`累计 ${netherPanel.ledgerSum}`)
      && netherPanel.meta.includes(`已归来 ${netherPanel.reborn}`),
      `${netherPanel.meta} vs 世界 ${netherPanel.souls}/${netherPanel.ledgerSum}/${netherPanel.reborn}`);
    check('魂路账本非空（空了的话上面几条就是 0==0 的空过）',
      netherPanel.ledgerSum > 0, `累计 ${netherPanel.ledgerSum} 条`);

    // ③' 幽冥**生态账本**（D6-2 工程包 E）：同一行上追加了「生态 生 / 亡 / 逐」三项。
    //     与上界 ②' 同款判据（DOM 自洽 + 直接对账），差别只在守恒式：
    //     幽冥有**两条**离开路径（消散 + 上限逐出），所以是 `鬼魂 + 鬼修 === 生 − 亡 − 逐`。
    //     ⚠️ 「逐」这一项**必须**单独印：把逐出并进「亡」等于把「被清出去」说成「死了」
    //        ——两个意思完全不同（smoke 5x ⑤ 专门守这条分流）。
    //     ⚠️ D6-3 工程包 B 再加**第三条离开路径**「出」（自幽冥缝爬入凡间的鬼）：
    //        守恒式因此变成 `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出`。不印「出」的话，
    //        一旦有鬼爬出去，这条守恒式会**在有鬼爬出时**才红——比漏印更难查。
    //     ⚠️ D6-3 工程包 D 再加**第四条离开路径**「夺」（低阶鬼修真夺舍凡间活人后
    //        从幽冥消失，`nether.popLog.possessedOut`）：守恒式因此变成
    //        `鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺`。同款理由：不印「夺」，
    //        一旦有鬼修夺舍成功，这条守恒式会**在夺舍发生时**才红。
    const neEco = /幽冥 鬼魂 (\d+) · 鬼修 (\d+)[\s\S]*?生态 生 (\d+) · 亡 (\d+) · 逐 (\d+) · 出 (\d+) · 夺 (\d+)/
      .exec(netherPanel.meta || '');
    check('幽冥：面板自报「生态 生/亡/逐/出/夺」，且 鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺（守恒式）',
      !!neEco
      && Number(neEco[1]) + Number(neEco[2])
        === Number(neEco[3]) - Number(neEco[4]) - Number(neEco[5]) - Number(neEco[6]) - Number(neEco[7])
      && Number(neEco[4]) === netherPanel.ghostDied
      && Number(neEco[5]) === netherPanel.evicted
      && Number(neEco[6]) === netherPanel.climbedOut
      && Number(neEco[7]) === netherPanel.possessedOut,
      neEco
        ? `面板 鬼魂 ${neEco[1]} + 鬼修 ${neEco[2]} vs 生 ${neEco[3]} − 亡 ${neEco[4]}`
          + ` − 逐 ${neEco[5]} − 出 ${neEco[6]} − 夺 ${neEco[7]}`
          + `（账本 died ${netherPanel.ghostDied} / evicted ${netherPanel.evicted}`
          + ` / climbedOut ${netherPanel.climbedOut} / possessedOut ${netherPanel.possessedOut}）`
        : `面板无生态栏：${netherPanel.meta}`);

    // ③'' **统一**口径（这就是「工程包 E」的名字）：两块面板用的必须是**同一组词**
    //     与**同一个顺序**（生 → 亡），而不是各写各的（「出生/死亡」「新增/减少」…）。
    //     故障：谁把某一界改成别的措辞 ⇒ 这条红——「统一」名存实亡。
    check('三界读数统一口径：上界 / 幽冥用的是同一组生态词与顺序（生态 生 … 亡 …）',
      /生态 生 \d+ · 亡 \d+/.test(upperPanel.meta || '')
      && /生态 生 \d+ · 亡 \d+/.test(netherPanel.meta || ''),
      `上界「生态 生 … 亡 …」· 幽冥「生态 生 … 亡 …」`);

    // ④ 按人查：史册那一行印出的「魂归X」条数 == 窗口里真带魂路的条数
    check('史册窗口里有带魂路的记录（没有的话下面那条是 0==0 的空过）',
      netherPanel.routed > 0, `窗口 ${netherPanel.shown} 条里 ${netherPanel.routed} 条`);
    check('史册行印出的「魂归」条数 == 窗口里真带魂路的条数（对账）',
      netherPanel.fateCount === netherPanel.routed,
      `面板 ${netherPanel.fateCount} 条 vs 数据 ${netherPanel.routed} 条`);
    // 反向：夺舍是**另一种去向**，不许被印成五路里的任何一条。
    // 这一条在窗口里恰好没有夺舍者时是 0==0，但它是**互补判据**：
    // 与上一条合起来才说明「两种去向分得开」，单看任何一条都可能被
    // 「无条件印一句魂归」蒙过去。
    check('夺舍者印的是「魂未入幽冥 · 元神夺舍」，不是五路里的任何一条',
      netherPanel.possessCount === netherPanel.possessed,
      `面板 ${netherPanel.possessCount} 条 vs 数据 ${netherPanel.possessed} 条`);

    // ⑤ 证据图：**先把两块浮层收掉**。
    //    检视面板（`.inspect`）与「人物一生」都贴在右栏上方，不收掉的话
    //    这张「三界面板」的证据图里，三界那块有一半被别的面板盖住——
    //    图还在、面板也在，只是**看不出验的是什么**。
    //    再把右栏滚到「三界」那一节：前面几节的操作会把侧栏滚走，
    //    不归位的话证据图看起来像「侧栏顶部坏了」。
    await cdp.js(`
      const s = window.inkbox;
      s.hidePersonCard();
      const ins = document.getElementById('inkInspect');
      if (ins) ins.classList.remove('on');
      const nd = document.getElementById('inkNecroDetail');
      if (nd) nd.classList.remove('on');
      const rail = document.querySelector('.rail.right');
      const title = Array.from(document.querySelectorAll('.rail.right .sec-title'))
        .find((el) => el.textContent.trim() === '三界');
      // ⚠️ 用 scrollIntoView，**不要**用 rail.scrollTop = title.offsetTop：
      //    .rail 不是定位祖先，offsetTop 是相对更高一层算的，
      //    那样设会把整栏**滚过头**——图上「三界」两个字反而被推到视野外。
      if (rail && title) title.scrollIntoView({ block: 'start' });
      return true;
    `);
    await sleep(300);
    await shot(cdp, '10e-three-realms');

    // ── 10f. 污染说明行（`@note` 渲染协议）────────────────────
    // `pollution` 是玩家看不见来路的量：面板只报一个数字 + 一个档位名
    // （清净 / 沾染浊气 / 道基受损 / 蚩影缠身），玩家答不出「这是什么、从哪来」。
    // 2026-09-22 给它补了一行说明（`rows` 里的 `@note` 伪标签 → `.inspect-note`）。
    // ⚠️ `@note` 是**新引入的渲染协议**：它坏了不会报错，只会**静默退回两列读数**
    //    （或者整行消失）——正是本项目最怕的「不报错、只在读数上静静地错」。
    //    所以这条断言验的是「说明行真的以 `.inspect-note` 出现在面板上」。
    section('10f. 污染说明行（检视面板的 `@note`）');
    // ⚠️ 注入坐标必须取整。实体的 x/y 是**连续坐标**，而 world.idx 是 `y * w + x`——
    //    传浮点进去会算出非整数索引，world.height[i] 就是 undefined，
    //    面板里 .toFixed() 直接抛 TypeError、整页脚本中断（本次实测踩过一次）。
    //    鼠标路径踩不到这个坑：camera.pick 返回的本来就是 Math.round。
    //    ⚠️ 上面这段注释写在模板串**外面**：cdp.js 的模板串里出现反引号会把它整个截断，
    //    症状是 `SyntaxError: missing ) after argument list`（本会话已踩过三次）。
    const pollutionNote = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      // ⚠️ 直接复用 10e 留下的世界，**不再 newWorld**：10c / 10d / 10e 已经各开过一次，
      //    再开第四次会把内存吃光——实测这台 8 GB 的机器上，浏览器直接被拖到
      //    CDP 超时（症状是「调试端口未就绪」/ Runtime.evaluate 超时，不是断言红）。
      //    10e 那个世界已经跑到第 21600 日、名录 800 位，里面必然有修士。
      // 给**所有**修士灌上污染：面板报的是「附近最强的那个修士」，
      // 只污染一个的话，他可能恰好不是最强的那位，断言就会红得没有道理。
      let n = 0;
      let target = null;
      for (let i = 0; i < w.entities.length; i += 1) {
        const e = w.entities[i];
        if ((e.level || 0) >= 1) { e.pollution = 50; n += 1; if (!target) target = e; }
      }
      if (!target) return { n: 0, has: false, text: '', rows: '' };
      s.inspectAt(Math.floor(target.x), Math.floor(target.y));
      const p = document.getElementById('inkInspect');
      const note = p.querySelector('.inspect-note');
      const rows = Array.from(p.querySelectorAll('.inspect-row')).map((r) => r.textContent).join(' | ');
      return { n, has: !!note, text: note ? note.textContent : '', rows };
    `);
    // 先证「注入生效了」——不然下面那条红了也说不清是产品坏还是测试没造出场景。
    check('注入的污染修士确实被面板读到',
      pollutionNote.n > 0 && /污染/.test(pollutionNote.rows || ''),
      `修士 ${pollutionNote.n} 位 · ${(pollutionNote.rows || '').slice(0, 60)}`);
    check('污染说明行以 `.inspect-note` 渲染（`@note` 协议没坏）',
      pollutionNote.has === true && /浊气/.test(pollutionNote.text || ''),
      pollutionNote.text || '(没有说明行)');
    await shot(cdp, '10f-pollution-note');

    // ── 11. 大世界 + 立体视图帧率 ─────────────────────────
    section('11. 大世界与立体视图帧率');
    await cdp.js(`
      const s = window.inkbox;
      s.newWorld('large', 424242);
      s.camera.relief = true;
      s.terrain.setRelief(true);
      s.setSpeed(5);
      return true;
    `);
    await sleep(3000);
    const large = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      return {
        size: [w.w, w.h],
        fps: s.fps,
        entities: w.entities.length,
        relief: s.camera.relief,
        zoom: s.camera.zoom,
      };
    `);
    check('大世界已生成', large.size[0] === 384 && large.size[1] === 240, `${large.size[0]}×${large.size[1]}`);
    check('大世界立体视图帧率可用', large.fps > 20, `${large.fps.toFixed(0)} FPS @ 立体`);

    // 控件必须跟着实际世界走，否则读档读进一个长卷后下拉还停在「中堂」
    const sync = await cdp.js(`
      const s = window.inkbox;
      return {
        preset: s.presetKey,
        select: document.getElementById('inkPresetSelect').value,
        seedInput: document.getElementById('inkSeedInput').value,
        worldSeed: String(s.world.seed),
      };
    `);
    check('换世界后底部控件同步到实际世界',
      sync.preset === 'large' && sync.select === 'large' && sync.seedInput === sync.worldSeed,
      `预设 ${sync.select} · 种子 ${sync.seedInput}${sync.seedInput === sync.worldSeed ? '' : ` ≠ 世界 ${sync.worldSeed}`}`);
    await shot(cdp, '05-large-relief');

    // 极限：放大到 1 像素 1 格
    const zoomed = await cdp.js(`
      const s = window.inkbox;
      s.camera.zoom = 12;
      s.camera.clamp();
      s.dirty = true;
      return true;
    `);
    await sleep(1600);
    const zoomFps = await cdp.js('return window.inkbox.fps;');
    check('高倍放大下帧率可用', zoomFps > 20, `${Number(zoomFps).toFixed(0)} FPS @ zoom 12`);
    await shot(cdp, '06-zoom12');

    // ── 11b. 上界视界（划选 / 帧率）─────────────────────────
    // 阶段一的头号验收判据：「划选之后，屏幕上到底有没有出现第二张图」。
    // 这一条只有真浏览器能守——无头直调模块测不出「事件序列没接上」「渲染没画」。
    section('11b. 上界视界（划选与帧率）');

    // 先把视角复位到稳定状态：第 11 节把相机拉到了 1 像素 1 格 + 立体，
    // 在那种视角下量帧率与像素差都会被极端缩放干扰。
    const upperReady = await cdp.js(`
      const s = window.inkbox;
      s.setSpeed(0);
      s.selection = null;              // 视界是 UI 状态；这里只是把测量前的现场清干净
      s.selectPath = null;             // ⚠️ 是 selectPath 不是 selectDrag：划选已套索化（见 11b ①-6）
      s.camera.relief = false;
      s.terrain.setRelief(false);
      if (s.upperTerrain) s.upperTerrain.setRelief(false);
      s.camera.fit(s.world);
      s.selectTool('viewUpper');
      s.dirty = true;
      return {
        tool: s.toolId,
        mode: s.tool.mode,
        upper: !!s.upperTerrain,
        size: [s.world.w, s.world.h],
      };
    `);
    check('上界视界工具已选中且是 select 模式（一次成型，不走限速笔刷）',
      upperReady.tool === 'viewUpper' && upperReady.mode === 'select' && upperReady.upper,
      `tool=${upperReady.tool} mode=${upperReady.mode} upperTerrain=${upperReady.upper}`);
    await sleep(300);

    // ①-1 关闭视界时的基线：帧率 + 两帧像素噪声
    const fpsClosed = await measureFps(cdp, 45);
    const capA = await cdp.js(`
      const s = window.inkbox;
      const cv = s.canvas;
      const g = cv.getContext('2d');
      window.__viewA = g.getImageData(0, 0, cv.width, cv.height).data.slice();
      return { w: cv.width, h: cv.height, selection: !!s.selection };
    `);
    check('量基线时视界确实是关着的', capA.selection === false,
      `selection=${capA.selection}`);
    await sleep(180);
    // 基线噪声：世界虽然暂停，水面/光晕等仍有逐帧动画，A→A' 也会有几个像素在动。
    // 先把这个噪声量出来，划选后的差异必须**明显高于**它，否则判据不成立。
    const noise = await cdp.js(`
      const s = window.inkbox;
      const cv = s.canvas;
      const g = cv.getContext('2d');
      const a = window.__viewA;
      const b = g.getImageData(0, 0, cv.width, cv.height).data;
      let changed = 0;
      for (let i = 0; i < b.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 8) changed += 1;
      }
      window.__viewA = b;   // 用这一帧当基准，供划选后比对
      return { changed, total: cv.width * cv.height };
    `);

    // ①-2 派发**真实**的 pointerdown → pointermove → pointerup 划一块矩形。
    // ⚠️ 绝不能直接调 commitSelection()——那会绕过 normalizeSelection 与
    // 「只在 pointerup 提交一次」这两条，而它们正是最可能出错的地方。
    //
    // 阶段三：先记下划选前的裂缝账本，用来断言「这一次划选**确实**开出了缝」。
    // 不能断言 `rifts.length > 0` 这种绝对值——本测试前面还有别的小节动过世界，
    // 绝对值分不清「这次开的」与「早就有的」。
    const riftBefore = await cdp.js(`
      const s = window.inkbox;
      return { opened: (s.world.riftLog && s.world.riftLog.opened) || 0 };
    `);
    const dragFrom = { x: left + width * 0.30, y: top + height * 0.30 };
    const dragTo = { x: left + width * 0.62, y: top + height * 0.62 };
    await mouseMove(cdp, dragFrom.x, dragFrom.y);
    await mouseDown(cdp, dragFrom.x, dragFrom.y);
    await mouseMove(cdp, (dragFrom.x + dragTo.x) / 2, (dragFrom.y + dragTo.y) / 2);
    await mouseMove(cdp, dragTo.x, dragTo.y);
    await sleep(80);
    await mouseUp(cdp, dragTo.x, dragTo.y);
    await sleep(300);

    // ①-3 便宜的状态断言：selection 非 null 且四角在世界内
    const selState = await cdp.js(`
      const s = window.inkbox;
      const sel = s.selection;
      return {
        sel: sel ? { x0: sel.x0, y0: sel.y0, x1: sel.x1, y1: sel.y1 } : null,
        w: s.world.w,
        h: s.world.h,
      };
    `);
    check('划选后 window.inkbox.selection 非 null',
      !!selState.sel,
      selState.sel ? JSON.stringify(selState.sel) : 'null（事件序列没走到 commitSelection？）');
    check('划选矩形四角落在 0..w-1 / 0..h-1 内',
      !!selState.sel
        && selState.sel.x0 >= 0 && selState.sel.y0 >= 0
        && selState.sel.x1 <= selState.w - 1 && selState.sel.y1 <= selState.h - 1
        && selState.sel.x1 >= selState.sel.x0 && selState.sel.y1 >= selState.sel.y0,
      selState.sel ? `${JSON.stringify(selState.sel)} / 世界 ${selState.w}×${selState.h}` : 'selection 为 null');

    // ①-3b 阶段三：这一次划选**真的开出了裂缝**（玩家的手 → 世界状态）。
    //
    // ⚠️ 为什么这条必须在**真浏览器**里断言：`openRifts` 接在 `main.js` 的
    //    `commitSelection`（pointerup 的唯一提交点）上，而 `inkbox-smoke.mjs`
    //    只在模块层直接调 `openRifts`。模块层全绿、玩家入口没接，正是本项目
    //    反复踩的「**字段存在 ≠ 字段生效**」——函数写好了、断言也绿，
    //    但没有任何玩家操作会走到它。
    //
    // 什么故障会让它变红：
    //   · `commitSelection` 里漏了 `openRifts` 调用（有人重构时删掉）；
    //   · `viewUpper` 被改回 `readonly: true` 或换成别的 mode，
    //     于是不走 `'select'` 这条提交路径（`ui/tools.js` 的注释解释过
    //     为什么它必须是 `readonly: false`）；
    //   · 位置过滤把候选格全滤掉（`openRifts` 返回 `refused: 'no-site'`）；
    //   · 活跃裂缝触顶（`refused: 'active-cap'`）。
    const riftAfter = await cdp.js(`
      const s = window.inkbox;
      const w = s.world;
      const first = (w.rifts && w.rifts.length) ? w.rifts[0] : null;
      return {
        opened: (w.riftLog && w.riftLog.opened) || 0,
        active: w.rifts ? w.rifts.length : -1,
        nextId: w.nextRiftId,
        keys: first ? Object.keys(first).sort().join(',') : '',
        // 随机流必须**不在**裂缝记录里（铁律：独立流不进存档，也不挂在实体上）
        leakedRng: first ? ('rng' in first) : false,
      };
    `);
    check('划选视界真的开出了裂缝（玩家入口 → openRifts，模块层测不到这一条）',
      riftAfter.opened > riftBefore.opened,
      `riftLog.opened ${riftBefore.opened} → ${riftAfter.opened} · 当前活跃 ${riftAfter.active} 道`);
    // ⚠️ 第 9 个键是 `age`（2026-09-19 阶段四新增）：记「视界**开启期间**累积的天数」，
    //    取决于玩家历次开关视界的历史，**现算不出来**，所以进档**不违反铁律二**。
    //    `radius` / `peakDay` 仍是推导量 —— 那两个出现在这里就该红。
    // ⚠️ 第 10 个键是 `targetPlane`（2026-09-24 · D6-2 工程包 B2）：记「这条缝连的
    //    是上界还是幽冥」。它同样推不出来（玩家关掉视界后缝仍要知道自己连哪里），
    //    且是纯字符串、无 id 引用。这一节的划选走 `viewUpper` ⇒ 值应为 `'upper'`。
    check('裂缝记录键集恰好是契约的 10 个（真世界里也不许混入 id 引用 / rng）',
      riftAfter.keys === '' || riftAfter.keys === 'age,closedDay,crossed,id,leaked,openedDay,strength,targetPlane,x,y',
      riftAfter.keys ? `键集 ${riftAfter.keys}` : '本次未开出缝（上一条已判红）');
    check('裂缝随机流没有混进裂缝记录（独立流不进存档）',
      riftAfter.leakedRng === false,
      `记录里含 'rng' 键：${riftAfter.leakedRng}`);

    // ①-4 头号判据：屏幕像素真的变了，且差异量明显高于基线噪声
    const diff = await cdp.js(`
      const s = window.inkbox;
      const cv = s.canvas;
      const g = cv.getContext('2d');
      const a = window.__viewA;
      const b = g.getImageData(0, 0, cv.width, cv.height).data;
      let changed = 0;
      for (let i = 0; i < b.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 8) changed += 1;
      }
      window.__viewA = null;
      return { changed, total: cv.width * cv.height };
    `);
    check('划选之后屏幕上真的出现了第二张图（差异显著高于基线噪声）',
      diff.changed > noise.changed + 1000,
      `基线噪声 ${noise.changed} 像素 · 划选后差异 ${diff.changed} / ${diff.total} 像素`
      + `（阈值 > 噪声+1000）`);
    await shot(cdp, '07-upper-view');

    // ② 开着视界的帧率代价：**相对判据**，不写绝对阈值（见 measureFps 的注释）
    const fpsOpen = await measureFps(cdp, 45);
    check('开着视界的帧率不低于关着时的 60%',
      fpsOpen.fps >= fpsClosed.fps * 0.6,
      `关闭 ${fpsClosed.fps.toFixed(1)} FPS（中位帧 ${fpsClosed.median.toFixed(2)} ms）`
      + ` · 开启 ${fpsOpen.fps.toFixed(1)} FPS（${fpsOpen.median.toFixed(2)} ms）`
      + ` · 比值 ${(fpsOpen.fps / fpsClosed.fps).toFixed(2)}`);

    // ①-5 反向断言（一）：起止同格的「退化划选」不该开出一扇窗。
    // 契约：单格不构成「一片山河」（ui/tools.js 的提示语就是这么写的），点击不开窗。
    //
    // 背景（这条抓到过一个真 bug，2026-09-18 已由产品侧修掉）：normalizeSelection 末尾
    // 原本是 `area = (x1-x0+1)*(y1-y0+1); if (area <= 0) return null;`——`x1>=x0`/`y1>=y0`
    // 已在上面保证过，`+1` 让格数最小就是 1×1=1，所以 `area <= 0` **永不成立**，是一句
    // **不可达的死代码**。后果就是点一下会开出 1×1 的窗，而读代码的人以为挡住了。
    // 修法是改成判**跨度**：`if (x1 === x0 && y1 === y0) return null;`（main.js:850）。
    // 所以这条断言**现在应当绿**；哪天有人把这个守卫删了或改回按格数判，它必须重新红。
    // ⚠️ 清的是 `selectPath`（划选路径数组），不是 `selectDrag`——后者是矩形拖拽
    // 时代的名字，该属性早已不存在：赋值**不报错，但什么都没清**（2026-09-23 修）。
    await cdp.js('window.inkbox.selection = null; window.inkbox.selectPath = null; window.inkbox.dirty = true; return true;');
    const degenPt = { x: left + width * 0.5, y: top + height * 0.5 };
    await mouseMove(cdp, degenPt.x, degenPt.y);
    await mouseDown(cdp, degenPt.x, degenPt.y);
    await sleep(60);
    await mouseUp(cdp, degenPt.x, degenPt.y);
    await sleep(200);
    const degen = await cdp.js(`
      const s = window.inkbox;
      const hint = (document.getElementById('inkHint') || {}).textContent || '';
      if (!s.selection) return { sel: null, area: 0, hint };
      const sel = s.selection;
      return {
        sel: { x0: sel.x0, y0: sel.y0, x1: sel.x1, y1: sel.y1 },
        area: (sel.x1 - sel.x0 + 1) * (sel.y1 - sel.y0 + 1),
        hint,
      };
    `);
    check('起止同格的退化划选不应开窗（selection 仍为 null）',
      degen.sel === null,
      degen.sel
        ? `竟然开出 ${JSON.stringify(degen.sel)}（面积 ${degen.area} 格）——`
          + 'normalizeSelection 的单格守卫被删了？'
        : 'null');
    // 拒绝路径**必须发得出声**（main.js:779 的 notify）。只判 selection === null 不够：
    // 守卫若被改成静默 return，上一条照样绿，而玩家点一下什么都不会发生，
    // 会以为工具坏了——本项目最怕的就是这种静默失效。
    // 默认提示是「上界视界：划选一片山河…· 左键落笔 / 右键平移 / 滚轮缩放」，
    // 里面**不含**「太小」「拖拽」，所以守卫一被删掉、notify 不再触发，这条必红。
    check('退化划选要发得出声（提示里说明「太小」并让玩家拖拽）',
      /太小/.test(degen.hint) || /拖拽/.test(degen.hint),
      `提示「${degen.hint}」`);

    // ①-6 反向断言（二）：**套索语义下的两条不变量**（2026-09-23 重写）。
    //
    // ⚠️ 这一块原来钉的是「1×N 的细条划选必须能开窗」——那是**矩形拖拽**时代的
    // 判据（min/max 跨度 ≥ 4 格即合法）。划选改成**自由套索路径**之后
    // （`main.js:857` 落笔建 `selectPath` → `:889-893` 逐点 push → `:901-903`
    // 抬手 `commitSelection(selectPath)`），那条断言的前提**消失了**：
    // 细条的三个采样点是**共线**的，而 `ui/tools.js:40-65` 的 `normalizeRegion`
    // 用**鞋带公式**算面积（`shoelaceArea < REGION_MIN_AREA(=6)` ⇒ 拒，`tools.js:65`），
    // 共线 ⇒ 面积 0 ⇒ 被**正确**拒绝。留着它就是一条「永远红」的断言。
    //
    // 按 §十二「契约变更 ⇒ 换契约稳定的不变量，不是改绿」，换成两条：
    //   (a) **真多边形必放行** —— 非共线的套索必须开出窗（正向，防「拒绝得太多」）；
    //   (b) **共线必被拒** —— 一条线没有面积。这是套索时代**取代旧「单格必拒」**
    //       的核心守卫（旧那条 `main.js:850` 的 `x1===x0 && y1===y0` 判的是矩形跨度，
    //       对自由形状已无意义）。
    // 加上上面 ①-5 的「单击必被拒」，三条合起来同时钉住「拒绝得太少」与
    // 「拒绝得太多」两侧。

    // ── (a) 真多边形必放行 ──────────────────────────────────────
    // 拉一个三角形，三条边各插一个中点 ⇒ 去重后 6 点，稳过 `path.length >= 3`。
    // zoom 8 下约 24 格底 × 16 格高 ⇒ 面积 ≈ 192 格，远大于 REGION_MIN_AREA(6)，
    // 又远小于面积上限（不会触发 capped）。
    await cdp.js(`
      const s = window.inkbox;
      s.selection = null;
      s.selectPath = null;
      s.camera.zoom = 8;
      s.camera.clamp();
      s.dirty = true;
      return true;
    `);
    await sleep(250);
    const triA = { x: left + width * 0.42, y: top + height * 0.42 };
    const triB = { x: left + width * 0.58, y: top + height * 0.42 };
    const triC = { x: left + width * 0.50, y: top + height * 0.58 };
    const triPts = [
      triA,
      { x: (triA.x + triB.x) / 2, y: triA.y },
      triB,
      { x: (triB.x + triC.x) / 2, y: (triB.y + triC.y) / 2 },
      triC,
      { x: (triC.x + triA.x) / 2, y: (triC.y + triA.y) / 2 },
    ];
    await mouseMove(cdp, triPts[0].x, triPts[0].y);
    await mouseDown(cdp, triPts[0].x, triPts[0].y);
    for (let k = 1; k < triPts.length; k += 1) {
      await mouseMove(cdp, triPts[k].x, triPts[k].y);
    }
    await sleep(80);
    await mouseUp(cdp, triPts[triPts.length - 1].x, triPts[triPts.length - 1].y);
    await sleep(250);
    const tri = await cdp.js(`
      const s = window.inkbox;
      if (!s.selection) return { sel: null };
      return { sel: true, pts: (s.selection.path || []).length, area: s.selection.area };
    `);
    check('非共线的套索必须能开窗（真多边形不该被面积守卫误挡）',
      tri.sel === true && tri.pts >= 3 && tri.area > 0,
      tri.sel
        ? `路径 ${tri.pts} 点 · 面积 ${tri.area} 格`
        : 'selection 为 null —— 真多边形被误挡了？');

    // ── (b) 共线必被拒 ──────────────────────────────────────────
    // ⚠️⚠️ **必须先清 `selection`**：否则 `commitSelection` 走的是「**收起**」分支
    // （`main.js:1318`，提示「已收起…视界（再按住拖拽可重新划开）」）而不是
    // 「拒绝 + 太小」——这条断言会**假红**。「收起」与「拒绝」是两条不同的路径，
    // 别把它们混成一条。（这也正是 `:2115` 那行本来想干的事，但它写错了属性名。）
    await cdp.js(`
      const s = window.inkbox;
      s.selection = null;
      s.selectPath = null;
      s.dirty = true;
      return true;
    `);
    await sleep(200);
    const lineFrom = { x: left + width * 0.42, y: top + height * 0.5 };
    const lineTo = { x: left + width * 0.58, y: top + height * 0.5 };
    await mouseMove(cdp, lineFrom.x, lineFrom.y);
    await mouseDown(cdp, lineFrom.x, lineFrom.y);
    await mouseMove(cdp, (lineFrom.x + lineTo.x) / 2, lineFrom.y);
    await mouseMove(cdp, lineTo.x, lineTo.y);
    await sleep(80);
    await mouseUp(cdp, lineTo.x, lineTo.y);
    await sleep(250);
    const collinear = await cdp.js(`
      const s = window.inkbox;
      const hint = (document.getElementById('inkHint') || {}).textContent || '';
      return { sel: s.selection ? true : null, hint };
    `);
    check('共线的套索必须被拒（一条线没有面积，不该开出窗）',
      collinear.sel === null,
      collinear.sel ? '竟然开出了窗 —— 鞋带面积守卫被删了？' : 'null');
    // 与 ①-5 同款理由：拒绝路径**必须发得出声**。守卫若被改成静默 return，
    // 上一条照样绿，而玩家拖一条线什么都不会发生，会以为工具坏了。
    check('共线被拒时要发得出声（提示里说明「太小」）',
      /太小/.test(collinear.hint),
      `提示「${collinear.hint}」`);

    // ── 12. 运行时报错总账 ────────────────────────────────
    section('12. 运行时报错');
    const errors = cdp.errors();
    check('全程无运行时报错', errors.length === 0,
      errors.length ? errors.slice(0, 3).join(' | ') : 'errors: []');

    console.log(`\n${'='.repeat(56)}`);
    console.log(`通过 ${passed} · 失败 ${failed}`);
    if (failed) {
      console.log(`失败用例：\n  - ${failures.join('\n  - ')}`);
    } else {
      console.log('全部通过 ✓');
    }
    console.log(`截图目录：${SHOT_DIR}`);
    if (failed) process.exitCode = 1;
  } finally {
    try { if (ws) ws.close(); } catch { /* ignore */ }
    await stopBrowser(child);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
    } catch { /* 浏览器 profile 是临时产物，不影响测试结论 */ }
  }
}

main().catch((error) => {
  console.error('\n试玩测试失败:', error.message);
  process.exit(1);
});
