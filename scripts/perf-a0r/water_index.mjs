// G3-PERF-A0R：水面紧凑索引布局补证。真实 PlaneStage + realm-style-v1（clipped 水面），只读导入产品模块。
// 每水文步记录 clipCounts 变化 quad、成因（湿掩码 / 对角翻转）、drawRange，并离线模拟四种索引布局的上传量与绘制索引数。
import fs from 'node:fs';
const ROOT = process.env.INKBOX_ROOT || '/data/wt-h3';
const { generateWorld } = await import(`${ROOT}/src/inkbox/world/worldgen.js`);
const { WORLD_PRESETS } = await import(`${ROOT}/src/inkbox/core/config.js`);
const { stepHydrology } = await import(`${ROOT}/src/inkbox/sim/hydrology.js`);
const { PlaneStage } = await import(`${ROOT}/src/inkbox/render3d/stage/PlaneStage.js`);
const { ArtPass } = await import(`${ROOT}/src/inkbox/render3d/art/ArtPass.js`);
const { resolveArtProfile } = await import(`${ROOT}/src/inkbox/render3d/art/ArtPassProfile.js`);
const { diagonalAD } = await import(`${ROOT}/src/inkbox/render3d/terrain/topology.js`);
const { applyArchipelagoFixture } = await import(`${ROOT}/scripts/inkbox-g2-h3-archipelago-world.mjs`);
const SEED = 673231, WARM = +(process.env.WARM || 30), STEPS = +(process.env.STEPS || 60), WET = 0.0015;
const BLOCKS = [16, 32], SLACK = [0.1, 0.25], MIN_SLACK_IDX = 96;
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

function runMap(map) {
  const world = generateWorld({ preset: WORLD_PRESETS.expanse, seed: SEED, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
  if (map === 'archipelago') applyArchipelagoFixture(world);
  for (let k = 0; k < WARM; k++) stepHydrology(world, 4, null);
  const stage = new PlaneStage({ plane: 'mortal', world });
  const host = { stages: new Map([['mortal', stage]]), scene: { background: null }, renderer: null };
  const art = Object.create(ArtPass.prototype);
  Object.assign(art, { host, profile: resolveArtProfile('realm-style-v1'), comparisonSnapshot: null, development: false, comparisonMaterials: new WeakMap(), comparisonStyle: 'c2d1-style' });
  art.styleStage(stage); stage.vegetation?.setLODEnabled?.(true); stage.update(0);
  const water = stage.water; if (!water.clipped) throw new Error('water not clipped');
  const { w, h } = world, qw = w - 1, qh = h - 1, Q = qw * qh, rimN = water.rimEdges.length, fullBytes = water.clipGeometry.index.array.byteLength;
  const mask = () => { const m = new Uint8Array(Q); for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) { const a = y * w + x; let v = 0; if (world.water[a] > WET) v |= 1; if (world.water[a + 1] > WET) v |= 2; if (world.water[a + w] > WET) v |= 4; if (world.water[a + w + 1] > WET) v |= 8; m[y * qw + x] = v; } return m; };
  const diag = () => { const d = new Uint8Array(Q); for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) d[y * qw + x] = diagonalAD(world, x, y) ? 1 : 0; return d; };
  // 分块紧凑布局状态
  const layouts = [];
  for (const B of BLOCKS) for (const s of SLACK) {
    const bw = Math.ceil(qw / B), bh = Math.ceil(qh / B), cap = new Int32Array(bw * bh);
    const blockOf = q => { const x = q % qw, y = (q / qw) | 0; return ((y / B) | 0) * bw + ((x / B) | 0); };
    const relayout = counts => { const sum = new Int32Array(bw * bh); for (let q = 0; q < Q; q++) sum[blockOf(q)] += counts[q]; for (let b = 0; b < cap.length; b++) cap[b] = Math.ceil(sum[b] * (1 + s)) + MIN_SLACK_IDX; };
    relayout(water.clipCounts);
    layouts.push({ B, s, bw, bh, cap, blockOf, relayout, overflow: 0, rows: [] });
  }
  let m0 = mask(), d0 = diag(), c0 = water.clipCounts.slice(), r0 = water.rimCounts.slice();
  const rows = [];
  for (let k = 0; k < STEPS; k++) {
    stepHydrology(world, 4, null);
    stage.update(0.16);
    const m1 = mask(), d1 = diag(), c1 = water.clipCounts, r1 = water.rimCounts;
    let changed = 0, byMask = 0, byDiagOnly = 0, first = -1, rimChanged = 0, prefix = 0, firstOffset = 0, wetQuads = 0, partial = 0;
    const changedList = [];
    for (let q = 0; q < Q; q++) {
      if (c1[q]) wetQuads++; if (m1[q] && m1[q] !== 15) partial++;
      if (c1[q] !== c0[q]) { changed++; changedList.push(q); if (m1[q] !== m0[q]) byMask++; else if (d1[q] !== d0[q]) byDiagOnly++; if (first < 0) { first = q; firstOffset = prefix; } }
      prefix += c0[q];
    }
    for (let e = 0; e < rimN; e++) if (r1[e] !== r0[e]) rimChanged++;
    const n = water.clipGeometry.drawRange.count, any = changed + rimChanged > 0;
    const L = { compactFull: any ? fullBytes : 0, compactSuffix: any ? (first < 0 ? rimChanged * 24 : (n - firstOffset) * 4) : 0, fixedSlot: changed * 48 + rimChanged * 24 };
    for (const lay of layouts) {
      const sums = new Int32Array(lay.cap.length); for (let q = 0; q < Q; q++) sums[lay.blockOf(q)] += c1[q];
      const touched = new Set(changedList.map(lay.blockOf)); let ov = false;
      for (const b of touched) if (sums[b] > lay.cap[b]) ov = true;
      let bytes = 0; if (ov) { lay.overflow++; lay.relayout(c1); bytes = fullBytes; } else for (const b of touched) bytes += lay.cap[b] * 4;
      bytes += rimChanged ? rimN * 24 : 0;
      let drawn = 0; for (let b = 0; b < lay.cap.length; b++) drawn += lay.cap[b];
      L[`block${lay.B}_s${lay.s}`] = bytes; L[`drawn_block${lay.B}_s${lay.s}`] = drawn + water.rimCounts.reduce((a, b) => a + b, 0);
      L[`blocks_touched_${lay.B}_s${lay.s}`] = touched.size;
    }
    rows.push({ step: k, changed, byMask, byDiagOnly, rimChanged, drawnCompact: n, drawnFixed: Q * 12 + rimN * 6, wetQuads, partial, ...L });
    m0 = m1; d0 = d1; c0 = c1.slice(); r0 = r1.slice();
  }
  const ov = Object.fromEntries(layouts.map(l => [`block${l.B}_s${l.s}`, l.overflow]));
  stage.dispose();
  return { map, Q, rimN, fullIndexBytes: fullBytes, overflowEvents: ov, rows };
}
const out = { meta: { script: 'water_index.mjs', seed: SEED, warm: WARM, steps: STEPS, root: ROOT, node: process.version, date: new Date().toISOString() }, runs: ['standard', 'archipelago'].map(runMap) };
fs.writeFileSync(process.env.OUT || '/data/exp/a0r/water_index.json', JSON.stringify(out));
for (const r of out.runs) {
  const R = r.rows, q = (k, p) => pct(R.map(x => x[k]), p);
  console.log(`\n== ${r.map} quads ${r.Q} fullIndexBytes ${r.fullIndexBytes} overflow ${JSON.stringify(r.overflowEvents)}`);
  for (const k of Object.keys(R[0]).filter(k => k !== 'step')) console.log(k.padEnd(28), 'p50', q(k, .5), ' p95', q(k, .95), ' max', Math.max(...R.map(x => x[k])), ' nonzero', R.filter(x => x[k]).length);
}
