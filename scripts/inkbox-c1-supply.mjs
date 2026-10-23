#!/usr/bin/env node
// Explicit mechanism fixtures: no natural births or free replacement people.
import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { SPECIES, TERRAIN } from '../src/inkbox/core/config.js';
import { OVER } from '../src/inkbox/world/terrain.js';
import { foundSect, stepSects } from '../src/inkbox/sim/sects.js';
import { aidSettlement } from '../src/inkbox/sim/settlementResilience.js';
import { FOOD_PER_PROVISION, SECT_FOOD_PER_DISCIPLE_DAY, villageSociety,
  sectSupplyStatus, stepSectEconomy, canSupportRecruitment, recordSectDisciple,
  affiliateSectResident } from '../src/inkbox/sim/sectEconomy.js';

let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const rng = () => 0.99;
function person(id, village = 0, level = 0) {
  return { id, name: `人${id}`, sp: level > 0 ? SPECIES.CULTIVATOR : SPECIES.HUMAN,
    age: 30 * 360, lifespan: 500 * 360, hp: 100, maxHp: 100,
    x: 12, y: 12, village, faction: 0, level, root: { elements: ['木'] } };
}
function setup({ adults = 20, fields = 10, food = 150, hp = 100, disciples = 3 } = {}) {
  const world = new World(48, 48, 61001);
  world.day = 10000;
  world.height.fill(0.48); world.type.fill(TERRAIN.GRASS);
  world.veg.fill(0.5); world.temp.fill(0.55); world.moist.fill(0.2);
  const leader = person(1, 0, 20); world.entities.push(leader);
  const sect = foundSect(world, 12, 12, leader, rng);
  assert.ok(sect); sect.resources.provisions = 10;
  const village = { id: 7, name: '有生村', x: 12, y: 12, faction: sect.id,
    pop: adults, food, hp, fields, fieldTiles: [], houses: [], age: 100,
    history: [], foundedDay: 0, level: 1 };
  for (let n = 0; n < fields; n += 1) {
    const index = world.idx(15 + n % 5, 12 + Math.floor(n / 5));
    village.fieldTiles.push(index); world.over[index] = OVER.FARMLAND;
  }
  world.villages.push(village); sect.villages.push(village.id);
  for (let n = 0; n < adults; n += 1) {
    const e = person(10 + n, village.id); e.faction = sect.id; world.entities.push(e);
  }
  for (let n = 1; n < disciples; n += 1) {
    const e = person(100 + n, 0, 10); e.faction = sect.id; world.entities.push(e);
  }
  sect.pop = disciples; sect.followers = adults + disciples;
  return { world, sect, village, leader };
}

check('population reader uses live absolute-age mortals, not village.pop or a cultivator label', () => {
  const f = setup(); f.village.pop = 999;
  const child = person(500, 7); child.age = 18 * 360 - 1;
  const adult = person(501, 7); adult.age = 18 * 360;
  const remembered = person(502, 7); remembered.sp = SPECIES.CULTIVATOR;
  const practicing = person(503, 7, 1);
  const dead = person(504, 7); dead.hp = 0;
  f.world.entities.push(child, adult, remembered, practicing, dead);
  const facts = villageSociety(f.world, f.village);
  assert.equal(facts.humans, 24); assert.equal(facts.mortals, 23);
  assert.equal(facts.mortalAdults, 22); assert.equal(facts.practitioners, 1);
});

check('tribute pays from real surplus at the P0 reciprocal food/provisions exchange, then upkeep', () => {
  const { world, sect, village } = setup();
  const beforeFood = village.food, beforeStock = sect.resources.provisions;
  stepSectEconomy(world, sect, 30);
  assert.ok(sect.economy.supplied > 0);
  approx(beforeFood - village.food, sect.economy.supplied * FOOD_PER_PROVISION);
  approx(sect.resources.provisions - beforeStock, sect.economy.supplied - sect.economy.consumed);
  approx(sect.economy.consumed, 3 * SECT_FOOD_PER_DISCIPLE_DAY * 30);
  approx(sect.economy.foodTransferred, beforeFood - village.food);
  assert.ok(village.food >= villageSociety(world, village).reserveFood);
});

check('empty, ruined, flooded, poor and unworked villages cannot match a healthy populated farm', () => {
  const tribute = (options, alter = () => {}) => {
    const f = setup(options); alter(f); stepSectEconomy(f.world, f.sect, 30); return f.sect.economy.supplied;
  };
  const healthy = tribute({});
  assert.equal(tribute({ adults: 0 }), 0);
  assert.equal(tribute({ hp: 20 }), 0);
  assert.equal(tribute({ food: 20 }), 0);
  assert.equal(tribute({}, (f) => { f.world.water[f.world.idx(12, 12)] = 0.04; }), 0);
  assert.ok(tribute({ fields: 0 }) < healthy);
  assert.ok(tribute({}, (f) => {
    for (const i of f.village.fieldTiles) f.world.water[i] = 0.04;
  }) < healthy);
  assert.ok(tribute({ hp: 60 }) < healthy);
});

check('with identical leylines, formal sector steps distinguish real supply while mountain food never appears', () => {
  const fed = setup(), empty = setup({ adults: 0 });
  for (const f of [fed, empty]) {
    f.world.leylines.push({ id: 1, strength: 1, owner: f.sect.id, x: 12, y: 12 });
    f.sect.leylines.push(1);
    stepSects(f.world, { factionNear: () => null, tileAt: () => 0 }, 3, rng);
  }
  assert.ok(fed.sect.economy.supplied > 0); assert.equal(empty.sect.economy.supplied, 0);
  approx(fed.sect.resources.spiritStone, empty.sect.resources.spiritStone);
  assert.ok(fed.sect.resources.provisions > empty.sect.resources.provisions);
  assert.equal(canSupportRecruitment(empty.world, empty.sect), false);
  assert.equal(canSupportRecruitment(fed.world, fed.sect), true);
});

check('real inventory buffers cutoff; prolonged shortage disperses a disciple without killing or inventing one', () => {
  const f = setup({ adults: 0 });
  // Isolate the economic/leadership clock on a small habitable island. Territory
  // expansion and large uniform-cost flood performance are outside this test.
  f.world.type.fill(TERRAIN.MOUNTAIN);
  f.world.type[f.world.idx(12, 12)] = TERRAIN.GRASS;
  f.sect.resources.provisions = 1; f.sect.stability = 40;
  const initialIds = f.world.entities.map((e) => e.id);
  for (let n = 0; n < 30; n += 1) {
    f.world.day += 3; stepSects(f.world, {}, 3, rng);
  }
  assert.equal(f.world.factions.length, 1); assert.equal(f.sect.pop, 3);
  assert.ok(f.sect.resources.provisions > 0);
  assert.equal(f.sect.economy.supplied, 0);
  for (let n = 0; n < 60; n += 1) {
    f.world.day += 3; stepSects(f.world, {}, 3, rng);
  }
  assert.equal(f.world.factions.length, 1); assert.ok(f.sect.pop < 3);
  assert.equal(f.leader.faction, f.sect.id);
  assert.deepEqual(f.world.entities.map((e) => e.id), initialIds);
  assert.ok(f.world.entities.every((e) => e.hp === 100));
});

check('paid P0 relief and real recovery restore reciprocal supply with no food multiplier loop', () => {
  const f = setup({ food: 20, hp: 60 });
  f.sect.resources.provisions = 50; f.sect.resources.spiritStone = 50;
  stepSectEconomy(f.world, f.sect, 3); assert.equal(f.sect.economy.supplied, 0);
  const before = f.village.food + f.sect.resources.provisions * FOOD_PER_PROVISION;
  f.world.day += 30;
  aidSettlement(f.world, f.village, 30);
  approx(f.village.food + f.sect.resources.provisions * FOOD_PER_PROVISION, before);
  // Fixture represents recovered production; it does not claim relief alone creates a surplus.
  f.village.food += 60; f.village.hp = 100;
  stepSectEconomy(f.world, f.sect, 30);
  assert.ok(f.sect.economy.supplied > 0); assert.equal(canSupportRecruitment(f.world, f.sect), true);
});

check('no source-free formal founders, no mortal leaders, and only an explicit fixture can create an empty sect', () => {
  const f = setup(); const count = f.world.factions.length;
  assert.equal(foundSect(f.world, 30, 30, null, rng), null);
  assert.equal(foundSect(f.world, 30, 30, { ...f.leader, id: 999 }, rng), null);
  assert.equal(foundSect(f.world, 30, 30, f.world.entities.find((e) => !e.level), rng), null);
  const young = person(888, 0, 10); young.age = 18 * 360 - 1; f.world.entities.push(young);
  assert.equal(foundSect(f.world, 30, 30, young, rng), null);
  assert.equal(f.world.factions.length, count);
  const fixture = foundSect(f.world, 30, 30, null, rng, { fixture: true });
  assert.ok(fixture); assert.equal(fixture.founderId, 0);
});

check('a real schism splits existing provisions instead of creating a second founding food grant', () => {
  const f = setup({ disciples: 40 });
  f.leader.level = 30;
  f.world.entities.find((e) => e.id === 101).level = 25;
  f.sect.stability = 20;
  const before = f.sect.resources.provisions;
  stepSects(f.world, {}, 3, () => 0);
  assert.equal(f.world.factions.length, 2);
  const schism = f.world.factions.find((s) => s !== f.sect);
  assert.ok(f.world.entities.some((e) => e.id === schism.founderId && e.faction === schism.id));
  approx(f.world.factions.reduce((sum, s) => sum + s.resources.provisions, 0),
    before + f.sect.economy.supplied - f.sect.economy.consumed);
});

check('territorial absorption protects mortals but recruits existing cultivators only with real supply, once', () => {
  for (const adults of [0, 20]) {
    const f = setup({ adults });
    f.world.type.fill(TERRAIN.MOUNTAIN);
    f.world.type[f.world.idx(12, 12)] = TERRAIN.GRASS;
    f.village.faction = 0; f.sect.villages = [];
    for (const e of f.world.entities) {
      if (e === f.leader) continue;
      e.faction = 0; e.village = f.village.id;
    }
    f.world.day = 10020;
    stepSects(f.world, {}, 3, rng);
    assert.equal(f.village.faction, f.sect.id, 'the village is politically absorbed');
    const candidates = f.world.entities.filter((e) => e !== f.leader && e.level > 0);
    if (adults === 0) {
      assert.ok(candidates.every((e) => !e.faction), 'land ownership does not recruit unfed lone cultivators');
      assert.equal(f.sect.economy.recruited, 0);
    } else {
      assert.ok(candidates.every((e) => e.faction === f.sect.id));
      assert.equal(f.sect.economy.recruited, candidates.length);
      assert.ok(f.world.entities.filter((e) => !e.level).every((e) => e.faction === f.sect.id));
      for (const e of f.world.entities) assert.equal(affiliateSectResident(f.world, e, f.sect), false);
      assert.equal(f.sect.economy.recruited, candidates.length, 'same residents are not counted twice');
    }
  }
});

check('natural founding does not turn an unworked village of existing cultivators into free disciples', () => {
  const f = setup({ adults: 0 });
  f.world.factions.length = 0; f.world.nextFactionId = 1;
  f.village.faction = 0;
  f.world.entities.forEach((e) => { e.faction = 0; e.village = f.village.id; });
  f.world.day = 14403;
  stepSects(f.world, { factionNear: () => null, tileAt: (x, y) => f.world.idx(x, y) }, 3, rng);
  assert.equal(f.world.factions.length, 1);
  const sect = f.world.factions[0];
  assert.equal(f.village.faction, sect.id);
  assert.equal(sect.founderId, f.leader.id);
  assert.ok(f.world.entities.filter((e) => e !== f.leader).every((e) => !e.faction));
  assert.equal(sect.economy.recruited, 0);
});

check('inspection is pure and unknown old history stays unknown; only actual awakening records a disciple', () => {
  const f = setup(); const before = JSON.stringify({ v: f.village, s: f.sect, e: f.world.entities });
  const status = sectSupplyStatus(f.world, f.sect);
  assert.equal(status.netPerDay, null); assert.equal(status.recruitedTotal, null);
  assert.equal(JSON.stringify({ v: f.village, s: f.sect, e: f.world.entities }), before);
  const mortal = f.world.entities.find((e) => !e.level);
  assert.equal(recordSectDisciple(f.world, mortal), false);
  mortal.level = 1;
  assert.equal(recordSectDisciple(f.world, mortal), true);
  assert.equal(f.sect.economy.recruited, 1);
  assert.equal(villageSociety(f.world, f.village).mortalAdults, 19);
  stepSectEconomy(f.world, f.sect, 3);
  assert.equal(sectSupplyStatus(f.world, f.sect).measuredDay, f.world.day);
  const empty = setup({ adults: 1 });
  const lastMortal = empty.world.entities.find((e) => !e.level);
  lastMortal.level = 1;
  assert.equal(recordSectDisciple(empty.world, lastMortal), false);
  assert.equal(lastMortal.faction, 0, 'civil protection cannot bypass cutoff recruitment');
  assert.equal(lastMortal.village, empty.village.id, 'failed entry does not erase residence or person');
  assert.equal(empty.sect.economy, undefined, 'no invented intake event');
});

check('awakening admission reserves the already-included disciple exactly once at the thirty-day boundary', () => {
  for (const shortage of [0, 1e-6]) {
    const f = setup({ disciples: 2 });
    const awakened = f.world.entities.find((e) => !e.level);
    awakened.level = 1;
    f.sect.resources.provisions = 3 * SECT_FOOD_PER_DISCIPLE_DAY * 30 - shortage;
    assert.equal(recordSectDisciple(f.world, awakened), shortage === 0);
    assert.equal(awakened.faction, shortage === 0 ? f.sect.id : 0);
    assert.equal(f.sect.economy?.recruited ?? 0, shortage === 0 ? 1 : 0);
    assert.equal(awakened.village, f.village.id);
  }
  // A lone practitioner is not in the member count yet and still costs +1.
  const f = setup({ disciples: 2 });
  const lone = person(777, f.village.id, 1); f.world.entities.push(lone);
  f.sect.resources.provisions = 3 * SECT_FOOD_PER_DISCIPLE_DAY * 30 - 1e-6;
  assert.equal(affiliateSectResident(f.world, lone, f.sect), false);
  f.sect.resources.provisions += 1e-6;
  assert.equal(affiliateSectResident(f.world, lone, f.sect), true);
});

console.log(`C1 supply: ${checks} groups passed`);
