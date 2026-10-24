#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { TERRAIN, STRUCT } from '../src/inkbox/core/config.js';
import { OVER, recomputeRect } from '../src/inkbox/world/terrain.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import {
  HOUSE_FLOOD_DAYS, SETTLEMENT_FLOOD_DEPTH, isDryBuildableSettlementTile, liveSettlementHouseType,
} from '../src/inkbox/world/settlementState.js';

function fixture() {
  const world = new World(24, 24, 26);
  world.type.fill(TERRAIN.GRASS);
  world.veg.fill(1);
  world.height.fill(0.5);
  world.day = 100;
  const village = {
    id: 1, x: 12, y: 12, faction: 0, name: '试村', pop: 0, food: 0,
    houses: [], fields: 0, level: 1, hp: 100, buildCooldown: 1000, age: 0,
  };
  world.villages.push(village);
  const life = new Life(world, () => 0.99);
  // P0 requires a real resident; C1 building and field work require adulthood.
  assert.equal(life.spawn(12, 12, 'human', 1, 0, { village: village.id }), 1);
  world.entities[0].age = 18 * 360;
  life.syncVillagePops();
  return { world, village, life };
}

// Founding and house placement share the same narrow build rule.
{
  const { world, village, life } = fixture();
  const center = world.idx(12, 12);
  world.water[center] = 0.084;
  assert.equal(world.isBuildable(center), true);
  assert.equal(isDryBuildableSettlementTile(world, center), false);
  village.food = 20;
  village.buildCooldown = 0;
  life.findVillageTile = () => null;
  life.stepVillages(1);
  assert.equal(village.houses.length, 0, 'wet center cannot acquire a new hall');
  world.water[center] = 0;
  village.buildCooldown = 0;
  life.stepVillages(1);
  assert.equal(world.struct[center], STRUCT.HALL);
  assert.equal(village.houses.length, 1);
}

// The structure remains visible during a short flood. A save/load preserves
// elapsed damage time, and the historical anchor survives the ruin transition.
{
  const { world, village, life } = fixture();
  const house = { x: 13, y: 12, type: STRUCT.HOUSE };
  village.houses.push(house);
  const idx = world.idx(13, 12);
  world.struct[idx] = STRUCT.HOUSE;
  world.water[idx] = 0.084;
  life.stepVillages(5);
  assert.equal(house.floodDays, 5);
  assert.equal(liveSettlementHouseType(world, house), STRUCT.HOUSE);
  const restored = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(world))));
  const savedHouse = restored.villages[0].houses[0];
  assert.equal(savedHouse.floodDays, 5);
  assert.equal(restored.struct[idx], STRUCT.HOUSE);
  const restoredLife = new Life(restored, () => 0.99);
  restoredLife.stepVillages(HOUSE_FLOOD_DAYS - 5);
  assert.equal(restored.struct[idx], STRUCT.RUIN);
  assert.equal(restored.over[idx], OVER.RUINS);
  assert.equal(restored.villages[0].houses.length, 1);
  assert.equal(savedHouse.floodRuined, true);
  assert.equal(liveSettlementHouseType(restored, savedHouse), STRUCT.NONE);
  assert.ok(restored.chronicle.some((entry) => String(entry.text || entry).includes('积水坍毁')));
  const roundtrip = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(restored))));
  assert.equal(roundtrip.struct[idx], STRUCT.RUIN);
  assert.equal(roundtrip.villages[0].houses.length, 1);
  assert.equal(roundtrip.villages[0].houses[0].floodRuined, true);
}

// Seven houses fill a level-one village. Losing one opens exactly one active
// slot, while the historical anchor remains. Rebuilding at the old coordinate
// later must not revive or draw the collapsed anchor a second time.
{
  const { world, village, life } = fixture();
  for (let n = 0; n < 7; n += 1) {
    const x = 13 + n;
    const house = { x, y: 12, type: STRUCT.HOUSE };
    village.houses.push(house);
    world.struct[world.idx(x, 12)] = STRUCT.HOUSE;
  }
  const old = village.houses[0];
  const oldIndex = world.idx(old.x, old.y);
  world.water[oldIndex] = 0.08;
  life.stepVillages(HOUSE_FLOOD_DAYS);
  assert.equal(old.floodRuined, true);
  village.food = 30;
  village.buildCooldown = 0;
  life.findVillageTile = (_v, _r, predicate) => predicate(world.idx(12, 13)) ? [12, 13] : null;
  life.stepVillages(1);
  assert.equal(village.houses.length, 8);
  assert.equal(village.houses.filter((h) => liveSettlementHouseType(world, h)).length, 7);
  assert.equal(world.struct[world.idx(12, 13)], STRUCT.HOUSE);

  world.water[oldIndex] = 0;
  world.struct[oldIndex] = STRUCT.NONE;
  world.over[oldIndex] = OVER.NONE; // A cleared plot, rather than an occupied ruin.
  recomputeRect(world, old.x, old.y, old.x, old.y);
  world.struct[world.idx(14, 12)] = STRUCT.RUIN;
  village.food = 30;
  village.buildCooldown = 0;
  life.findVillageTile = (_v, _r, predicate) => predicate(oldIndex) ? [old.x, old.y] : null;
  life.stepVillages(1);
  assert.equal(village.houses.length, 9);
  assert.equal(world.struct[oldIndex], STRUCT.HOUSE);
  assert.equal(liveSettlementHouseType(world, old), STRUCT.NONE);
  assert.equal(liveSettlementHouseType(world, village.houses.at(-1)), STRUCT.HOUSE);
  assert.equal(village.houses.filter((h) => liveSettlementHouseType(world, h)).length, 7);
  assert.equal(deriveSettlements(world, { productionAssets: true }).houses, 7);
  assert.equal(deriveSettlements(world, { productionAssets: false }).houses, 7);
}

// Drying before the threshold clears the timer. Flood bookkeeping itself
// consumes no extra draws from the village's existing random stream.
{
  const dry = fixture();
  const wet = fixture();
  for (const scenario of [dry, wet]) {
    scenario.village.houses.push({ x: 13, y: 12, type: STRUCT.HOUSE });
    scenario.world.struct[scenario.world.idx(13, 12)] = STRUCT.HOUSE;
  }
  let dryDraws = 0;
  let wetDraws = 0;
  dry.life.rng = () => { dryDraws += 1; return 0.99; };
  wet.life.rng = () => { wetDraws += 1; return 0.99; };
  wet.world.water[wet.world.idx(13, 12)] = 0.08;
  dry.life.stepVillages(5);
  wet.life.stepVillages(5);
  assert.equal(wetDraws, dryDraws);
  wet.world.water[wet.world.idx(13, 12)] = 0;
  wet.life.stepVillages(1);
  assert.equal(wet.village.houses[0].floodDays, undefined);
  assert.equal(wet.world.struct[wet.world.idx(13, 12)], STRUCT.HOUSE);
}

// Optional private legacy fixture: read only, never modify or copy it.
if (process.argv[2]) {
  const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const originalHouses = data.villages.map((v) => v.houses.map((h) => [h.x, h.y, h.type]));
  const world = deserializeWorld(data);
  assert.deepEqual(world.villages.map((v) => v.houses.map((h) => [h.x, h.y, h.type])), originalHouses);
  const before = originalHouses.reduce((count, houses) => count + houses.length, 0);
  assert.equal(world.villages.length, data.villages.length);
  const wetLiveHouses = world.villages.flatMap((v) => v.houses).filter((h) =>
    [STRUCT.HOUSE, STRUCT.HALL].includes(world.struct[world.idx(h.x, h.y)])
      && world.water[world.idx(h.x, h.y)] >= SETTLEMENT_FLOOD_DEPTH);
  assert.ok(wetLiveHouses.length > 0, 'legacy reference retains live inundated houses on load');
  assert.deepEqual(serializeWorld(world).villages.map((v) => v.houses.map((h) => [h.x, h.y, h.type])), originalHouses);
  assert.equal(world.villages.flatMap((v) => v.houses).length, before);
  console.log(`legacy read only: ${world.villages.length} villages, ${before} historical houses retained`);
}
console.log('settlement flood checks passed');
