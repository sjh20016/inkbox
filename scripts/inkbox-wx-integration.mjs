import { cultivationRate } from '../src/inkbox/sim/cultivation.js';
import assert from 'node:assert/strict';
import { createSandboxWorld } from '../src/inkbox/ui/worldCreation.js';
import { enableWanxiang } from '../src/inkbox/wanxiang/runtime.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { Life } from '../src/inkbox/sim/life.js';
import { rngStream, rngStateOf } from '../src/inkbox/core/noise.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { previewChangeSet, commitChangeSet } from '../src/inkbox/wanxiang/changes.js';
import { WORLD_PRESETS, SPECIES } from '../src/inkbox/core/config.js';

const makeWorld = seed => createSandboxWorld(WORLD_PRESETS.small, seed, { terrainPreset: 'standard' });
const makeLife = world => new Life(world, rngStream(world.seed ^ 0xa5a5a5a5));
const spawnCultivator = (world, life) => {
  // The official Life path creates a complete entity and, after enableWanxiang,
  // attaches its persistent identity/profile through initializeBornProfile.
  const tile = Array.from({ length: world.w * world.h }, (_, index) => index)
    .find(index => world.isWalkable(index) && !world.struct[index]);
  assert.notEqual(tile, undefined, 'small sandbox should have a walkable unoccupied tile');
  assert.equal(life.spawn(tile % world.w, Math.floor(tile / world.w), SPECIES.CULTIVATOR, 1, 0, { genesis: true }), 1);
  return world.entities.findLast(entity => entity.sp === SPECIES.CULTIVATOR);
};

const world = makeWorld(62029);
enableWanxiang(world);
const life = makeLife(world);
const cultivator = spawnCultivator(world, life);
assert.ok(cultivator?.wanxiang, 'Life.spawn must create a living cultivator with a persistent profile');
advanceWorld(world, 1, { life, state: createAdvanceState() });

const saved = serializeWorld(world);
const loaded = deserializeWorld(saved);
assert.equal(loaded.wanxiang.enabled, true);
assert.ok(loaded.entities.some(e => e.wanxiang), 'at least one world entity should have a persistent profile');
for (const plane of ['upper', 'nether']) {
  assert.equal(loaded[plane]?.wanxiang?.enabled, true, `${plane} profile survives save/load`);
}

const broken = structuredClone(saved);
broken.wanxiang = { version: 1, world: { enabled: true }, profiles: [{ key: 'mortal:missing', profile: {} }] };
assert.throws(() => deserializeWorld(broken), /wanxiang|identity|profile/i, 'malformed profile block must reject the save');

const command = { id: 'integration-root', key: `mortal:${cultivator.id}`, mode: 'player', expectedRevision: 0,
  operations: [{ op: 'set', field: 'root', value: { elements: ['fire'], purity: 90, natural: false, heavenly: false } }] };
const profileBeforePreview = JSON.stringify(cultivator.wanxiang);
const mainRngBeforePreview = rngStateOf(life.rng);
assert.equal(previewChangeSet(world, command).ok, true);
assert.equal(JSON.stringify(cultivator.wanxiang), profileBeforePreview, 'preview must not mutate profile');
assert.deepEqual(rngStateOf(life.rng), mainRngBeforePreview, 'preview must not consume the main RNG');

// Compare equivalent worlds with and without the preview call. Life.advance is
// allowed to consume its normal RNG; preview must not shift that sequence.
const rngWorldA = makeWorld(62031), rngWorldB = makeWorld(62031);
enableWanxiang(rngWorldA); enableWanxiang(rngWorldB);
const lifeA = makeLife(rngWorldA), lifeB = makeLife(rngWorldB);
const cultivatorA = spawnCultivator(rngWorldA, lifeA), cultivatorB = spawnCultivator(rngWorldB, lifeB);
const rngCommand = { ...command, key: `mortal:${cultivatorA.id}` };
const rngBefore = rngStateOf(lifeA.rng);
assert.equal(previewChangeSet(rngWorldA, rngCommand).ok, true);
assert.deepEqual(rngStateOf(lifeA.rng), rngBefore, 'preview call itself must preserve the main RNG state');
advanceWorld(rngWorldA, 1, { life: lifeA, state: createAdvanceState() });
advanceWorld(rngWorldB, 1, { life: lifeB, state: createAdvanceState() });
assert.deepEqual(rngStateOf(lifeA.rng), rngStateOf(lifeB.rng), 'preview must not shift normal advance RNG consumption');

// Commit through the public changeset API and verify it mutates the live entity.
const committed = commitChangeSet(world, command);
assert.equal(committed.ok, true, 'valid change must commit');
assert.deepEqual(cultivator.wanxiang.root, { elements: ['fire'], purity: 90, natural: false, heavenly: false });
assert.equal(cultivator.wanxiang.revision, 1, 'commit must advance profile revision');

const singleRate=cultivationRate(world,cultivator);
const weaker=commitChangeSet(world,{...command,id:'integration-multiroot',expectedRevision:cultivator.wanxiang.revision,operations:[{op:'set',field:'root',value:{elements:['metal','wood','water','fire','earth'],purity:50,natural:false,heavenly:false}}]});
assert.ok(weaker.ok);
assert.ok(cultivationRate(world,cultivator)<singleRate,'new root tiers change real cultivation without stacking legacy bonus');
const duplicate = serializeWorld(world);
const normalized = serializeWorld(deserializeWorld(duplicate));
// Older sandbox saves can omit lazily-created realms; loading materializes
// them. Once normalized, further save/load cycles must be byte-for-byte stable.
assert.deepEqual(serializeWorld(deserializeWorld(normalized)), normalized, 'normalized serialize/deserialize cycle must be idempotent');

// Legacy worlds without Wanxiang metadata remain loadable and opt out cleanly.
const legacy = structuredClone(saved);
delete legacy.wanxiang;
for (const plane of ['upper', 'nether']) if (legacy[plane]) delete legacy[plane].wanxiang;
const legacyLoaded = deserializeWorld(legacy);
assert.notEqual(legacyLoaded.wanxiang?.enabled, true, 'legacy save must not silently opt into Wanxiang');
console.log('wanxiang integration: official Life.spawn, runtime advance, three-plane persistence, malformed block rejection, legacy save, changeset commit, preview purity and RNG equivalence, and save idempotence passed');
