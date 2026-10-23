#!/usr/bin/env node
import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { Life, POP_SOFT_CAP } from '../src/inkbox/sim/life.js';
import { pickParents } from '../src/inkbox/sim/family.js';
import { isAdult, isFertileAge } from '../src/inkbox/core/demographics.js';
import { SPECIES_INFO, TERRAIN, LIMITS } from '../src/inkbox/core/config.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { grantRoot, placeLeyline } from '../src/inkbox/sim/divine.js';
import { villageSociety } from '../src/inkbox/sim/sectEconomy.js';
import { OVER } from '../src/inkbox/world/terrain.js';

const Y = 360;
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
function fixture(count = 2) {
  const world = new World(80, 64, 61001);
  world.height.fill(0.48); world.type.fill(TERRAIN.GRASS);
  world.water.fill(0); world.veg.fill(0.9); world.moist.fill(0.6); world.temp.fill(0.55);
  const life = new Life(world, () => 0.5);
  const village = life.foundVillage(30, 30, 0);
  village.food = 200; village.hp = 100; village.buildCooldown = 1e9;
  life.spawn(30, 30, 'human', count, 0, { village: village.id });
  for (const e of world.entities) e.age = 25 * Y;
  life.syncVillagePops(); life.rebuildGrid();
  return { world, life, village, parents: world.entities.slice(0, 2) };
}
const birth = (f, parents = f.parents, count = 1) => f.life.spawn(30, 30, 'cultivator', count, 0,
  { village: f.village.id, allowSouls: true, parents });

check('absolute 18-year adulthood and 18–50 fertility never depend on lifespan', () => {
  for (const lifespan of [60, 110, 240, 620].map(n => n * Y)) {
    assert.equal(isAdult({ age: 18 * Y - 1, lifespan }), false);
    assert.equal(isAdult({ age: 18 * Y, lifespan }), true);
    assert.equal(isFertileAge({ age: 50 * Y, lifespan }), false);
  }
  const f = fixture();
  assert.ok(pickParents(f.life, f.village).every(Boolean));
  f.parents[0].age = 18 * Y - 1;
  assert.deepEqual(pickParents(f.life, f.village), [null, null]);
});

check('formal newborn has age zero, mortal longevity, real parents and immutable source', () => {
  const f = fixture();
  const ids = f.parents.map(e => e.id), names = f.parents.map(e => e.name);
  assert.equal(birth(f), 1);
  const child = f.world.entities.at(-1);
  assert.equal(child.sp, 'human'); assert.equal(child.level, 0); assert.equal(child.age, 0);
  assert.ok(child.lifespan >= 60 * Y && child.lifespan <= 65 * Y);
  assert.deepEqual([child.parentA, child.parentB], ids);
  assert.equal(child.birthOrigin.kind, 'village');
  assert.deepEqual(child.birthOrigin.parentNames, names);
  assert.equal(child.birthOrigin.villageId, f.village.id);
});

check('old short-lived residents bridge through real adult cultivator parents without lifespan migration', () => {
  const f = fixture(3);
  for (const parent of f.parents) { parent.sp = 'cultivator'; parent.level = 5; parent.lifespan = 110 * Y; }
  const legacy = f.world.entities[2]; legacy.age = 2000; legacy.lifespan = 4200;
  const before = f.world.entities.map(e => [e.id, e.age, e.lifespan]);
  assert.ok(pickParents(f.life, f.village).every(Boolean));
  assert.equal(birth(f), 1);
  assert.deepEqual(f.world.entities.slice(0, 3).map(e => [e.id, e.age, e.lifespan]), before);
  assert.equal(f.world.entities.at(-1).level, 0);
  assert.ok(f.world.entities.at(-1).lifespan >= 60 * Y);
});

check('no local mortals, invalid pairs or extinct society cannot create people or consume souls', () => {
  const f = fixture();
  f.world.souls.push({ id: 9, dueDay: 0, name: '旧人', level: 20, incarnation: 1 });
  const invalid = [[f.parents[0], f.parents[0]], [f.parents[0], null],
    [f.parents[0], { ...f.parents[1] }]];
  for (const pair of invalid) assert.equal(birth(f, pair), 0);
  for (const parent of f.parents) { parent.sp = 'cultivator'; parent.level = 2; }
  assert.equal(birth(f), 0);
  assert.equal(f.world.souls.length, 1);
  f.world.entities.push({ ...f.parents[0], id: 999, sp: 'human', level: 0, village: 999 });
  assert.equal(birth(f), 0, 'a different village is not a local mortal society');
  assert.equal(f.world.entities.length, 3);
});

check('a soul attaches only to a real newborn, retaining identity without cultivation or longevity', () => {
  const f = fixture();
  f.world.souls.push({ id: 9, dueDay: 0, name: '前生某人', level: 30, incarnation: 2,
    root: { quality: 4, elements: ['木'], rootName: '木灵根', bonus: 0.08 } });
  assert.equal(birth(f), 1);
  const child = f.world.entities.at(-1);
  assert.equal(child.sp, 'cultivator'); assert.equal(child.level, 0); assert.equal(child.age, 0);
  assert.ok(child.pastLife); assert.equal(child.soulId, 9);
  assert.ok(child.lifespan >= 60 * Y && child.lifespan <= 65 * Y);
  assert.equal(f.world.souls.length, 0);
  assert.deepEqual([child.parentA, child.parentB], f.parents.map(e => e.id));
});

check('actual village clock gives adults the work, guards food and cannot reproduce from children', () => {
  const f = fixture(4);
  f.world.entities[2].age = 0;
  f.world.entities[3].sp = 'cultivator'; f.world.entities[3].level = 1;
  f.life.syncVillagePops(); f.life.rebuildGrid();
  const society = villageSociety(f.world, f.village);
  assert.deepEqual([society.humans, society.mortals, society.mortalAdults, society.practitioners], [4, 3, 2, 1]);
  f.life.rng = () => 0;
  const before = f.world.entities.length;
  f.life.stepVillages(3);
  assert.equal(f.world.entities.length, before + 1, 'confirmed favorable birth draw uses actual adults');
  assert.equal(f.world.entities.at(-1).birthOrigin.kind, 'village');
  for (const e of f.world.entities) e.age = 0;
  f.life.syncVillagePops();
  const n = f.world.entities.length, food = f.village.food;
  f.life.stepVillages(3);
  assert.equal(f.world.entities.length, n);
  assert.ok(f.village.food < food, 'children and cultivated people do not produce free grain');
});

check('small real adult migrant families can split, settle and produce descendants', () => {
  const f = fixture(20);
  f.life.rng = () => 0;
  f.life.maybeSplitVillage(f.village, 3);
  assert.equal(f.world.villages.length, 2);
  const childVillage = f.world.villages[1];
  // Migration is physical movement, not an instant teleport to the child site.
  for (const e of f.world.entities.filter(e => e.village === childVillage.id)) {
    e.tx = childVillage.x; e.ty = childVillage.y;
    f.life.moveTowards(e, 8, SPECIES_INFO.human);
  }
  f.life.rebuildGrid();
  const parents = pickParents(f.life, childVillage);
  assert.ok(parents.every(Boolean));
  assert.ok(parents.every(isAdult));
  assert.equal(f.life.spawn(childVillage.x, childVillage.y, 'human', 1, 0,
    { village: childVillage.id, allowSouls: true, parents }), 1);
  assert.equal(f.world.entities.at(-1).parentA, parents[0].id);
});

check('soft birth cap and hard entity cap stop real creation without losing a waiting soul', () => {
  const f = fixture();
  while (f.world.entities.length < POP_SOFT_CAP) f.world.addEntity({ sp: 'beast', age: 0, hp: 1, lifespan: 1000 });
  f.world.souls.push({ id: 9, dueDay: 0 });
  assert.equal(birth(f), 0); assert.equal(f.world.souls.length, 1);
  while (f.world.entities.length < LIMITS.maxEntities) f.world.addEntity({ sp: 'beast', age: 0, hp: 1, lifespan: 1000 });
  assert.equal(f.life.spawn(30, 30, 'human', 1), 0);
  assert.equal(f.world.entities.length, LIMITS.maxEntities);
});

check('birth sources and old age/lifespan survive save/load; grantRoot and leyline use real identities', () => {
  const f = fixture(); birth(f);
  const child = f.world.entities.at(-1), id = child.id, age = child.age, origin = structuredClone(child.birthOrigin);
  const copy = deserializeWorld(serializeWorld(f.world));
  assert.deepEqual(copy.entities.find(e => e.id === id).birthOrigin, origin);
  const old = serializeWorld(f.world); old.entities.forEach(row => row.length = 70);
  const oldCopy = deserializeWorld(old);
  assert.equal(oldCopy.entities[0].age, f.parents[0].age);
  assert.equal(oldCopy.entities[0].lifespan, f.parents[0].lifespan);
  assert.equal(oldCopy.entities[0].birthOrigin, null);
  const n = copy.entities.length;
  grantRoot(copy, child.x, child.y, 1, () => 0.5);
  const actual = copy.entities.find(e => e.id === id);
  assert.equal(copy.entities.length, n); assert.equal(actual.id, id); assert.equal(actual.age, age);
  assert.equal(actual.level, 1); assert.ok(actual.lifespan > child.lifespan);
  assert.deepEqual(actual.birthOrigin, origin);
  placeLeyline(copy, 30, 30, () => 0.5); assert.equal(copy.leylines.length, 1);
});

console.log(`C1 births: ${checks} groups passed.`);
