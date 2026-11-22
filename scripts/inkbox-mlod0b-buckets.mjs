import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { deserializeWorld } from '../src/inkbox/io/save.js';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';
import { villageSocieties } from '../src/inkbox/sim/sectEconomy.js';
import { projectJointBuckets, jointMarginals } from '../src/inkbox/sim/demography/jointBuckets.js';
import { buildPopulationCensus } from '../src/inkbox/sim/demography/legacyCensus.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, 'reports/mlod0b/buckets.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const grains = [['day', 1], ['week', 7], ['month', 30], ['year', 360], ['fiveYears', 1800]];
const report = { schema: 1, source: 'existing v11 entities', node: process.version,
  cpu: os.cpus()[0]?.model, inputs: [], synthetic: [] };

for (const age of [100, 400]) {
  const {saved,file,sha256:inputSha,bytes:inputBytes} = loadCheckpoint(age);
  const world = deserializeWorld(structuredClone(saved));
  const before = sha(Buffer.from(JSON.stringify(world.entities)));
  const observed = { age, file, sha256: inputSha, bytes: inputBytes,
    day: world.day, sourceEntities: world.entities.length, grains: [] };
  const legacySocieties = villageSocieties(world);
  const independentCensus = buildPopulationCensus(world, 'joint-bucket-check');
  const reverse = {...world, entities: [...world.entities].reverse()};
  for (const [label, days] of grains) {
    const start = performance.now();
    const projection = projectJointBuckets(world, {ageGrainDays: days});
    const buildMs = performance.now() - start;
    const traversalStart = performance.now();
    const reordered = projectJointBuckets(reverse, {ageGrainDays: days});
    assert.deepEqual([...projection.buckets.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      [...reordered.buckets.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      'entity iteration order changed joint counts');
    const reverseBuildMs = performance.now() - traversalStart;
    const marginalStart = performance.now();
    const marginals = jointMarginals(projection);
    const marginalQueryMs = performance.now() - marginalStart;
    const encoded = Buffer.from(JSON.stringify([...projection.buckets.values()]));
    const mismatches = [];
    for (const [id, society] of legacySocieties) {
      const got = marginals.villages.get('mortal')?.get(id);
      for (const field of ['humans', 'mortals', 'mortalAdults', 'practitioners', 'fertileMortals']) {
        if ((got?.[field] ?? 0) !== society[field]) mismatches.push({villageId: id, field, legacy: society[field], bucket: got?.[field] ?? 0});
      }
    }
    for (const [id, facts] of independentCensus.villages) {
      const got = marginals.villages.get('mortal')?.get(id);
      for (const field of ['humans', 'mortals', 'mortalAdults', 'fertileMortals']) {
        if ((got?.[field] ?? 0) !== facts.society[field]) mismatches.push({villageId: id, field, census: facts.society[field], bucket: got?.[field] ?? 0});
      }
    }
    // Sect truth is recomputed directly from old entity records. Stored caches may lag.
    for (const sect of world.factions) {
      let followers = 0, pop = 0;
      for (const entity of world.entities) {
        if (entity.faction !== sect.id) continue;
        followers++;
        if ((entity.sp === 'human' || entity.sp === 'cultivator') && entity.level > 0
          && entity.hp > 0 && entity.age < entity.lifespan && !entity._ascended) pop++;
      }
      const got = marginals.sects.get('mortal')?.get(sect.id);
      if ((got?.followers ?? 0) !== followers || (got?.pop ?? 0) !== pop) {
        mismatches.push({sectId: sect.id, followers, pop, bucket: got});
      }
      const independent = independentCensus.sects.get(sect.id);
      if ((got?.followers ?? 0) !== independent.followers || (got?.pop ?? 0) !== independent.pop) {
        mismatches.push({sectId: sect.id, independent, bucket: got});
      }
    }
    const counts = [...projection.buckets.values()].map(bucket => bucket.count);
    observed.grains.push({label, days, records: projection.records, living: projection.living, bucketCount: counts.length,
      meanPeoplePerBucket: projection.records / counts.length,
      singletonBuckets: counts.filter(count => count === 1).length,
      singletonFraction: counts.filter(count => count === 1).length / counts.length,
      maxBucket: Math.max(...counts), unknownOrigin: projection.unknownOrigin,
      buildMs, reverseBuildMs, marginalQueryMs, jsonBytes: encoded.length, mismatches});
    assert.deepEqual(mismatches, [], `${age}y ${label} has incompatible legacy margins`);
  }
  assert.equal(sha(Buffer.from(JSON.stringify(world.entities))), before, 'projection wrote entities');
  report.inputs.push(observed);
}

const fixture = {entities: [
  {sp: 'cultivator', level: 0, hp: 10, age: 18 * 360, lifespan: 100 * 360, village: 2, faction: 7},
  {sp: 'human', level: 1, hp: 10, age: 50 * 360, lifespan: 100 * 360, village: 2, faction: 7},
  {sp: 'beast', level: 0, hp: 10, age: 20 * 360, lifespan: 100 * 360, village: 2, faction: 0},
  {sp: 'human', level: 0, hp: 0, age: 21 * 360, lifespan: 100 * 360, village: 2, faction: 7}
], upper: {entities: [{sp: 'spirit', level: 2, hp: 10, age: 100, lifespan: 1000, village: 2, faction: 7}]},
nether: {entities: [{sp: 'beast', level: 0, hp: 10, age: 100, lifespan: 1000, village: 0, faction: 0}]}};
const fixtureFacts = jointMarginals(projectJointBuckets(fixture));
assert.deepEqual({residents: fixtureFacts.villages.get('mortal').get(2).residents,
  humans: fixtureFacts.villages.get('mortal').get(2).humans, mortals: fixtureFacts.villages.get('mortal').get(2).mortals,
  fertileMortals: fixtureFacts.villages.get('mortal').get(2).fertileMortals,
  followers: fixtureFacts.sects.get('mortal').get(7).followers, pop: fixtureFacts.sects.get('mortal').get(7).pop},
  {residents: 3, humans: 2, mortals: 1, fertileMortals: 1, followers: 3, pop: 1});
assert.equal(fixtureFacts.planes.get('mortal').residents, 3);
assert.equal(fixtureFacts.planes.get('upper').residents, 1);
assert.equal(fixtureFacts.planes.get('nether').residents, 1);
assert.equal(fixtureFacts.sects.get('upper').get(7).pop, 1);
assert.equal(fixtureFacts.sects.get('upper').get(7).followers, 0);
assert.equal(fixtureFacts.villages.get('mortal').get(2).residents, 3);
assert.equal(fixtureFacts.villages.get('upper').get(2).residents, 1);
report.edgeFixture = 'level, species, adult boundary, dead follower, beast resident, upper and nether plane passed';

// The synthetic study changes counts and number of occupied joint cells independently.
for (const population of [10_000, 200_000, 1_000_000]) {
  for (const occupied of [50, 300, 1000, 5000, 20000]) {
    const start = performance.now();
    const buckets = new Map();
    const base = Math.floor(population / occupied);
    for (let index = 0; index < occupied; index++) buckets.set(index, base + (index < population % occupied ? 1 : 0));
    let people = 0;
    for (const count of buckets.values()) people += count;
    const traverseMs = performance.now() - start;
    assert.equal(people, population);
    const serialized = Buffer.byteLength(JSON.stringify([...buckets]));
    report.synthetic.push({population, occupiedBuckets: occupied, traverseMs, serializedBytes: serialized,
      bytesPerBucket: serialized / occupied});
  }
}
report.pass = true;
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({pass: report.pass, real: report.inputs.map(input => ({age: input.age, grains: input.grains.length})), synthetic: report.synthetic.length}));

