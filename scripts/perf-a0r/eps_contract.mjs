// G3-PERF-A0R：ε 误差契约补证。只读导入产品模块（H3 worktree），不写产品文件。
// 输出：每 ε 策略的更新格数、着色输出误差上界（8-bit 级）、水面通道计数、逐步世界状态哈希。
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const ROOT = process.env.INKBOX_ROOT || '/data/wt-h3';
const { generateWorld } = await import(`${ROOT}/src/inkbox/world/worldgen.js`);
const { WORLD_PRESETS } = await import(`${ROOT}/src/inkbox/core/config.js`);
const { stepHydrology } = await import(`${ROOT}/src/inkbox/sim/hydrology.js`);
const { visualElevation } = await import(`${ROOT}/src/inkbox/render3d/terrain/VisualElevation.js`);
const { diagonalAD } = await import(`${ROOT}/src/inkbox/render3d/terrain/topology.js`);
const { resolveArtProfile } = await import(`${ROOT}/src/inkbox/render3d/art/ArtPassProfile.js`);
const { applyArchipelagoFixture } = await import(`${ROOT}/scripts/inkbox-g2-h3-archipelago-world.mjs`);
const SEED = 673231, WARM = +(process.env.WARM || 30), STEPS = +(process.env.STEPS || 60), TMAX = +(process.env.TMAX || 12);
const EPS = (process.env.EPS || '0.001,0.002,0.005,0.01,0.02').split(',').map(Number);
const WET = 0.0015, DEPTH_REF = 0.5;
const { ArtPass } = await import(`${ROOT}/src/inkbox/render3d/art/ArtPass.js`);
const artProbe = Object.create(ArtPass.prototype); artProbe.profile = resolveArtProfile('realm-style-v1');
const RS = artProbe.realmStyleFor(process.env.PLANE || 'mortal'); // 与 ArtPass.styleStage 同源（ArtPass.js 110–122）
const S = { plane: process.env.PLANE || 'mortal', structural: RS.ink.structure, deep: RS.tone?.deepInk ?? 0, mass: RS.tone?.massShade ?? 0 };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const pct = (a, p) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const sha = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex').slice(0, 16);
const key = [-0.45, 0.76, -0.47], kl = Math.hypot(...key); key.forEach((v, i) => key[i] = v / kl);

// 着色器项（PigmentTerrainMaterial.js 150–260 的逐格 CPU 复刻；brushGate=1、distant=1、strokeDirection=1 取上界）
function shadeTerms(G, w, h, x, y, broad) {
  const at = (xx, yy) => G[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
  const c = at(x, y), l = at(x - 1, y), r = at(x + 1, y), d = at(x, y - 1), u = at(x, y + 1);
  const gx = (r - l) * 0.5, gy = (u - d) * 0.5, slope = Math.hypot(gx, gy), curv = l + r + d + u - 4 * c;
  const ridge = ss(0.16, 1.7, -curv), valley = ss(0.22, 2.0, curv) * 0.58, brk = ss(1.2, 3.8, slope) * ss(0.30, 1.8, Math.abs(curv));
  const structure = Math.max(ridge, valley, brk) * ss(0.10, 0.65, slope);
  const ink = Math.min(0.82, structure * S.structural * 0.72);
  const c2d = ss(0.12, 0.50, Math.abs(curv)) * ss(0.35, 1.60, slope);
  const deep = Math.min(0.22, (structure * structure * S.deep + c2d * S.deep));
  const bx = broad[(y * w + x) * 2], by = broad[(y * w + x) * 2 + 1], b2 = bx * bx + by * by;
  const nl = Math.hypot(bx, 1, by), keyDot = (-bx * key[0] + key[1] - by * key[2]) / nl;
  const mm = ss(0.01, 0.7225, b2);
  const massInk = Math.min(0.24, (1 - ss(0.10, 0.60, keyDot)) * S.mass * mm * 0.65);
  const lit = Math.min(0.16, ss(0.68, 0.98, keyDot) * S.mass * mm * 0.30);
  return [ink, deep, massInk, lit];
}
function broadGradient(G, w, h, out) { // TerrainDataTextures.js：radius 2.5 线性采样中心差分
  const R = 2.5, at = (x, y) => G[y * w + x];
  const sx = (x, y) => { const c = Math.max(0, Math.min(w - 1, x)), i = Math.floor(c), f = c - i; return at(i, y) * (1 - f) + at(Math.min(w - 1, i + 1), y) * f; };
  const sy = (x, y) => { const c = Math.max(0, Math.min(h - 1, y)), i = Math.floor(c), f = c - i; return at(x, i) * (1 - f) + at(x, Math.min(h - 1, i + 1)) * f; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 2; out[o] = (sx(x + R, y) - sx(x - R, y)) / (2 * R); out[o + 1] = (sy(x, y + R) - sy(x, y - R)) / (2 * R); }
}
const depthByte = d => d > 0 ? Math.min(255, Math.round(d * 255 / DEPTH_REF)) : 0;

function run(label, fixture) {
  const world = generateWorld({ preset: WORLD_PRESETS.expanse, seed: SEED, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
  if (fixture) applyArchipelagoFixture(world);
  const { w, h, size } = world;
  for (let k = 0; k < WARM; k++) stepHydrology(world, 4, null);
  const exactG = new Float32Array(size), exactW = new Float32Array(size);
  const fill = () => { for (let i = 0; i < size; i++) { exactG[i] = Math.fround(visualElevation(world.height[i])); exactW[i] = Math.fround(visualElevation(world.height[i] + world.water[i])) + 0.04; } };
  fill();
  const presG = EPS.map(() => exactG.slice()), presW = EPS.map(() => exactW.slice());
  let bytes = new Uint8Array(size); for (let i = 0; i < size; i++) bytes[i] = depthByte(world.water[i]);
  const bE = new Float32Array(size * 2), bP = new Float32Array(size * 2);
  const rows = [], hashes = [];
  for (let k = 0; k < STEPS; k++) {
    const bw = world.water.slice();
    const t0 = performance.now(); stepHydrology(world, 4, null); const hydroMs = performance.now() - t0;
    hashes.push({ step: k, height: sha(world.height), water: sha(world.water), type: sha(world.type) });
    fill();
    // 水面：深度字节通道（SurfaceVisualFieldTexture 的输出等价判据）
    let byteCells = 0, texelCells = 0; const nb = new Uint8Array(size);
    for (let i = 0; i < size; i++) { nb[i] = depthByte(world.water[i]); if (nb[i] !== bytes[i]) byteCells++; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x;
      const ch = j => nb[j] !== bytes[j];
      if (ch(i) || ch(y * w + Math.max(0, x - 1)) || ch(y * w + Math.min(w - 1, x + 1)) || ch(Math.max(0, y - 1) * w + x)) texelCells++; }
    bytes = nb;
    // 岸线 quad（湿掩码非 0/15）与其中的对角翻转
    let partial = 0, partialChanged = 0;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) { const a = y * w + x, n = [a, a + 1, a + w, a + w + 1];
      let m = 0, mb = 0; for (let j = 0; j < 4; j++) { if (world.water[n[j]] > WET) m |= 1 << j; if (bw[n[j]] > WET) mb |= 1 << j; }
      if (m !== 0 && m !== 15) { partial++; if (n.some(j => world.water[j] !== bw[j])) partialChanged++; } }
    broadGradient(exactG, w, h, bE);
    const per = EPS.map((eps, e) => {
      let accT = 0, forcedT = 0, accW = 0, forcedW = 0;
      const G = presG[e], WW = presW[e];
      for (let i = 0; i < size; i++) { const y = (i / w) | 0, forced = (y % TMAX) === (k % TMAX);
        if (Math.abs(exactG[i] - G[i]) > eps) { G[i] = exactG[i]; accT++; } else if (forced && G[i] !== exactG[i]) { G[i] = exactG[i]; forcedT++; }
        if (world.water[i] > WET) { if (Math.abs(exactW[i] - WW[i]) > eps) { WW[i] = exactW[i]; accW++; } else if (forced && WW[i] !== exactW[i]) { WW[i] = exactW[i]; forcedW++; } } else WW[i] = exactW[i]; }
      broadGradient(G, w, h, bP);
      const dInk = [], dAll = []; let maxAll = 0, over2 = 0, over4 = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const a = shadeTerms(exactG, w, h, x, y, bE), b = shadeTerms(G, w, h, x, y, bP);
        const di = Math.abs(a[0] - b[0]) * 255, dt = (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3])) * 255;
        if (dt > 0) { dInk.push(di); dAll.push(dt); }
        if (dt > maxAll) maxAll = dt; if (dt > 2) over2++; if (dt > 4) over4++;
      }
      return { eps, terrainCells: accT + forcedT, accT, forcedT, waterCells: accW + forcedW, accW, forcedW,
        shadeDiffCells: dAll.length, ink8P99: pct(dInk, .99), all8P99: pct(dAll, .99), all8P999: pct(dAll, .999), all8Max: maxAll, over2, over4 };
    });
    rows.push({ step: k, hydroMs, byteCells, texelCells, partial, partialChanged, per });
  }
  return { label, size, w, h, warm: WARM, steps: STEPS, tmax: TMAX, strengths: S, rows, hashes };
}
const out = { meta: { script: 'eps_contract.mjs', seed: SEED, root: ROOT, node: process.version, date: new Date().toISOString() }, runs: [run('standard', false), run('archipelago', true)] };
fs.writeFileSync(process.env.OUT || '/data/exp/a0r/eps_contract.json', JSON.stringify(out));
for (const r of out.runs) {
  const R = r.rows, q = (f, p) => pct(R.map(f), p);
  console.log(`\n== ${r.label} strengths ${JSON.stringify(r.strengths)} TMAX ${r.tmax}`);
  console.log('depth-byte cells p50/p95', q(x => x.byteCells, .5), q(x => x.byteCells, .95), ' texels', q(x => x.texelCells, .5), q(x => x.texelCells, .95), ' shoreline quads', q(x => x.partial, .5), ' changed', q(x => x.partialChanged, .5));
  EPS.forEach((e, j) => { const g = f => [q(x => f(x.per[j]), .5), q(x => f(x.per[j]), .95)].map(v => +v.toFixed(2)).join('/');
    console.log(`eps ${e}: terrain ${g(p => p.terrainCells)} (forced ${g(p => p.forcedT)})  water ${g(p => p.waterCells)}  shade8 p99 ${g(p => p.all8P99)} p99.9 ${g(p => p.all8P999)} max ${g(p => p.all8Max)}  cells>2lv ${g(p => p.over2)} >4lv ${g(p => p.over4)}`); });
}
