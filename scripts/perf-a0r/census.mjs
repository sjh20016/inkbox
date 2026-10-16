// G3-PERF-A0 read-only evidence experiment: hydrology change census.
// Imports product modules from the H3 worktree; never writes product files.
import { performance } from 'node:perf_hooks';
const ROOT = process.env.INKBOX_ROOT || '/data/wt-h3';
import { createHash } from 'node:crypto';
const sha = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex').slice(0, 16);
const { generateWorld } = await import(`${ROOT}/src/inkbox/world/worldgen.js`);
const { WORLD_PRESETS, SEA_LEVEL } = await import(`${ROOT}/src/inkbox/core/config.js`);
const { stepHydrology } = await import(`${ROOT}/src/inkbox/sim/hydrology.js`);
const { classify } = await import(`${ROOT}/src/inkbox/world/terrain.js`);
const { diagonalAD } = await import(`${ROOT}/src/inkbox/render3d/terrain/topology.js`);
const { visualElevation } = await import(`${ROOT}/src/inkbox/render3d/terrain/VisualElevation.js`);
const { deriveVegetation } = await import(`${ROOT}/src/inkbox/render3d/vegetation/deriveVegetation.js`);
const { applyArchipelagoFixture } = await import(`${ROOT}/scripts/inkbox-g2-h3-archipelago-world.mjs`);

const SEED = 673231, WARM = +process.env.WARM || 30, STEPS = +process.env.STEPS || 60;
const EPS = [0.01, 0.02, 0.05];           // render units (1 cell = 1 unit horizontally)
const CHUNKS = [8, 16, 32, 64];
const pct = (a, p) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const band = d => d > 0.15 ? 4 : d > 0.055 ? 3 : d > 0.016 ? 2 : d > 0.0015 ? 1 : 0;

function run(label, fixture) {
  const world = generateWorld({ preset: WORLD_PRESETS.expanse, seed: SEED, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
  if (fixture) applyArchipelagoFixture(world);
  const { w, h, size } = world;
  for (let k = 0; k < WARM; k++) stepHydrology(world, 4, null);
  // presented (render-owned) snapshots, initialised to current state
  const presTerrain = EPS.map(() => new Float32Array(size));
  const presWater = EPS.map(() => new Float32Array(size));
  for (let e = 0; e < EPS.length; e++) for (let i = 0; i < size; i++) {
    presTerrain[e][i] = visualElevation(world.height[i]);
    presWater[e][i] = visualElevation(world.height[i] + world.water[i]);
  }
  let prevTrees = deriveVegetation(world).map(t => t.cell);
  const rows = [];
  let staleTypeCum = 0;
  for (let k = 0; k < STEPS; k++) {
    const bh = world.height.slice(), bw = world.water.slice(), bt = world.type.slice();
    const bdiag = new Uint8Array((w - 1) * (h - 1));
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) bdiag[y * (w - 1) + x] = diagonalAD(world, x, y) ? 1 : 0;
    const t0 = performance.now();
    stepHydrology(world, 4, null);
    const hydroMs = performance.now() - t0;
    const stateHash = { height: sha(world.height), water: sha(world.water), type: sha(world.type) };
    let hc = 0, wc = 0, tc = 0, wetdry = 0, bandX = 0, diagFlip = 0, vegElig = 0, staleType = 0;
    const dh = [], dnode = [];
    const visT = EPS.map(() => 0), visW = EPS.map(() => 0);
    const chunkSets = CHUNKS.map(() => ({ anyH: new Set(), anyW: new Set(), vis: new Set() }));
    for (let i = 0; i < size; i++) {
      const x = i % w, y = (i - x) / w;
      const dH = world.height[i] !== bh[i], dW = world.water[i] !== bw[i];
      if (dH) { hc++; const d = Math.abs(world.height[i] - bh[i]); dh.push(d); dnode.push(Math.abs(visualElevation(world.height[i]) - visualElevation(bh[i]))); }
      if (dW) wc++;
      if (world.type[i] !== bt[i]) tc++;
      if ((bw[i] > 0.0015) !== (world.water[i] > 0.0015)) wetdry++;
      if (band(bw[i]) !== band(world.water[i])) bandX++;
      const eb = bh[i] >= SEA_LEVEL && bw[i] <= 0.0015, ea = world.height[i] >= SEA_LEVEL && world.water[i] <= 0.0015;
      if (eb !== ea) vegElig++;
      if (classify(world, x, y, i) !== world.type[i]) staleType++;
      let visible = false;
      for (let e = 0; e < EPS.length; e++) {
        const nT = visualElevation(world.height[i]);
        if (Math.abs(nT - presTerrain[e][i]) > EPS[e]) { visT[e]++; presTerrain[e][i] = nT; if (e === 1) visible = true; }
        const nW = visualElevation(world.height[i] + world.water[i]);
        const wetNow = world.water[i] > 0.0015;
        if (wetNow && Math.abs(nW - presWater[e][i]) > EPS[e]) { visW[e]++; presWater[e][i] = nW; if (e === 1) visible = true; }
      }
      if ((bw[i] > 0.0015) !== (world.water[i] > 0.0015)) visible = true;
      for (let c = 0; c < CHUNKS.length; c++) {
        const s = CHUNKS[c], id = ((y / s) | 0) * 1000 + ((x / s) | 0);
        if (dH) chunkSets[c].anyH.add(id);
        if (dW) chunkSets[c].anyW.add(id);
        if (visible) chunkSets[c].vis.add(id);
      }
    }
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) if ((diagonalAD(world, x, y) ? 1 : 0) !== bdiag[y * (w - 1) + x]) diagFlip++;
    staleTypeCum = staleType;
    const t1 = performance.now();
    const trees = deriveVegetation(world).map(t => t.cell);
    const deriveMs = performance.now() - t1;
    let sameOrder = trees.length === prevTrees.length;
    if (sameOrder) for (let j = 0; j < trees.length; j++) if (trees[j] !== prevTrees[j]) { sameOrder = false; break; }
    prevTrees = trees;
    const totalChunks = CHUNKS.map(s => Math.ceil(w / s) * Math.ceil(h / s));
    rows.push({ step: k, stateHash, hydroMs, deriveMs, hc, wc, tc, wetdry, bandX, diagFlip, vegElig, staleType, treesSame: sameOrder, trees: trees.length,
      dhP50: pct(dh, .5), dhP95: pct(dh, .95), dhMax: pct(dh, 1), dnodeP50: pct(dnode, .5), dnodeP95: pct(dnode, .95), dnodeMax: pct(dnode, 1),
      visT, visW,
      chunk: CHUNKS.map((s, c) => ({ s, total: totalChunks[c], anyH: chunkSets[c].anyH.size / totalChunks[c], anyW: chunkSets[c].anyW.size / totalChunks[c], vis: chunkSets[c].vis.size / totalChunks[c] })) });
  }
  // bridge-like scan cost and full-map Y rewrite cost (node, this CPU)
  const snaps = ['height', 'water', 'type', 'veg', 'fire'].map(k => world[k].slice());
  let t = performance.now();
  for (let rep = 0; rep < 20; rep++) { let n = 0; for (let i = 0; i < size; i++) { if (snaps[0][i] !== world.height[i] || snaps[1][i] !== world.water[i] || snaps[2][i] !== world.type[i] || snaps[3][i] !== world.veg[i] || snaps[4][i] !== world.fire[i]) n++; } }
  const scanMs = (performance.now() - t) / 20;
  const pos = new Float32Array(size * 3); t = performance.now();
  for (let rep = 0; rep < 20; rep++) for (let i = 0; i < size; i++) pos[i * 3 + 1] = visualElevation(world.height[i]);
  const yWriteMs = (performance.now() - t) / 20;
  return { label, rows, scanMs, yWriteMs, size };
}

const out = [run('standard', false), run('archipelago', true)];
const agg = (rows, f, p) => pct(rows.map(f).filter(v => v !== null), p);
for (const r of out) {
  const R = r.rows;
  console.log(`\n=== ${r.label} (cells ${r.size}, warm ${WARM}, steps ${STEPS}) ===`);
  const line = (name, f) => console.log(name.padEnd(28), 'p50', (agg(R, f, .5) ?? 0).toPrecision(4), ' p95', (agg(R, f, .95) ?? 0).toPrecision(4), ' max', (agg(R, f, 1) ?? 0).toPrecision(4));
  line('hydroMs(node)', x => x.hydroMs); line('deriveVegMs(node)', x => x.deriveMs);
  line('height changed', x => x.hc); line('water changed', x => x.wc); line('type changed', x => x.tc);
  line('wet/dry transitions', x => x.wetdry); line('water band crossings', x => x.bandX); line('diag flips', x => x.diagFlip);
  line('veg eligibility flips', x => x.vegElig); line('stale type after flush', x => x.staleType);
  line('|dh| p50 per step', x => x.dhP50); line('|dh| p95 per step', x => x.dhP95); line('|dh| max per step', x => x.dhMax);
  line('|dnode| p50 (units)', x => x.dnodeP50); line('|dnode| p95 (units)', x => x.dnodeP95); line('|dnode| max (units)', x => x.dnodeMax);
  EPS.forEach((e, k) => { line(`terrain vis>eps ${e}`, x => x.visT[k]); line(`water vis>eps ${e}`, x => x.visW[k]); });
  [0,1,2,3].forEach(c => { line(`chunk${R[0].chunk[c].s} anyH frac`, x => x.chunk[c].anyH); line(`chunk${R[0].chunk[c].s} anyW frac`, x => x.chunk[c].anyW); line(`chunk${R[0].chunk[c].s} vis.02 frac`, x => x.chunk[c].vis); });
  console.log('tree list identical to previous step:', R.filter(x => x.treesSame).length, '/', R.length, ' trees', R[0].trees);
  console.log('bridge-like 5-array scan ms(node):', r.scanMs.toFixed(2), ' full Y rewrite ms(node):', r.yWriteMs.toFixed(2));
}
import fs from 'node:fs'; fs.writeFileSync(process.env.OUT || '/data/exp/a0r/census.json', JSON.stringify({ meta: { script: 'census.mjs', seed: SEED, warm: WARM, steps: STEPS, root: ROOT, node: process.version, date: new Date().toISOString() }, runs: out }));
