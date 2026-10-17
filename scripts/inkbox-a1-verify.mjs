// A1 QA · 组合验收（真实 Edge + 硬件 GPU，CDP 串行）
//
// 覆盖 A1_TEAM.md §4 / 委托书 §十 的浏览器验收项：
//   lab  : cultivator-lab（6/20、真实 GLB、材质共享、无 console error）
//          creature-lab（13 species、动画切换、截图）        —— T3 接口，未实现时 SKIP
//          busanzi-lab（3 clip、动画切换、截图）             —— T2 接口，未实现时 SKIP
//   游戏 : Canvas 启动/创世/卜算子 Viewer；Three 启动/创世、
//          修士新 GLB 批次、异兽真实模型（≥3 species）、卜算子 Viewer 三动画、
//          视界开关（同一世界、不串位面）、存读档、连续重建世界 3 次资源计数稳定、
//          window.inkbox 无 console/page error。
//
// 输出：reports/a1/verify/result.json + summary.txt + heartbeat.json + 截图（*.png）
// 运行：node scripts/inkbox-a1-verify.mjs
//   A1_VERIFY_STRICT=1            未实现的产品接口按 FAIL 处理（阶段 B 用；默认 SKIP）
//   A1_VERIFY_SCOPE=labs|game|all 只跑 lab 层 / 只跑游戏层 / 全部（默认 all）
//   A1_CHECK_BUDGET_MS=60000      单个检查项硬超时（默认 60s；超时即终止后续检查并落盘）
//   A1_RUN_BUDGET_MS=600000       整轮硬超时（默认 10min；看门狗到点写证据 + 强杀浏览器）
//   A1_READY_TIMEOUT=30000        单个页面/接口就绪等待上限（默认 30s）
//
// 健壮性（2026-10-17 22:11 卡住教训）：
//   · 每个检查项 withBudget 硬超时，超时记录 FAIL 并停止后续检查，避免长尾等待累积；
//   · 每完成一步立即原子写 result.json（先 tmp 后 rename），中途被杀也有证据；
//   · heartbeat.json 每 5s 更新当前步骤/耗时，便于外部判断“卡在哪一步”；
//   · 整轮看门狗 + SIGINT/SIGTERM 处理器：写证据、关闭浏览器与临时服务、退出码 3/130；
//   · 所有等待都有上限，禁止无超时等待产品接口。
// 端口：4188（A1_QA_PORT 可覆盖；❌ 4190/4191/4192 是 fetch/Chromium bad port）
//
// 纪律：只读产品代码；不改产品源码/资产；不伪造世界事实；不注入假渲染。
// 修士/异兽实体通过产品 API（window.inkbox.life.spawn）创建，属于正常游戏路径。
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.A1_QA_PORT || 4188);
const BASE = process.env.A1_QA_URL || `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/a1/verify'));
const WIDTH = 1440;
const HEIGHT = 900;
const STRICT = process.env.A1_VERIFY_STRICT === '1';
const SCOPE = process.env.A1_VERIFY_SCOPE || 'all'; // labs | game | all
const CHECK_BUDGET_MS = Math.max(15000, Number(process.env.A1_CHECK_BUDGET_MS || 60000));
const RUN_BUDGET_MS = Math.max(60000, Number(process.env.A1_RUN_BUDGET_MS || 600000));
const READY_TIMEOUT = Math.max(5000, Number(process.env.A1_READY_TIMEOUT || 30000));
const SEED = 20261031;

// 改动前基线：来自 git HEAD e6fb8c6 的资产（不是 Phase-A 截图——后者抓取时 T1 资产已开始落盘）。
const BASELINE = {
  capturedFrom: 'git HEAD e6fb8c6 (feat/g2-r1-playable-integration)',
  capturedAt: '2026-10-17T22:16:00+08:00',
  cultivatorGlbSha256: 'a9326d49bf0e994c0fca6d4aca90acc25bc4c54640ed27afd52a7a7216bfd10f',
  cultivatorGlbBytes: 145188,
  cultivatorManifestSha256: 'de45256b9c86da42462c8dfc928331a50f1cf9834fb4142b5f7d60257d0da0fd',
  cultivatorRoles: ['basic', 'sect_disciple', 'wanderer', 'elder', 'ghost', 'alchemist'],
  cultivatorModules: 12,
  // HEAD 旧 manifest 的逐模块三角面（用于断言 T1 已按新 GLB 实测更新；旧 6 角色组合值=2988）
  headModuleTriangles: {
    body_base: 384, hair_base: 50, hair_elder: 50, hair_ghost: 50, sword_simple: 36,
    pack_traveler: 60, gourd_small: 68, soul_lamp: 100, sect_token: 24, alchemy_tag: 32,
    elder_mantle: 12, ghost_torn_hem: 16,
  },
  headRoleTriangles6: 2988,
  gpuRenderer: 'ANGLE (AMD, AMD Radeon(TM) 610M (0x0000164E) Direct3D11 vs_5_0 ps_5_0, D3D11)',
};

const report = {
  startedAt: new Date().toISOString(),
  phase: STRICT ? 'phase-B strict acceptance' : 'phase-A skeleton (non-strict)',
  scope: SCOPE,
  budget: { checkMs: CHECK_BUDGET_MS, runMs: RUN_BUDGET_MS, readyMs: READY_TIMEOUT },
  git: null,
  base: BASE,
  viewport: [WIDTH, HEIGHT],
  browser: null,
  gpu: null,
  baseline: BASELINE,
  assets: {},
  checks: [],
  screenshots: [],
  consoleErrors: [],
  runtimeErrors: [],
  pagesVisited: [],
  launches: 0,
  accumulated: { runtime: [], consoleErrors: [] },
  pass: false,
};
let server;
let browser;
let heartbeatTimer = null;
let runWatchdog = null;
let currentStep = 'init';
let cleanedUp = false;
const STARTED_AT_MS = Date.parse(report.startedAt);

const page = (expr, timeoutMs = 25000) => browser.js(`return (async()=>{${expr}})()`, { timeoutMs });
const awaitFrames = (n = 3) => page(`for(let i=0;i<${n};i++)await new Promise(requestAnimationFrame);return true`);
const waitFor = (expr, timeoutMs = 15000) => browser.waitFor(`return (async()=>{${expr}})()`, { timeoutMs });
const sleepMs = (ms) => sleep(ms);

function relativePath(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

// 原子写 evidence：先 tmp 再 rename，避免半截 JSON。
function persist() {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    report.currentStep = currentStep;
    report.elapsedMs = Date.now() - STARTED_AT_MS;
    const failed = report.checks.filter(c => !c.pass && !c.skipped);
    const skipped = report.checks.filter(c => c.skipped);
    report.summary = {
      passed: report.checks.filter(c => c.pass).length,
      failed: failed.map(c => c.name),
      skipped: skipped.map(c => ({ name: c.name, reason: c.skipReason })),
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    fs.writeFileSync(path.join(OUT, 'result.json.tmp'), json, 'utf8');
    fs.renameSync(path.join(OUT, 'result.json.tmp'), path.join(OUT, 'result.json'));
    fs.writeFileSync(path.join(OUT, 'summary.txt'),
      `${report.startedAt} · ${report.phase} · scope=${SCOPE} · strict=${STRICT}\n` +
      `PASS=${report.summary.passed} FAIL=${failed.length} SKIP=${skipped.length} · currentStep=${currentStep} · elapsedMs=${report.elapsedMs}\n` +
      report.checks.map(c => `${c.pass ? 'PASS' : c.skipped ? 'SKIP' : 'FAIL'} ${c.name}${c.error ? ` :: ${c.error.split('\n')[0]}` : ''}${c.skipReason ? ` :: ${c.skipReason}` : ''}`).join('\n') + '\n',
      'utf8');
  } catch (error) {
    console.error('persist failed:', error.message);
  }
}

function writeHeartbeat() {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'heartbeat.json'), `${JSON.stringify({
      at: new Date().toISOString(),
      step: currentStep,
      elapsedMs: Date.now() - STARTED_AT_MS,
      checks: report.checks.map(c => ({ name: c.name, pass: c.pass, skipped: c.skipped })),
      screenshots: report.screenshots.length,
      aborted: report.aborted || null,
    }, null, 2)}\n`, 'utf8');
  } catch { /* heartbeat 失败不影响验收 */ }
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(writeHeartbeat, 5000);
  heartbeatTimer.unref?.();
}

async function forceCleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (runWatchdog) clearTimeout(runWatchdog);
  const child = browser?.child;
  if (browser) {
    try { await Promise.race([browser.close(), sleepMs(8000)]); } catch (error) { console.error('browser close failed:', error.message); }
  }
  if (child?.pid) {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* already exited */ }
  }
  if (server) { try { server.kill(); } catch { /* already exited */ } }
  await sleepMs(300);
}

function startWatchdog() {
  runWatchdog = setTimeout(async () => {
    report.aborted = `整轮硬超时 ${RUN_BUDGET_MS}ms（卡在步骤：${currentStep}）`;
    console.error(`\n[WATCHDOG] ${report.aborted}`);
    persist();
    await forceCleanup();
    process.exit(3);
  }, RUN_BUDGET_MS);
}

function withBudget(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`检查项硬超时 ${ms}ms（${label}）`)), ms);
  });
  // 超时后原 promise 仍在后台跑；吞掉它后续的 rejection，避免 unhandledRejection 崩溃。
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function skip(reason) {
  const error = new Error(reason);
  error.skip = true;
  throw error;
}

// scope 门：labs 只跑 lab 层，game 只跑游戏层
function gateScope(layer) {
  if (SCOPE !== 'all' && SCOPE !== layer) skip(`A1_VERIFY_SCOPE=${SCOPE}，跳过 ${layer} 层检查`);
}

function gateAbort() {
  if (report.abortRemaining) skip(report.abortRemaining);
}

// 按检查项名字判定它属于 lab 层还是游戏层（避免在每个 check 调用点重复传参）
function layerOf(name) {
  if (/^(cultivator-lab|creature-lab|busanzi-lab)/.test(name)) return 'labs';
  if (/^总体/.test(name)) return 'all';
  return 'game';
}

process.on('unhandledRejection', (reason) => {
  // 检查项硬超时后，后台 promise 仍可能抛错；记录但不让整轮验收崩溃。
  console.error('[unhandledRejection]', reason?.stack || reason);
});

// 重活（多次建世界/养成实体/重建 3 次）单独放宽单步预算，但仍硬上限。
function budgetFor(name) {
  if (/连续重建世界/.test(name)) return 90000;
  if (/异兽真实模型/.test(name)) return 90000;
  return CHECK_BUDGET_MS;
}

async function check(name, fn, { optional = false, budgetMs = budgetFor(name) } = {}) {
  const startedAt = Date.now();
  currentStep = name;
  let marker = browser ? browser.cdp.events.length : 0;
  const entry = { name, optional, pass: false, skipped: false, durationMs: 0 };
  console.log(`\n=== [${new Date().toISOString()}] ${name} (budget ${budgetMs}ms) ===`);
  writeHeartbeat();
  try {
    const layer = layerOf(name);
    if (SCOPE !== 'all' && SCOPE !== layer) skip(`A1_VERIFY_SCOPE=${SCOPE}，跳过 ${layer} 层检查`);
    if (report.abortRemaining) skip(report.abortRemaining);
    const evidence = await withBudget(fn(entry), budgetMs, name);
    entry.pass = true;
    entry.evidence = evidence;
    console.log(`PASS ${name} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    if (error.skip) {
      entry.skipped = true;
      entry.skipReason = error.message;
      console.log(`SKIP ${name}: ${error.message}`);
    } else {
      entry.error = String(error.stack || error);
      if (/检查项硬超时/.test(error.message)) {
        entry.timedOut = true;
        report.abortRemaining = `前一检查项「${name}」硬超时 ${budgetMs}ms，浏览器状态不可靠，终止后续检查：${error.message}`;
      }
      console.error(`FAIL ${name}: ${error.message}`);
    }
  } finally {
    entry.durationMs = Date.now() - startedAt;
    if (browser) {
      const errs = collectErrors(browser.cdp.events.slice(marker));
      const runtime = errs.runtime.filter(x => !/favicon/i.test(String(x)));
      entry.newPageErrors = runtime;
      entry.newConsoleErrors = errs.consoleErrors;
      if (runtime.length || errs.consoleErrors.length) {
        report.accumulated.runtime.push(...runtime);
        report.accumulated.consoleErrors.push(...errs.consoleErrors);
      }
    }
    report.checks.push(entry);
    persist();
  }
  return entry;
}

function collectErrors(events) {
  const runtime = [];
  const consoleErrors = [];
  for (const event of events) {
    if (event.method === 'Runtime.exceptionThrown') {
      runtime.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
    } else if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
      runtime.push(event.params.entry.text);
    } else if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
      consoleErrors.push(event.params.args.map(a => a.value || a.description || '').join(' '));
    }
  }
  return { runtime, consoleErrors };
}
const relevantErrors = (events) => collectErrors(events).runtime
  .filter(x => !/favicon|net::ERR_ABORTED|net::ERR_FAILED.*favicon/i.test(String(x)));

async function startServer() {
  if (process.env.A1_QA_URL) return;
  server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(PORT)], {
    cwd: ROOT, stdio: 'ignore', windowsHide: true,
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`inkbox-server exited: ${server.exitCode}`);
    try { if ((await fetch(`${BASE}/inkbox.html`)).ok) return; } catch { /* booting */ }
    await sleep(150);
  }
  throw new Error('inkbox-server did not become ready');
}

async function navigate(url, waitExpr, timeoutMs = READY_TIMEOUT) {
  await browser.cdp.send('Page.navigate', { url });
  report.pagesVisited.push(url);
  if (waitExpr && !(await waitFor(waitExpr, timeoutMs))) {
    throw new Error(`页面未就绪 ${url}: ${browser.errors().join(' | ')}`);
  }
}

// 多次 Page.navigate 会累积旧 WebGL 上下文（开发侧同样用「每段独立浏览器实例」规避假阴性）。
// 每组场景开始时换一个全新隔离 profile 的浏览器实例，GPU 仍串行、同一时间只有一个。
async function relaunch(url) {
  try { await browser?.close(); } catch (error) { console.error('relaunch close failed:', error.message); }
  const executable = findEdge();
  if (!executable) throw new Error('未找到本机 Edge');
  browser = await launch({ url, browser: executable, width: WIDTH, height: HEIGHT, gpu: true });
  report.launches += 1;
  report.pagesVisited.push(url);
  console.log(`[relaunch #${report.launches}] ${url}`);
  return browser;
}

async function screenshot(name) {
  const file = await browser.screenshot(path.join(OUT, `${name}.png`), { timeoutMs: 30000 });
  report.screenshots.push({ name, file: path.relative(ROOT, file).replace(/\\/g, '/') });
  return file;
}

async function click(selector) {
  const point = await page(`
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('missing control ' + ${JSON.stringify(selector)});
    if (el.disabled) throw new Error('disabled control ' + ${JSON.stringify(selector)});
    if (el.closest('.rail,.g1-character__body')) el.scrollIntoView({ block: 'nearest' });
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  `);
  if (point.w < 1 || point.h < 1) throw new Error(`control not visible: ${selector}`);
  await browser.click(point.x, point.y);
}

async function gpuInfo() {
  return page(`
    const out = { canvases: [], renderer: null, vendor: null, softwareRasterizer: null };
    for (const canvas of [...document.querySelectorAll('canvas')]) {
      if (!canvas.width || !canvas.height) continue;
      let gl = null;
      try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch {}
      if (!gl) continue;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const info = { id: canvas.id || '(anon)', width: canvas.width, height: canvas.height,
        renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        vendor: gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext };
      info.softwareRasterizer = /basic render|swiftshader|llvmpipe|software|warp|mesa offscreen/i.test(info.renderer);
      out.canvases.push(info);
      if (!out.renderer) { out.renderer = info.renderer; out.vendor = info.vendor; }
      out.softwareRasterizer = out.softwareRasterizer || info.softwareRasterizer;
    }
    return out;
  `);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

// 由 manifest 的 roles/modules 计算「6 种身份」静态组合的期望三角面总数。
function expectedRoleTriangles(manifest, roles = manifest.roles) {
  let total = 0;
  for (const role of Object.values(roles)) {
    for (const [slot, id] of Object.entries(role)) {
      if (slot === 'paletteIndex' || slot === 'allowedSlots' || !id || typeof id !== 'string') continue;
      total += manifest.modules[id]?.triangles || 0;
    }
  }
  return total;
}

const resourcesExpression = () => `
  return performance.getEntriesByType('resource')
    .filter(r => /\\.(glb|gltf|png|json)(\\?|$)/i.test(r.name))
    .map(r => r.name.replace(location.origin, ''))
    .filter((v, i, a) => a.indexOf(v) === i).sort();
`;

// 页面内取资源真实 sha256（证明游戏加载的就是磁盘上那份 GLB）
async function pageAssetSha256(url) {
  return page(`
    const res = await fetch(${JSON.stringify(url)}, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch asset failed: ' + res.status + ' ' + ${JSON.stringify(url)});
    const bytes = new Uint8Array(await res.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { bytes: bytes.length, sha256: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') };
  `, READY_TIMEOUT);
}

// ── 游戏页面等待助手 ─────────────────────────────────────────────
const GAME_CANVAS_READY = 'return !!window.inkbox?.world && !!window.inkbox?.life';
const GAME_THREE_READY = 'return !!window.inkbox?.render3d?.active && !!window.inkbox?.render3d?.renderer?.stages?.get("mortal")';
const WAIT_THREE_LOADS = `
  const k = window.inkbox, r = k.render3d.renderer;
  const pending = [r.characterLoadPromise, r.environmentLoadPromise, r.art?.comparisonReady,
    r.creatureLoadPromise, r.creatureLibraryLoadPromise, k.busanziViewerReady].filter(x => x && typeof x.then === 'function');
  await Promise.all(pending);
  return true;
`;

async function createWorld(seed, { renderer = '3d' } = {}) {
  const preset = await page(`
    const k = window.inkbox;
    if (k.setSpeed) k.setSpeed(0);
    const before = { seed: k.world.seed, entities: k.world.entities.length };
    k.newWorld('small', ${seed});
    return { before, presetKey: k.presetKey, after: { seed: k.world.seed, entities: k.world.entities.length, w: k.world.w, h: k.world.h } };
  `);
  const adopted = await waitFor(`
    return window.inkbox.lastTime > 0 && window.inkbox.world.seed === ${seed}
      && (${renderer === '3d'
    ? 'window.inkbox.render3d.renderer.world === window.inkbox.world'
    : '!window.inkbox.render3d?.active'})
  `, READY_TIMEOUT);
  if (!adopted) throw new Error(`newWorld 后渲染器未采纳：seed=${seed}`);
  await awaitFrames(6);
  return preset;
}

// 通过产品 API 生成实体（正常游戏路径；不触碰模拟字段）
async function spawnEntities(species, target) {
  return page(`
    const k = window.inkbox, w = k.world;
    let made = 0;
    for (let y = 8; y < w.h - 8 && made < ${target}; y += 7) {
      for (let x = 8; x < w.w - 8 && made < ${target}; x += 7) {
        const i = w.idx(x, y);
        if (!w.isWalkable(i)) continue;
        const n = Math.min(4, ${target} - made);
        const before = w.entities.length;
        const created = k.life.spawn(x, y, ${JSON.stringify(species)}, n, 0);
        const delta = w.entities.length - before;
        if (created || delta > 0) made += (typeof created === 'number' ? Math.min(created, n) : Math.max(1, delta));
      }
    }
    const bySpecies = {};
    for (const e of w.entities) bySpecies[e.sp] = (bySpecies[e.sp] || 0) + 1;
    return { made, entities: w.entities.length, bySpecies };
  `, 45000);
}

// 真实产品结构（T3 契约）：creatureLibrary / creatureLoadPromise 在 Render3DHost；
// 每个 stage 的 `stage.entities.creatureBatch` 才是 InstancedMesh 批次（不是 renderer.creatureBatch）。
async function beastRenderStats() {
  return page(`
    const k = window.inkbox, r = k.render3d.renderer;
    const lib = r.creatureLibrary || null;
    const libIds = lib
      ? (Array.isArray(lib.ids) ? [...lib.ids]
        : (lib.species instanceof Map ? [...lib.species.keys()] : Object.keys(lib.species || {})))
      : [];
    const worldSpecies = lib ? [...(lib.worldSpecies || [])] : [];
    const beastEntities = k.world.entities.filter(e => e.sp === 'beast');
    const beastIdSet = new Set(beastEntities.map(e => e.id));
    const stages = [...r.stages.entries()].map(([name, stage]) => {
      const batch = stage.entities?.creatureBatch || null;
      const meshes = batch?.meshes instanceof Map ? [...batch.meshes.entries()]
        : Object.entries(batch?.meshes || {});
      const userDataIds = [];
      for (const [, mesh] of meshes) {
        const ids = mesh?.userData?.renderEntities;
        if (Array.isArray(ids)) userDataIds.push(...ids.filter(Boolean).map(v => (v && typeof v === 'object') ? v.id : v));
      }
      return {
        name, hasBatch: !!batch,
        batchStats: batch?.stats || null,
        bySpecies: batch?.bySpecies || null,
        meshSpecies: meshes.map(([id]) => id),
        userDataMapped: userDataIds.length,
        userDataMappedToRealBeasts: userDataIds.filter(id => beastIdSet.has(id)).length,
        materialCount: meshes.length ? new Set(meshes.map(([, mesh]) => mesh?.material)).size : null,
        entityStats: stage.entities?.stats || null,
        worldIsMortal: stage.world === k.world,
        worldIsUpper: stage.world === k.upper,
        creatureLibraryIsHost: stage.creatureLibrary === lib,
      };
    });
    const mortal = stages.find(s => s.name === 'mortal') || null;
    const creatureInstances = stages.reduce((n, s) => n + (s.batchStats?.instances || 0), 0);
    return {
      libraryPresent: !!lib, libraryReady: !!lib && !lib.disposed, libIds, worldSpecies,
      libraryTriangles: lib?.totalTriangles ?? null,
      creatureLoadError: r.creatureLoadError ? String(r.creatureLoadError?.message || r.creatureLoadError) : null,
      creatureLoadPromisePresent: r.creatureLoadPromise !== undefined,
      stages, mortal,
      creatureInstances,
      visibleSpecies: [...new Set(stages
        .flatMap(s => Object.entries(s.bySpecies || {}))
        .filter(([, count]) => count > 0)
        .map(([id]) => id))],
      userDataMappedToRealBeasts: stages.reduce((n, s) => n + s.userDataMappedToRealBeasts, 0),
      beastEntities: beastEntities.length,
      gpuMemory: r.gpu?.info?.memory || null,
    };
  `, READY_TIMEOUT);
}

// 交付截图用：把镜头摆到某类实体之一旁边（3/4 俯视、避开树冠），再截图。
// 只操作产品相机/渲染 API，不碰模拟状态。
async function frameWorldEntity(kind, shotName, { zoom = 14 } = {}) {
  const framed = await page(`
    const k = window.inkbox, r = k.render3d.renderer;
    const layer = r.stages.get('mortal').entities;
    const entities = k.world.entities.filter(e => e.sp === ${JSON.stringify(kind)});
    if (!entities.length) return { framed: false, reason: 'no entity' };
    const trees = r.stages.get('mortal').vegetation?.trees || [];
    let target = null, best = -Infinity;
    for (const entity of entities) {
      let nearest = 40;
      for (const tree of trees) nearest = Math.min(nearest, Math.hypot(tree.x - entity.x, tree.y - entity.y));
      const score = Math.min(nearest, 20);
      if (score > best) { best = score; target = entity; }
    }
    const p = r.coordinates.worldToRender(target.x, target.y, 0);
    const groundY = layer.elevation.at(target.x, target.y) + (Number.isFinite(target.lift) ? target.lift : 0);
    const camera = r.cameraRig.camera;
    camera.zoom = ${JSON.stringify(zoom)};
    camera.updateProjectionMatrix();
    r.cameraRig.cancelFocus?.();
    r.cameraRig.controls.target.set(p.x, groundY + 0.8, p.z);
    camera.position.set(p.x + 3, groundY + ${JSON.stringify(zoom >= 15 ? 12 : 14)}, p.z + 4);
    r.cameraRig.controls.update();
    r.update(1 / 60);
    r.render();
    return { framed: true, targetId: target.id, world: [target.x, target.y], zoom: camera.zoom };
  `);
  await sleepMs(500);
  const file = await screenshot(shotName);
  return { ...framed, file: relativePath(file) };
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  report.knownFiles = {
    cultivatorLab: fs.existsSync(path.join(ROOT, 'cultivator-lab.html')),
    creatureLab: fs.existsSync(path.join(ROOT, 'creature-lab.html')),
    busanziLab: fs.existsSync(path.join(ROOT, 'busanzi-lab.html')),
    creatureCheckScript: fs.existsSync(path.join(ROOT, 'scripts/inkbox-creatures-check.mjs')),
    busanziCheckScript: fs.existsSync(path.join(ROOT, 'scripts/inkbox-busanzi-check.mjs')),
  };
  persist();
  startHeartbeat();
  startWatchdog();

  const onSignal = (signal) => {
    report.aborted = `收到 ${signal}，在步骤「${currentStep}」中止（已收集 ${report.checks.length} 项检查）`;
    console.error(`\n[SIGNAL] ${report.aborted}`);
    persist();
    forceCleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  report.git = (() => {
    try {
      return {
        head: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(),
        branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(),
        dirty: execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim().split('\n').filter(Boolean).length,
      };
    } catch (error) { return { error: error.message }; }
  })();
  await startServer();
  currentStep = 'launch browser';
  const executable = findEdge();
  if (!executable) throw new Error('未找到本机 Edge');
  browser = await launch({ url: `${BASE}/cultivator-lab.html`, browser: executable, width: WIDTH, height: HEIGHT, gpu: true });
  report.browser = { ...browser.meta, executable, gpuMode: 'hardware (gpu:true)', strict: STRICT, scope: SCOPE };
  persist();
  if (!(await waitFor('return !!window.cultivatorLab?.ready', READY_TIMEOUT))) throw new Error('cultivatorLab 未就绪');
  report.gpu = await gpuInfo();
  assert.equal(report.gpu.softwareRasterizer, false, `GPU 验收必须是硬件渲染，当前是软件光栅：${report.gpu.renderer}`);
  persist();

  // ═══════════════════════════ lab 层 ═══════════════════════════
  await check('cultivator-lab：6/20 规模、真实 GLB、材质共享、无 console error（真实 GPU）', async (entry) => {
    const marker = browser.cdp.events.length;
    const labState = await page(`
      const l = window.cultivatorLab;
      return { roles: Object.keys(l.library.roles), modules: l.library.modules.size,
        animations: l.library.animations.map(a => a.name),
        glbResources: performance.getEntriesByType('resource').filter(r => /cultivator_library\\.glb$/.test(r.name)).map(r => r.name),
        manifestResources: performance.getEntriesByType('resource').filter(r => /cultivator_manifest\\.json$/.test(r.name)).map(r => r.name) };
    `);
    entry.evidence = { labState };
    assert.deepEqual([...labState.roles].sort(), [...BASELINE.cultivatorRoles].sort(), '六种修士身份缺失');
    assert.equal(labState.modules, BASELINE.cultivatorModules, '模块数应与基线一致（12）');
    assert(labState.glbResources.some(url => url.endsWith('/assets/characters/cultivator/mesh/cultivator_library.glb')), 'lab 必须加载正式 GLB URL');
    assert(labState.manifestResources.length > 0, 'lab 必须加载 manifest');
    const asset = await pageAssetSha256('/assets/characters/cultivator/mesh/cultivator_library.glb');
    report.assets.cultivatorGlbSha256 = asset.sha256;
    entry.evidence.asset = asset;
    assert(asset.bytes > 10000, 'GLB 太小，可能不是真实模型');
    assert.notEqual(asset.sha256, BASELINE.cultivatorGlbSha256, '正式 GLB 与改动前基线相同——修士模型尚未真正替换');
    // 旧模型回退资产必须保留，且就是 HEAD 旧 GLB（委托书 §四.5：可安全回退，不被未来资产生成覆盖）
    const prevPath = path.join(ROOT, 'assets/characters/cultivator/mesh/cultivator_library_prev.glb');
    assert(fs.existsSync(prevPath), '回退用旧 GLB cultivator_library_prev.glb 缺失');
    const prevSha = sha256File(prevPath);
    entry.evidence.rollback = { file: 'assets/characters/cultivator/mesh/cultivator_library_prev.glb', sha256: prevSha, bytes: fs.statSync(prevPath).size };
    assert.equal(prevSha, BASELINE.cultivatorGlbSha256, '回退旧 GLB 与 HEAD 旧资产 sha 不一致');
    // manifest 必须记录真实 GLB 的 sha，且逐模块三角面按新 GLB 实测更新（不许沿用 HEAD 旧值）。
    const manifest = readJson('assets/characters/cultivator/data/cultivator_manifest.json');
    const changedModules = Object.entries(manifest.modules)
      .filter(([id, mod]) => BASELINE.headModuleTriangles[id] !== mod.triangles);
    const expected6 = expectedRoleTriangles(manifest);
    entry.evidence.manifest = {
      asset_sha256: manifest.asset_sha256,
      changedModules: changedModules.map(([id, mod]) => ({ id, triangles: mod.triangles, head: BASELINE.headModuleTriangles[id] })),
      expectedRoleTriangles6: expected6,
      headRoleTriangles6: BASELINE.headRoleTriangles6,
    };
    assert.equal(manifest.asset_sha256, asset.sha256, 'manifest.asset_sha256 与实际 GLB 不一致');
    assert(changedModules.length > 0, 'manifest 三角面与 HEAD 完全一致——未按新 GLB 实测更新');
    const scale6 = await page('return window.cultivatorLab.setCount(6)');
    await awaitFrames(2);
    await screenshot('a1-lab-cultivator-6');
    const scale20 = await page('return window.cultivatorLab.setCount(20)');
    await awaitFrames(2);
    await screenshot('a1-lab-cultivator-20');
    entry.evidence.scale6 = scale6;
    entry.evidence.scale20 = scale20;
    assert.equal(scale6.count, 6);
    assert.equal(scale20.count, 20);
    assert.equal(scale6.materialCount, 1, '6 人批次必须共享单材质');
    assert.equal(scale20.materialCount, 1, '20 人批次必须共享单材质');
    assert(scale6.characterDraws > 0 && scale6.characterDraws <= BASELINE.cultivatorModules, '绘制调用应被共享模块限制');
    assert.equal(scale6.characterTriangles, expected6,
      `lab 渲染三角面 ${scale6.characterTriangles} ≠ manifest 六角色组合期望 ${expected6}（统计未按实测更新或模块组合不一致）`);
    assert.notEqual(expected6, BASELINE.headRoleTriangles6, 'manifest 六角色组合三角面仍等于 HEAD 旧值');
    assert(scale20.characterTriangles > scale6.characterTriangles, '20 人三角面应随数量增长');
    assert(scale6.renderer && !/basic render|swiftshader|llvmpipe|software/i.test(scale6.renderer), 'lab 在软件光栅上运行');
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'lab 出现运行时错误');
    assert.deepEqual(errors.consoleErrors, [], 'lab 出现 console.error');
    entry.evidence.newErrors = errors;
    return entry.evidence;
  });

  await check('creature-lab：13 种 species 列表、动画切换、截图', async (entry) => {
    if (!report.knownFiles.creatureLab) {
      if (STRICT) assert.fail('creature-lab.html 缺失（T3 未交付）');
      skip('creature-lab.html 尚未实现（T3 进行中）');
    }
    let marker = browser.cdp.events.length;
    try {
      await relaunch(`${BASE}/creature-lab.html`);
      marker = 0;
      if (!(await waitFor('return !!window.creatureLab?.ready', READY_TIMEOUT))) throw new Error('creatureLab ready 超时');
    } catch (error) {
      if (STRICT) throw error;
      skip(`creature-lab 未在 ${READY_TIMEOUT}ms 内就绪（T3 进行中）：${String(error.message).split('\n')[0]}`);
    }
    const state = await page(`
      const lab = window.creatureLab;
      const species = (lab.species || []).map(s => typeof s === 'string' ? s : (s.id || s.species || s.name));
      const metrics = typeof lab.metrics === 'function' ? lab.metrics() : null;
      return { species, speciesCount: species.length, errors: lab.errors || [],
        metrics, hasSelect: typeof lab.select === 'function', hasPlay: typeof lab.play === 'function',
        canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]) };
    `);
    entry.evidence = { state };
    if ((!state.hasPlay || !state.hasSelect) && !STRICT) skip('window.creatureLab 尚无 select/play API（T3 进行中）');
    assert(state.hasPlay && state.hasSelect, 'window.creatureLab 缺少 select/play API');
    assert.equal(state.speciesCount, 13, `异兽 species 应为 13 种，实际 ${state.speciesCount}`);
    assert.equal(state.metrics?.species, 13, `metrics().species 应为 13，实际 ${state.metrics?.species}`);
    assert(state.canvas.some(([w, h]) => w > 100 && h > 100), 'creature-lab 无有效 WebGL 画布');
    assert.equal(state.metrics?.materialCount, 1, '13 只异兽必须共享单材质');
    assert.equal(state.metrics?.textureCount, 1, '13 只异兽必须共享单调色板贴图');
    const clips = await page(`
      const lab = window.creatureLab;
      const m = typeof lab.metrics === 'function' ? lab.metrics() : null;
      const list = lab.clips || m?.clips || m?.animations || lab.animations || [];
      return { clips: list.map(c => typeof c === 'string' ? c : (c.name || c.clip)), allClipsMatch: m?.allClipsMatch ?? null, clipsPerRig: m?.clipsPerRig ?? null };
    `);
    entry.evidence.clips = clips;
    assert.equal(clips.clips.length, 8, `13 种异兽应各有 8 套动画，实际列表 ${JSON.stringify(clips.clips)}`);
    assert.equal(clips.allClipsMatch, true, '每个物种的 8 套 clip 名称/顺序必须一致');
    assert(Array.isArray(clips.clipsPerRig) && clips.clipsPerRig.every(n => n === 8), `clipsPerRig 应全为 8：${JSON.stringify(clips.clipsPerRig)}`);
    const shots = [];
    const playedClips = [];
    const firstSpecies = await page(`const lab = window.creatureLab; const s = lab.species?.[0]; return s ? (typeof s === 'string' ? s : s.id) : null;`);
    for (const [index, clip] of clips.clips.slice(0, 2).entries()) {
      const played = await page(`
        const lab = window.creatureLab;
        await lab.select(${JSON.stringify(firstSpecies)});
        await lab.play(${JSON.stringify(clip)});
        await new Promise(requestAnimationFrame);
        const m = lab.metrics();
        return { clip: ${JSON.stringify(clip)}, currentClip: m.currentClip, selected: m.selected };
      `, READY_TIMEOUT);
      playedClips.push(played);
      await awaitFrames(24);
      shots.push(await screenshot(`a1-lab-creature-clip-${index}`));
    }
    entry.evidence.playedClips = playedClips;
    assert.deepEqual(playedClips.map(p => p.currentClip), clips.clips.slice(0, 2), `creature-lab 动画切换未生效：${JSON.stringify(playedClips)}`);
    entry.evidence.shots = shots;
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'creature-lab 出现运行时错误');
    return entry.evidence;
  }, { optional: true });

  await check('busanzi-lab：3 clip、动画切换、截图', async (entry) => {
    if (!report.knownFiles.busanziLab) {
      if (STRICT) assert.fail('busanzi-lab.html 缺失（T2 未交付）');
      skip('busanzi-lab.html 尚未实现（T2 进行中）');
    }
    let marker = browser.cdp.events.length;
    try {
      await relaunch(`${BASE}/busanzi-lab.html`);
      marker = 0;
      if (!(await waitFor('return !!window.busanziLab?.ready', READY_TIMEOUT))) throw new Error('busanziLab ready 超时');
    } catch (error) {
      if (STRICT) throw error;
      skip(`busanzi-lab 未在 ${READY_TIMEOUT}ms 内就绪（T2 进行中）：${String(error.message).split('\n')[0]}`);
    }
    const state = await page(`
      const lab = window.busanziLab;
      const clips = lab.clips || (typeof lab.metrics === 'function' ? lab.metrics().clips : null) || [];
      return { clips, hasPlay: typeof lab.play === 'function', errors: lab.errors || [],
        canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]) };
    `);
    entry.evidence = { state };
    if (!state.hasPlay && !STRICT) skip('window.busanziLab 尚无 play API（T2 进行中）');
    assert(state.hasPlay, 'window.busanziLab 缺少 play API');
    const names = state.clips.map(c => typeof c === 'string' ? c : (c.name || c.clip));
    entry.evidence.clipNames = names;
    for (const required of ['Idle', 'Walk', 'Wind']) {
      assert(names.some(n => String(n).toLowerCase() === required.toLowerCase()), `卜算子缺少 ${required} 动画：${JSON.stringify(names)}`);
    }
    assert(state.canvas.some(([w, h]) => w > 100 && h > 100), 'busanzi-lab 无有效 WebGL 画布');
    const playedClips = [];
    for (const clip of ['Idle', 'Walk', 'Wind']) {
      playedClips.push(await page(`
        await window.busanziLab.play(${JSON.stringify(clip)});
        await new Promise(requestAnimationFrame);
        const m = typeof window.busanziLab.metrics === 'function' ? window.busanziLab.metrics() : null;
        return { requested: ${JSON.stringify(clip)}, activeClip: window.busanziLab.activeClip ?? m?.activeClip ?? null };
      `, READY_TIMEOUT));
      await awaitFrames(24);
      await screenshot(`a1-lab-busanzi-${clip}`);
    }
    entry.evidence.playedClips = playedClips;
    assert.deepEqual(playedClips.map(p => p.activeClip), ['Idle', 'Walk', 'Wind'], `busanzi-lab 动画切换未生效：${JSON.stringify(playedClips)}`);
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'busanzi-lab 出现运行时错误');
    return entry.evidence;
  }, { optional: true });

  // ═════════════════════ Canvas 游戏 ═════════════════════
  await check('Canvas 游戏：启动、创建 small 世界、无错误', async (entry) => {
    let marker = browser.cdp.events.length;
    await relaunch(`${BASE}/inkbox.html`);
    marker = 0;
    if (!(await waitFor(GAME_CANVAS_READY, 60000))) throw new Error(`Canvas 游戏未就绪: ${browser.errors().join(' | ')}`);
    const boot = await page(`
      const k = window.inkbox;
      return { presetKey: k.presetKey, seed: k.seed, worldSeed: k.world.seed, entities: k.world.entities.length,
        canvas: !!document.querySelector('#inkCanvas'), renderer3dActive: !!k.render3d?.active,
        title: document.title };
    `);
    assert(boot.canvas, 'Canvas 画布缺失');
    assert.equal(boot.renderer3dActive, false, '默认入口不应自动进入 Three');
    await awaitFrames(4);
    await screenshot('a1-canvas-boot');
    const created = await createWorld(SEED, { renderer: 'canvas' });
    entry.evidence = { boot, created };
    const state = await page(`
      const k = window.inkbox;
      return { seed: k.world.seed, w: k.world.w, h: k.world.h, day: k.world.day, lastTime: k.lastTime,
        speed: k.speedIndex, renderer3dActive: !!k.render3d?.active };
    `);
    entry.evidence.state = state;
    assert.equal(state.seed, SEED);
    assert.equal(state.renderer3dActive, false);
    assert(state.lastTime > 0, 'Canvas 未进入正常产品帧');
    await screenshot('a1-canvas-small-world');
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'Canvas 模式出现运行时错误');
    return entry.evidence;
  });

  await check('Canvas 卜算子面板 → Viewer 打开并播放三动画', async (entry) => {
    const marker = browser.cdp.events.length;
    const api = await page(`
      const k = window.inkbox, v = k.busanziViewer;
      return { viewer: !!v, ready: typeof k.busanziViewerReady,
        open: typeof v?.open, play: typeof v?.play, close: typeof v?.close,
        panel: !!document.querySelector('#inkBusanzi') };
    `);
    entry.evidence = { api };
    if (!api.viewer) skip('window.inkbox.busanziViewer 尚未实现（T2 进行中）');
    assert(api.panel, '卜算子面板 #inkBusanzi 缺失');
    if (api.open !== 'function' || api.play !== 'function') skip('window.inkbox.busanziViewer 缺少 open/play API（T2 进行中）');
    // 真实玩家入口：点击卜算子面板上的肖像按钮打开 Viewer（不是直接调 API）
    const portrait = await page(`return { present: !!document.querySelector('#inkBusanziPortrait') };`);
    entry.evidence.portrait = portrait;
    if (STRICT) assert(portrait.present, '卜算子面板肖像入口 #inkBusanziPortrait 缺失');
    if (portrait.present) {
      await click('#inkBusanziPortrait');
      const openedByClick = await waitFor('return !!window.inkbox.busanziViewer?.state?.opened && !!window.inkbox.busanziViewer?.state?.ready', 20000);
      entry.evidence.openedByClick = openedByClick;
      assert(openedByClick, '点击 #inkBusanziPortrait 未打开卜算子 Viewer（真实入口路径）');
    } else {
      await page('await window.inkbox.busanziViewer.open(); return true;', READY_TIMEOUT);
    }
    await awaitFrames(20);
    const opened = await page(`
      const v = window.inkbox.busanziViewer;
      const state = v.state || {};
      return { opened: !!state.opened, ready: !!state.ready, activeClip: state.activeClip ?? null,
        error: state.error ?? null, clips: state.clips ?? null,
        canvas: [...document.querySelectorAll('canvas')].filter(c => c.width > 50 && c.height > 50).length };
    `);
    entry.evidence.opened = opened;
    assert(opened.opened && opened.ready, `卜算子 Viewer 未真正打开/就绪：${JSON.stringify(opened)}`);
    await screenshot('a1-canvas-busanzi-viewer');
    const shots = [];
    const clipStates = [];
    for (const clip of ['Idle', 'Walk', 'Wind']) {
      await page(`await window.inkbox.busanziViewer.play(${JSON.stringify(clip)}); return true;`, READY_TIMEOUT);
      await awaitFrames(24);
      clipStates.push(await page(`const s = window.inkbox.busanziViewer.state || {}; return { activeClip: s.activeClip ?? null, error: s.error ?? null };`));
      shots.push(await screenshot(`a1-canvas-busanzi-${clip}`));
    }
    entry.evidence.shots = shots;
    entry.evidence.clipStates = clipStates;
    assert.deepEqual(entry.evidence.clipStates.map(s => s.activeClip), ['Idle', 'Walk', 'Wind'], `Canvas Viewer 动画切换未生效：${JSON.stringify(clipStates)}`);
    entry.evidence.shotHashes = shots.map(f => sha256File(f));
    assert(new Set(entry.evidence.shotHashes).size >= 2, 'Canvas Idle/Walk/Wind 三动画截图完全相同——动画可能未真实播放');
    await page('window.inkbox.busanziViewer.close?.(); return true;', READY_TIMEOUT);
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'Canvas 卜算子 Viewer 出现运行时错误');
    return entry.evidence;
  }, { optional: true });

  // ═════════════════════ Three 游戏 ═════════════════════
  await check('Three 游戏：启动、加载就绪、无错误（默认 LOD）', async (entry) => {
    let marker = browser.cdp.events.length;
    await relaunch(`${BASE}/inkbox.html?renderer=3d`);
    marker = 0;
    if (!(await waitFor(GAME_THREE_READY, 60000))) throw new Error(`Three 渲染器未就绪: ${browser.errors().join(' | ')}`);
    await page(WAIT_THREE_LOADS, 60000);
    const boot = await page(`
      const k = window.inkbox, r = k.render3d.renderer;
      return { active: k.render3d.active, mode: k.render3d.mode, stages: [...r.stages.keys()],
        canvas3d: !!document.querySelector('#inkCanvas3D'),
        gpuMemory: r.gpu?.info?.memory || null,
        resources: performance.getEntriesByType('resource').map(x => x.name.replace(location.origin, '')).filter(n => /\\.(glb|png|json)$/i.test(n)).sort() };
    `);
    entry.evidence = { boot };
    assert(boot.active, 'Three 渲染器未激活');
    assert.deepEqual([...boot.stages].sort(), ['mortal', 'nether', 'upper'], '三界 stage 缺失');
    assert(boot.canvas3d, '#inkCanvas3D 画布缺失');
    report.gpu.threeMode = await gpuInfo();
    assert(report.gpu.threeMode.canvases.length > 0, 'Three 模式没有 WebGL 画布');
    assert.equal(report.gpu.threeMode.softwareRasterizer, false, 'Three 模式跑在软件光栅上');
    await screenshot('a1-three-boot');
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'Three 启动出现运行时错误');
    return entry.evidence;
  });

  // 产品默认 LOD 契约（A1_TEAM §3.3）：默认俯瞰镜头下 beast 落 LOD2 旧占位，但实体统计不得丢。
  await check('Three（默认 LOD）：可见异兽实体不丢、实体统计自洽', async (entry) => {
    const marker = browser.cdp.events.length;
    const created = await createWorld(SEED, { renderer: '3d' });
    const beasts = await spawnEntities('beast', 24);
    const cultivators = await spawnEntities('cultivator', 12);
    entry.evidence = { created, beasts, cultivators };
    assert(beasts.made >= 8, `默认 LOD 世界未能生成异兽实体：${JSON.stringify(beasts)}`);
    await awaitFrames(8);
    const stats = await page(`
      const k = window.inkbox, r = k.render3d.renderer;
      const layer = r.stages.get('mortal')?.entities || r.entities;
      const derived = layer.derive(k.world);
      const visible = {};
      for (const cls of ['human', 'cultivator', 'beast', 'spirit', 'wraith']) visible[cls] = layer.visibleList(derived, cls).length;
      const visibleTotal = Object.values(visible).reduce((a, b) => a + b, 0);
      const batch = layer.creatureBatch;
      return { zoom: r.cameraRig?.camera?.zoom ?? null, lodEnabled: r.lodEnabled,
        visible, visibleTotal,
        stats: { instances: layer.stats.instances, byClass: { ...layer.stats.byClass }, lod: [...layer.stats.lod], creatures: layer.stats.creatures },
        creatureBatchInstances: batch?.stats?.instances ?? 0,
        placeholderBeastCount: layer.placeholderMeshes?.beast?.count ?? null,
        beastEntities: k.world.entities.filter(e => e.sp === 'beast').length };
    `);
    entry.evidence.stats = stats;
    assert(stats.lodEnabled, '默认页面应开启 LOD');
    assert(stats.beastEntities > 0, '世界里没有 beast 实体');
    assert.equal(stats.stats.byClass.beast, stats.visible.beast, '默认 LOD2 占位也应把每只可见异兽计入实体统计（实体不丢）');
    assert.equal(stats.stats.instances, stats.visibleTotal, '默认镜头应恰好提交每个可见实体一次表现');
    assert.equal(stats.stats.lod.reduce((a, b) => a + b, 0), stats.stats.instances, 'LOD 计数应与提交实例总数一致');
    await screenshot('a1-three-default-lod-world');
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], '默认 LOD 场景出现运行时错误');
    return entry.evidence;
  });

  // 真模型验收走产品支持的 lod=off 路径（默认 LOD 下 beast 为 LOD2 占位，不是 bug）。
  await check('Three（?renderer=3d&lod=off）：启动、LOD 关闭、异兽库 4 物种就绪', async (entry) => {
    let marker = browser.cdp.events.length;
    await relaunch(`${BASE}/inkbox.html?renderer=3d&lod=off`);
    marker = 0;
    if (!(await waitFor(GAME_THREE_READY, 60000))) throw new Error(`lod=off Three 未就绪: ${browser.errors().join(' | ')}`);
    await page(WAIT_THREE_LOADS, 60000);
    const boot = await page(`
      const k = window.inkbox, r = k.render3d.renderer;
      const gl = r.gpu.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { lodEnabled: r.lodEnabled, creatureReady: !!r.creatureLibrary && !r.creatureLibrary.disposed,
        creatureError: r.creatureLoadError ? String(r.creatureLoadError?.message || r.creatureLoadError) : null,
        worldSpecies: r.creatureLibrary ? [...r.creatureLibrary.worldSpecies] : [],
        speciesCount: r.creatureLibrary ? r.creatureLibrary.size : 0,
        stages: [...r.stages.keys()],
        gpuRenderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) };
    `);
    entry.evidence = { boot };
    assert.equal(boot.lodEnabled, false, 'lod=off 未关闭 LOD');
    assert(boot.creatureReady, `lod=off 页面异兽库未就绪：${boot.creatureError}`);
    assert.deepEqual([...boot.worldSpecies].sort(), ['dangkang', 'lushu', 'tiangou', 'xuangui'], '世界试装异兽物种应为 4 种（天狗/当康/鹿蜀/旋龟）');
    assert.equal(boot.speciesCount, 4, '正式世界只加载 4 种试装异兽');
    assert(!/basic render|swiftshader|llvmpipe|software/i.test(boot.gpuRenderer), 'lod=off 页面在软件光栅上运行');
    await screenshot('a1-three-lodoff-boot');
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'lod=off 启动出现运行时错误');
    return entry.evidence;
  });

  await check('Three（lod=off）：创建 small 世界 + 修士 batch 使用新 GLB（实体数/材质/GLB sha 一致）', async (entry) => {
    const marker = browser.cdp.events.length;
    const created = await createWorld(SEED, { renderer: '3d' });
    const spawned = await spawnEntities('cultivator', 12);
    entry.evidence = { created, spawned };
    assert(spawned.made >= 6, `未能通过产品 API 生成修士实体：${JSON.stringify(spawned)}`);
    const displayed = await waitFor(`
      const r = window.inkbox.render3d.renderer;
      const layer = r.stages.get('mortal')?.entities || r.entities;
      return (layer?.characterBatch?.stats?.characters || 0) >= ${Math.min(6, spawned.made)}
        && window.inkbox.render3d.renderer.world === window.inkbox.world;
    `, 30000);
    assert(displayed, '实体层未显示 GLB 修士批次');
    await awaitFrames(6);
    const state = await page(`
      const k = window.inkbox, r = k.render3d.renderer;
      const layer = r.stages.get('mortal')?.entities || r.entities;
      const batch = layer?.characterBatch;
      const meshes = Object.values(batch?.meshes || {});
      const materials = new Set(meshes.map(m => m.material));
      const glbResources = performance.getEntriesByType('resource').filter(x => /cultivator_library\\.glb$/.test(x.name)).map(x => x.name);
      const cs = k.world.entities.filter(e => e.sp === 'cultivator');
      return { cultivatorEntities: cs.length,
        batchStats: batch?.stats || null,
        batchCharacters: batch?.stats?.characters ?? null,
        batchDrawCalls: batch?.stats?.drawCalls ?? null,
        batchMaterialCount: materials.size,
        librarySharedMaterials: batch?.library?.material ? 1 : null,
        glbResources, layerStats: layer?.stats || null,
        gpuMemory: r.gpu?.info?.memory || null };
    `);
    entry.evidence.state = state;
    assert(state.cultivatorEntities >= 6, '世界里没有修士实体');
    assert(state.glbResources.length > 0 && state.glbResources.every(u => u.endsWith('/assets/characters/cultivator/mesh/cultivator_library.glb')), `游戏 Three 未加载正式修士 GLB：${JSON.stringify(state.glbResources)}`);
    assert.equal(state.batchCharacters, state.cultivatorEntities,
      `lod=off 下 characterBatch.characters(${state.batchCharacters}) 应等于修士实体数(${state.cultivatorEntities})`);
    assert.equal(state.batchMaterialCount, 1, 'LOD0 修士批次必须共享同一材质');
    const asset = await pageAssetSha256('/assets/characters/cultivator/mesh/cultivator_library.glb');
    assert.equal(asset.sha256, report.assets.cultivatorGlbSha256, '游戏加载的 GLB 与 lab 加载的不是同一份');
    entry.evidence.framed = await frameWorldEntity('cultivator', 'a1-three-cultivators', { zoom: 16 });
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'Three 修士批次出现运行时错误');
    return entry.evidence;
  });

  await check('Three：世界里的异兽真实模型（≥3 种 species、实例>0、拾取映射）', async (entry) => {
    const marker = browser.cdp.events.length;
    const spawned = await spawnEntities('beast', 40);
    entry.evidence = { spawned };
    assert(spawned.made >= 8, `未能生成足够异兽实体：${JSON.stringify(spawned)}`);
    const displayed = await waitFor(`
      const k = window.inkbox, r = k.render3d.renderer;
      const batches = [...r.stages.values()].map(stage => stage.entities?.creatureBatch).filter(Boolean);
      const n = batches.reduce((sum, batch) => sum + (batch.stats?.instances || 0), 0);
      return n > 0 && r.world === k.world;
    `, 30000);
    if (!displayed) {
      const probe = await beastRenderStats();
      entry.evidence.probe = probe;
      if (!probe.libraryPresent) skip(`creatureLibrary 未接入正式世界（T3 进行中）：${probe.creatureLoadError || 'library 为空'}`);
      assert(displayed, `异兽真实模型未出现：${JSON.stringify(probe.stages)}`);
    }
    await awaitFrames(6);
    const stats = await beastRenderStats();
    entry.evidence.stats = stats;
    entry.evidence.batchSpecies = stats.visibleSpecies;
    if (!stats.libraryPresent) skip(`creatureLibrary 未接入正式世界（T3 进行中）：${stats.creatureLoadError || 'library 为空'}`);
    assert(stats.libraryReady, 'creatureLibrary 存在但已 disposed');
    assert(stats.libIds.length >= 4, `世界试装异兽物种数应 ≥4，实际 ${stats.libIds.length}（${JSON.stringify(stats.libIds)}）`);
    assert(stats.creatureInstances > 0, `异兽实例数为 0：${JSON.stringify(stats.stages.map(s => s.batchStats))}`);
    assert(stats.visibleSpecies.length >= 3, `世界里可见异兽 species 少于 3：${JSON.stringify(stats.visibleSpecies)}`);
    assert(stats.beastEntities > 0, '模拟世界里没有 beast 实体');
    assert(stats.userDataMappedToRealBeasts > 0, '异兽批次的 renderEntities 拾取映射未指向真实 beast 实体');
    assert(stats.mortal?.hasBatch, 'mortal stage 没有异兽 InstancedMesh 批次');
    assert.equal(stats.creatureInstances, stats.mortal.entityStats?.byClass?.beast,
      `creatureBatch 实例数(${stats.creatureInstances}) 应等于实体层 beast 计数(${stats.mortal.entityStats?.byClass?.beast})`);
    assert.equal(stats.creatureInstances, stats.beastEntities,
      `lod=off 默认镜头应把全部 beast 画成真模型：实例 ${stats.creatureInstances} / 实体 ${stats.beastEntities}`);
    assert.equal(stats.mortal.materialCount, 1, '异兽真实模型必须共享单材质');
    // 拾取映射：真实射线命中 InstancedMesh → instanceId → 世界实体 id
    const picking = await page(`
      return import('/vendor/three/build/three.module.js').then(THREE => {
        const k = window.inkbox, r = k.render3d.renderer;
        const layer = r.stages.get('mortal').entities;
        const batch = layer.creatureBatch;
        // 拾取用固定俯瞰镜头：前面的检查可能把镜头拉到近景，投影点会落在视野外导致假阴性。
        r.cameraRig.cancelFocus?.();
        const camera = r.cameraRig.camera;
        camera.zoom = 2; camera.updateProjectionMatrix();
        r.update(1 / 60); r.render();
        r.scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        const results = [], skipped = [];
        for (const mesh of batch.group.children) {
          if (!mesh.count) continue;
          for (let i = 0; i < Math.min(2, mesh.count); i += 1) {
            const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix);
            const position = new THREE.Vector3().setFromMatrixPosition(matrix);
            const species = batch.library.species.get(mesh.userData.species);
            position.y += species.height * 0.5;
            const projected = position.clone().project(camera);
            if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)
              || Math.abs(projected.x) > 0.95 || Math.abs(projected.y) > 0.95
              || projected.z < -1 || projected.z > 1) {
              skipped.push({ mesh: mesh.userData.species, instance: i, ndc: [projected.x, projected.y, projected.z] });
              continue;
            }
            const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
            const hits = raycaster.intersectObject(batch.group, true).filter(hit => hit.instanceId != null && hit.object.visible && hit.object.count);
            const entity = hits[0]?.object.userData.renderEntities?.[hits[0].instanceId];
            results.push({ expected: mesh.userData.renderEntities[i].id, picked: entity?.id ?? null,
              mapped: hits.length > 0 && entity != null, ndc: [projected.x, projected.y] });
          }
        }
        return { results, skipped, zoom: camera.zoom };
      });
    `);
    entry.evidence.picking = picking;
    assert(picking.results.length >= Math.min(3, stats.visibleSpecies.length),
      `拾取采样不足（视野内 ${picking.results.length}，视野外 ${picking.skipped.length}）：${JSON.stringify(picking)}`);
    assert(picking.results.every(item => item.mapped), `真实射线必须能由 instanceId 映射回世界实体：${JSON.stringify(picking.results)}`);
    assert(picking.results.some(item => item.expected === item.picked), '拾取必须命中真实 beast 实体 id');
    const resources = await page(resourcesExpression());
    entry.evidence.resources = resources;
    assert(resources.some(r => /\/assets\/creatures\/mesh\/creature-[\w-]+\.glb$/.test(r)), `正式世界未加载异兽 GLB：${JSON.stringify(resources.filter(r => /creature/i.test(r)))}`);
    // 对准兽群截图（3/4 俯视、避开树冠）
    entry.evidence.framed = await frameWorldEntity('beast', 'a1-three-creatures', { zoom: 14 });
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'Three 异兽出现运行时错误');
    return entry.evidence;
  }, { optional: true });

  await check('Three：卜算子面板 → Viewer 播放 Idle/Walk/Wind', async (entry) => {
    const marker = browser.cdp.events.length;
    const api = await page(`
      const k = window.inkbox, v = k.busanziViewer;
      return { viewer: !!v, ready: typeof k.busanziViewerReady,
        open: typeof v?.open, play: typeof v?.play, close: typeof v?.close,
        panel: !!document.querySelector('#inkBusanzi') };
    `);
    entry.evidence = { api };
    if (!api.viewer) skip('window.inkbox.busanziViewer 尚未实现（T2 进行中）');
    assert(api.panel, '卜算子面板 #inkBusanzi 缺失');
    if (api.open !== 'function' || api.play !== 'function') skip('window.inkbox.busanziViewer 缺少 open/play API（T2 进行中）');
    // 真实入口点击路径（Three 模式下同样必须可用）
    const portrait = await page(`return { present: !!document.querySelector('#inkBusanziPortrait') };`);
    entry.evidence.portrait = portrait;
    assert(portrait.present, 'Three 模式卜算子面板肖像入口 #inkBusanziPortrait 缺失');
    await click('#inkBusanziPortrait');
    const openedByClick = await waitFor('return !!window.inkbox.busanziViewer?.state?.opened && !!window.inkbox.busanziViewer?.state?.ready', 20000);
    entry.evidence.openedByClick = openedByClick;
    assert(openedByClick, 'Three 模式点击 #inkBusanziPortrait 未打开卜算子 Viewer');
    await awaitFrames(24);
    const openedState = await page(`
      const s = window.inkbox.busanziViewer.state || {};
      return { opened: !!s.opened, ready: !!s.ready, activeClip: s.activeClip ?? null, error: s.error ?? null };
    `);
    entry.evidence.openedState = openedState;
    assert(openedState.opened && openedState.ready, `Three 卜算子 Viewer 未真正打开/就绪：${JSON.stringify(openedState)}`);
    await screenshot('a1-three-busanzi-viewer');
    const shots = [];
    const clipStates = [];
    for (const clip of ['Idle', 'Walk', 'Wind']) {
      await page(`await window.inkbox.busanziViewer.play(${JSON.stringify(clip)}); return true;`, READY_TIMEOUT);
      await awaitFrames(24);
      clipStates.push(await page(`const s = window.inkbox.busanziViewer.state || {}; return { activeClip: s.activeClip ?? null, error: s.error ?? null };`));
      shots.push(await screenshot(`a1-three-busanzi-${clip}`));
    }
    entry.evidence.shots = shots;
    entry.evidence.clipStates = clipStates;
    assert.deepEqual(clipStates.map(s => s.activeClip), ['Idle', 'Walk', 'Wind'], `Three Viewer 动画切换未生效：${JSON.stringify(clipStates)}`);
    const hashes = shots.map(f => sha256File(f));
    entry.evidence.shotHashes = hashes;
    assert(new Set(hashes).size >= 2, 'Idle/Walk/Wind 三动画截图完全相同——动画可能未真实播放');
    await page('window.inkbox.busanziViewer.close?.(); return true;', READY_TIMEOUT);
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], 'Three 卜算子 Viewer 出现运行时错误');
    return entry.evidence;
  }, { optional: true });

  await check('Three：视界工具开/关后仍是同一世界、不串位面', async (entry) => {
    const marker = browser.cdp.events.length;
    await page('window.inkbox.setSpeed(0); return true');
    const detailOpen = await page(`
      const d = document.querySelector('#inkRender3DTools [data-probe=upper]')?.closest('details');
      if (d && !d.open) d.open = true;
      return !!d;
    `);
    assert(detailOpen, '#inkRender3DTools 视界探针面板缺失');
    const snapshotExpr = `
      const k = window.inkbox, r = k.render3d.renderer;
      const mortal = r.stages.get('mortal'), upper = r.stages.get('upper');
      const mort = mortal?.entities, upperLayer = upper?.entities;
      return {
        view: k.getRealmViewState(), seed: k.world.seed, entities: k.world.entities.length, day: k.world.day,
        activePlane: r.activePlane,
        stages: [...r.stages.entries()].map(([name, stage]) => ({
          name, visible: stage.visible,
          worldIsMortal: stage.world === k.world, worldIsUpper: stage.world === k.upper,
          entityInstances: stage.entities?.stats?.instances ?? null,
          byClass: stage.entities?.stats?.byClass ? { ...stage.entities.stats.byClass } : null,
          creatureInstances: stage.entities?.creatureBatch?.stats?.instances ?? 0,
        })),
        mortalEntityInstances: mort?.stats?.instances ?? null,
        mortalByClass: mort?.stats?.byClass ? { ...mort.stats.byClass } : null,
        mortalCreatureInstances: mort?.creatureBatch?.stats?.instances ?? 0,
        upperWorldEntities: k.upper.entities.length,
        upperWorldBeasts: k.upper.entities.filter(e => e.sp === 'beast').length,
        upperCreatureInstances: upperLayer?.creatureBatch?.stats?.instances ?? 0,
        upperByClass: upperLayer?.stats?.byClass ? { ...upperLayer.stats.byClass } : null,
      };
    `;
    const before = await page(snapshotExpr);
    await click('#inkRender3DTools [data-probe="upper"]');
    await awaitFrames(8);
    const opened = await page(snapshotExpr);
    entry.evidence = { before, opened };
    entry.evidence.openedFile = await screenshot('a1-three-realm-upper');
    assert(opened.view.open, `视界未打开：${JSON.stringify(opened.view)}`);
    assert.equal(opened.view.targetPlane, 'upper', `视界目标位面不是上界：${JSON.stringify(opened.view)}`);
    // activePlane 不作为断言：产品把视界当作「窗口」叠在 activePlane 上，不切主位面；
    // 真正的不串位面断言是 upper stage 只绑上界世界、且不含凡间 beast/异兽模型（见下）。
    assert.equal(opened.seed, before.seed, '打开视界后世界 seed 变了');
    assert.equal(opened.entities, before.entities, '打开视界后世界实体数变了');
    assert.equal(opened.day, before.day, '打开视界后世界时间前进了（应为暂停态）');
    // 不串位面：mortal stage 仍绑凡间世界；upper stage 绑上界世界，且不含凡间异兽模型/实体
    const mortalStage = opened.stages.find(s => s.name === 'mortal');
    const upperStage = opened.stages.find(s => s.name === 'upper');
    assert(mortalStage?.worldIsMortal, 'mortal stage 绑定到了错误的世界');
    assert(upperStage?.worldIsUpper, 'upper stage 没有绑定上界世界');
    assert.equal(opened.upperWorldBeasts, 0, '前提不成立：上界世界不应有 beast 实体');
    assert.equal(opened.upperCreatureInstances, 0, `凡间异兽模型串入上界 stage：creatureInstances=${opened.upperCreatureInstances}`);
    assert.equal(opened.upperByClass?.beast ?? 0, 0, `上界 stage 出现 beast 实体：${JSON.stringify(opened.upperByClass)}`);
    // 凡间表现不受影响（打开视界不得改动世界，也不得丢失凡间模型）
    assert.equal(opened.mortalEntityInstances, before.mortalEntityInstances, '打开视界后凡间实体层提交数变化');
    assert.deepEqual(opened.mortalByClass, before.mortalByClass, '打开视界后凡间实体分类计数变化');
    assert(opened.mortalCreatureInstances > 0, '凡间异兽真实模型实例在打开视界后消失');
    await click('#inkRender3DTools [data-probe="close"]');
    await awaitFrames(8);
    const closed = await page(snapshotExpr);
    entry.evidence.closed = closed;
    assert.equal(closed.view.open, false, '视界未关闭');
    assert.equal(closed.seed, before.seed, '关闭视界后世界 seed 变了');
    assert.equal(closed.entities, before.entities, '关闭视界后世界实体数变了');
    assert.equal(closed.mortalCreatureInstances, before.mortalCreatureInstances, '关闭视界后凡间异兽模型实例数与打开前不一致');
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], '视界操作出现运行时错误');
    return entry.evidence;
  });

  await check('Three：存档 → 读档后渲染器/GLB 批次仍正常', async (entry) => {
    const marker = browser.cdp.events.length;
    const before = await page(`
      const k = window.inkbox;
      window.__a1SavedWorld = k.world;
      return { seed: k.world.seed, day: k.world.day, entities: k.world.entities.length,
        cultivators: k.world.entities.filter(e => e.sp === 'cultivator').length,
        beasts: k.world.entities.filter(e => e.sp === 'beast').length };
    `);
    await click('#inkBtnSave');
    await sleepMs(300);
    await click('#inkBtnLoad');
    const loaded = await waitFor(`
      return window.inkbox.world !== window.__a1SavedWorld
        && window.inkbox.lastTime > 0
        && window.inkbox.render3d.renderer.world === window.inkbox.world
    `, 30000);
    assert(loaded, '读档后渲染器未采纳新世界');
    await awaitFrames(8);
    const state = await page(`
      const k = window.inkbox, r = k.render3d.renderer;
      return { replaced: k.world !== window.__a1SavedWorld, seed: k.world.seed, day: k.world.day,
        entities: k.world.entities.length,
        cultivators: k.world.entities.filter(e => e.sp === 'cultivator').length,
        beasts: k.world.entities.filter(e => e.sp === 'beast').length,
        worldAdopted: r.world === k.world,
        characterBatch: (r.stages.get('mortal')?.entities || r.entities)?.characterBatch?.stats || null,
        creatureBatches: Object.fromEntries([...r.stages.entries()].map(([plane, stage]) => [plane, stage.entities?.creatureBatch?.stats || null])),
        gpuMemory: r.gpu?.info?.memory || null };
    `);
    entry.evidence = { before, state };
    assert(state.replaced, '读档没有替换 World');
    assert.equal(state.seed, before.seed, '读档后 seed 与存档不一致');
    assert.equal(state.entities, before.entities, '读档后实体数不一致');
    assert.equal(state.characterBatch?.characters, state.cultivators,
      `读档后修士批次(${state.characterBatch?.characters}) 应等于修士实体数(${state.cultivators})`);
    assert((state.creatureBatches?.mortal?.instances || 0) > 0, `读档后凡间异兽真实模型消失：${JSON.stringify(state.creatureBatches)}`);
    await awaitFrames(4);
    await screenshot('a1-three-after-load');
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], '存读档出现运行时错误');
    return entry.evidence;
  });

  await check('Three（lod=off）：连续重建世界 3 次，几何/贴图计数稳定、异兽库复用', async (entry) => {
    const marker = browser.cdp.events.length;
    const baseline = await page(`
      const r = window.inkbox.render3d.renderer;
      window.__a1CreatureLibrary = r.creatureLibrary;
      return { geometries: r.gpu?.info?.memory?.geometries ?? null, textures: r.gpu?.info?.memory?.textures ?? null,
        libraryMaterial: r.creatureLibrary?.material?.uuid ?? null, librarySpecies: r.creatureLibrary ? [...r.creatureLibrary.worldSpecies] : [] };
    `);
    const samples = [];
    for (let i = 0; i < 3; i += 1) {
      await createWorld(SEED + 10 + i, { renderer: '3d' });
      await spawnEntities('cultivator', 6);
      await spawnEntities('beast', 12);
      await awaitFrames(10);
      samples.push(await page(`
        const k = window.inkbox, r = k.render3d.renderer;
        const batch = r.stages.get('mortal')?.entities?.creatureBatch;
        return { seed: k.world.seed, geometries: r.gpu?.info?.memory?.geometries ?? null,
          textures: r.gpu?.info?.memory?.textures ?? null,
          sameLibrary: r.creatureLibrary === window.__a1CreatureLibrary,
          libraryMaterial: r.creatureLibrary?.material?.uuid ?? null,
          creatureBatchAlive: !!batch,
          creatureInstances: batch?.stats?.instances ?? 0,
          characterBatch: (r.stages.get('mortal')?.entities || r.entities)?.characterBatch?.stats || null,
          worldAdopted: r.world === k.world, stages: r.stages.size };
      `));
      if (i === 0) await screenshot('a1-three-rebuild-warm');
    }
    entry.evidence = { baseline, samples };
    const geometries = samples.map(s => s.geometries).filter(v => v !== null);
    const textures = samples.map(s => s.textures).filter(v => v !== null);
    assert(samples.every(s => s.worldAdopted && s.stages === 3), '重建世界后渲染器/三界 stage 不正常');
    assert(samples.every(s => s.sameLibrary), '重建世界不得重新加载异兽库（应复用同一 CreatureLibrary）');
    assert(samples.every(s => s.libraryMaterial === baseline.libraryMaterial), '重建世界后异兽共享材质 uuid 变化（资源被重建）');
    assert(samples.every(s => s.creatureBatchAlive), '重建世界后 mortal stage 没有新的异兽 batch');
    if (geometries.length >= 3) {
      assert(geometries[2] <= geometries[1] + 2, `连续重建世界几何数增长：${geometries.join(' -> ')}`);
      assert(textures[2] <= textures[1] + 1, `连续重建世界贴图数增长：${textures.join(' -> ')}`);
      assert(geometries[2] <= baseline.geometries + 4, `重建后几何数超过基线 +4：${baseline.geometries} -> ${geometries[2]}`);
      assert(textures[2] <= baseline.textures + 2, `重建后贴图数超过基线 +2：${baseline.textures} -> ${textures[2]}`);
    }
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], '连续重建世界出现运行时错误');
    return entry.evidence;
  });

  // 委托书 §八：资源加载失败不得让整个游戏无法启动。?creatures=off 是产品支持的显式回退路径。
  await check('Three（?creatures=off&lod=off）：异兽库缺失时回退旧占位、游戏继续运行', async (entry) => {
    let marker = browser.cdp.events.length;
    await relaunch(`${BASE}/inkbox.html?renderer=3d&creatures=off&lod=off`);
    marker = 0;
    if (!(await waitFor(GAME_THREE_READY, 60000))) throw new Error(`回退页 Three 未就绪: ${browser.errors().join(' | ')}`);
    await page(WAIT_THREE_LOADS, 60000);
    // 固定俯瞰镜头，避免实体因镜头/LOD 选择原因暂不在提交列表里造成假阴性
    await page(`
      const r = window.inkbox.render3d.renderer;
      r.cameraRig.cancelFocus?.();
      const camera = r.cameraRig.camera;
      camera.zoom = 2; camera.updateProjectionMatrix();
      r.update(1 / 60); r.render();
      return true;
    `);
    const created = await createWorld(SEED + 5, { renderer: '3d' });
    const spawned = await spawnEntities('beast', 12);
    entry.evidence = { created, spawned };
    const displayed = await waitFor(`
      const k = window.inkbox, r = k.render3d.renderer;
      const layer = r.stages.get('mortal')?.entities || r.entities;
      return (layer?.stats?.byClass?.beast || 0) > 0 && r.world === k.world;
    `, 20000);
    entry.evidence.displayed = displayed;
    if (!displayed) {
      entry.evidence.probe = await page(`
        const k = window.inkbox, r = k.render3d.renderer;
        const layer = r.stages.get('mortal')?.entities || r.entities;
        const derived = layer.derive(k.world);
        return { beastEntities: k.world.entities.filter(e => e.sp === 'beast').length,
          visibleBeast: layer.visibleList(derived, 'beast').length,
          stats: layer.stats || null, activePlane: r.activePlane,
          stages: [...r.stages.entries()].map(([name, stage]) => ({ name, visible: stage.visible, hasEntities: !!stage.entities })),
          camera: { zoom: r.cameraRig.camera.zoom, target: r.cameraRig.controls?.target?.toArray?.() } };
      `);
    }
    const fallback = await page(`
      const k = window.inkbox, r = k.render3d.renderer;
      const layer = r.stages.get('mortal')?.entities || r.entities;
      return { creatureLibrary: !!r.creatureLibrary,
        loadError: r.creatureLoadError ? String(r.creatureLoadError?.message || r.creatureLoadError) : '',
        creatureBatch: !!layer?.creatureBatch,
        byClassBeast: layer?.stats?.byClass?.beast ?? 0,
        placeholderBeastCount: layer?.placeholderMeshes?.beast?.count ?? null,
        beastEntities: k.world.entities.filter(e => e.sp === 'beast').length,
        worldAdopted: r.world === k.world, lastTime: k.lastTime };
    `);
    entry.evidence.fallback = fallback;
    assert.equal(fallback.creatureLibrary, false, '?creatures=off 不应加载异兽库');
    assert(fallback.worldAdopted && fallback.lastTime > 0, '回退页面未进入正常产品帧');
    assert(fallback.beastEntities > 0, '回退世界没有 beast 实体');
    assert.equal(fallback.creatureBatch, false, '回退路径不应有 creatureBatch');
    assert(fallback.byClassBeast > 0, `回退路径未绘制旧灵兽占位，beast 实体丢失：${JSON.stringify(entry.evidence.probe || fallback)}`);
    if (fallback.placeholderBeastCount !== null) {
      assert.equal(fallback.placeholderBeastCount, fallback.byClassBeast, '旧占位实例数应与 beast 统计一致');
    }
    await screenshot('a1-three-creatures-fallback');
    const errors = collectErrors(browser.cdp.events.slice(marker));
    assert.deepEqual(errors.runtime, [], '异兽回退路径出现运行时错误');
    return entry.evidence;
  });

  await check('总体：window.inkbox 无 console/page error', async (entry) => {
    await awaitFrames(4);
    const current = collectErrors(browser.cdp.events);
    const errors = {
      runtime: [...report.accumulated.runtime, ...current.runtime.filter(x => !/favicon/i.test(String(x)))],
      consoleErrors: [...report.accumulated.consoleErrors, ...current.consoleErrors],
    };
    report.runtimeErrors = errors.runtime;
    report.consoleErrors = errors.consoleErrors;
    report.launches = report.launches;
    entry.evidence = { ...errors, launches: report.launches, pagesVisited: report.pagesVisited };
    assert.deepEqual(errors.runtime, [], `浏览器运行时错误：${JSON.stringify(errors.runtime.slice(0, 5))}`);
    assert.deepEqual(errors.consoleErrors, [], `console.error：${JSON.stringify(errors.consoleErrors.slice(0, 5))}`);
    return entry.evidence;
  });

  const failed = report.checks.filter(c => !c.pass && !c.skipped);
  report.pass = failed.length === 0 && !report.aborted;
  report.finishedAt = new Date().toISOString();
  currentStep = 'finished';
  persist();
  console.log('\n================ A1 VERIFY SUMMARY ================');
  console.log(`PASS=${report.summary.passed} FAIL=${failed.length} SKIP=${report.checks.filter(c => c.skipped).length} · scope=${SCOPE} strict=${STRICT} · ${report.elapsedMs}ms`);
  console.log(`result: ${relativePath(path.join(OUT, 'result.json'))}`);
  for (const entry of report.checks) {
    console.log(`${entry.pass ? 'PASS' : entry.skipped ? 'SKIP' : 'FAIL'} ${entry.name}${entry.skipReason ? ` :: ${entry.skipReason}` : ''}${entry.error ? ` :: ${entry.error.split('\n')[0]}` : ''}`);
  }
  if (report.abortRemaining) {
    console.error(`\n[ABORTED] ${report.abortRemaining}`);
    process.exitCode = 3;
  } else if (failed.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  report.crash = String(error.stack || error);
  report.finishedAt = new Date().toISOString();
  persist();
  console.error(error.stack || error);
  process.exitCode = 2;
} finally {
  await forceCleanup();
}
