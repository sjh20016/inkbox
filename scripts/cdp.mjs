// 零依赖 CDP 浏览器驱动
//
// 复用本机已安装的 Edge / Chrome，走 Chrome DevTools Protocol 做无头自动化。
// 不需要 npm install（Node 18+ 自带 fetch，Node 22+ 自带全局 WebSocket）。
//
// 用法见同目录 SKILL.md。

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';

const DEFAULT_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
].filter(Boolean);

export function findBrowser(candidates = DEFAULT_CANDIDATES) {
  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });
}

export function findEdge() {
  return findBrowser([
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Every launch owns an isolated temporary profile. Stop only that process tree.
// Killing just the Edge leader on Windows can strand renderer/GPU subprocesses.
function stopOwnedBrowser(child) {
  if (!child) return;
  if (process.platform === 'win32' && child.pid && child.exitCode === null) {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* already exited */ }
  }
  try { child.kill(); } catch { /* already exited */ }
}

// CDP 的修饰键是位掩码，不是布尔
export const input = {
  ALT: 1,
  CTRL: 2,
  META: 4,
  SHIFT: 8,
};

// 常用按键表。只给 key 有时不够——很多框架要 code / windowsVirtualKeyCode。
export const KEYS = {
  enter: { key: 'Enter', code: 'Enter', vk: 13 },
  escape: { key: 'Escape', code: 'Escape', vk: 27 },
  tab: { key: 'Tab', code: 'Tab', vk: 9 },
  space: { key: ' ', code: 'Space', vk: 32 },
  backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  arrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  arrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  arrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  arrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  bracketLeft: { key: '[', code: 'BracketLeft', vk: 219 },
  bracketRight: { key: ']', code: 'BracketRight', vk: 221 },
  z: { key: 'z', code: 'KeyZ', vk: 90 },
  ...Object.fromEntries('abcdefghijklmnopqrstuvwxy'.split('').map((ch) => [
    ch,
    { key: ch, code: `Key${ch.toUpperCase()}`, vk: ch.toUpperCase().charCodeAt(0) },
  ])),
  ...Object.fromEntries('0123456789'.split('').map((ch) => [
    `digit${ch}`,
    { key: ch, code: `Digit${ch}`, vk: ch.charCodeAt(0) },
  ])),
};

async function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (ok) return true;
    await sleep(200);
  }
  return false;
}

// 新版 Chrome/Edge 对 /json/new 只接受 PUT，旧版接受 GET，两种都试。
// 不能只看 fetch 有没有抛错——405 也是「成功返回」，要查 response.ok。
async function openTarget(base) {
  let lastError = null;
  for (const method of ['GET', 'PUT']) {
    try {
      const response = await fetch(`${base}/json/new?about:blank`, { method });
      if (!response.ok) continue;
      const data = await response.json();
      if (data && data.webSocketDebuggerUrl) return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`无法创建调试目标${lastError ? `: ${lastError.message}` : ''}`);
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
        const { resolve, reject, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      this.events.push(message);
    });
    ws.addEventListener('close', () => this.rejectPending(new Error('CDP connection closed')));
    ws.addEventListener('error', () => this.rejectPending(new Error('CDP connection error')));
  }

  send(method, params = {}, timeoutMs = 30000) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  rejectPending(error) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }
}

export class Session {
  constructor(cdp, child, userDataDir, meta) {
    this.cdp = cdp;
    this.child = child;
    this.userDataDir = userDataDir;
    this.meta = meta;
  }

  /** 在页面里跑一段脚本并把结果取回。表达式会被包成立即执行函数，用 return 返回。 */
  async js(expression, { timeoutMs = 30000 } = {}) {
    const result = await this.cdp.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    }, timeoutMs);
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(`页面内脚本抛错: ${detail}`);
    }
    return result.result.value;
  }

  /** 等待页面里某个条件为真（表达式返回 truthy）。返回是否等到。 */
  async waitFor(expression, { timeoutMs = 12000, intervalMs = 300 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await this.js(expression)) return true;
      } catch { /* 页面可能还没加载完 */ }
      await sleep(intervalMs);
    }
    return false;
  }

  // ── 输入 ──────────────────────────────────────────────
  async mouseMove(x, y) {
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await sleep(25);
  }

  async mouseDown(x, y, button = 'left') {
    const buttons = button === 'left' ? 1 : button === 'right' ? 2 : 4;
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button, buttons, clickCount: 1,
    });
  }

  async mouseUp(x, y, button = 'left') {
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1,
    });
  }

  async click(x, y, button = 'left', settleMs = 120) {
    await this.mouseMove(x, y);
    await this.mouseDown(x, y, button);
    await sleep(50);
    await this.mouseUp(x, y, button);
    await sleep(settleMs);
  }

  /** 右键拖拽（常用于平移画布） */
  async rightDrag(x0, y0, x1, y1, steps = 4) {
    await this.mouseMove(x0, y0);
    await this.mouseDown(x0, y0, 'right');
    for (let i = 1; i <= steps; i += 1) {
      await this.mouseMove(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    }
    await this.mouseUp(x1, y1, 'right');
    await sleep(120);
  }

  /** 滚轮。deltaY 为负是向上滚（通常等于放大）。 */
  async wheel(x, y, deltaY, deltaX = 0) {
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x, y, deltaX, deltaY, button: 'none', buttons: 0,
    });
    await sleep(120);
  }

  /** 按键。name 取 KEYS 的键名，或直接传 {key, code, vk}。 */
  async key(name, modifiers = 0) {
    const spec = typeof name === 'string' ? KEYS[name] : name;
    if (!spec) throw new Error(`未定义的按键: ${name}`);
    const base = {
      key: spec.key,
      code: spec.code,
      windowsVirtualKeyCode: spec.vk,
      nativeVirtualKeyCode: spec.vk,
      modifiers,
    };
    await this.cdp.send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' });
    await this.cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
    await sleep(90);
  }

  /** 输入文本（走 insertText，绕过输入法） */
  async type(text) {
    await this.cdp.send('Input.insertText', { text });
    await sleep(60);
  }

  // ── 输出 ──────────────────────────────────────────────
  async screenshot(outPath, { timeoutMs = 120000 } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Screenshot timeoutMs must be positive and finite');
    const started = performance.now();
    console.log(`Screenshot start: ${path.basename(outPath)} (deadline ${timeoutMs}ms)`);
    let result;
    try {
      result = await this.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, timeoutMs);
    } catch (error) {
      throw new Error(`Screenshot ${path.basename(outPath)} failed after ${Math.round(performance.now() - started)}ms: ${error.message}`, { cause: error });
    }
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), Buffer.from(result.data, 'base64'));
    console.log(`Screenshot saved: ${path.basename(outPath)} (${Math.round(performance.now() - started)}ms)`);
    return path.resolve(outPath);
  }

  /** 收集到的运行时报错（未捕获异常 + 控制台 error，含资源 404） */
  errors() {
    return this.cdp.events
      .filter((e) => e.method === 'Runtime.exceptionThrown'
        || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
      .map((e) => (e.method === 'Runtime.exceptionThrown'
        ? (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
        : e.params.entry.text));
  }

  async close() {
    if (this.cdp.ws.readyState === 1) {
      try { await this.cdp.send('Browser.close', {}, 2000); } catch { /* fallback below */ }
    }
    this.cdp.rejectPending(new Error('CDP session closed'));
    try { this.cdp.ws.close(); } catch { /* ignore */ }
    stopOwnedBrowser(this.child);
    await sleep(400);
    try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * 启动无头浏览器并打开目标页面。
 *
 * @param {object}  options
 * @param {string}  options.url          要打开的地址
 * @param {number} [options.port]        CDP 调试端口，默认随机挑一个
 * @param {number} [options.width]       视口宽
 * @param {number} [options.height]      视口高
 * @param {string} [options.browser]     浏览器可执行文件路径，默认自动探测
 * @param {number} [options.timeoutMs]   等待调试端口就绪的超时
 * @param {boolean} [options.gpu]        **默认 `false`**：加 `--disable-gpu`，WebGL 落到
 *   软件光栅器（SwiftShader）。这样同一台机器上的读数**可比**（渲染器名会自报
 *   `Microsoft Basic Render Driver` 之类），但它**不是**真实 GPU 性能。
 *   传 `true` 会去掉这个开关去试真显卡——⚠️ 只在做「真实 GPU 基线」时用，
 *   而且**必须如实标注渲染器名**：换开关会让历史读数不再可比（M1.1D D5.3/D5.4）。
 */
export async function launch({
  url = 'about:blank',
  port,
  width = 1440,
  height = 900,
  browser,
  timeoutMs = 15000,
  gpu = false,
} = {}) {
  const executable = browser || findBrowser();
  if (!executable) throw new Error('找不到 Edge / Chrome，请显式传 browser 路径');

  const debugPort = port || (9300 + Math.floor(Math.random() * 500));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const child = spawn(executable, [
    '--headless=new',
    ...(gpu ? [] : ['--disable-gpu']),
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-extensions',
    '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ], { stdio: 'ignore', detached: false, windowsHide: true });

  const base = `http://127.0.0.1:${debugPort}`;
  let cdp = null;
  try {
    if (!(await waitForPort(debugPort, timeoutMs))) throw new Error('调试端口未就绪');

    const version = await (await fetch(`${base}/json/version`)).json();
    const target = await openTarget(base);

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    cdp = new Cdp(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url });

    return new Session(cdp, child, userDataDir, { browser: version.Browser, debugPort, width, height });
  } catch (error) {
    if (cdp?.ws.readyState === 1) {
      try { await cdp.send('Browser.close', {}, 2000); } catch { /* process fallback below */ }
      try { cdp.ws.close(); } catch { /* already closed */ }
    }
    stopOwnedBrowser(child);
    await sleep(300);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw error;
  }
}
