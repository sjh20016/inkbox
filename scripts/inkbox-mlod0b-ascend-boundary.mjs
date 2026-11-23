import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeApi } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { deriveUpperSeed, deriveNetherSeed, createPlanes } from '../src/inkbox/world/planes.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { advanceWorld } from '../src/inkbox/sim/advance.js';
import { buildPopulationCensus } from '../src/inkbox/sim/demography/legacyCensus.js';
import { captureRuntimeState } from '../src/inkbox/sim/runtimeState.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = { test: 'MLOD-0B real cultivation ascend source cleanup with attached planes',
  input: '100-year supplied natural checkpoint', mode: 'controlled single-person promotion fixture; official Life.stepEntity and Life.step cleanup',
  dt: 10, pass: false };
const api = await nativeApi(root);
try {
  const { saved, sha256 } = loadCheckpoint(100);
  evidence.inputSha256 = sha256;
  const c = api.restore(saved), mortal = c.world;
  const archivedPerson = mortal.entities.find(e => e.hp > 0 && !e._ascended && e.age < e.lifespan);
  assert.ok(archivedPerson, 'natural save supplies a living person to promote in the controlled fixture');

  const preset = { w: mortal.w, h: mortal.h };
  const upper = generateUpperWorld({ preset, seed: mortal.seed });
  const nether = generateNetherWorld({ preset, seed: mortal.seed });
  assert.equal(upper.seed, deriveUpperSeed(mortal.seed));
  assert.equal(nether.seed, deriveNetherSeed(mortal.seed));
  mortal.upper = upper; mortal.nether = nether;
  const planes = createPlanes(mortal, upper, nether);
  assert.equal(planes.nether.souls, mortal.souls, 'nether soul alias remains the attached mortal soul pool');
  c.upperLife = new UpperLife(upper);

  // The supplied archive has no cultivators. Promote one real archived mortal in
  // this isolated fixture so the actual level-60 gate is reachable without
  // bypassing it or changing simulation code.
  archivedPerson.sp = 'cultivator';
  archivedPerson.level = 60;
  archivedPerson.exp = 0;
  archivedPerson.pollution = 0;
  archivedPerson.root = { elements: ['wood'], quality: 1 };
  archivedPerson.techniques ||= [];
  archivedPerson.artifacts ||= [];
  archivedPerson.relations ||= new Map();
  archivedPerson.hp = Math.max(1, archivedPerson.hp);
  const source = archivedPerson, sourceId = source.id;
  mortal.entities = [source]; // isolate only the promoted witness; archive remains immutable
  const countAt = () => {
    const census = buildPopulationCensus(mortal, 'ascend-boundary');
    return Object.fromEntries(['mortal','upper','nether'].map(p => [p, census.byPlane.get(p)?.total ?? 0]));
  };
  const beforeCounts = countAt();
  const mortalIdsBefore = new Set(mortal.entities.map(e => e.id));
  const originalStepEntity = c.life.stepEntity;
  let midStep = null;
  c.life.stepEntity = function (entity, dtDays, ...rest) {
    const result = originalStepEntity.call(this, entity, dtDays, ...rest);
    if (entity === source && result === false && entity._ascended) {
      const arrivals = upper.entities.filter(e => e.id !== sourceId && upper.arrivedLog?.some(row => row.fromKey === `mortal:${sourceId}` && row.id === e.id));
      midStep = { status: result, sourceStillInMortal: mortal.entities.includes(source), sourceMarkedAscended: source._ascended,
        matchingUpperCopies: arrivals.length, sameObject: arrivals.some(e => e === source) };
    }
    return result;
  };
  const stepResult = advanceWorld(mortal, evidence.dt, c);
  c.life.stepEntity = originalStepEntity;
  assert.equal(stepResult.upper, true, 'official 10-day advance fired attached UpperLife branch');
  assert.ok(midStep, 'official mortal Life.stepEntity called the actual cultivation step and captured its in-loop state');
  assert.equal(midStep.sourceStillInMortal, true, 'formal source cleanup occurs after Life.stepEntity returns');
  assert.equal(midStep.sourceMarkedAscended, true);
  assert.equal(midStep.matchingUpperCopies, 1, 'exactly one destination copy exists before source cleanup');
  assert.equal(midStep.sameObject, false, 'cross-plane transfer uses an independent snapshot object');
  assert.equal(mortal.entities.includes(source), false, 'official Life.step cleanup removed ascended source');

  const copy = upper.entities.find(e => upper.arrivedLog?.some(row => row.fromKey === `mortal:${sourceId}` && row.id === e.id));
  assert.ok(copy && copy !== source);
  assert.equal(source._ascended, true);
  assert.equal(copy._ascended, undefined);
  assert.equal(copy.id, upper.arrivedLog.find(row => row.fromKey === `mortal:${sourceId}`).id);
  assert.ok(copy.id >= 1_000_000);
  assert.equal(copy.faction, 0); assert.equal(copy.clan, 0); assert.equal(copy.gen, 0); assert.equal(copy.village, 0);
  assert.equal(copy.relations.size, 0);
  assert.equal(copy.hp > 0, true);
  assert.equal(upper.arrivedLog.filter(row => row.fromKey === `mortal:${sourceId}`).length, 1);
  assert.equal(upper.popLog.arrived, 1);
  assert.equal(upper.popLog.arrivedThunder, 0, 'ordinary 60-level ascend is not mislabeled as thunder');
  const afterCounts = countAt();
  evidence.populationAtBoundary = { beforeCounts, afterCounts };
  assert.equal(afterCounts.upper - beforeCounts.upper, 1);
  const additionalMortalIds = mortal.entities.filter(e => !mortalIdsBefore.has(e.id)).map(e => e.id);
  assert.equal(afterCounts.mortal, beforeCounts.mortal - 1 + additionalMortalIds.length,
    'source removal and any independent births account for the final mortal count');

  const ids = {};
  for (const plane of ['mortal','upper','nether']) {
    const w = plane === 'mortal' ? mortal : mortal[plane];
    ids[plane] = (w.entities || []).map(e => e.id);
    assert.equal(new Set(ids[plane]).size, ids[plane].length, `${plane} ids unique`);
  }
  assert.equal(ids.mortal.includes(sourceId), false);
  assert.equal(ids.upper.includes(copy.id), true);
  for (const [a,b] of [['mortal','upper'],['mortal','nether'],['upper','nether']])
    assert.equal(ids[a].some(id => ids[b].includes(id)), false, `${a}/${b} ID ranges disjoint`);

  const runtime = captureRuntimeState({ world: mortal, life: c.life, upperLife: c.upperLife, advanceState: c.state, playerRng: c.playerRng });
  assert.equal(runtime.exact, true, 'G8 runtime checkpoint remains exact with attached upper controller');
  assert.ok(runtime.upperLife?.rng && runtime.upperLife?.spatialRng, 'G8 upper life and spatial streams captured');
  assert.equal(upper.day, mortal.day, 'official advance synchronized attached upper clock');
  assert.equal(nether.day, mortal.day, 'official advance synchronized attached nether clock');

  evidence.pass = true;
  evidence.result = { sourceId, upperId: copy.id, crossPlaneWasTwoObjectsDuringStep: true, sourceRemovedAfterStep: true,
    countsBefore: beforeCounts, countsAfter: afterCounts, additionalMortalIds,
    entityCounts: Object.fromEntries(Object.entries(ids).map(([p,x])=>[p,x.length])),
    day: mortal.day, advanceFired: stepResult, g8Exact: runtime.exact, g8UpperStreams: Object.keys(runtime.upperLife),
    arrival: upper.arrivedLog.find(row => row.fromKey === `mortal:${sourceId}`) };
} catch (error) {
  evidence.error = error.stack;
} finally {
  const out = path.join(root, 'reports/mlod0b/ascend-boundary.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
}
console.log(`MLOD-0B ascend boundary: ${evidence.pass ? 'PASS' : 'FAIL'}; report reports/mlod0b/ascend-boundary.json`);
if (!evidence.pass) process.exitCode = 1;
