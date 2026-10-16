import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { WORLD_PRESETS, TERRAIN_INFO } from '../src/inkbox/core/config.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { ART_PROFILES } from '../src/inkbox/render3d/art/ArtPassProfile.js';
import { applyArchipelagoFixture } from './inkbox-g2-h3-archipelago-world.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_ROOT = path.resolve(process.env.INKBOX_H3_BASELINE_ROOT || path.join(ROOT, '..', 'g2-p03-final-local'));
const OUT = path.resolve(process.env.INKBOX_H3_REPLAY_REPORT || path.join(ROOT, 'reports/analysis/g2-h3/render-replay-report.json'));
const SEED = 673231;
const FIELDS = ['height', 'water', 'type', 'veg', 'fire'];

function hashParts(parts) {
  const hash = crypto.createHash('sha256');
  for (const [name, value] of parts) {
    hash.update(`${name}:${value?.constructor?.name || typeof value}:${value?.length ?? ''}:`);
    if (ArrayBuffer.isView(value)) hash.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    else hash.update(JSON.stringify(value));
  }
  return hash.digest('hex');
}

function cloneWorld(world) {
  const clone = { ...world };
  for (const [key, value] of Object.entries(world)) {
    if (ArrayBuffer.isView(value)) clone[key] = value.slice();
    else if (value instanceof Map) clone[key] = new Map(value);
    else if (value instanceof Set) clone[key] = new Set(value);
  }
  return clone;
}

function cloneFields(world) {
  return Object.fromEntries(FIELDS.map(key => [key, world[key].slice()]));
}

function worldHash(world) {
  return hashParts(FIELDS.map(key => [key, world[key]]));
}

function makeSnapshots(world, map) {
  const current = cloneFields(world), snapshots = [];
  const centers = map === 'standard'
    ? [[256, 160], [226, 133], [286, 186], [254, 210]]
    : [[174, 150], [344, 156], [232, 246], [78, 104], [420, 220], [380, 90]];
  const events = ['type-patch', 'fire-on', 'fire-threshold', 'water-front', 'height-sculpt', 'mixed-recovery'];
  for (let step = 0; step < 24; step += 1) {
    const [cx, cy] = centers[step % centers.length];
    const x0 = Math.max(0, cx - 6 - (step % 3)), x1 = Math.min(world.w - 1, cx + 7 + (step % 2));
    const y0 = Math.max(0, cy - 4 - (step % 2)), y1 = Math.min(world.h - 1, cy + 5 + (step % 3));
    const event = events[step % events.length];
    const changedIndices = new Set();
    let changedFieldValues = 0;
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      const i = y * world.w + x, phase = step + x * 3 + y * 5;
      if (event === 'water-front' || event === 'mixed-recovery') {
        current.water[i] = Math.max(0, current.water[i] + (phase % 2 ? 0.018 : -0.013));
        current.veg[i] = Math.max(0, Math.min(1, current.veg[i] + (phase % 2 ? -0.08 : 0.055)));
        changedIndices.add(i); changedFieldValues += 2;
      }
      if (event === 'height-sculpt' || event === 'mixed-recovery') {
        current.height[i] += phase % 2 ? 0.0125 : -0.009;
        changedIndices.add(i); changedFieldValues += 1;
      }
    }
    // Terrain and fire changes are sparse across the broad map, like the narrow
    // type front produced by hydrology. This forces Bridge to report a large
    // dirty box while only a small number of color tuples actually differ.
    if (event === 'type-patch' || event === 'mixed-recovery'
      || event === 'fire-on' || event === 'fire-threshold') {
      for (let n = 0; n < 64; n += 1) {
        const x = (n * 211 + step * 83 + (map === 'archipelago' ? 47 : 0)) % world.w;
        const y = (n * 47 + step * 59 + (map === 'archipelago' ? 23 : 0)) % world.h;
        const i = y * world.w + x, phase = step + x * 3 + y * 5;
        if (event === 'type-patch' || event === 'mixed-recovery') {
          current.type[i] = (current.type[i] + 1 + (step % (TERRAIN_INFO.length - 1))) % TERRAIN_INFO.length;
          changedIndices.add(i); changedFieldValues += 1;
        }
        if (event === 'fire-on' || event === 'fire-threshold' || event === 'mixed-recovery') {
          current.fire[i] = event === 'fire-threshold' ? (phase % 2 ? 0.019 : 0.024)
            : (event === 'fire-on' ? 0.18 + (phase % 5) * 0.04 : (phase % 3 ? 0.06 : 0));
          changedIndices.add(i); changedFieldValues += 1;
        }
      }
    }
    snapshots.push({ step: step + 1, event, changedCells: changedIndices.size, changedFieldValues,
      fields: cloneFields({ ...world, ...current }) });
  }
  return snapshots;
}

function installBridgeCapture(stage) {
  const original = stage.bridge.changes.bind(stage.bridge);
  stage.lastBridgeChanges = null;
  stage.bridge.changes = () => {
    const changes = original();
    stage.lastBridgeChanges = changes ? JSON.parse(JSON.stringify(changes)) : null;
    return changes;
  };
}

function clearRanges(stage) {
  for (const object of [stage.terrain, stage.water, stage.terrainSides]) {
    for (const attribute of Object.values(object?.geometry?.attributes || {})) attribute.clearUpdateRanges?.();
    object?.geometry?.index?.clearUpdateRanges?.();
  }
}

function rangeStats(stage) {
  const ranges = stage.terrain?.geometry?.attributes?.color?.updateRanges || [];
  return { ranges: ranges.length, components: ranges.reduce((sum, range) => sum + range.count, 0) };
}

function geometryDigest(stage) {
  const parts = [];
  stage.root.traverse(object => {
    parts.push([`object:${object.name || object.type}:${object.visible}`, object.matrix.elements]);
    if (object.geometry) {
      const attributes = Object.entries(object.geometry.attributes || {}).sort(([a], [b]) => a.localeCompare(b));
      for (const [name, attribute] of attributes) parts.push([`${object.name || object.type}:attr:${name}`, attribute.array]);
      if (object.geometry.index) parts.push([`${object.name || object.type}:index`, object.geometry.index.array]);
    }
    if (object.instanceMatrix) parts.push([`${object.name || object.type}:instanceMatrix`, object.instanceMatrix.array]);
    if (object.instanceColor) parts.push([`${object.name || object.type}:instanceColor`, object.instanceColor.array]);
  });
  const terrainData = stage.terrain?.artData;
  if (terrainData) { parts.push(['artData:heights', terrainData.heights]); parts.push(['artData:types', terrainData.types]); }
  if (stage.surfaceField) {
    for (const key of ['data', 'values', 'field']) if (ArrayBuffer.isView(stage.surfaceField[key])) parts.push([`surfaceField:${key}`, stage.surfaceField[key]]);
  }
  return hashParts(parts);
}

function getTerrainUpload(stage) {
  const stats = rangeStats(stage);
  return { ...stats, version: stage.terrain.geometry.attributes.color.version };
}

async function loadStages() {
  const baselinePath = pathToFileURL(path.join(BASELINE_ROOT, 'src/inkbox/render3d/stage/PlaneStage.js')).href;
  const candidatePath = pathToFileURL(path.join(ROOT, 'src/inkbox/render3d/stage/PlaneStage.js')).href;
  const [baseline, candidate] = await Promise.all([import(baselinePath), import(candidatePath)]);
  return [baseline.PlaneStage, candidate.PlaneStage];
}

async function runMap(map, PlaneStageBaseline, PlaneStageCandidate) {
  const source = generateWorld({ preset: WORLD_PRESETS.expanse, seed: SEED, scatter: false, generationVersion: 2, terrainPreset: 'standard' });
  const fixture = map === 'archipelago' ? applyArchipelagoFixture(source) : null;
  const snapshots = makeSnapshots(source, map);
  const baseWorld = cloneWorld(source), candidateWorld = cloneWorld(source);
  const baseline = new PlaneStageBaseline({ plane: 'mortal', world: baseWorld });
  const candidate = new PlaneStageCandidate({ plane: 'mortal', world: candidateWorld });
  installBridgeCapture(baseline); installBridgeCapture(candidate);
  baseline.update(0); candidate.update(0);
  const initialDigest = [geometryDigest(baseline), geometryDigest(candidate)];
  assert.equal(initialDigest[0], initialDigest[1], `${map}: initial Stage geometry differs`);
  const rows = [], colorUploadTotals = { baseline: 0, candidate: 0 };

  for (const snapshot of snapshots) {
    for (const key of FIELDS) {
      baseWorld[key].set(snapshot.fields[key]);
      candidateWorld[key].set(snapshot.fields[key]);
    }
    if (snapshot.step === 5 || snapshot.step === 17) {
      const x0 = map === 'standard' ? 220 : 150, y0 = map === 'standard' ? 126 : 118;
      const mask = new RegionMask({ path: [[x0, y0], [x0 + 66, y0], [x0 + 66, y0 + 54], [x0, y0 + 54]], x0, y0, x1: x0 + 66, y1: y0 + 54, area: 66 * 54 });
      baseline.setRegionMask(mask, snapshot.step === 5);
      candidate.setRegionMask(mask, snapshot.step === 5);
    }
    if (snapshot.step === 8 || snapshot.step === 20) {
      const profile = snapshot.step === 8 ? { datum: 0.025, relief: 1.16 } : null;
      assert.equal(baseline.setElevationProfile(profile), candidate.setElevationProfile(profile));
    }
    if (snapshot.step === 11 || snapshot.step === 23) {
      const profile = snapshot.step === 11 ? ART_PROFILES.pilot : null;
      baseline.terrain.setArtProfile(profile); candidate.terrain.setArtProfile(profile);
    }
    clearRanges(baseline); clearRanges(candidate);
    const beforeVersions = [baseline.terrain.geometry.attributes.color.version, candidate.terrain.geometry.attributes.color.version];
    baseline.update(0.2); candidate.update(0.2);
    const dirtyA = baseline.lastBridgeChanges, dirtyB = candidate.lastBridgeChanges;
    assert.deepEqual(dirtyA, dirtyB, `${map}/step${snapshot.step}: Bridge classification differs`);
    assert.equal(worldHash(baseWorld), worldHash(candidateWorld), `${map}/step${snapshot.step}: replay World arrays differ`);
    const digestA = geometryDigest(baseline), digestB = geometryDigest(candidate);
    assert.equal(digestA, digestB, `${map}/step${snapshot.step}: Stage geometry/texture output differs`);
    const uploadsA = getTerrainUpload(baseline), uploadsB = getTerrainUpload(candidate);
    assert(uploadsB.components <= uploadsA.components, `${map}/step${snapshot.step}: candidate queued more color components`);
    colorUploadTotals.baseline += uploadsA.components;
    colorUploadTotals.candidate += uploadsB.components;
    rows.push({ step: snapshot.step, event: snapshot.event, changedCells: snapshot.changedCells,
      changedFieldValues: snapshot.changedFieldValues,
      bridge: dirtyA, worldSha256: worldHash(baseWorld), stageSha256: digestA,
      colorComponents: { baseline: uploadsA.components, candidate: uploadsB.components },
      colorNeedsUpdateMarks: { baseline: uploadsA.version - beforeVersions[0], candidate: uploadsB.version - beforeVersions[1] } });
  }

  const replacement = generateWorld({ preset: WORLD_PRESETS.expanse, seed: SEED + 1, scatter: false, generationVersion: 2, terrainPreset: 'standard' });
  const baseReplacement = cloneWorld(replacement), candidateReplacement = cloneWorld(replacement);
  baseline.setWorld(baseReplacement); candidate.setWorld(candidateReplacement);
  installBridgeCapture(baseline); installBridgeCapture(candidate);
  baseline.update(0); candidate.update(0);
  assert.equal(geometryDigest(baseline), geometryDigest(candidate), `${map}: setWorld geometry differs`);
  assert.equal(worldHash(baseReplacement), worldHash(candidateReplacement), `${map}: setWorld World differs`);
  rows.push({ step: 25, event: 'world-swap', worldSha256: worldHash(baseReplacement), stageSha256: geometryDigest(baseline), bridge: null });
  const result = { map, seed: SEED, dimensions: [source.w, source.h], fixture, snapshots: rows.length - 1,
    worldSwap: true, colorComponentsQueued: colorUploadTotals,
    colorComponentReductionPct: colorUploadTotals.baseline ? Math.round((1 - colorUploadTotals.candidate / colorUploadTotals.baseline) * 10000) / 100 : null,
    rows };
  baseline.dispose(); candidate.dispose();
  return result;
}

const [PlaneStageBaseline, PlaneStageCandidate] = await loadStages();
assert(fs.existsSync(path.join(BASELINE_ROOT, 'src/inkbox/render3d/terrain/TerrainMesh.js')),
  `P0.3 baseline missing: ${BASELINE_ROOT}`);
const results = [
  await runMap('standard', PlaneStageBaseline, PlaneStageCandidate),
  await runMap('archipelago', PlaneStageBaseline, PlaneStageCandidate),
];
const report = { task: 'G2-PERF-H3 render snapshot replay', status: 'PASS', generatedAt: new Date().toISOString(),
  baseline: 'P0.3 commit 4960f88d6256d63a82c0172bb052c62ae5acb1f3', candidate: 'TerrainMesh color snapshot/range optimization',
  replayContract: { maps: ['standard', 'archipelago'], eventsPerMap: 24, framesHydrologyCalls: 0,
    replayTimeRngDraws: 0, fields: FIELDS, compares: ['World fields', 'Bridge dirty classification', 'Stage geometry and texture arrays', 'color update-range bounds'] },
  results };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`H3 render replay: PASS, ${results.map(row => `${row.map} ${row.snapshots} events`).join('; ')}, ${OUT}`);
