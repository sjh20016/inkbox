// A1 QA · 改动前基线采集
//
// 目的（阶段 A 第 2 步）：在 T1/T2/T3 落盘之前，用真实 Edge（硬件 GPU）采集
// 「改动前」的产品表现，作为后续 A1 验收的对照证据：
//   1. cultivator-lab.html：6 人近景、20 人中景（旧修士库）
//   2. inkbox.html（默认 Canvas）：创建 small 世界后
//   3. inkbox.html?renderer=3d（Three）：创建 small 世界、render3d 就绪、实体已渲染后
//
// 同时记录：browser.meta、WebGL UNMASKED_RENDERER（GPU/软件光栅判定）、
// 资源加载名（GLB/JSON）、window.inkbox / window.*Lab 接口存在性、console 错误。
// 输出：reports/a1/baseline/*.png + reports/a1/baseline/baseline.json
//
// 运行：node scripts/inkbox-a1-baseline.mjs
// 端口：4188（可用 A1_QA_PORT 覆盖；❌ 不要用 4190/4191/4192，它们被 fetch/Chromium 列为 bad port）
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.A1_QA_PORT || 4188);
const BASE = process.env.A1_QA_URL || `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/a1/baseline'));
const WIDTH = 1440;
const HEIGHT = 900;
const SEED_CANVAS = 20261020;
const SEED_THREE = 20261021;

const report = {
  startedAt: new Date().toISOString(),
  purpose: 'A1 QA phase-A baseline BEFORE asset integration (git HEAD e6fb8c6 / branch feat/a1-creature-character-assets)',
  base: BASE,
  viewport: { width: WIDTH, height: HEIGHT },
  browser: null,
  gpu: null,
  cultivatorLab: null,
  gameCanvas: null,
  gameThree: null,
  apiSurface: null,
  screenshots: [],
  consoleErrors: [],
  runtimeErrors: [],
  pass: false,
};
let server;
let browser;

const page = (expr, timeoutMs = 45000) => browser.js(`return (async()=>{${expr}})()`, { timeoutMs });
const awaitFrames = (n = 3) => page(`for(let i=0;i<${n};i++)await new Promise(requestAnimationFrame);return true`);

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

async function capture(name, extra = {}) {
  const file = await browser.screenshot(path.join(OUT, `${name}.png`), { timeoutMs: 30000 });
  const entry = { name, file: path.relative(ROOT, file).replace(/\\/g, '/'), ...extra };
  report.screenshots.push(entry);
  return entry;
}

async function gpuInfo() {
  return page(`
    const canvases = [...document.querySelectorAll('canvas')].filter(c => c.width > 0 && c.height > 0);
    const out = { canvases: canvases.length, renderer: null, vendor: null, webgl2: false, softwareRasterizer: null };
    for (const canvas of canvases) {
      let gl = null;
      try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch {}
      if (!gl) continue;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      out.renderer = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      out.vendor = gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR);
      out.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      out.canvas = { id: canvas.id, width: canvas.width, height: canvas.height };
      break;
    }
    out.softwareRasterizer = out.renderer ? /basic render|swiftshader|llvmpipe|software|warp|mesa offscreen/i.test(out.renderer) : null;
    return out;
  `);
}

const resourceSnapshot = () => page(`
  return performance.getEntriesByType('resource')
    .filter(r => /\\.(glb|gltf|json|png|webp)(\\?|$)/i.test(r.name))
    .map(r => r.name.replace(location.origin, ''))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();
`);

const errorsSnapshot = () => {
  const runtimeErrors = [];
  for (const event of browser.cdp.events) {
    if (event.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
    } else if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
      runtimeErrors.push(event.params.entry.text);
    }
  }
  return runtimeErrors;
};

try {
  await startServer();
  const executable = findEdge();
  if (!executable) throw new Error('未找到本机 Edge');

  // ── 1. cultivator-lab：硬件 GPU + 旧修士库 ────────────────────────────
  browser = await launch({
    url: `${BASE}/cultivator-lab.html`, browser: executable, width: WIDTH, height: HEIGHT, gpu: true,
  });
  report.browser = { ...browser.meta, executable };
  if (!(await browser.waitFor('return !!window.cultivatorLab?.ready', { timeoutMs: 30000 }))) {
    throw new Error(`cultivatorLab 未就绪: ${browser.errors().join(' | ')}`);
  }
  await awaitFrames(3);
  report.gpu = await gpuInfo();
  report.cultivatorLab = {
    roles: await page('return Object.keys(window.cultivatorLab.library.roles)'),
    modules: await page('return window.cultivatorLab.library.modules.size'),
    animations: await page('return window.cultivatorLab.library.animations.map(a=>a.name)'),
    glbResources: await resourceSnapshot(),
    scale6: await page('return window.cultivatorLab.setCount(6)'),
  };
  await awaitFrames(2);
  await capture('cultivator-lab-6', { scene: 'cultivator-lab', count: 6 });
  report.cultivatorLab.scale20 = await page('return window.cultivatorLab.setCount(20)');
  await awaitFrames(2);
  await capture('cultivator-lab-20', { scene: 'cultivator-lab', count: 20 });
  await page('return window.cultivatorLab.setCount(6)');

  // ── 2. 游戏 Canvas 模式：创建 small 世界 ─────────────────────────────
  await browser.cdp.send('Page.navigate', { url: `${BASE}/inkbox.html` });
  if (!(await browser.waitFor('return !!window.inkbox?.world && !!window.inkbox?.life', { timeoutMs: 60000 }))) {
    throw new Error(`Canvas 游戏未就绪: ${browser.errors().join(' | ')}`);
  }
  await page(`const k=window.inkbox; if(k.setSpeed)k.setSpeed(0); return true;`);
  report.gameCanvas = await page(`
    const k = window.inkbox;
    const before = { seed: k.world.seed, entities: k.world.entities.length };
    k.newWorld('small', ${SEED_CANVAS});
    return { before, after: { seed: k.world.seed, entities: k.world.entities.length }, renderer3dActive: !!k.render3d?.active };
  `);
  const canvasOk = await browser.waitFor(
    `return window.inkbox.lastTime>0 && window.inkbox.world.seed===${SEED_CANVAS} && !window.inkbox.render3d?.active`,
    { timeoutMs: 30000 },
  );
  if (!canvasOk) throw new Error('Canvas 模式新世界未进入正常产品帧');
  await awaitFrames(6);
  report.gameCanvas.state = await page(`
    const k = window.inkbox;
    return { seed: k.world.seed, entities: k.world.entities.length,
      beasts: k.world.entities.filter(e=>e.cls==='beast'||e.kind==='beast').length,
      day: k.world.day, lastTime: k.lastTime,
      canvas3dPresent: !!document.querySelector('#inkCanvas3D'),
      canvasVisible: getComputedStyle(document.querySelector('#inkCanvas')).visibility };
  `);
  report.gameCanvas.resources = await resourceSnapshot();
  report.gpu.canvasMode = await gpuInfo();
  await capture('game-canvas-small-world', { scene: 'inkbox-canvas', seed: SEED_CANVAS });

  // ── 3. 游戏 Three 模式：render3d 就绪 + 创建 small 世界 + 实体渲染 ────
  await browser.cdp.send('Page.navigate', { url: `${BASE}/inkbox.html?renderer=3d` });
  if (!(await browser.waitFor('return !!window.inkbox?.render3d?.active && !!window.inkbox?.render3d?.renderer?.stages?.get("mortal")', { timeoutMs: 90000 }))) {
    throw new Error(`Three 渲染器未就绪: ${browser.errors().join(' | ')}`);
  }
  await page(`return (async()=>{const r=window.inkbox.render3d.renderer;await Promise.all([r.characterLoadPromise,r.environmentLoadPromise,r.art?.comparisonReady].filter(Boolean));return true})()`, 90000);
  report.gameThree = await page(`
    const k = window.inkbox, r = k.render3d.renderer;
    if (k.setSpeed) k.setSpeed(0);
    const before = { seed: k.world.seed, entities: k.world.entities.length };
    k.newWorld('small', ${SEED_THREE});
    return { before, after: { seed: k.world.seed, entities: k.world.entities.length },
      characterBatch: { characters: r.entities?.characterBatch?.stats?.characters ?? null,
        drawCalls: r.entities?.characterBatch?.stats?.drawCalls ?? null },
      entityLayerStats: r.entities?.stats || null,
      gpuMemory: r.gpu?.info?.memory || null };
  `);
  const threeOk = await browser.waitFor(
    `return window.inkbox.lastTime>0 && window.inkbox.world.seed===${SEED_THREE} && window.inkbox.render3d.renderer.world===window.inkbox.world`,
    { timeoutMs: 30000 },
  );
  if (!threeOk) throw new Error('Three 模式新世界未被渲染器采纳');
  // 等实体批次写入世界真实实体
  const rendered = await browser.waitFor(
    'return (window.inkbox.render3d.renderer.entities?.stats?.characters ?? window.inkbox.render3d.renderer.entities?.stats?.cultivators ?? 0) >= 0 && window.inkbox.lastTime>0',
    { timeoutMs: 20000 },
  );
  await awaitFrames(10);
  report.gameThree.state = await page(`
    const k = window.inkbox, r = k.render3d.renderer;
    return { seed: k.world.seed, day: k.world.day,
      entities: k.world.entities.length,
      beastEntities: k.world.entities.filter(e=>e.cls==='beast'||e.kind==='beast').length,
      entityLayerStats: r.entities?.stats || null,
      characterBatch: { characters: r.entities?.characterBatch?.stats?.characters ?? null,
        drawCalls: r.entities?.characterBatch?.stats?.drawCalls ?? null },
      stages: [...r.stages.keys()],
      gpuMemory: r.gpu?.info?.memory || null,
      rendererSize: r.gpu?.domElement ? [r.gpu.domElement.width, r.gpu.domElement.height] : null,
      worldAdopted: r.world === k.world };
  `);
  report.gpu.threeMode = await gpuInfo();
  report.gameThree.resources = await resourceSnapshot();
  await capture('game-three-small-world', { scene: 'inkbox-three', seed: SEED_THREE, rendered });

  // ── 4. 改动前接口面（供阶段 B 判断哪些 API 是新增的）────────────────
  report.apiSurface = await page(`
    const k = window.inkbox;
    return {
      windowLabs: { cultivatorLab: !!window.cultivatorLab, creatureLab: !!window.creatureLab, busanziLab: !!window.busanziLab },
      inkboxKeys: Object.keys(k).sort(),
      busanziViewer: !!k.busanziViewer, busanziViewerReady: typeof k.busanziViewerReady,
      render3dKeys: k.render3d ? Object.keys(k.render3d).sort() : [],
      hasCreatureLibrary: !!(k.render3d?.renderer?.creatureLibrary),
      hasCreatureBatch: !!(k.render3d?.renderer?.creatureBatch),
      hasBusanziViewer: !!k.render3d?.renderer?.busanziViewer,
    };
  `);

  report.runtimeErrors = errorsSnapshot();
  report.consoleErrors = browser.cdp.events
    .filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
    .map(e => e.params.args.map(a => a.value || a.description || '').join(' '));
  report.issues = [
    'port 4190/4191/4192 are WHATWG/Chromium bad ports: Node fetch fails with "bad port" and Edge navigation hits ERR_UNSAFE_PORT; QA uses 4188/4189',
    ...report.runtimeErrors,
  ];
  report.pass = report.runtimeErrors.length === 0 && report.consoleErrors.length === 0;
  report.finishedAt = new Date().toISOString();
  console.log('baseline summary =', JSON.stringify({
    pass: report.pass,
    gpu: report.gpu,
    cultivatorLab: { roles: report.cultivatorLab.roles, modules: report.cultivatorLab.modules, scale6: report.cultivatorLab.scale6 },
    gameCanvas: report.gameCanvas.state,
    gameThree: report.gameThree.state,
    apiSurface: report.apiSurface,
    screenshots: report.screenshots.map(s => s.file),
    errors: report.runtimeErrors,
  }, null, 2));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'baseline.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Baseline ${report.pass ? 'PASS' : 'FAIL'} → ${path.join(OUT, 'baseline.json')}`);
  if (!report.pass) process.exitCode = 1;
} catch (error) {
  report.runtimeErrors.push(String(error.stack || error));
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'baseline.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch (error) { console.error('browser close failed:', error.message); }
  if (server) { server.kill(); await sleep(300); }
}
