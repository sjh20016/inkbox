// 零依赖 CDP 浏览器驱动
//
// 复用本机已安装的 Edge / Chrome，走 Chrome DevTools Protocol 做无头自动化。
// 不需要 npm install（Node 18+ 自带 fetch，Node 22+ 自带全局 WebSocket）。
//
// 用法见同目录 SKILL.md。

import fs from 'node:fs';
import path from 'node:path';
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

// Edge can release its profile handles after Browser.close has returned.
// Retry only the isolated profile created by launch(), with a bounded wait.
async function removeOwnedProfile(profile) {
  const target = path.resolve(profile);
  if (path.dirname(target).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase()
    || !/^cdp-[a-z0-9]{6}$/i.test(path.basename(target))) {
    throw new Error('Refusing cleanup outside an owned temporary CDP profile');
  }
  let lastError;
  // One shared bound replaces the former two independent ten-attempt callers.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!fs.existsSync(target)) return { removed: true, attempts: attempt };
    try { fs.rmSync(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }); }
    catch (error) { lastError = error.code || error.message; }
    if (!fs.existsSync(target)) return { removed: true, attempts: attempt + 1 };
    await sleep(200);
  }
  return { removed: false, attempts: 20, lastError };
}

// Freeze owned Windows process identities before Browser.close can remove the
// leader. A PID alone is insufficient after exit because Windows can reuse it.
function ownedWindowsProcesses(child, profile, frozen = []) {
  if (process.platform !== 'win32') return { supported: false, processes: [] };
  const target = path.resolve(profile);
  if (path.dirname(target).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase()
    || !/^cdp-[a-z0-9]{6}$/i.test(path.basename(target))) {
    throw new Error('Refusing process discovery outside an owned CDP profile');
  }
  const executable = child?.spawnfile;
  if (!executable || !path.isAbsolute(executable)) return { supported: true, error: 'Unknown owned browser executable', processes: [] };
  const script = `
$ErrorActionPreference = 'Stop'
$all = @(Get-CimInstance Win32_Process)
$byId = @{}; foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
$escaped = [regex]::Escape($env:INKBOX_CDP_PROFILE)
$pattern = '(?i)(?:^|\\s)(?:"--user-data-dir=' + $escaped + '"|--user-data-dir="' + $escaped + '"|--user-data-dir=' + $escaped + ')(?=\\s|$)'
$browsers = @($all | Where-Object { [string]::Equals([string]$_.ExecutablePath, $env:INKBOX_CDP_EXECUTABLE, [StringComparison]::OrdinalIgnoreCase) })
$roots = @{}; foreach ($p in $browsers) { if ([string]$p.CommandLine -match $pattern) { $roots[[int]$p.ProcessId] = $true } }
$prior = @{}; foreach ($f in (ConvertFrom-Json -InputObject $env:INKBOX_CDP_PRIOR_IDENTITIES)) { $prior[[int]$f.pid] = $f }
$rows = @(); foreach ($p in $browsers) {
  $cursor = [int]$p.ProcessId; $seen = @{}; $owned = $false; $depth = 0
  while ($cursor -gt 0 -and -not $seen.ContainsKey($cursor)) {
    $seen[$cursor] = $true
    if ($roots.ContainsKey($cursor)) { $owned = $true; break }
    if (-not $byId.ContainsKey($cursor)) { break }
    $parent = [int]$byId[$cursor].ParentProcessId
    if ($byId.ContainsKey($parent) -and $byId[$parent].CreationDate -gt $byId[$cursor].CreationDate) { break }
    $cursor = $parent; $depth++
  }
  if (-not $owned -and $prior.ContainsKey([int]$p.ProcessId)) {
    $f = $prior[[int]$p.ProcessId]
    $owned = $p.CreationDate.ToUniversalTime().Ticks.ToString() -eq [string]$f.created -and
      [string]::Equals([string]$p.ExecutablePath,[string]$f.executable,[StringComparison]::OrdinalIgnoreCase) -and
      [string]$p.CommandLine -ceq [string]$f.commandLine
  }
  if ($owned) { $rows += @{ pid=[int]$p.ProcessId; created=$p.CreationDate.ToUniversalTime().Ticks.ToString(); executable=[string]$p.ExecutablePath; commandLine=[string]$p.CommandLine; depth=$depth } }
}
$unattributed = $env:INKBOX_CDP_LAUNCHER_PENDING -eq 'true' -and $byId.ContainsKey([int]$env:INKBOX_CDP_LAUNCHER_PID) -and -not @($rows | Where-Object pid -eq ([int]$env:INKBOX_CDP_LAUNCHER_PID)).Count
@{ supported=$true; processes=@($rows); error=$(if($unattributed){'Live launcher ownership could not be proven'}else{$null}) } | ConvertTo-Json -Depth 5 -Compress`;
  try {
    return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: 8000, windowsHide: true,
      env: { ...process.env, INKBOX_CDP_PROFILE: target, INKBOX_CDP_EXECUTABLE: executable,
        INKBOX_CDP_PRIOR_IDENTITIES: JSON.stringify(frozen), INKBOX_CDP_LAUNCHER_PID: String(child.pid || 0),
        INKBOX_CDP_LAUNCHER_PENDING: String(child.exitCode === null && child.signalCode === null) },
    }).trim());
  } catch (error) { return { supported: true, error: error.message, processes: [] }; }
}

function stopFrozenWindowsProcesses(snapshot) {
  if (!snapshot.supported || snapshot.error || !snapshot.processes.length) return { attempted: 0, errors: [] };
  const script = `
$ErrorActionPreference = 'Stop'
$frozen = ConvertFrom-Json -InputObject $env:INKBOX_CDP_FROZEN
$all = @{}; foreach ($p in @(Get-CimInstance Win32_Process)) { $all[[int]$p.ProcessId] = $p }
$attempted = 0; $problems = @()
foreach ($f in @($frozen | Sort-Object depth -Descending)) {
  if (-not $all.ContainsKey([int]$f.pid)) { continue }
  $p = $all[[int]$f.pid]
  if ($p.CreationDate.ToUniversalTime().Ticks.ToString() -ne [string]$f.created -or
      -not [string]::Equals([string]$p.ExecutablePath,[string]$f.executable,[StringComparison]::OrdinalIgnoreCase) -or
      [string]$p.CommandLine -cne [string]$f.commandLine) { continue }
  try { Stop-Process -Id ([int]$f.pid) -Force -ErrorAction Stop; $attempted++ }
  catch { if (Get-Process -Id ([int]$f.pid) -ErrorAction SilentlyContinue) { $problems += $_.Exception.Message } }
}
@{ attempted=$attempted; errors=@($problems) } | ConvertTo-Json -Depth 4 -Compress`;
  try {
    return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: 8000, windowsHide: true,
      env: { ...process.env, INKBOX_CDP_FROZEN: JSON.stringify(snapshot.processes) },
    }).trim());
  } catch (error) { return { attempted: 0, errors: [error.message] }; }
}

async function finalizeOwnedBrowser(child, profile, cdp) {
  const target = path.resolve(profile);
  if (path.dirname(target).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase()
    || !/^cdp-[a-z0-9]{6}$/i.test(path.basename(target))) {
    return { removed: false, attempts: 0, processesExited: false, complete: false,
      lastError: 'Refusing cleanup outside an owned temporary CDP profile' };
  }
  const frozen = ownedWindowsProcesses(child, profile);
  if (cdp?.ws.readyState === 1) {
    try { await cdp.send('Browser.close', {}, 2000); } catch { /* terminate frozen identities below */ }
  }
  cdp?.rejectPending(new Error('CDP session closed'));
  try { cdp?.ws.close(); } catch { /* already closed */ }
  const termination = stopFrozenWindowsProcesses(frozen);
  if (!frozen.supported || frozen.error) {
    // Some managed Windows environments deny WMI process enumeration. In that
    // case, use only the exact launcher PID returned by spawn(); taskkill /T
    // scopes termination to that owned process tree. Profile deletion below
    // remains the final proof that no process holds files in the isolated dir.
    const waitForLauncherExit = async (timeoutMs) => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return true;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (child.exitCode !== null || child.signalCode !== null) return true;
        await sleep(100);
      }
      return child.exitCode !== null || child.signalCode !== null;
    };
    let launcherExited = await waitForLauncherExit(1200);
    if (!launcherExited) {
      stopOwnedBrowser(child);
      launcherExited = await waitForLauncherExit(3000);
    }
    const cleanup = launcherExited ? await removeOwnedProfile(profile)
      : { removed: false, attempts: 0, lastError: 'Owned browser launcher did not exit; profile retained' };
    const processesExited = launcherExited && cleanup.removed;
    return { ...cleanup, processesExited, complete: processesExited,
      processEvidence: { supported: frozen.supported, frozen: frozen.processes.length,
        remaining: null, discoveryError: frozen.error || null, termination,
        fallback: 'exact spawned PID tree plus successful isolated-profile removal', launcherExited } };
  }
  await sleep(400);
  let remaining = ownedWindowsProcesses(child, profile, frozen.processes);
  for (let attempt = 0; !remaining.error && remaining.processes.length && attempt < 4; attempt++) {
    await sleep(200);
    remaining = ownedWindowsProcesses(child, profile, frozen.processes);
  }
  const processesExited = !frozen.supported || (!frozen.error && !remaining.error && remaining.processes.length === 0);
  const cleanup = processesExited ? await removeOwnedProfile(profile)
    : { removed: false, attempts: 0, lastError: 'Owned process exit could not be verified; profile retained' };
  return { ...cleanup, processesExited, complete: cleanup.removed && processesExited,
    processEvidence: { supported: frozen.supported, frozen: frozen.processes.length, remaining: remaining.processes.length,
      discoveryError: frozen.error || remaining.error || null, termination } };
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

// Chromium writes this file inside the profile only after it has bound its
// OS-assigned debugging port. A listening port by itself proves no ownership.
function readOwnedEndpoint(profile) {
  let contents;
  try { contents = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  // An in-progress write may contain just the first line; keep waiting for it.
  if (/^\d{0,5}\r?\n?$/.test(contents)) return null;
  const match = /^([1-9]\d{0,4})\r?\n(\/devtools\/browser\/[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})\r?\n?$/.exec(contents);
  if (/^\d{1,5}\r?\n\/devtools\/browser\/[a-fA-F0-9-]{0,35}$/.test(contents)) return null;
  if (!match || Number(match[1]) > 65535) throw new Error('Invalid owned DevToolsActivePort');
  return { port: Number(match[1]), browserPath: match[2] };
}

async function waitForOwnedEndpoint(profile, child, timeoutMs, launchError) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const endpoint = readOwnedEndpoint(profile);
    if (endpoint) return endpoint;
    if (launchError.current) throw launchError.current;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Owned browser exited before DevToolsActivePort was ready');
    await sleep(Math.min(100, Math.max(1, deadline - Date.now())));
  }
  throw new Error('Timed out waiting for owned DevToolsActivePort');
}

function verifyOwnedBrowserEndpoint(debuggerUrl, endpoint) {
  let parsed;
  try { parsed = new URL(debuggerUrl); } catch { throw new Error('Invalid browser WebSocket endpoint'); }
  if (parsed.protocol !== 'ws:' || parsed.hostname !== '127.0.0.1'
    || Number(parsed.port) !== endpoint.port || parsed.pathname !== endpoint.browserPath
    || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error('Browser endpoint does not match owned DevToolsActivePort');
  }
}

async function fetchOwnedJson(url, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Timed out verifying owned browser endpoint');
  const response = await fetch(url, { signal: AbortSignal.timeout(remaining) });
  if (!response.ok) throw new Error(`Browser endpoint returned HTTP ${response.status}`);
  return response.json();
}

// 新版 Chrome/Edge 对 /json/new 只接受 PUT，旧版接受 GET，两种都试。
// 不能只看 fetch 有没有抛错——405 也是「成功返回」，要查 response.ok。
async function openTarget(base, deadline) {
  let lastError = null;
  for (const method of ['GET', 'PUT']) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Timed out creating owned debug target');
      const response = await fetch(`${base}/json/new?about:blank`, { method, signal: AbortSignal.timeout(remaining) });
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
    this._closePromise ??= (async () => {
      this.meta.profileCleanup = await finalizeOwnedBrowser(this.child, this.userDataDir, this.cdp);
      if (!this.meta.profileCleanup.complete) {
        process.exitCode = 1;
        console.error('Owned CDP cleanup failed: ' + JSON.stringify(this.meta.profileCleanup));
      }
      return this.meta.profileCleanup;
    })();
    return this._closePromise;
  }
}

/**
 * 启动无头浏览器并打开目标页面。
 *
 * @param {object}  options
 * @param {string}  options.url          要打开的地址
 * @param {number} [options.port]        保留兼容；实际端口由浏览器分配并从隔离 profile 读取
 * @param {number} [options.width]       视口宽
 * @param {number} [options.height]      视口高
 * @param {string} [options.browser]     浏览器可执行文件路径，默认自动探测
 * @param {number} [options.timeoutMs]   等待本次浏览器调试端点就绪的超时
 * @param {boolean} [options.gpu]        **默认 `false`**：加 `--disable-gpu`，WebGL 落到
 *   软件光栅器（SwiftShader）。这样同一台机器上的读数**可比**（渲染器名会自报
 *   `Microsoft Basic Render Driver` 之类），但它**不是**真实 GPU 性能。
 *   传 `true` 会去掉这个开关去试真显卡——⚠️ 只在做「真实 GPU 基线」时用，
 *   而且**必须如实标注渲染器名**：换开关会让历史读数不再可比（M1.1D D5.3/D5.4）。
 * @param {boolean} [options.headless]   默认 `true`；false 时创建可见浏览器窗口。
 * @param {boolean} [options.disableBackgroundThrottling] 关闭后台页计时节流，供固定帧数的诊断实验使用。
 */
export async function launch({
  url = 'about:blank',
  port,
  width = 1440,
  height = 900,
  browser,
  timeoutMs = 15000,
  gpu = false,
  headless = true,
  disableBackgroundThrottling = false,
} = {}) {
  if (typeof headless !== 'boolean') throw new TypeError('headless must be a boolean');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be positive and finite');
  const executable = browser || findBrowser();
  if (!executable) throw new Error('找不到 Edge / Chrome，请显式传 browser 路径');

  void port; // Retained in the public API; a requested fixed port cannot establish ownership.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  let child;
  let cdp = null;
  let ws = null;
  try {
    child = spawn(executable, [
    ...(headless ? ['--headless=new'] : []),
    ...(gpu ? [] : ['--disable-gpu']),
    ...(disableBackgroundThrottling ? [
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-extensions',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    'about:blank',
    ], { stdio: 'ignore', detached: false, windowsHide: headless });
    const launchError = { current: null };
    child.on('error', (error) => { launchError.current = error; });
    const deadline = Date.now() + timeoutMs;
    const endpoint = await waitForOwnedEndpoint(userDataDir, child, timeoutMs, launchError);
    if (launchError.current) throw launchError.current;
    const base = `http://127.0.0.1:${endpoint.port}`;
    const version = await fetchOwnedJson(`${base}/json/version`, deadline);
    verifyOwnedBrowserEndpoint(version.webSocketDebuggerUrl, endpoint);
    if (launchError.current || child.exitCode !== null || child.signalCode !== null) {
      throw launchError.current || new Error('Owned browser exited before target creation');
    }
    const target = await openTarget(base, deadline);
    let targetUrl;
    try { targetUrl = new URL(target.webSocketDebuggerUrl); } catch { throw new Error('Invalid owned target WebSocket endpoint'); }
    if (targetUrl.protocol !== 'ws:' || targetUrl.hostname !== '127.0.0.1'
      || Number(targetUrl.port) !== endpoint.port || !/^\/devtools\/page\/[A-Za-z0-9_-]+$/.test(targetUrl.pathname)
      || targetUrl.search || targetUrl.hash || targetUrl.username || targetUrl.password) {
      throw new Error('Target endpoint does not match owned browser port');
    }

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to owned CDP target')),
        Math.max(1, deadline - Date.now()));
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', (error) => { clearTimeout(timer); reject(error); }, { once: true });
    });

    cdp = new Cdp(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url });

    return new Session(cdp, child, userDataDir, { browser: version.Browser, debugPort: endpoint.port, width, height });
  } catch (error) {
    if (!cdp) try { ws?.close(); } catch { /* connection never opened */ }
    const cleanup = child?.pid ? await finalizeOwnedBrowser(child, userDataDir, cdp)
      : await removeOwnedProfile(userDataDir).then((result) => ({ ...result, processesExited: true, complete: result.removed }));
    if (!cleanup.complete) throw new AggregateError([error,
      new Error('Owned CDP profile cleanup failed: ' + JSON.stringify(cleanup))],
    'CDP launch and owned profile cleanup failed');
    throw error;
  }
}
