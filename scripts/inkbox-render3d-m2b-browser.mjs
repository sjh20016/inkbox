#!/usr/bin/env node
// Render3D M2-B browser evidence collector（§41 / §75 / §81 / §82 / §83 / §101）。
//
// 用仓库自带的零依赖 CDP 驱动跑本机 Edge。产出：
//   · 17 张视觉矩阵截图（§81）
//   · 浏览器拾取读数（§75：Upper / Nether 各 80+，外加界缘采样）
//   · 性能读数（§82 / §83）
//   · m2b-browser-evidence.json
//
// ⚠️ 证据脚本**不修改产品代码**：它只驱动真实 UI / 真实指针事件，
//    需要布置场景时走公开运行时状态（`s.selection` / `r.setBoundaryMode`），
//    与 M2-A 的浏览器脚本同款。
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep, findBrowser } from './cdp.mjs';

const BASE = process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html';
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}renderer=3d&assets=off`;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/release/render3d-m2b');
const SEED = Number(process.env.INKBOX_M2B_SEED || 20260930);
const EDGE = findBrowser([
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].filter(Boolean));
if (!EDGE) throw new Error('M2-B 浏览器证据需要本机 Microsoft Edge / Chrome。');
fs.mkdirSync(OUT, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  stage: 'Render3D M2-B browser evidence',
  request: { url: URL, browser: EDGE, seed: SEED },
  environment: {}, world: {}, screenshots: [], drawnRegion: null,
  picking: {}, boundary: {}, performance: {}, runtimeErrors: [],
};

const session = await launch({ url: URL, browser: EDGE, width: 1500, height: 940, gpu: true });
const capture = async (name, metadata = {}) => {
  const file = path.join(OUT, name);
  await session.screenshot(file);
  evidence.screenshots.push({ file: path.relative(process.cwd(), file).replaceAll('\\', '/'), ...metadata });
  console.log(`  screenshot ${name}`);
};

const camera = async ({ yaw = 0, polar = Math.PI / 4, zoom = 1 }) => session.js(`
  const r = window.inkbox.render3d.renderer, rig = r.cameraRig, w = window.inkbox.world;
  const distance = Math.max(w.w, w.h) * 2.15;
  rig.controls.target.set(0, 0, 0);
  rig.camera.position.set(Math.sin(${yaw}) * distance * Math.sin(${polar}),
    Math.cos(${polar}) * distance, Math.cos(${yaw}) * distance * Math.sin(${polar}));
  rig.camera.zoom = ${zoom}; rig.camera.updateProjectionMatrix(); rig.controls.update(); rig.camera.updateMatrixWorld(true);
  return { position: rig.camera.position.toArray(), zoom: rig.camera.zoom };
`);

/** 用公开运行时状态布置一个 Region（不是玩家动作；手绘那一张走真实指针）。 */
const setRegion = async (toolId, points) => session.js(`
  const s = window.inkbox, r = s.render3d.renderer;
  const path = ${JSON.stringify(points)};
  const xs = path.map(p => p[0]), ys = path.map(p => p[1]);
  s.speedIndex = 0; s.selectTool('${toolId}');
  s.selection = { path, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys),
    area: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) };
  s.dirty = true;
  r.setRealmViewState(s.getRealmViewState());
  return { open: r.realmPrototype.open, targetPlane: r.realmPrototype.targetPlane, boundaryEdges: r.boundary?.stats.edges ?? 0 };
`);

const closeView = async () => session.js(`
  const s = window.inkbox, r = s.render3d.renderer;
  s.selectTool('inspect'); s.selection = null; s.dirty = true;
  r.setRealmViewState(s.getRealmViewState());
  return { open: r.realmPrototype.open };
`);

const setMode = async mode => session.js(`return window.inkbox.render3d.renderer.setBoundaryMode('${mode}');`);

/** §83 的读数快照。 */
const snapshot = async () => session.js(`
  const r = window.inkbox.render3d.renderer;
  const stageInfo = stage => ({ visible: stage.visible, terrainVisible: !!stage.terrain?.mesh.visible,
    submittedTriangles: Math.floor((stage.terrain?.geometry.drawRange.count ?? (stage.terrain?.geometry.index?.count || 0)) / 3),
    entities: stage.entities?.stats.instances ?? 0,
    waterQuads: stage.water ? Math.floor(stage.water.geometry.drawRange.count / 6) : 0,
    trees: stage.vegetation ? stage.vegetation.mesh.count : 0,
    buildings: stage.settlements ? stage.settlements.stats.buildings : 0,
    markers: stage.markers ? stage.markers.stats.total : 0,
    bufferBytes: (() => { let n = 0;
      stage.root.traverse(o => { const g = o.geometry; if (!g) return;
        for (const a of Object.values(g.attributes || {})) n += a.array?.byteLength || 0;
        if (g.index) n += g.index.array?.byteLength || 0; });
      return n; })() });
  return {
    activePlane: r.activePlane, maskOpen: r.realmPrototype.open, targetPlane: r.realmPrototype.targetPlane,
    boundaryMode: r.boundaryMode, visiblePlanes: [...r.stages].filter(([,s]) => s.visible).map(([p]) => p),
    updatedPlanes: [...(r.updatedPlanes || [])],
    stages: Object.fromEntries([...r.stages].map(([p, s]) => [p, stageInfo(s)])),
    drawCalls: r.gpu.info.render.calls, triangles: r.gpu.info.render.triangles,
    memory: { ...r.gpu.info.memory },
    profile: { ...r.profile }, updateMs: r.updateMs,
    metrics: { ...r.debug.metrics },
    boundary: { ...(r.boundary?.stats || {}) },
    realmMode: r.boundaryMode,
    strataField: r.boundaryField ? { band: r.boundaryField.band, ...r.boundaryField.stats } : null,
  };
`);

try {
  const ready = await session.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 });
  if (!ready) throw new Error(`Render3D 未就绪：${session.errors().slice(0, 4).join(' | ')}`);

  evidence.environment = await session.js(`
    const r = window.inkbox.render3d.renderer, gl = r.gpu.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { browser: navigator.userAgent,
      gpuRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      webglVersion: gl.getParameter(gl.VERSION),
      viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, pixelRatioUsed: r.gpu.getPixelRatio() };
  `);
  evidence.environment.softwareRasterizer = /basic render|swiftshader|llvmpipe|software|mesa offscreen/i.test(String(evidence.environment.gpuRenderer));
  evidence.environment.realGpu = !evidence.environment.softwareRasterizer;
  console.log(`GPU ${evidence.environment.gpuRenderer} (${evidence.environment.softwareRasterizer ? 'software' : 'hardware/unknown'})`);

  // ── 世界与相机（与 §41 的「同一 seed / 同一区域 / 同一相机」一致）──
  // `await import` 必须待在 async IIFE 里（页面脚本不是模块顶层）。
  evidence.world = await session.js(`
    return (async () => {
      const s = window.inkbox;
      s.newWorld('small', ${SEED}); s.speedIndex = 0; s.advanceDays(10);
      const { spawnNetherGhost } = await import('./src/inkbox/sim/netherLife.js');
      for (let i = 0; i < 48; i += 1) spawnNetherGhost(s.world.nether, { kind: 'ghost', decayYears: 10 });
      const w = s.world;
      return { preset: 'small', seed: ${SEED}, size: [w.w, w.h], days: w.day, entities: w.entities.length,
        netherEntities: w.nether.entities.length, note: 'small seeded world, 10 simulated days, +48 nether probes' };
    })();
  `);
  await camera({ yaw: 0, polar: 0.2, zoom: 1 });
  await sleep(260);
  await capture('01-mortal.png', { view: 'mortal', maskOpen: false, camera: 'overhead' });

  // ── 02：**真实指针手绘**一扇上界窗（§50 / §101-14）──
  //
  // ⚠️ 两个坑（第一次采集时踩到）：
  //   ① `cdp.mjs` 的 `mouseMove()` 固定发 `buttons: 0`。按下之后再这么发，
  //      Chromium 会认为按键已松开 ⇒ `lostpointercapture` ⇒ `endStroke()` 取消划窗。
  //      拖拽期间必须自己发 `buttons: 1`。
  //   ② 面板 `#inkRender3DTools` 覆盖在画布上方，落在它下面的像素收不到事件。
  //      先用 `elementFromPoint` 确认每个拖拽点真的打在 3D 画布上。
  const dragMove = async (x, y) => {
    await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await sleep(16);
  };
  const drawRegion = async (toolId, box2d) => {
    await session.js(`
      const s = window.inkbox;
      s.render3d.mode = '${toolId}'; s.selectTool('${toolId}');
      s.selection = null; s.dirty = true;
      const c = document.getElementById('inkCanvas3D');
      window.__m2bProbe = { down: 0, move: 0, up: 0, cancel: 0, maxPath: 0, isView: null };
      if (!window.__m2bProbeBound) {
        window.__m2bProbeBound = true;
        c.addEventListener('pointerdown', () => { window.__m2bProbe.down += 1; window.__m2bProbe.isView = s.render3d.isViewMode(); }, true);
        c.addEventListener('pointermove', () => { window.__m2bProbe.move += 1;
          const rd = s.render3d.realmDraw; if (rd) window.__m2bProbe.maxPath = Math.max(window.__m2bProbe.maxPath, rd.path.length); }, true);
        c.addEventListener('pointerup', () => { window.__m2bProbe.up += 1; }, true);
        c.addEventListener('lostpointercapture', () => { window.__m2bProbe.cancel += 1; }, true);
      }
      return true;
    `);
    const box = await session.js(`const c = document.getElementById('inkCanvas3D').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height };`);
    const points = box2d.map(([fx, fy]) => [box.x + box.w * fx, box.y + box.h * fy]);
    evidence.drawnRegionHitTest = await session.js(`
      const pts = ${JSON.stringify(points)};
      return pts.map(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? (el.id || el.tagName) : null; });
    `);
    await session.mouseMove(points[0][0], points[0][1]);
    await session.mouseDown(points[0][0], points[0][1]);
    await sleep(30);
    for (let i = 1; i < points.length; i += 1) await dragMove(points[i][0], points[i][1]);
    await dragMove(points[0][0] + 1, points[0][1] + 1);
    await session.mouseUp(points[0][0] + 1, points[0][1] + 1);
    await sleep(260);
    return session.js(`const s = window.inkbox, r = s.render3d.renderer;
      return { open: r.realmPrototype.open, targetPlane: r.realmPrototype.targetPlane,
        probe: window.__m2bProbe,
        region: s.selection ? { x0: s.selection.x0, y0: s.selection.y0, x1: s.selection.x1, y1: s.selection.y1, pathLength: (s.selection.path || []).length } : null,
        boundaryEdges: r.boundary?.stats.edges ?? 0 };`);
  };
  evidence.drawnRegion = await drawRegion('viewUpper', [[0.30, 0.34], [0.60, 0.28], [0.70, 0.56], [0.44, 0.68], [0.26, 0.54]]);
  if (!evidence.drawnRegion.open) {
    // 换一片更大的手势区域再试一次（面板下方更稳妥）
    evidence.drawnRegionRetry = await drawRegion('viewUpper', [[0.22, 0.42], [0.66, 0.36], [0.78, 0.62], [0.40, 0.76], [0.18, 0.62]]);
    if (evidence.drawnRegionRetry.open) evidence.drawnRegion = evidence.drawnRegionRetry;
  }
  // 手绘结果决定后面所有脚本布置的窗口位置（保证「同一区域」）
  const drawn = evidence.drawnRegion.region || { x0: 12, y0: 8, x1: 34, y1: 26 };
  const RECT = [[drawn.x0, drawn.y0], [drawn.x1, drawn.y0], [drawn.x1, drawn.y1], [drawn.x0, drawn.y1]];
  await capture('02-upper-small.png', { view: 'realm-window', targetPlane: 'upper', drawn: true, camera: 'overhead' });

  const w = await session.js('return { w: window.inkbox.world.w, h: window.inkbox.world.h };');
  const bigRect = [[Math.round(w.w * 0.18), Math.round(w.h * 0.16)], [Math.round(w.w * 0.78), Math.round(w.h * 0.16)],
    [Math.round(w.w * 0.78), Math.round(w.h * 0.70)], [Math.round(w.w * 0.18), Math.round(w.h * 0.70)]];
  const concave = [[Math.round(w.w * 0.16), Math.round(w.h * 0.14)], [Math.round(w.w * 0.72), Math.round(w.h * 0.14)],
    [Math.round(w.w * 0.72), Math.round(w.h * 0.44)], [Math.round(w.w * 0.40), Math.round(w.h * 0.44)],
    [Math.round(w.w * 0.40), Math.round(w.h * 0.78)], [Math.round(w.w * 0.16), Math.round(w.h * 0.78)]];
  const mapEdge = [[0, 0], [Math.round(w.w * 0.34), 0], [Math.round(w.w * 0.34), Math.round(w.h * 0.34)], [0, Math.round(w.h * 0.34)]];

  await setRegion('viewUpper', bigRect); await sleep(220);
  await capture('03-upper-large.png', { view: 'realm-window', targetPlane: 'upper', camera: 'overhead' });
  await setRegion('viewNether', RECT); await sleep(220);
  await capture('04-nether-small.png', { view: 'realm-window', targetPlane: 'nether', camera: 'overhead' });
  await setRegion('viewNether', bigRect); await sleep(220);
  await capture('05-nether-large.png', { view: 'realm-window', targetPlane: 'nether', camera: 'overhead' });

  await setRegion('viewUpper', bigRect);
  await camera({ yaw: 0, polar: Math.PI / 4, zoom: 1 }); await sleep(220);
  await capture('06-upper-oblique.png', { view: 'realm-window', targetPlane: 'upper', camera: 'oblique-45' });
  await setRegion('viewNether', bigRect); await sleep(200);
  await capture('07-nether-oblique.png', { view: 'realm-window', targetPlane: 'nether', camera: 'oblique-45' });
  await camera({ yaw: 0, polar: 1.18, zoom: 1.08 }); await sleep(200);
  await capture('09-nether-low-angle.png', { view: 'realm-window', targetPlane: 'nether', camera: 'low-angle' });
  await setRegion('viewUpper', bigRect);
  await camera({ yaw: 0, polar: 1.18, zoom: 1.08 }); await sleep(200);
  await capture('08-upper-low-angle.png', { view: 'realm-window', targetPlane: 'upper', camera: 'low-angle' });

  await camera({ yaw: 0, polar: 0.42, zoom: 1 });
  await setRegion('viewUpper', concave); await sleep(220);
  await capture('10-concave-region.png', { view: 'realm-window', targetPlane: 'upper', shape: 'concave' });
  await setRegion('viewUpper', mapEdge); await sleep(220);
  await capture('11-map-edge-region.png', { view: 'realm-window', targetPlane: 'upper', shape: 'map-edge' });

  // ── 12–15：Raw / Strata × Upper / Nether（同 seed / 同区域 / 同相机，§41）──
  evidence.boundary.rawStrata = {};
  const SHOT_NAMES = {
    'upper-raw': '12-boundary-raw-upper.png',
    'upper-strata': '13-boundary-strata-upper.png',
    'nether-raw': '14-boundary-raw-nether.png',
    'nether-strata': '15-boundary-strata-nether.png',
  };
  for (const [target, toolId] of [['upper', 'viewUpper'], ['nether', 'viewNether']]) {
    for (const mode of ['raw', 'strata']) {
      await setRegion(toolId, bigRect);
      await setMode(mode);
      await camera({ yaw: 0, polar: 0.62, zoom: 1 });
      await sleep(240);
      await capture(SHOT_NAMES[`${target}-${mode}`], { view: 'boundary', targetPlane: target, mode, camera: 'oblique-34' });
      evidence.boundary.rawStrata[`${target}-${mode}`] = await snapshot();
    }
  }

  // ── 16：活跃裂缝破口 ──
  await setRegion('viewUpper', bigRect);
  await setMode('strata');
  await camera({ yaw: 0, polar: 0.62, zoom: 1 });
  evidence.boundary.breach = await session.js(`
    const s = window.inkbox, r = s.render3d.renderer;
    const region = s.selection;
    // 把一道活跃裂缝放在窗口边界上（证据场景布置，不是产品 API）
    s.world.rifts.push({ id: 99001, x: region.x0, y: Math.round((region.y0 + region.y1) / 2),
      strength: 9, openedDay: 0, age: 900, closedDay: -1, targetPlane: 'upper' });
    r.boundaryKey = null; r.applyView();
    return { rifts: s.world.rifts.length, stats: { ...r.boundary.stats } };
  `);
  await sleep(240);
  await capture('16-active-rift-breach.png', { view: 'boundary-breach', targetPlane: 'upper', mode: 'strata' });

  // ── 17：界缘检视（真实点击界缘）──
  const boundaryPixel = await session.js(`
    const s = window.inkbox, r = s.render3d.renderer;
    const c = document.getElementById('inkCanvas3D').getBoundingClientRect();
    // 从画布下半部开始扫：上面被工具面板盖住，落在面板下的像素点不到画布。
    for (let gy = 0; gy < 44; gy += 1) for (let gx = 0; gx < 64; gx += 1) {
      const x = c.width * (0.04 + 0.92 * gx / 63), y = c.height * (0.36 + 0.56 * gy / 43);
      const hit = r.pick(x, y);
      if (hit && hit.kind === 'realm-boundary') {
        const el = document.elementFromPoint(c.x + x, c.y + y);
        if (el && el.id === 'inkCanvas3D') return { x: c.x + x, y: c.y + y, hit, receiver: el.id };
      }
    }
    return null;
  `);
  evidence.boundary.inspect = boundaryPixel;
  if (boundaryPixel) {
    // ⚠️ 先把手绘那段留下的适配器 mode 收回 `inspect`。
    //    否则 pointerdown 会走「划窗」分支（`isViewMode()` 为真），而不是检视分支。
    //    只改适配器字段、**不**调 `selectTool`——后者会走「切换工具即关窗」出口，把窗口关掉。
    await session.js(`window.inkbox.render3d.mode = 'inspect'; return true;`);
    await session.click(boundaryPixel.x, boundaryPixel.y, 'left', 320);
    await sleep(220);
    evidence.boundary.inspectReadout = await session.js(`
      const el = document.getElementById('inkRender3DReadout');
      return { text: el ? el.textContent : null, selected: !!window.inkbox.render3d.selectedBoundary };
    `);
  }
  await capture('17-boundary-inspect.png', { view: 'boundary-inspect', clicked: !!boundaryPixel });

  // ── 拾取套件（§75：Upper / Nether 各 80+，外加界缘采样）──
  //
  // ⚠️ **自校准**：不假设相机把地图框满了。先粗扫找到「有命中的屏幕范围」，
  //    再在框内密集采样。第一次采集时直接按画布比例采样，78% 的点落在图外。
  const pickSuite = async () => session.js(`
    const s = window.inkbox, r = s.render3d.renderer;
    const c = document.getElementById('inkCanvas3D').getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, coarseHits = 0;
    for (let gy = 0; gy < 24; gy += 1) for (let gx = 0; gx < 32; gx += 1) {
      const x = c.width * (0.02 + 0.96 * gx / 31), y = c.height * (0.28 + 0.68 * gy / 23);
      if (!r.pick(x, y)) continue;
      coarseHits += 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const count = { mortal: 0, upper: 0, nether: 0, 'realm-boundary': 0, miss: 0 };
    if (!coarseHits) return { samples: 0, coarseHits: 0, count, visibleMismatch: 0, visibleGeometryWins: false, note: '粗扫零命中' };
    let visibleMismatch = 0, samples = 0;
    // 粗扫框是**方形包围盒**，而地图在屏幕上是个梯形 ⇒ 框角仍会落空。
    // 所以密集采样要比「刚够 80」更密一档（§75 要求 Upper / Nether 各 80+）。
    for (let gy = 0; gy < 26; gy += 1) for (let gx = 0; gx < 44; gx += 1) {
      const x = minX + (maxX - minX) * gx / 43, y = minY + (maxY - minY) * gy / 25;
      const hit = r.pick(x, y); samples += 1;
      if (!hit) { count.miss += 1; continue; }
      if (hit.kind === 'realm-boundary') { count['realm-boundary'] += 1; continue; }
      count[hit.plane] = (count[hit.plane] || 0) + 1;
      const stage = r.stages.get(hit.plane);
      if (!stage?.visible || !stage.terrain?.mesh.visible) visibleMismatch += 1;
    }
    return { samples, coarseHits, bounds: { minX, minY, maxX, maxY }, count, visibleMismatch,
      visibleGeometryWins: visibleMismatch === 0,
      region: s.selection ? { x0: s.selection.x0, y0: s.selection.y0, x1: s.selection.x1, y1: s.selection.y1 } : null };
  `);
  evidence.picking = {};
  for (const [target, toolId] of [['upper', 'viewUpper'], ['nether', 'viewNether']]) {
    await setRegion(toolId, bigRect);
    // 相机必须真的框住地图，否则采样点大多落空（第一次采集 308 点里 239 点 miss）。
    await session.js('return window.inkbox.render3d.renderer.cameraRig.fit()');
    await sleep(260);
    evidence.picking[target] = await pickSuite();
  }
  // §75 的判据写进证据本身，别让「80+」只活在人的记忆里。
  evidence.pickingRequirements = {
    rule: '§75：Upper 80+ / Nether 80+，且 visible geometry === returned hit',
    upperHits: evidence.picking.upper?.count.upper ?? 0,
    netherHits: evidence.picking.nether?.count.nether ?? 0,
    visibleGeometryWins: evidence.picking.upper?.visibleGeometryWins === true && evidence.picking.nether?.visibleGeometryWins === true,
    boundarySamples: (evidence.picking.upper?.count['realm-boundary'] ?? 0) + (evidence.picking.nether?.count['realm-boundary'] ?? 0),
  };
  evidence.pickingRequirements.met = evidence.pickingRequirements.upperHits >= 80
    && evidence.pickingRequirements.netherHits >= 80
    && evidence.pickingRequirements.visibleGeometryWins
    && evidence.pickingRequirements.boundarySamples > 0;
  console.log(`picking: upper=${evidence.pickingRequirements.upperHits} nether=${evidence.pickingRequirements.netherHits} boundary=${evidence.pickingRequirements.boundarySamples} met=${evidence.pickingRequirements.met}`);

  // ── 性能：closed / upper small / upper large / nether small / nether large（§82 / §83）──
  const measureOpen = async (label, toolId, points, repeat) => {
    await closeView(); await session.js('return new Promise(requestAnimationFrame)');
    const started = await session.js('return performance.now()');
    await setRegion(toolId, points);
    const first = await session.js(`return new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())))`);
    await sleep(140);
    return { label, pass: repeat ? 'repeat-open' : 'first-open', firstCompletedFrameMs: first - started, state: await snapshot() };
  };
  evidence.performance = { closed: await (async () => { await closeView(); await sleep(160); return snapshot(); })(), openFrames: {} };
  for (const [label, toolId, points] of [['upper-small', 'viewUpper', RECT], ['upper-large', 'viewUpper', bigRect],
    ['nether-small', 'viewNether', RECT], ['nether-large', 'viewNether', bigRect]]) {
    evidence.performance.openFrames[label] = {
      first: await measureOpen(label, toolId, points, false),
      repeat: await measureOpen(label, toolId, points, true),
    };
  }
  await closeView();

  evidence.runtimeErrors = session.errors();
  evidence.status = 'passed';
  console.log(`M2-B browser evidence: ${evidence.screenshots.length} screenshots`);
} catch (error) {
  evidence.status = 'failed';
  evidence.error = String(error);
  evidence.runtimeErrors = session.errors();
  console.error(error);
} finally {
  fs.writeFileSync(path.join(OUT, 'm2b-browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  await session.close();
}
if (evidence.status !== 'passed') process.exitCode = 1;
