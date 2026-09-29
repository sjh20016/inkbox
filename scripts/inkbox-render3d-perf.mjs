#!/usr/bin/env node
// Inkbox Render3D 性能基线（M1.1D D5）
//
// ───────────────────────────────────────────────────────────────────────
// 这个脚本要解决什么问题
// ───────────────────────────────────────────────────────────────────────
//
// M1 留下的性能数字（large：2832 实体 · 6 draw calls）采自 **软件光栅器**
// （`Microsoft Basic Render Driver`）。那组数字**不能当 M2 的性能依据**，
// 而且当时只记了「总 frame time」——知道慢，不知道**慢在哪**。
//
// 本脚本因此做三件事：
//   ① **记全环境**：浏览器 / GPU 渲染器 / 厂商 / WebGL 版本 / 视口 / DPR —— 没有这些，
//      任何 FPS 都不可比；
//   ② **逐层 profiling**：`bridgeScanMs` / `terrainUpdateMs` / `entityUpdateMs` /
//      `settlementUpdateMs` / `markerUpdateMs`，把 CPU 时间摊开；
//   ③ **输出 JSON**（不只是 console.log），落 `reports/render3d/perf-baseline.json`。
//
// ⚠️⚠️ **零依赖**：走同目录的 `scripts/cdp.mjs`（复用本机已装的 Edge / Chrome，
//    CDP 协议）。**不引 Playwright / Puppeteer**——那会让这个基线脚本在
//    大多数机器与 CI 上根本跑不起来，而「跑不起来」正是 M1 性能数据缺失的原因。
//
// ⚠️ **软件光栅器不算失败**（D5.4）：云环境 / CI 天然没有显卡。脚本会如实写出
//    `softwareRasterizer: true`，报告里也必须照抄这句话：
//    「当前仍运行于软件光栅器，性能结论只作为相对数据。」
//
// 用法：
//   npm run dev                                   # 另开一个终端起服务器（4180）
//   npm run test:render3d:perf                    # 默认 3 个预设 × 3 个阶段
//   INKBOX_PERF_GPU=1 npm run test:render3d:perf  # 试真显卡（读数与默认不可比！）
//   INKBOX_PERF_FRAMES=60 npm run test:render3d:perf
//
// 退出码 0 = 采集完成且帧循环活着；非 0 = 帧循环死了 / 有运行时报错。

import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const BASE = process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html';
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}renderer=3d`;
const OUT_DIR = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/render3d');
const FRAMES = Number(process.env.INKBOX_PERF_FRAMES || 120);
const USE_GPU = process.env.INKBOX_PERF_GPU === '1';
const PRESETS = (process.env.INKBOX_PERF_PRESETS || 'small,medium,large').split(',').map(s => s.trim()).filter(Boolean);

fs.mkdirSync(OUT_DIR, { recursive: true });

let failed = 0;
function assert(label, condition, detail = '') {
  if (condition) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); return true; }
  failed += 1; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); return false;
}

/** 在页面里数 `frames` 帧，把每帧的 metrics 全量带回（含 M1.1D 新增的逐层 ms）。 */
function sampler(frames, { moveCamera = false, running = false } = {}) {
  return `
    const k = window.inkbox, r = k.render3d.renderer;
    ${running ? 'k.setSpeed(2);' : 'k.speedIndex = 0;'}
    return new Promise((resolve) => {
      const samples = [];
      let previous = null;
      const tick = (t) => {
        if (previous !== null) {
          // 相机匀速环绕：真实玩家最常做、也最容易暴露「每帧重算」的操作。
          ${moveCamera ? 'r.cameraRig.rotate(Math.PI / 300);' : ''}
          samples.push({ ...r.debug.metrics, frameMs: t - previous, fps: 1000 / (t - previous) });
        }
        previous = t;
        if (samples.length >= ${frames}) resolve(samples);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  `;
}

/** 把一批样本压成「均值 + p95」，只保留我们关心的字段。 */
const NUMERIC = [
  'frameMs', 'fps', 'drawCalls', 'triangles', 'raycastMs', 'lastRaycastMs',
  'bridgeScanMs', 'scanMs', 'terrainUpdateMs', 'waterUpdateMs', 'vegetationUpdateMs',
  'entityUpdateMs', 'settlementUpdateMs', 'markerUpdateMs', 'layerUpdateMs', 'renderMs',
  'terrainVertices', 'treeInstances', 'entityInstances', 'houseInstances', 'markerInstances',
];

function summarize(samples) {
  const out = { frames: samples.length };
  for (const key of NUMERIC) {
    const values = samples.map(s => Number(s[key])).filter(Number.isFinite);
    if (!values.length) { out[key] = null; continue; }
    values.sort((a, b) => a - b);
    out[key] = {
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      p95: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))],
      max: values[values.length - 1],
    };
  }
  return out;
}

/** 造一个「近 3000 实体」的 large 世界（走真工厂 `life.spawn`，不手搓实体对象）。 */
const HEAVY = `
  const k = window.inkbox, w = k.world;
  function walkableNear(x, y, r) {
    for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
      const nx = Math.round(x) + dx, ny = Math.round(y) + dy;
      if (nx > 3 && ny > 3 && nx < w.w - 3 && ny < w.h - 3 && w.isWalkable(ny * w.w + nx)) return [nx, ny];
    }
    return null;
  }
  let made = 0;
  for (let i = 0; i < 60 && w.entities.length < 2950; i += 1) {
    const spot = walkableNear(16 + (i % 8) * 46, 16 + Math.floor(i / 8) * 40, 18);
    if (!spot) continue;
    const sp = i % 11 === 0 ? 'beast' : (i % 7 === 0 ? 'spirit' : 'human');
    made += k.life.spawn(spot[0], spot[1], sp, 70, 0);
  }
  return { made, entities: w.entities.length };
`;

const counts = () => `
  const k = window.inkbox, r = k.render3d.renderer, w = k.world;
  return {
    entityCount: w.entities.length,
    wraithCount: (w.wraiths || []).length,
    villageCount: w.villages.length,
    houseCount: r.settlements.stats.buildings,
    sectCount: w.factions.length,
    artifactCount: w.artifacts.length,
    siteCount: w.sites.length,
    leylineCount: w.leylines.length,
    riftCount: w.rifts.length,
    markerCount: r.markers.stats.total,
    entityInstances: r.entities.stats.instances,
  };
`;

const results = {
  generatedAt: new Date().toISOString(),
  stage: 'Render3D M1.1D',
  request: { url: URL, frames: FRAMES, presets: PRESETS, gpuFlag: USE_GPU },
  environment: {},
  maps: {},
  notes: [],
};

const session = await launch({ url: URL, width: 1500, height: 940, gpu: USE_GPU });
try {
  const ready = await session.waitFor(
    'return !!window.inkbox && !!window.inkbox.render3d && !!window.inkbox.render3d.renderer',
    { timeoutMs: 60000 },
  );
  if (!ready) throw new Error(`3D 适配器未就绪；控制台：${session.errors().slice(0, 3).join(' | ')}`);

  // ── 环境（D5.1）──────────────────────────────────────────────────
  results.environment = await session.js(`
    const r = window.inkbox.render3d.renderer, gl = r.gpu.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const canvas = r.canvas;
    return {
      userAgent: navigator.userAgent,
      browserVersion: navigator.userAgent.replace(/^.*(Edg|Chrome)\\/([0-9.]+).*$/, '$1/$2'),
      gpuRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      webglVersion: gl.getParameter(gl.VERSION),
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      viewport: [innerWidth, innerHeight],
      canvasSize: [canvas.width, canvas.height],
      dpr: devicePixelRatio,
      pixelRatioUsed: r.gpu.getPixelRatio(),
      // D5.1 的「vendor」一栏：**实测浏览器到底从哪个 URL 拉的 Three.js**，
      // 而不是照抄源码里的 importmap。少这一个，vendor 迁移就没被真正验证过。
      threeRuntimeUrl: (performance.getEntriesByType('resource').find(e => /three\.module\.js$/.test(e.name)) || {}).name || null,
    };
  `);
  const renderer = String(results.environment.gpuRenderer || '');
  results.environment.softwareRasterizer = /basic render|swiftshader|llvmpipe|software|mesa offscreen/i.test(renderer);
  if (results.environment.softwareRasterizer) {
    results.notes.push('当前仍运行于软件光栅器，性能结论只作为相对数据。');
  }

  console.log('\n═══ 环境 ═══');
  console.log(`  浏览器   ${results.environment.browserVersion}`);
  console.log(`  GPU      ${results.environment.gpuRenderer}`);
  console.log(`  厂商     ${results.environment.gpuVendor}`);
  console.log(`  WebGL    ${results.environment.webglVersion}`);
  console.log(`  视口     ${results.environment.viewport.join('×')} · DPR ${results.environment.dpr} · 画布像素比 ${results.environment.pixelRatioUsed}`);
  console.log(`  Three.js ${results.environment.threeRuntimeUrl || '（没抓到资源请求！）'}`);
  assert('Three.js 运行时确实从仓库内 vendor/ 加载（D6）',
    typeof results.environment.threeRuntimeUrl === 'string' && results.environment.threeRuntimeUrl.includes('/vendor/three/'),
    String(results.environment.threeRuntimeUrl));
  if (results.environment.softwareRasterizer) console.log('  ⚠️ 软件光栅器 —— 下面所有 FPS 只作**相对**数据，不是真实 GPU 性能。');

  for (const preset of PRESETS) {
    console.log(`\n═══ ${preset} ═══`);
    await session.js(`window.inkbox.newWorld('${preset}', 20260928); window.inkbox.speedIndex = 0; return true;`);
    const swapped = await session.waitFor('return window.inkbox.render3d.renderer.world === window.inkbox.world', { timeoutMs: 30000 });
    assert(`${preset}: 换世界后渲染器跟上了新世界`, swapped === true);
    await sleep(600);

    const phases = {};
    for (const [name, options] of [['static', {}], ['moving', { moveCamera: true }], ['running', { running: true }]]) {
      const samples = await session.js(sampler(FRAMES, options));
      phases[name] = summarize(samples);
      const s = phases[name];
      console.log(`  ${name.padEnd(8)} ${s.fps.mean.toFixed(1)} FPS · ${s.frameMs.mean.toFixed(2)} ms · ${s.drawCalls.mean.toFixed(1)} draws · 实体 ${s.entityInstances.mean.toFixed(0)} · 建筑 ${s.houseInstances.mean.toFixed(0)} · 标记 ${s.markerInstances.mean.toFixed(0)}`);
      console.log(`           逐层 ms：桥 ${s.bridgeScanMs.mean.toFixed(2)} · 地形 ${s.terrainUpdateMs.mean.toFixed(2)} · 水 ${s.waterUpdateMs.mean.toFixed(2)} · 植被 ${s.vegetationUpdateMs.mean.toFixed(2)} · 实体 ${s.entityUpdateMs.mean.toFixed(2)} · 建筑 ${s.settlementUpdateMs.mean.toFixed(2)} · 标记 ${s.markerUpdateMs.mean.toFixed(2)}`);
    }
    await session.js('window.inkbox.speedIndex = 0; return true;');
    results.maps[preset] = { counts: await session.js(counts()), phases };
    await session.screenshot(path.join(OUT_DIR, `perf-${preset}.png`));
  }

  // ── 高人口 large（D5.3 第四组）───────────────────────────────────
  console.log('\n═══ large · 高人口 ═══');
  await session.js(`window.inkbox.newWorld('large', 20260928); window.inkbox.speedIndex = 0; return true;`);
  await session.waitFor('return window.inkbox.render3d.renderer.world === window.inkbox.world', { timeoutMs: 30000 });
  const heavy = await session.js(HEAVY);
  await sleep(900);
  const heavyPhases = {};
  for (const [name, options] of [['static', {}], ['moving', { moveCamera: true }], ['running', { running: true }]]) {
    const samples = await session.js(sampler(FRAMES, options));
    heavyPhases[name] = summarize(samples);
    const s = heavyPhases[name];
    console.log(`  ${name.padEnd(8)} ${s.fps.mean.toFixed(1)} FPS · ${s.frameMs.mean.toFixed(2)} ms · ${s.drawCalls.mean.toFixed(1)} draws · 实体 ${s.entityInstances.mean.toFixed(0)}`);
  }
  await session.js('window.inkbox.speedIndex = 0; return true;');
  results.maps['large-heavy'] = { counts: await session.js(counts()), spawned: heavy, phases: heavyPhases };
  await session.screenshot(path.join(OUT_DIR, 'perf-large-heavy.png'));

  assert('高人口世界真的造出来了（> 2000 实体）', results.maps['large-heavy'].counts.entityCount > 2000,
    `${results.maps['large-heavy'].counts.entityCount} 实体`);
  assert('3000 实体不产生数千 draw call', heavyPhases.static.drawCalls.mean < 40, `${heavyPhases.static.drawCalls.mean.toFixed(1)} draws`);

  // ── 帧循环还活着吗（这是本脚本最容易静默失败的地方）───────────────
  const alive = await session.js(`
    window.__perfFrames = 0;
    if (!window.__perfHooked) {
      window.__perfHooked = true;
      const original = window.inkbox.frame.bind(window.inkbox);
      window.inkbox.frame = (ts) => { window.__perfFrames += 1; return original(ts); };
    }
    return new Promise((resolve) => setTimeout(() => resolve(window.__perfFrames), 1000));
  `);
  assert('帧循环仍在跑（不是静默死在某一帧）', alive > 5, `1 秒 ${alive} 帧`);
  assert('无浏览器运行时报错', session.errors().length === 0, session.errors().slice(0, 2).join(' | '));
} finally {
  await session.close();
}

fs.writeFileSync(path.join(OUT_DIR, 'perf-baseline.json'), JSON.stringify(results, null, 2));
console.log(`\n═══ 汇总 ═══`);
console.log(`  JSON → ${path.relative(process.cwd(), path.join(OUT_DIR, 'perf-baseline.json')).replaceAll('\\', '/')}`);
if (results.environment.softwareRasterizer) console.log('  ⚠️ 软件光栅器：只作相对数据。');
console.log(failed ? `✗ ${failed} 项失败` : '✓ 采集完成，全部检查通过');
if (failed) process.exitCode = 1;
