// G3-PERF-A0 read-only render-derivation replay. Node CPU only (no WebGL submit / GPU).
import { performance } from 'node:perf_hooks';
const ROOT = process.env.INKBOX_ROOT || '/data/wt-h3';
import fs from 'node:fs';
const RAW = [];
const { generateWorld } = await import(`${ROOT}/src/inkbox/world/worldgen.js`);
const { WORLD_PRESETS } = await import(`${ROOT}/src/inkbox/core/config.js`);
const { stepHydrology } = await import(`${ROOT}/src/inkbox/sim/hydrology.js`);
const { PlaneStage } = await import(`${ROOT}/src/inkbox/render3d/stage/PlaneStage.js`);
const { ArtPass } = await import(`${ROOT}/src/inkbox/render3d/art/ArtPass.js`);
const await_profile = await import(`${ROOT}/src/inkbox/render3d/art/ArtPassProfile.js`);
const { applyArchipelagoFixture } = await import(`${ROOT}/scripts/inkbox-g2-h3-archipelago-world.mjs`);
const SEED = 673231, WARM = 30, STEPS = +process.env.STEPS || 30, MODE = process.env.MODE || 'real';
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

function queued(stage) {
  // bytes represented by pending update ranges (or whole array if needsUpdate w/o ranges) — API-side only
  const out = {};
  const visit = (name, attr) => {
    if (!attr) return;
    const bpe = attr.array.BYTES_PER_ELEMENT;
    const r = attr.updateRanges || [];
    const v = attr.version;
    out[name] = { ranges: r.length, bytes: r.length ? r.reduce((s, x) => s + x.count, 0) * bpe : null, version: v, full: attr.array.byteLength };
  };
  visit('terrain.position', stage.terrain?.geometry.attributes.position);
  visit('terrain.color', stage.terrain?.geometry.attributes.color);
  visit('terrain.index', stage.terrain?.geometry.index);
  visit('water.position', stage.water?.geometry.attributes.position);
  visit('water.index', stage.water?.geometry.index);
  for (const [k, t] of [['tex.height', stage.terrain?.artData?.heightTexture], ['tex.type', stage.terrain?.artData?.typeTexture], ['tex.surface', stage.surfaceField?.texture]]) {
    if (!t) continue; const r = t.updateRanges || []; const bpe = t.image.data.BYTES_PER_ELEMENT;
    out[k] = { ranges: r.length, bytes: r.reduce((s, x) => s + x.count, 0) * bpe, version: t.version, full: t.image.data.byteLength };
  }
  stage.vegetation?.lodMeshes?.forEach((m, i) => { if (m) out['veg' + i + '.matrix'] = { version: m.instanceMatrix.version, full: m.count * 64 }; });
  return out;
}
function clear(stage) {
  for (const g of [stage.terrain?.geometry, stage.water?.geometry, stage.terrainSides?.mesh?.geometry]) {
    if (!g) continue; for (const a of Object.values(g.attributes)) a.clearUpdateRanges?.(); g.index?.clearUpdateRanges?.();
  }
  for (const t of [stage.terrain?.artData?.heightTexture, stage.terrain?.artData?.typeTexture, stage.surfaceField?.texture]) t?.clearUpdateRanges?.();
}

function runMap(map) {
  const world = generateWorld({ preset: WORLD_PRESETS.expanse, seed: SEED, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
  if (map === 'archipelago') applyArchipelagoFixture(world);
  for (let k = 0; k < WARM; k++) stepHydrology(world, 4, null);
  const stage = new PlaneStage({ plane: 'mortal', world });
  const host = { stages: new Map([['mortal', stage]]), scene: { background: null }, renderer: null };
  let styled = 'none';
  if (process.env.ART !== 'off') try { const { resolveArtProfile } = await_profile; const art = Object.create(ArtPass.prototype); Object.assign(art, { host, profile: resolveArtProfile('realm-style-v1'), comparisonSnapshot: null, development: false, comparisonMaterials: new WeakMap(), comparisonStyle: 'c2d1-style' }); art.styleStage(stage); styled = 'realm-style-v1:' + art.profile.mode; } catch (e) { styled = 'failed: ' + e.message.slice(0, 120); }
  stage.vegetation?.setLODEnabled?.(true);
  stage.update(0); clear(stage);
  const rows = [];
  for (let k = 0; k < STEPS; k++) {
    if (MODE === 'real') stepHydrology(world, 4, null);
    else if (MODE === 'typeonly') { const i = (k * 7919) % world.size; world.type[i] = (world.type[i] + 1) % 20; }
    const before = queued(stage);
    const t0 = performance.now();
    stage.update(0.16);
    const total = performance.now() - t0;
    const after = queued(stage);
    const up = {};
    for (const key of Object.keys(after)) {
      const a = after[key], b = before[key];
      if (a.version === b?.version) continue;
      up[key] = a.bytes ?? a.full;
    }
    rows.push({ total, ...stage.timings, up });
    clear(stage);
  }
  const keys = ['total', 'bridgeScanMs', 'terrainUpdateMs', 'waterUpdateMs', 'vegetationUpdateMs', 'entityUpdateMs', 'settlementUpdateMs', 'markerUpdateMs'];
  console.log(`\n=== ${map} mode=${MODE} art=${styled} waterClipped=${stage.water?.clipped} steps=${STEPS}`);
  for (const k of keys) console.log(k.padEnd(20), 'p50', pct(rows.map(r => r[k] || 0), .5).toFixed(2), ' p95', pct(rows.map(r => r[k] || 0), .95).toFixed(2));
  const upKeys = [...new Set(rows.flatMap(r => Object.keys(r.up)))];
  for (const k of upKeys) { const v = rows.map(r => r.up[k] || 0); console.log(('queued ' + k).padEnd(28), 'frames', v.filter(Boolean).length, ' p50 bytes', pct(v, .5), ' max', Math.max(...v)); }
  const tot = rows.map(r => Object.values(r.up).reduce((s, x) => s + x, 0));
  console.log('queued total bytes/step p50', pct(tot, .5), ' max', Math.max(...tot));
  RAW.push({ map, mode: MODE, art: styled, waterClipped: stage.water?.clipped, steps: STEPS, rows });
  stage.dispose();
}
runMap('standard'); runMap('archipelago');
fs.writeFileSync(process.env.OUT || `/data/exp/a0r/replay_${MODE}${process.env.ART === 'off' ? '_artoff' : ''}.json`, JSON.stringify({ meta: { script: 'replay.mjs', seed: SEED, warm: WARM, steps: STEPS, mode: MODE, art: process.env.ART || 'on', root: ROOT, node: process.version, date: new Date().toISOString() }, runs: RAW }));
