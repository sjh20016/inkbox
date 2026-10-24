#!/usr/bin/env node
import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { arriveUpper } from '../src/inkbox/world/planes.js';
import { Life } from '../src/inkbox/sim/life.js';
import { SPECIES_INFO, TIME, TERRAIN } from '../src/inkbox/core/config.js';
import { REALMS, lifespanFor, BREAKTHROUGH_LIFE_DAYS } from '../src/inkbox/core/cultivation.js';
import { awaken, attemptBreakthrough, lifespanForEntity, stepEntity, maxHpFor, combatPower } from '../src/inkbox/sim/cultivation.js';
import { attachSoul, stepReincarnation, diedOfOldAge } from '../src/inkbox/sim/reincarnation.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';

const year = TIME.daysPerYear;
let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }
function fixture() {
  const world = new World(64, 64, 61001);
  world.height.fill(0.48); world.type.fill(TERRAIN.GRASS); world.water.fill(0);
  const life = new Life(world, () => 0.5);
  // A developer fixture, deliberately not natural birth or a free disciple source.
  life.spawn(32, 32, 'human', 1);
  const entity = world.entities.at(-1);
  entity.age = 0; entity.lifespan = SPECIES_INFO.human.lifespan;
  return { world, entity };
}
function trained() {
  const result = fixture();
  awaken(result.entity, () => 0.5);
  result.entity.root.quality = 4;
  result.entity.fortune = 100;
  result.entity.bloodline = null;
  result.entity.heartDemon = 0;
  return result;
}

check('single REALMS table: level 0 / 1 / 9 / 10 / 19 / 20 and every realm cap', () => {
  const examples = [[0, 62.5], [1, 62.5 + 47.5 / 9], [9, 110], [10, 123], [19, 240], [20, 278]];
  for (const [level, expected] of examples) assert.ok(Math.abs(lifespanFor(level) - expected) < 1e-8);
  for (let level = 1; level <= 69; level += 1) assert.ok(lifespanFor(level) > lifespanFor(level - 1));
  for (const realm of REALMS) assert.equal(lifespanFor(realm.max), realm.lifespan);
  assert.equal(lifespanFor(1000), 16000);
  assert.equal(lifespanForEntity({ bloodline: '玄武血脉' }, 0), 62.5 * year);
});

check('real awakening keeps identity and age and only raises existing lifespan', () => {
  const { entity } = fixture();
  const id = entity.id; entity.age = 25 * year;
  assert.equal(awaken(entity, () => 0.5), true);
  assert.equal(entity.id, id); assert.equal(entity.age, 25 * year);
  assert.equal(entity.level, 1); assert.ok(entity.lifespan > 65 * year);
  const first = entity.lifespan;
  assert.equal(awaken(entity, () => 0.5), false); assert.equal(entity.lifespan, first);
  const old = fixture().entity; old.lifespan = 100 * year;
  awaken(old, () => 0.5); assert.equal(old.lifespan, 100 * year);
});

check('ordinary and remembered infants share mortal health and power until real entry', () => {
  for (const sp of ['human', 'cultivator']) {
    const { entity } = fixture(); entity.sp = sp;
    assert.equal(maxHpFor(entity), 100); assert.equal(combatPower(entity), 1);
    awaken(entity, () => 0.5);
    assert.equal(entity.level, 1); assert.equal(entity.maxHp, 341);
    assert.equal(entity.hp, 341); assert.equal(maxHpFor(entity), 341);
    assert.ok(combatPower(entity) > 1);
  }
});

check('natural awakening starts at absolute 18 years in either plane; active awakening remains available', () => {
  for (const plane of ['mortal', 'upper']) {
    const { world, entity } = fixture(); world.plane = plane;
    entity.age = 18 * year - 2;
    stepEntity(world, entity, 1, () => { throw new Error('underage natural awakening must not draw'); });
    assert.equal(entity.age, 18 * year - 1); assert.equal(entity.level, 0);
    let draws = 0;
    stepEntity(world, entity, 1, () => draws++ ? 0.5 : 0);
    assert.equal(entity.age, 18 * year); assert.equal(entity.level, 1);
    assert.ok(entity.lifespan > 65 * year);
  }
  const { entity } = fixture();
  awaken(entity, () => 0.5);
  assert.equal(entity.age, 0); assert.equal(entity.level, 1);
});

check('natural entry records one supported disciple immediately; cutoff entry becomes independent', () => {
  for (const supplied of [true, false]) {
    const { world, entity } = fixture();
    entity.age = 18 * year - 1; entity.village = 7; entity.faction = 7;
    const sect = { id: 7, destroyedDay: -1, villages: [7], resources: { provisions: 10 } };
    world.factions.push(sect);
    world.villages.push({ id: 7, name: '出生村', x: 32, y: 32, faction: 7,
      hp: 100, food: supplied ? 200 : 0, fieldTiles: [] });
    const neighbor = structuredClone(entity);
    neighbor.id += 1; neighbor.age = 30 * year;
    world.entities.push(neighbor);
    let draws = 0;
    stepEntity(world, entity, 1, () => draws++ ? 0.5 : 0);
    assert.equal(entity.level, 1); assert.equal(entity.village, 7);
    assert.equal(entity.faction, supplied ? 7 : 0);
    assert.equal(sect.economy?.recruited || 0, supplied ? 1 : 0);
    if (supplied) assert.equal(sect.economy.lastRecruitDay, world.day);
    stepEntity(world, entity, 1, () => 0.999);
    assert.equal(sect.economy?.recruited || 0, supplied ? 1 : 0);
  }
});

check('ordinary progress and realm breakthroughs never shorten age or stack rewards', () => {
  const { world, entity } = trained();
  entity.age = 30 * year;
  let previous = entity.lifespan;
  for (let n = 1; n < 20; n += 1) {
    entity.exp = 1e6;
    attemptBreakthrough(world, entity, () => 0.3);
    assert.equal(entity.level, n + 1);
    assert.ok(entity.lifespan >= previous); assert.equal(entity.age, 30 * year);
    previous = entity.lifespan;
  }
  const at20 = entity.lifespan;
  assert.equal(at20, lifespanForEntity(entity, 20) + BREAKTHROUGH_LIFE_DAYS);
  // Reaching the same gate after a setback cannot stack another 12000 days.
  entity.level = 19; entity.exp = 1e6;
  attemptBreakthrough(world, entity, () => 0.3);
  assert.equal(entity.lifespan, at20);
  entity.level = 20; entity.lifespan = 1000 * year; entity.exp = 1e6;
  attemptBreakthrough(world, entity, () => 0.3);
  assert.equal(entity.lifespan, 1000 * year);
});

check('failure has real loss, cannot extend life, and ordinary ticks cannot refund it', () => {
  const { world, entity } = trained();
  entity.root.quality = 0; entity.fortune = 50;
  entity.level = 18; entity.lifespan = lifespanForEntity(entity, 18); entity.exp = 1e6;
  const original = entity.lifespan; entity._lifespan0 = original;
  let draws = 0;
  attemptBreakthrough(world, entity, () => draws++ === 0 ? 0.999 : 0.1);
  assert.equal(entity.level, 17); assert.ok(entity.lifespan < original);
  const lost = entity.lifespan;
  entity.age = lost + 1;
  assert.equal(diedOfOldAge(entity), false);
  entity.age = 30 * year; entity.exp = 0;
  stepEntity(world, entity, 1, () => 0.999);
  assert.equal(entity.lifespan, lost);
  entity.level = 18; entity.lifespan = 70 * year; entity.exp = 1e6; draws = 0;
  attemptBreakthrough(world, entity, () => draws++ === 0 ? 0.999 : 0.1);
  assert.equal(entity.lifespan, 70 * year);
});

check('reincarnated infant retains previous identity and potential but no cultivation lifespan', () => {
  const { world, entity } = fixture();
  entity.sp = 'cultivator';
  const root = { elements: ['水'], quality: 3, rootName: '水灵根', bonus: 0.06, mutated: null };
  const soul = { id: 12, incarnation: 4, ofName: '前身', ofLevel: 35, ofRoot: root,
    fragments: 3, ofSectName: '旧宗', bonds: [], route: 'natural' };
  attachSoul(world, entity, soul, () => { throw new Error('soul attachment must not roll lifespan'); });
  assert.equal(entity.level, 0); assert.equal(entity.age, 0);
  assert.equal(entity.lifespan, 62.5 * year); assert.equal(entity.soulId, 12);
  assert.equal(entity.incarnation, 5); assert.equal(entity.pastLife.name, '前身');
  assert.equal(entity.pastLife.realm, '元婴 35 重'); assert.equal(entity.root.quality, 4);
  assert.equal(root.quality, 3);
  entity.age = 15 * year;
  const before = entity.lifespan;
  stepReincarnation(world, 0, () => 0.5);
  assert.equal(entity.pastLife.remembered, true);
  assert.equal(entity.level, 0); assert.equal(entity.lifespan, before);
  // A retained cultivator identity follows the same real adult natural-entry path.
  entity.age = 18 * year - 1;
  let draws = 0;
  stepEntity(world, entity, 1, () => draws++ ? 0.5 : 0);
  assert.equal(entity.level, 1); assert.equal(entity.root.quality, 4);
  assert.ok(entity.lifespan > before); assert.equal(entity.age, 18 * year);
});

check('save and realm transport data preserve legacy age / lifespan without curve migration', () => {
  const { world, entity } = trained();
  entity.level = 16; entity.age = 180 * year; entity.lifespan = 270 * year;
  const copy = deserializeWorld(serializeWorld(world));
  const restored = copy.entities.find(e => e.id === entity.id);
  assert.equal(restored.age, entity.age); assert.equal(restored.lifespan, entity.lifespan);
  assert.equal(restored.level, entity.level);
  const upper = new World(64, 64, 61002); upper.plane = 'upper';
  upper.height.fill(0.48); upper.type.fill(TERRAIN.GRASS);
  const arrival = arriveUpper(upper, entity, world);
  assert.equal(arrival.age, entity.age); assert.equal(arrival.lifespan, entity.lifespan);
  assert.equal(arrival.level, entity.level); assert.notEqual(arrival.id, entity.id);
  const upperRestored = deserializeWorld(serializeWorld(upper)).entities.find(e => e.id === arrival.id);
  assert.equal(upperRestored.age, entity.age); assert.equal(upperRestored.lifespan, entity.lifespan);
});

console.log(`C1 longevity: ${checks} groups passed.`);
