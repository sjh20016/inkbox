#!/usr/bin/env node
// T2 · 卜算子真实浏览器验收（Edge + CDP + 真实 three.js）
//
// 覆盖 A1_TEAM.md §3.2 / 委托书 §五：
//   · 看板：真实 GLB 加载、38 骨 / 1534 面 / 20 色最近邻、Idle/Walk/Wind 可播可切、mixer 真在跑
//   · Wind 可见性：符纸 / 头发 / 衣摆骨骼的世界四元数与 Idle 不同，身体骨不变
//   · 肖像：从同一具模型离线渲染 PNG（透明底），写入 materials/（首个生成或显式强制时）
//   · 游戏（Canvas）：面板肖像入口存在且可点 → Viewer 打开 → 三动画 → Esc 关闭 → 游戏继续
//   · 游戏（Three）：3D 模式下同样能开/关 Viewer，主 renderer 上下文与资源计数不受影响
//   · 换世界：Viewer 自动关闭并释放
//
// 用法：
//   node scripts/inkbox-busanzi-browser.mjs
//   BUSANZI_WRITE_PORTRAIT=1 node scripts/inkbox-busanzi-browser.mjs  # 强制重渲面板肖像
//   BUSANZI_PORT=4188 ... / BUSANZI_URL=http://127.0.0.1:4188 ...     # 自定义端口/复用服务
// 截图落 assets/characters/busanzi/preview/，摘要落 data/runtime_validation.json。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.BUSANZI_PORT || 4187);
const base = process.env.BUSANZI_URL || `http://127.0.0.1:${port}`;
const assetRoot = path.join(root, 'assets/characters/busanzi');
const output = path.join(assetRoot, 'preview');
const materials = path.join(assetRoot, 'materials');
const portraitPath = path.join(materials, 'busanzi_portrait.png');
const reportPath = path.join(assetRoot, 'data/runtime_validation.json');
const forcePortrait = process.env.BUSANZI_WRITE_PORTRAIT === '1';

let server = null;
let browser = null;
const report = { generatedAt: new Date().toISOString(), asset: 'busanzi', lab: {}, portrait: {}, game: { canvas: {}, three: {} }, errors: [], pass: false };
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(materials, { recursive: true });

/** 四元数夹角（双覆盖：q 与 -q 是同一姿态）。 */
function quaternionDelta(a, b) {
  const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return 2 * Math.acos(dot);
}

function readPngHeader(bytes) {
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', 'PNG 头不对');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const WIND_BONES = ['talisman_1', 'hair_back_1', 'hem_f', 'sleeve_flap_l'];
const BODY_BONES = ['l_upperleg', 'spine'];

function windDeltas(idleProbe, windProbe) {
  const deltas = {};
  for (const bone of [...WIND_BONES, ...BODY_BONES]) {
    deltas[bone] = quaternionDelta(idleProbe[bone].quaternion, windProbe[bone].quaternion);
  }
  return deltas;
}

function assertWindVisible(deltas, label) {
  for (const bone of WIND_BONES) assert(deltas[bone] > 0.004, `${label}: 风起时 ${bone} 没有可见变化（Δq=${deltas[bone]}）`);
  for (const bone of BODY_BONES) assert(deltas[bone] < 5e-3, `${label}: 风起标识身体骨 ${bone} 也动了（Δq=${deltas[bone]}）——Wind 应只动附加骨`);
}

try {
  if (!process.env.BUSANZI_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: root, stdio: 'pipe', windowsHide: true });
    let serverError = '';
    server.stderr.on('data', (data) => { serverError += data; });
    server.on('error', (error) => { serverError += error.message; });
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`Asset QA server exited: ${serverError}`);
      try { const response = await fetch(`${base}/busanzi-lab.html`); ready = response.ok; } catch { /* booting */ }
      if (ready) break;
      await sleep(150);
    }
    assert(ready, 'Busanzi asset QA server failed to start');
  }

  browser = await launch({ url: `${base}/busanzi-lab.html`, width: 1440, height: 900, gpu: process.env.BUSANZI_GPU !== '0' });
  assert(await browser.waitFor('return window.busanziLab?.ready === true', { timeoutMs: 30000 }), `Busanzi lab not ready: ${browser.errors().join(' | ')}`);
  report.browser = browser.meta;

  // ── ① 看板：结构 + 加载来源 ─────────────────────────────────────
  report.lab.metrics = await browser.js(`
    const lab = window.busanziLab;
    const loaded = performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /busanzi.*(glb|json)$/.test(name));
    return { clips: lab.clips, metrics: lab.metrics(), loaded, paletteSwatches: document.querySelectorAll('#palette .swatch').length, statusText: document.querySelector('#status').textContent };
  `);
  assert.deepEqual(report.lab.metrics.clips, ['Idle', 'Walk', 'Wind'], 'lab 必须暴露 Idle/Walk/Wind');
  const labMetrics = report.lab.metrics.metrics;
  assert.equal(labMetrics.bones, 38, 'lab 必须加载 38 骨模型');
  assert.equal(labMetrics.triangles, 1534, 'lab 必须加载 1534 面模型');
  assert.equal(labMetrics.meshes, 5, 'lab 必须是 5 个网格节点');
  assert.equal(labMetrics.materialCount, 1, 'lab 必须只有一个材质');
  assert.equal(labMetrics.palette.count, 20, 'lab 调色板必须是 20 色');
  assert.equal(labMetrics.palette.nearest, true, 'lab 调色板必须最近邻');
  assert.equal(labMetrics.activeClip, 'Idle', 'lab 首开必须播 Idle');
  assert.equal(labMetrics.mixerRunning, true, 'lab 首开 mixer 必须在跑');
  assert.equal(report.lab.metrics.loaded.some((url) => url.endsWith('busanzi.glb')), true, 'lab 必须加载真实 busanzi.glb');
  assert.equal(report.lab.metrics.loaded.some((url) => url.endsWith('busanzi_manifest.json')), true, 'lab 必须加载 busanzi_manifest.json');
  assert.equal(report.lab.metrics.paletteSwatches, 20, 'lab 必须画出 20 格调色板');
  assert.equal(report.lab.metrics.statusText.includes('1534'), true, 'lab 状态必须显示实测面数');

  // ── ② 三动画依次播放 + 截图 ────────────────────────────────────────
  report.lab.clips = [];
  for (const [clip, file] of [['Idle', 'lab_idle.png'], ['Walk', 'lab_walk.png'], ['Wind', 'lab_wind.png']]) {
    const played = await browser.js(`return window.busanziLab.play('${clip}');`);
    assert.equal(played, clip, `lab.play(${clip}) 必须返回片段名`);
    await sleep(700);
    const state = await browser.js('return window.busanziLab.metrics();');
    assert.equal(state.activeClip, clip, `lab 当前片段必须是 ${clip}`);
    assert.equal(state.mixerRunning, true, `${clip} 播放时 mixer 必须在跑`);
    assert(state.mixerTime > 0.2, `${clip} 播放时 mixer 时间必须前进`);
    report.lab.clips.push({ clip, mixerTime: state.mixerTime, frames: state.frames });
    await browser.screenshot(path.join(output, file));
    console.log(`lab ${clip} · mixerTime ${state.mixerTime.toFixed(2)}s · ${state.frames} frames`);
  }

  // ── ③ Wind 可见性：符纸/头发/衣摆动，身体骨不动 ─────────────────────
  await browser.js("return window.busanziLab.play('Idle');");
  await sleep(500);
  const labIdleProbe = await browser.js(`return window.busanziLab.probe(${JSON.stringify([...WIND_BONES, ...BODY_BONES])});`);
  await browser.js("return window.busanziLab.play('Wind');");
  await sleep(520);
  const labWindProbe = await browser.js(`return window.busanziLab.probe(${JSON.stringify([...WIND_BONES, ...BODY_BONES])});`);
  report.lab.windDeltas = windDeltas(labIdleProbe, labWindProbe);
  assertWindVisible(report.lab.windDeltas, 'lab');

  // ── ④ 从真实模型渲染面板肖像（透明底）──────────────────────────────
  const generated = await browser.js("return window.busanziLab.capturePortrait({ width: 456, height: 576, clip: 'Idle', time: 0.6, framing: 'bust' });");
  assert(generated.startsWith('data:image/png;base64,'), '肖像必须是 PNG dataURL');
  const portraitBytes = Buffer.from(generated.split(',')[1], 'base64');
  assert(portraitBytes.length > 2000, '肖像 PNG 太小，可能没渲染出模型');
  assert.deepEqual(readPngHeader(portraitBytes), { width: 456, height: 576 }, '肖像 PNG 尺寸必须是 456×576');
  fs.writeFileSync(path.join(output, 'portrait_bust.png'), portraitBytes);
  if (forcePortrait || !fs.existsSync(portraitPath)) {
    fs.writeFileSync(portraitPath, portraitBytes);
    report.portrait.generated = true;
  } else {
    assert.deepEqual(readPngHeader(fs.readFileSync(portraitPath)), { width: 456, height: 576 }, '随包肖像 PNG 尺寸必须是 456×576');
    report.portrait.generated = false;
  }
  const fullBody = await browser.js("return window.busanziLab.capturePortrait({ width: 640, height: 760, clip: 'Idle', time: 0.6, framing: 'full' });");
  fs.writeFileSync(path.join(output, 'portrait_full.png'), Buffer.from(fullBody.split(',')[1], 'base64'));
  const windPeak = await browser.js("return window.busanziLab.capturePortrait({ width: 456, height: 576, clip: 'Wind', time: 0.5, framing: 'bust' });");
  fs.writeFileSync(path.join(output, 'portrait_wind_peak.png'), Buffer.from(windPeak.split(',')[1], 'base64'));
  report.portrait = { ...report.portrait, width: 456, height: 576, bytes: portraitBytes.length, sha256: null };
  report.portrait.sha256 = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(portraitPath)).digest('hex').toUpperCase();
  console.log(`portrait ${report.portrait.width}×${report.portrait.height} · ${portraitBytes.length} bytes · generated=${report.portrait.generated}`);

  const labErrors = browser.errors();
  assert.deepEqual(labErrors, [], `lab 页面不允许运行时报错：${labErrors.join(' | ')}`);

  // ── ⑤ 游戏（Canvas）：面板 → Viewer → 三动画 → Esc 关闭 ─────────────
  await browser.cdp.send('Page.navigate', { url: `${base}/inkbox.html` });
  assert(await browser.waitFor('return !!window.inkbox?.world && !!window.inkbox?.busanziViewer', { timeoutMs: 30000 }), '游戏必须启动并暴露 window.inkbox.busanziViewer');
  report.game.canvas.panel = await browser.js(`
    const k = window.inkbox;
    k.setSpeed(0);
    k.refreshBusanzi();
    const panel = document.getElementById('inkBusanzi');
    const lines = document.getElementById('inkBusanziLines');
    const meter = document.getElementById('inkBusanziMeter');
    const portrait = document.getElementById('inkBusanziPortrait');
    const image = portrait?.querySelector('img');
    return {
      panelOn: panel.classList.contains('on'),
      lineCount: lines.children.length,
      tier: document.getElementById('inkBusanziTier').textContent,
      meterWidth: meter.style.width,
      portraitButton: Boolean(portrait),
      imageComplete: Boolean(image?.complete),
      imageSize: [image?.naturalWidth || 0, image?.naturalHeight || 0],
      speed: k.speedIndex,
    };
  `);
  const panel = report.game.canvas.panel;
  assert.equal(panel.panelOn, true, '卜算子面板必须显示（首开有登场台词）');
  assert(panel.lineCount > 0, '卜算子对话条必须仍有台词');
  assert(panel.tier.length > 0, '亲缘阶梯文字必须仍在');
  assert.equal(panel.portraitButton, true, '面板必须有肖像入口按钮');
  assert.equal(panel.imageComplete, true, '肖像 PNG 必须随包可加载');
  assert(panel.imageSize[0] > 0 && panel.imageSize[1] > 0, '肖像 PNG 必须真的有像素');
  await browser.screenshot(path.join(output, 'panel_canvas.png'));
  const worldBefore = await browser.js('return JSON.stringify({ day: window.inkbox.world.day, entities: window.inkbox.world.entities.length, busanzi: window.inkbox.world.busanzi });');

  await browser.js("document.getElementById('inkBusanziPortrait').click(); return true;");
  assert(await browser.waitFor('return window.inkbox.busanziViewer.state.opened === true', { timeoutMs: 30000 }), '点击肖像必须打开 Viewer');
  assert.equal(await browser.js('return window.inkbox.busanziViewer.ready();'), true, 'Viewer 必须加载成功');
  assert.equal(await browser.js('return window.inkbox.busanziViewerReady;'), true, 'window.inkbox.busanziViewerReady 必须可等待并 resolve true');
  report.game.canvas.viewer = await browser.js(`
    const api = window.inkbox.busanziViewer;
    return {
      state: { ...api.state },
      metrics: api.metrics(),
      canvas: Boolean(document.querySelector('.busanzi-viewer canvas')),
      viewerReadyFlag: typeof window.inkbox.busanziViewerReady?.then === 'function',
    };
  `);
  assert.equal(report.game.canvas.viewer.state.ready, true, 'Viewer state.ready 必须为 true');
  assert.equal(report.game.canvas.viewer.state.activeClip, 'Idle', 'Viewer 首开必须是 Idle');
  assert.equal(report.game.canvas.viewer.metrics.mixerRunning, true, 'Viewer mixer 必须在跑');
  assert.equal(report.game.canvas.viewer.canvas, true, 'Viewer 必须有独立 canvas');
  assert.equal(report.game.canvas.viewer.viewerReadyFlag, true, 'window.inkbox.busanziViewerReady 必须可 await');
  assert.equal(report.game.canvas.viewer.metrics.textures >= 1, true, 'Viewer 必须真的上传了调色板贴图');
  await browser.screenshot(path.join(output, 'viewer_idle.png'));

  const walk = await browser.js("return window.inkbox.busanziViewer.play('Walk');");
  assert.equal(walk, 'Walk', 'Viewer.play(Walk) 必须切到 Walk');
  await sleep(600);
  report.game.canvas.viewerAfterWalk = await browser.js('return window.inkbox.busanziViewer.metrics();');
  assert.equal(report.game.canvas.viewerAfterWalk.activeClip, 'Walk', 'Viewer 必须停在 Walk');
  assert.equal(report.game.canvas.viewerAfterWalk.mixerRunning, true, '切换后 mixer 必须继续跑');
  await browser.screenshot(path.join(output, 'viewer_walk.png'));

  await browser.js("return window.inkbox.busanziViewer.play('Idle');");
  await sleep(500);
  const canvasIdleProbe = await browser.js(`return window.inkbox.busanziViewer.viewer.probe(${JSON.stringify([...WIND_BONES, ...BODY_BONES])});`);
  await browser.js("return window.inkbox.busanziViewer.play('Wind');");
  await sleep(520);
  const canvasWindProbe = await browser.js(`return window.inkbox.busanziViewer.viewer.probe(${JSON.stringify([...WIND_BONES, ...BODY_BONES])});`);
  report.game.canvas.windDeltas = windDeltas(canvasIdleProbe, canvasWindProbe);
  assertWindVisible(report.game.canvas.windDeltas, 'game-viewer');
  await browser.screenshot(path.join(output, 'viewer_wind.png'));
  // 风起是可演示的：约 2.75s 后自动淡回 Idle（不伪造天气/风级）。
  await sleep(2900);
  report.game.canvas.windAutoReturn = await browser.js('return window.inkbox.busanziViewer.state.activeClip;');
  assert.equal(report.game.canvas.windAutoReturn, 'Idle', '风起结束后必须自动淡回 Idle');

  // Esc 关闭：先被 Viewer 捕获，不传给游戏的 Escape 分层。
  await browser.key('escape');
  assert(await browser.waitFor('return window.inkbox.busanziViewer.state.opened === false && !document.querySelector(".busanzi-viewer")', { timeoutMs: 10000 }), 'Esc 必须关闭 Viewer 并移除 DOM');
  report.game.canvas.afterClose = await browser.js(`
    const k = window.inkbox;
    return {
      viewerState: { ...k.busanziViewer.state },
      viewerReadyIsThenable: typeof k.busanziViewerReady?.then === 'function',
      gameCanvas: Boolean(document.getElementById('inkCanvas')),
      worldStable: JSON.stringify({ day: k.world.day, entities: k.world.entities.length, busanzi: k.world.busanzi }),
      fps: k.fps,
    };
  `);
  assert.equal(report.game.canvas.afterClose.gameCanvas, true, '关闭 Viewer 后游戏画布必须还在');
  assert.equal(report.game.canvas.afterClose.viewerState.ready, false, '关闭后 Viewer 必须报告未就绪');
  assert.equal(report.game.canvas.afterClose.worldStable, worldBefore, '打开/关闭 Viewer 不得改世界（严格只读）');
  assert.equal(await browser.js('return window.inkbox.busanziViewer.ready();'), false, '关闭后 ready() 必须立即返回 false');
  report.game.canvas.viewerReadyAfter = await browser.js('return window.inkbox.busanziViewer.ready();');

  // 折叠 / 展开仍然可用
  report.game.canvas.collapse = await browser.js(`
    const button = document.getElementById('inkBusanziToggle');
    button.click();
    const collapsed = document.getElementById('inkBusanzi').classList.contains('is-collapsed');
    button.click();
    return { collapsed, expandedAgain: !document.getElementById('inkBusanzi').classList.contains('is-collapsed') };
  `);
  assert.equal(report.game.canvas.collapse.collapsed, true, '折叠按钮必须仍然生效');
  assert.equal(report.game.canvas.collapse.expandedAgain, true, '再点一次必须展开');

  // 换世界必须自动关闭 Viewer（释放独立 renderer / 贴图）
  await browser.js('return window.inkbox.busanziViewer.open();');
  assert(await browser.waitFor('return window.inkbox.busanziViewer.state.ready === true', { timeoutMs: 30000 }), 'Viewer 必须能重新打开（关闭后资源已释放，重新加载）');
  await browser.js("window.inkbox.newWorld('small', 20261111); return true;");
  assert(await browser.waitFor('return window.inkbox.busanziViewer.state.opened === false && !document.querySelector(".busanzi-viewer")', { timeoutMs: 10000 }), '换世界必须自动关闭 Viewer');
  report.game.canvas.worldSwitch = { closed: true };
  const canvasErrors = browser.errors();
  assert.deepEqual(canvasErrors, [], `Canvas 游戏页面不允许运行时报错：${canvasErrors.join(' | ')}`);

  // ── ⑥ 游戏（Three）：3D 模式下同样能开/关 Viewer，主 renderer 不受影响 ──
  await browser.cdp.send('Page.navigate', { url: `${base}/inkbox.html?renderer=3d` });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer', { timeoutMs: 30000 }), '3D 模式必须启动主 Renderer3D');
  report.game.three.before = await browser.js(`
    const k = window.inkbox;
    k.setSpeed(0);
    k.refreshBusanzi();
    const canvas = document.getElementById('inkCanvas3D');
    const renderer = k.render3d.renderer;
    return {
      canvas: Boolean(canvas),
      hidden: Boolean(canvas?.hidden),
      geometries: renderer.gpu.info.memory.geometries,
      textures: renderer.gpu.info.memory.textures,
      calls: renderer.gpu.info.render.calls,
    };
  `);
  assert.equal(report.game.three.before.canvas, true, '3D 模式必须有独立主画布');
  assert.equal(report.game.three.before.hidden, false, '3D 主画布必须可见');
  await browser.screenshot(path.join(output, 'panel_three.png'));
  await browser.js("document.getElementById('inkBusanziPortrait').click(); return true;");
  assert(await browser.waitFor('return window.inkbox.busanziViewer.state.ready === true', { timeoutMs: 30000 }), '3D 模式下 Viewer 必须能打开');
  await sleep(400);
  report.game.three.withViewer = await browser.js(`
    const k = window.inkbox;
    const main = k.render3d.renderer;
    const api = k.busanziViewer;
    return {
      viewerClip: api.state.activeClip,
      viewerMetrics: api.metrics(),
      mainCanvas: Boolean(document.getElementById('inkCanvas3D')),
      mainContextLost: main.gpu.getContext().isContextLost(),
      mainGeometries: main.gpu.info.memory.geometries,
      mainTextures: main.gpu.info.memory.textures,
      active: k.render3d.active,
    };
  `);
  assert.equal(report.game.three.withViewer.viewerClip, 'Idle', '3D 模式下 Viewer 必须播 Idle');
  assert.equal(report.game.three.withViewer.mainContextLost, false, 'Viewer 打开时主 renderer 上下文不能丢');
  assert.equal(report.game.three.withViewer.active, true, '3D 模式必须仍是激活状态');
  await browser.screenshot(path.join(output, 'viewer_in_3d.png'));

  await browser.js("document.querySelector('.busanzi-viewer .bv-close').click(); return true;");
  assert(await browser.waitFor('return window.inkbox.busanziViewer.state.opened === false', { timeoutMs: 10000 }), '3D 模式下关窗必须生效');
  await sleep(300);
  report.game.three.afterClose = await browser.js(`
    const k = window.inkbox;
    const main = k.render3d.renderer;
    return {
      mainCanvas: Boolean(document.getElementById('inkCanvas3D')),
      mainContextLost: main.gpu.getContext().isContextLost(),
      geometries: main.gpu.info.memory.geometries,
      textures: main.gpu.info.memory.textures,
      viewerDom: Boolean(document.querySelector('.busanzi-viewer')),
      viewerState: { ...k.busanziViewer.state },
    };
  `);
  assert.equal(report.game.three.afterClose.mainCanvas, true, '关闭 Viewer 后 3D 主画布必须还在');
  assert.equal(report.game.three.afterClose.mainContextLost, false, '关闭 Viewer 后主 renderer 上下文不能丢');
  assert.equal(report.game.three.afterClose.viewerDom, false, '关闭 Viewer 后 DOM 必须移除');
  assert(report.game.three.afterClose.geometries <= report.game.three.before.geometries + 2, '开关 Viewer 不得让主 renderer 几何体累积');
  assert(report.game.three.afterClose.textures <= report.game.three.before.textures + 2, '开关 Viewer 不得让主 renderer 贴图累积');
  await browser.screenshot(path.join(output, 'game_3d_after_viewer.png'));

  const threeErrors = browser.errors();
  assert.deepEqual(threeErrors, [], `3D 游戏页面不允许运行时报错：${threeErrors.join(' | ')}`);

  // ── ⑦ 加载失败兜底：故意拦掉 GLB，Viewer 只报错、不阻断游戏 ─────────────
  // 这一段会故意产生网络错误日志，所以放在所有「无控制台报错」断言之后。
  await browser.cdp.send('Network.enable');
  await browser.cdp.send('Network.setBlockedURLs', { urls: ['*busanzi.glb*'] });
  await browser.cdp.send('Page.navigate', { url: `${base}/inkbox.html` });
  assert(await browser.waitFor('return !!window.inkbox?.world && !!window.inkbox?.busanziViewer', { timeoutMs: 30000 }), '拦截 GLB 后游戏仍必须能启动');
  await browser.js("window.inkbox.setSpeed(0); window.inkbox.refreshBusanzi(); document.getElementById('inkBusanziPortrait').click(); return true;");
  assert(await browser.waitFor('return window.inkbox.busanziViewer.state.opened === true && window.inkbox.busanziViewer.state.loading === false', { timeoutMs: 20000 }), '加载失败必须落定为错误态（而不是永远加载中）');
  report.game.failurePath = await browser.js(`
    const k = window.inkbox;
    const state = { ...k.busanziViewer.state };
    return {
      state,
      errorShown: document.querySelector('.bv-error')?.hidden === false,
      retryButton: Boolean(document.querySelector('.bv-retry')),
      gameCanvas: Boolean(document.getElementById('inkCanvas')),
      gameWorld: Boolean(k.world),
      loadingHidden: document.querySelector('.bv-loading')?.hidden === true,
    };
  `);
  assert.equal(typeof report.game.failurePath.state.error, 'string', '加载失败必须记录可读错误');
  assert.equal(report.game.failurePath.state.ready, false, '加载失败时 ready 必须为 false');
  assert.equal(report.game.failurePath.errorShown, true, '加载失败必须在小窗内显示错误');
  assert.equal(report.game.failurePath.retryButton, true, '加载失败必须给出重试入口');
  assert.equal(report.game.failurePath.loadingHidden, true, '加载失败后不能停在 loading');
  assert.equal(report.game.failurePath.gameCanvas, true, '加载失败不得影响游戏画布');
  assert.equal(report.game.failurePath.gameWorld, true, '加载失败不得影响世界');
  await browser.key('escape');
  assert(await browser.waitFor('return window.inkbox.busanziViewer.state.opened === false && !document.querySelector(".busanzi-viewer")', { timeoutMs: 8000 }), '加载失败态也必须能 Esc 关闭');
  await browser.cdp.send('Network.setBlockedURLs', { urls: [] });

  report.pass = true;
  console.log('\nT2 busanzi real-browser acceptance passed (lab + Canvas + Three + failure fallback).');
} catch (error) {
  report.pass = false;
  report.errors.push(error.stack || String(error));
  process.exitCode = 1;
  console.error(error.stack || error);
} finally {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close();
  if (server) { server.kill(); await sleep(200); }
}
