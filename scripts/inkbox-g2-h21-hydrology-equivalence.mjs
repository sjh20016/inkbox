import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'reports/analysis/g2-h21-local-evidence');
const BASELINE = path.join(OUT, 'p1-baseline-src');
const BASE_SHA = '74934a8b1360af9007c69935d5becdf8f9809872';
const HYDROLOGY_PATH = 'src/inkbox/sim/hydrology.js';
const SEED = 673231;
const sha256 = data => createHash('sha256').update(data).digest('hex');

fs.mkdirSync(OUT, { recursive: true });
const baselineHydrology = execFileSync('git', ['show', `${BASE_SHA}:${HYDROLOGY_PATH}`], { cwd: ROOT, encoding: 'utf8' });
if (!fs.existsSync(BASELINE)) fs.cpSync(path.join(ROOT, 'src'), BASELINE, { recursive: true });
fs.writeFileSync(path.join(BASELINE, 'inkbox/sim/hydrology.js'), baselineHydrology);

async function loadSet(sourceRoot) {
  const importAt = relative => import(pathToFileURL(path.join(sourceRoot, relative)).href);
  const [config, noise, worldgen, lifeModule, advance, hydrology, save] = await Promise.all([
    importAt('inkbox/core/config.js'), importAt('inkbox/core/noise.js'), importAt('inkbox/world/worldgen.js'),
    importAt('inkbox/sim/life.js'), importAt('inkbox/sim/advance.js'), importAt('inkbox/sim/hydrology.js'),
    importAt('inkbox/io/save.js'),
  ]);
  return { config, noise, worldgen, lifeModule, advance, hydrology, save };
}

async function run(sourceRoot, probeOff) {
  const modules = await loadSet(sourceRoot);
  const world = modules.worldgen.generateWorld({ preset: modules.config.WORLD_PRESETS.expanse, seed: SEED, scatter: false });
  const lifeRng = modules.noise.mulberry32(world.seed ^ 0xa5a5a5a5);
  const ecologyRng = modules.noise.mulberry32(world.seed ^ 0x71c3a909);
  const life = new modules.lifeModule.Life(world, lifeRng);
  const state = modules.advance.createAdvanceState();
  const hydroResults = [];
  if (probeOff) globalThis.__INKBOX_G2_H2_PROBE = { enabled: false, mode: 'detailed', frameIndex: 0, hydrologyRecords: [] };
  else delete globalThis.__INKBOX_G2_H2_PROBE;
  for (let i = 0; i < 24; i += 1) {
    hydroResults.push(modules.hydrology.stepHydrology(world, 0.16));
    modules.advance.advanceWorld(world, 1, { life, rng: ecologyRng, state, riftActive: false, nether: false, wraith: false });
  }
  const savePayload = modules.save.serializeWorld(world);
  const saveJson = JSON.stringify(savePayload);
  const rngWitness = { life: Array.from({ length: 16 }, () => lifeRng()), ecology: Array.from({ length: 16 }, () => ecologyRng()) };
  const result = {
    probeOff,
    world: { w: world.w, h: world.h, day: world.day, year: world.year },
    worldSaveSha256: sha256(saveJson),
    worldSaveBytes: Buffer.byteLength(saveJson),
    advanceState: state,
    hydroResultSha256: sha256(JSON.stringify(hydroResults)),
    rngWitnessSha256: sha256(JSON.stringify(rngWitness)),
    rngWitness,
    hydrologySha256: sha256(fs.readFileSync(path.join(sourceRoot, 'inkbox/sim/hydrology.js'))),
  };
  return result;
}

const baseline = await run(BASELINE, false);
const diagnosticProbeOff = await run(path.join(ROOT, 'src'), true);
delete globalThis.__INKBOX_G2_H2_PROBE;
assert.deepEqual(diagnosticProbeOff.world, baseline.world);
assert.equal(diagnosticProbeOff.worldSaveSha256, baseline.worldSaveSha256);
assert.equal(diagnosticProbeOff.advanceState.upper, baseline.advanceState.upper);
assert.deepEqual(diagnosticProbeOff.advanceState, baseline.advanceState);
assert.equal(diagnosticProbeOff.hydroResultSha256, baseline.hydroResultSha256);
assert.deepEqual(diagnosticProbeOff.rngWitness, baseline.rngWitness);

const result = { status: 'PASS', baselineHead: BASE_SHA, seed: SEED, hydroCalls: 24, advanceCalls: 24,
  comparisons: ['World dimensions/day/year', 'serialized save SHA-256', 'advanceState', 'hydrology return sequence', 'post-sequence Life and ecology RNG witnesses'],
  baseline, diagnosticProbeOff };
const output = path.join(OUT, 'hydrology-probe-off-equivalence.json');
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, output, world: baseline.world, saveSha256: baseline.worldSaveSha256,
  advanceState: baseline.advanceState, rngWitnessSha256: baseline.rngWitnessSha256 }, null, 2));
