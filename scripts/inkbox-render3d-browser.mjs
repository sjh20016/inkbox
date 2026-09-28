// Optional QA runner: uses an existing Playwright installation, no runtime dependency.
// INKBOX_PLAYWRIGHT can point to a preinstalled playwright package directory.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.INKBOX_PLAYWRIGHT || 'playwright');
const output = process.env.INKBOX_REPORT_DIR || 'reports/render3d'; fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const base = process.env.INKBOX_URL || 'http://127.0.0.1:4181/inkbox.html';
const results = { browser: browser.version(), environment: {}, maps: {}, checks: [] };
const check = (label, value) => { assert(value, label); results.checks.push(label); console.log(`PASS ${label}`); };
try {
  await page.goto(`${base}?renderer=3d`);
  await page.waitForFunction(() => window.inkbox?.render3d?.renderer?.debug.metrics.fps > 0);
  await page.evaluate(() => { window.inkbox.speedIndex = 0; });
  results.environment = await page.evaluate(() => {
    const gl = window.inkbox.render3d.renderer.gpu.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, dpr: devicePixelRatio, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), width: innerWidth, height: innerHeight };
  });
  for (const preset of ['small', 'medium', 'large']) {
    await page.evaluate(preset => { const s = window.inkbox; s.newWorld(preset, 20260928); s.speedIndex = 0; }, preset);
    await page.waitForFunction(() => window.inkbox.render3d.renderer.world === window.inkbox.world);
    const box = await page.locator('#inkCanvas3D').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
    const data = await page.evaluate(async () => {
      const s = window.inkbox, r = s.render3d.renderer;
      const snapshot = () => JSON.stringify(s.world);
      const before = snapshot();
      const samples = [];
      let previous = await new Promise(requestAnimationFrame);
      for (let i = 0; i < 40; i++) {
        const timestamp = await new Promise(requestAnimationFrame), frameMs = timestamp - previous;
        previous = timestamp; samples.push({ ...r.debug.metrics, frameMs, fps: 1000 / frameMs });
      }
      const keys = ['frameMs', 'fps', 'raycastMs', 'terrainUpdateMs', 'scanMs', 'renderMs'];
      const means = Object.fromEntries(keys.map(key => [key, samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length]));
      const pure = snapshot() === before;
      means.fps = 1000 / means.frameMs;
      const { sculpt } = await import('./src/inkbox/render3d/terrain/sculpt.js');
      const saved = s.world.height.slice(), editSamples = [];
      for (let i = 0; i < 24; i++) {
        const start = performance.now();
        r.markTerrainDirty(sculpt(s.world, { x: s.world.w / 2 + i * 0.25, y: s.world.h / 2, radius: 6, mode: 'lower' }));
        r.update(1 / 60); r.render(); editSamples.push(performance.now() - start);
      }
      s.world.height.set(saved); s.world.touch(); r.update(0.2);
      editSamples.sort((a, b) => a - b);
      return { ...samples.at(-1), ...means, pure, sculptMeanMs: editSamples.reduce((a, b) => a + b, 0) / editSamples.length, sculptP95Ms: editSamples[Math.floor(editSamples.length * 0.95)] };
    });
    check(`${preset}: render/update does not mutate paused world`, data.pure);
    // Profile separately from the allocating whole-world purity snapshot above.
    await page.waitForTimeout(300);
    const steady = await page.evaluate(async () => {
      const adapter = window.inkbox.render3d, r = adapter.renderer, frames = [], movingFrames = [], queries = [];
      let previous = await new Promise(requestAnimationFrame);
      for (let i = 0; i < 90; i++) { const t = await new Promise(requestAnimationFrame); frames.push(t - previous); previous = t; }
      const rect = r.canvas.getBoundingClientRect();
      for (let i = 0; i < 90; i++) {
        adapter.pointer = { x: rect.left + r.width * 0.5 + Math.sin(i * 0.13) * 70, y: rect.top + r.height * 0.5 + Math.cos(i * 0.13) * 40 };
        const t = await new Promise(requestAnimationFrame); movingFrames.push(t - previous); previous = t;
      }
      for (let i = 0; i < 24; i++) { r.pick(r.width * 0.5 + i * 0.7, r.height * 0.5); queries.push(r.picker.timeMs); }
      return { frameMs: frames.reduce((a, b) => a + b, 0) / frames.length, movingFrameMs: movingFrames.reduce((a, b) => a + b, 0) / movingFrames.length, raycastMs: queries.reduce((a, b) => a + b, 0) / queries.length };
    });
    results.maps[preset] = { ...data, ...steady, fps: 1000 / steady.frameMs };
    await page.screenshot({ path: `${output}/${preset}.png` });
  }
  results.picking = await page.evaluate(async () => {
    const THREE = await import('three'), s = window.inkbox, r = s.render3d.renderer, w = s.world;
    // Sample inside each cell, away from shared triangle edges/vertex silhouettes.
    const targets = [[0.13, 0.19, 'corner'], [w.w - 1.13, 0.19, 'corner'], [0.13, w.h - 1.19, 'corner'], [w.w - 1.13, w.h - 1.19, 'corner']];
    let peak = 0, slope = 0, slopeIndex = 0;
    for (let i = w.w; i < w.size - w.w; i++) {
      if (w.height[i] > w.height[peak]) peak = i;
      const d = Math.abs(w.height[i] - w.height[i + w.w]);
      if (d > slope) { slope = d; slopeIndex = i; }
    }
    for (const [index, label] of [[peak, 'peak'], [slopeIndex, 'slope'], [w.type.findIndex(t => t === 5), 'plain'], [w.type.findIndex(t => t === 4), 'coast']]) if (index >= 0) targets.push([Math.min(w.w - 1.13, index % w.w + 0.13), Math.min(w.h - 1.19, Math.floor(index / w.w) + 0.19), label]);
    const { surfaceElevation } = await import('./src/inkbox/render3d/terrain/VisualElevation.js');
    let exact = 0, occluded = 0; const failures = [];
    for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) for (const polar of [0.27, 1.17]) {
      r.cameraRig.controls.target.set(0, 0, 0);
      r.cameraRig.camera.position.set(Math.sin(yaw) * 500 * Math.sin(polar), 500 * Math.cos(polar), Math.cos(yaw) * 500 * Math.sin(polar));
      r.cameraRig.controls.update();
      r.cameraRig.camera.updateMatrixWorld();
      for (const [x, y, label] of targets) {
        const p = r.coordinates.worldToRender(x, y, surfaceElevation(w, x, y));
        const q = new THREE.Vector3(p.x, p.y, p.z).project(r.cameraRig.camera);
        const hit = r.pick((q.x + 1) / 2 * r.width, (1 - q.y) / 2 * r.height);
        if (hit && hit.x === Math.round(x) && hit.y === Math.round(y)) exact++;
        else if (hit && hit.point.distanceTo(r.cameraRig.camera.position) < new THREE.Vector3(p.x, p.y, p.z).distanceTo(r.cameraRig.camera.position) - 0.05) occluded++;
        else failures.push({ yaw, polar, label, target: [x, y], point: p, hit: hit && [hit.x, hit.y], hitPoint: hit?.point, rayError: r.picker.raycaster.ray.distanceToPoint(new THREE.Vector3(p.x, p.y, p.z)), vertex: r.terrain.geometry.attributes.position.getY(Math.round(y) * w.w + Math.round(x)) });
      }
    }
    r.cameraRig.fit(); return { exact, occluded, failures };
  });
  check('corners, plains, slopes, peaks and coast at 8 camera poses', results.picking.failures.length === 0 && results.picking.exact >= 32);
  // Screen projections are used only as targets; actual editing goes through pointer events.
  const target = await page.evaluate(async () => {
    const THREE = await import('three'), s = window.inkbox, r = s.render3d.renderer;
    let index = -1;
    for (let i = 0; i < s.world.size; i += 13) {
      if (s.world.height[i] < 0.45 || s.world.height[i] > 0.8) continue;
      const point = r.coordinates.cellToRender(i % s.world.w, Math.floor(i / s.world.w), r.terrain.geometry.attributes.position.getY(i));
      const projected = new THREE.Vector3(point.x, point.y, point.z).project(r.cameraRig.camera);
      const hit = r.pick((projected.x + 1) / 2 * r.width, (1 - projected.y) / 2 * r.height);
      if (hit && hit.x === i % s.world.w && hit.y === Math.floor(i / s.world.w) && Math.abs(projected.x) < 0.65 && Math.abs(projected.y) < 0.5) { index = i; break; }
    }
    if (index < 0) throw new Error('No visible sculpt target');
    const p = r.coordinates.cellToRender(index % s.world.w, Math.floor(index / s.world.w), r.terrain.geometry.attributes.position.getY(index));
    const q = new THREE.Vector3(p.x, p.y, p.z).project(r.cameraRig.camera), rect = r.canvas.getBoundingClientRect();
    window.m0Before = { height: s.world.height.slice(), water: s.world.water.slice(), type: s.world.type.slice(), veg: s.world.veg.slice(), day: s.world.day };
    return { index, x: rect.left + (q.x + 1) / 2 * rect.width, y: rect.top + (1 - q.y) / 2 * rect.height, height: s.world.height[index] };
  });
  await page.getByLabel('沙盘工具').selectOption('raise');
  await page.mouse.move(target.x, target.y); await page.mouse.down();
  await page.waitForTimeout(180); await page.mouse.up();
  check('real pointer raises world.height only', await page.evaluate(index => {
    const w = window.inkbox.world, b = window.m0Before;
    return w.height[index] > b.height[index] && w.day === b.day && ['water', 'type', 'veg'].every(key => w[key].every((v, i) => v === b[key][i]));
  }, target.index));
  await page.getByRole('button', { name: '撤销雕刻', exact: true }).click();
  check('sculpt undo restores every height', await page.evaluate(() => window.inkbox.world.height.every((v, i) => v === window.m0Before.height[i])));
  for (const mode of ['lower', 'flatten', 'smooth']) {
    await page.getByLabel('沙盘工具').selectOption(mode);
    await page.mouse.move(target.x, target.y); await page.mouse.down(); await page.mouse.move(target.x + 25, target.y + 12, { steps: 8 }); await page.mouse.up();
    check(`${mode}: pointer stroke changes height`, await page.evaluate(() => window.inkbox.world.height.some((v, i) => v !== window.m0Before.height[i])));
    await page.getByRole('button', { name: '撤销雕刻', exact: true }).click();
  }
  const beforeToggle = await page.evaluate(() => JSON.stringify(window.inkbox.world));
  await page.getByRole('button', { name: '切回 Canvas', exact: true }).click();
  await page.waitForTimeout(100);
  check('same-world Canvas switch is pure', await page.evaluate(before => JSON.stringify(window.inkbox.world) === before && !window.inkbox.render3d.active, beforeToggle));
  await page.getByRole('button', { name: '进入 3D', exact: true }).click();
  await page.getByLabel('沙盘工具').selectOption('inspect');
  const startCamera = await page.evaluate(() => window.inkbox.render3d.renderer.cameraRig.camera.position.toArray());
  await page.locator('#inkCanvas3D').focus(); await page.keyboard.press('q');
  check('Q rotates camera', await page.evaluate(before => JSON.stringify(window.inkbox.render3d.renderer.cameraRig.camera.position.toArray()) !== JSON.stringify(before), startCamera));
  await page.keyboard.press('f');
  const rect = await page.locator('#inkCanvas3D').boundingBox(), cx = rect.x + rect.width * 0.55, cy = rect.y + rect.height * 0.55;
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'middle' }); await page.mouse.move(cx + 90, cy + 20, { steps: 10 }); await page.mouse.up({ button: 'middle' });
  check('middle drag rotates camera', await page.evaluate(before => JSON.stringify(window.inkbox.render3d.renderer.cameraRig.camera.position.toArray()) !== JSON.stringify(before), startCamera));
  await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 140, cy + 50, { steps: 6 }); await page.mouse.up({ button: 'right' });
  check('right drag pans camera', await page.evaluate(() => window.inkbox.render3d.renderer.cameraRig.controls.target.length() > 0.1));
  await page.mouse.wheel(0, -240); await page.waitForTimeout(100);
  check('wheel zooms camera', await page.evaluate(() => window.inkbox.render3d.renderer.cameraRig.camera.zoom > 1));
  await page.evaluate(() => { const s = window.inkbox; s.camera.focusOn(100, 60, { duration: 0.1 }); });
  await page.waitForTimeout(200);
  check('legacy focusOn routes to 3D and completes', await page.evaluate(() => {
    const r = window.inkbox.render3d.renderer, p = r.coordinates.renderToWorld(r.cameraRig.controls.target.x, r.cameraRig.controls.target.z);
    return Math.abs(p.x - 100) < 0.01 && Math.abs(p.y - 60) < 0.01 && !r.cameraRig.focus;
  }));
  await page.evaluate(() => window.inkbox.render3d.renderer.cameraRig.focusOn(40, 40, { duration: 5 }));
  await page.mouse.wheel(0, 100);
  check('player input cancels focus', await page.evaluate(() => !window.inkbox.render3d.renderer.cameraRig.focus));
  await page.keyboard.press('f');
  await page.screenshot({ path: `${output}/interactive.png` });
  await page.setViewportSize({ width: 700, height: 800 }); await page.waitForTimeout(150);
  check('responsive canvas resize', await page.evaluate(() => Math.abs(window.inkbox.render3d.renderer.width - document.getElementById('inkCanvas3D').getBoundingClientRect().width) < 2));
  await page.screenshot({ path: `${output}/narrow.png` });
  await page.evaluate(() => window.inkbox.render3d.renderer.gpu.forceContextLoss());
  await page.waitForFunction(() => !window.inkbox.render3d.active);
  check('WebGL context loss returns to Canvas', await page.locator('#inkCanvas').isVisible());
  await page.evaluate(() => window.inkbox.render3d.renderer.gpu.forceContextRestore());
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '进入 3D', exact: true }).click();
  check('WebGL context restores', await page.evaluate(() => !window.inkbox.render3d.renderer.gpu.getContext().isContextLost()));
  check('dispose restores Canvas and removes owned UI', await page.evaluate(() => {
    const s = window.inkbox, adapter = s.render3d; adapter.dispose(); s.render3d = null;
    return !document.getElementById('inkCanvas3D') && !document.getElementById('inkRender3DTools') && s.camera.focusOn === adapter.originalFocus && !s.canvas.style.visibility;
  }));
  const plain = await browser.newPage(); let threeRequests = 0;
  plain.on('request', request => { if (request.url().includes('/node_modules/three/')) threeRequests++; });
  await plain.goto(base); await plain.waitForFunction(() => window.inkbox?.world);
  check('default Canvas does not download Three.js', threeRequests === 0);
  await plain.close();
  check('no browser runtime errors', errors.length === 0);
  fs.writeFileSync(`${output}/browser-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  fs.writeFileSync(`${output}/browser-partial.json`, JSON.stringify({ ...results, errors }, null, 2));
  await browser.close();
}
