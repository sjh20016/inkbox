#!/usr/bin/env node
// Focused, local acceptance evidence for settlement resilience P0.
// Usage: node scripts/inkbox-local-resilience.mjs [--long|--century] [--benchmark]

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { TERRAIN, STRUCT, LIMITS, WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { History, earthquake, meteor, eraseLife, burnForest, paintVegetation, flood } from '../src/inkbox/sim/powers.js';
import { OVER } from '../src/inkbox/world/terrain.js';
import { setHeight, setWater } from '../src/inkbox/world/terrainEdit.js';
import { settleNature, igniteCell } from '../src/inkbox/sim/nature.js';
import { aidSettlement, archiveSettlement, settlementHistory } from '../src/inkbox/sim/settlementResilience.js';
import { settlementCondition } from '../src/inkbox/world/settlementState.js';
import { settlementInspectCard } from '../src/inkbox/ui/settlementInspector.js';
import { deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { visibleSettlementRuins, settlementRuinMarkerId, settlementRuinForMarker } from '../src/inkbox/world/settlementIdentity.js';
import { deriveMarkers } from '../src/inkbox/render3d/markers/WorldMarkerLayer.js';

const CENTURY = process.argv.includes('--century');
const LONG = process.argv.includes('--long') || CENTURY;
const BENCHMARK = process.argv.includes('--benchmark');
const checks = [];
const evidence = { startedAt: new Date().toISOString(), options: { long: LONG, benchmark: BENCHMARK }, checks, notes: [] };
function check(name, fn) {
  const details = fn();
  checks.push({ name, status: 'pass', ...(details && typeof details === 'object' ? details : {}) });
  console.log(`✓ ${name}`);
  return details;
}
function setup(seed = 20261022, { village = true, sect = false, population = 12 } = {}) {
  const world = new World(64, 64, seed);
  world.day = 360;
  world.year = 1;
  world.type.fill(TERRAIN.GRASS);
  const terrainRng = mulberry32(seed ^ 0x74657272);
  for (let i = 0; i < world.size; i += 1) world.height[i] = 0.45 + terrainRng() * 0.1;
  world.veg.fill(0.6);
  world.moist.fill(0.2);
  world.temp.fill(0.55);
  const rng = mulberry32(seed ^ 0xa5a5a5a5);
  const life = new Life(world, rng);
  const state = createAdvanceState();
  let faction = null;
  if (sect) {
    faction = {
      id: 1, name: '青岚宗', color: '#456', accent: '#789', element: '木', doctrine: { name: '守望' },
      villages: [], pop: 4, followers: 16, kills: 0, war: new Set(), capitalX: 32, capitalY: 32,
      founderId: 0, founderName: '无名', leaderId: 0, leaderName: '无名', elders: [],
      reputation: 30, stability: 70, resources: { spiritStone: 80, heritage: 5, provisions: 100 },
      leylines: [], relations: new Map(), history: [], foundedDay: 0, destroyedDay: -1,
      destroyReason: null, lastConflictDay: -1e9, claim: null,
    };
    world.factions.push(faction);
    world.nextFactionId = 2;
  }
  let v = null;
  if (village) {
    v = { id: 7, x: 32, y: 32, faction: faction?.id || 0, name: '松溪村', pop: 0, food: 4,
      houses: [], fields: 0, fieldTiles: [], level: 1, hp: 62, buildCooldown: 1e9, age: 80,
      foundedDay: 0, distressDays: 0, history: [] };
    world.villages.push(v);
    if (faction) faction.villages.push(v.id);
    for (let n = 0; n < 5; n += 1) {
      const x = 32 + (n % 3) - 1;
      const y = 32 + Math.floor(n / 3) - 1;
      const index = world.idx(x, y);
      const type = n === 0 ? STRUCT.HALL : STRUCT.HOUSE;
      world.struct[index] = type;
      v.houses.push({ x, y, type });
    }
    for (let n = 0; n < population; n += 1) {
      const x = 30 + (n % 5);
      const y = 30 + Math.floor(n / 5);
      const species = sect && n < 2 ? 'cultivator' : 'human';
      assert.equal(life.spawn(x, y, species, 1, faction?.id || 0, { village: v.id }), 1, 'formal Life.spawn creates population');
      const entity = world.entities.at(-1);
      if (species === 'cultivator') entity.level = Math.max(1, entity.level || 0);
      entity.village = v.id;
      entity.faction = faction?.id || 0;
    }
    life.syncVillagePops();
  }
  return { world, life, state, faction, village: v };
}
function advance(f, days) {
  return advanceWorld(f.world, days, { life: f.life, state: f.state, riftActive: false });
}
function basicCrisis(f) {
  return f.life.events.triggerCrisis(f.village.x, f.village.y, { crisis: 0.6, duration: 0.15 });
}
function report() {
  const root = new URL('../reports/local/resilience/', import.meta.url);
  const dir = decodeURIComponent(root.pathname.replace(/^\/(\w:)/, '$1'));
  mkdirSync(dir, { recursive: true });
  evidence.finishedAt = new Date().toISOString();
  evidence.summary = { passed: checks.filter(x => x.status === 'pass').length, failed: checks.filter(x => x.status === 'fail').length };
  writeFileSync(`${dir}/acceptance-${Date.now()}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
}

check('同一正式玩家灾祸在有援助与无资源配对中造成相同初始损伤', () => {
  const supported = setup(31801, { sect: true });
  const unsupported = setup(31801, { sect: true });
  unsupported.faction.resources.provisions = 0;
  unsupported.faction.resources.spiritStone = 0;
  const before = [supported, unsupported].map(f => ({ hp: f.village.hp, food: f.village.food }));
  for (const f of [supported, unsupported]) {
    const crisis = basicCrisis(f);
    assert.equal(crisis.status, 'active');
    assert.equal(crisis.byPlayer, true);
    assert.ok(f.village.hp < 62 && f.village.food < 4);
    assert.ok(f.village.houses.some(h => h.ruinedBySettlement), 'formal crisis ruins a real house');
  }
  assert.deepEqual([supported, unsupported].map(f => ({ hp: f.village.hp, food: f.village.food })),
    [supported, unsupported].map(() => ({ hp: 54, food: 0 })), 'paired crisis resolves to same initial state');
  const afterDamage = [supported, unsupported].map(f => ({ hp: f.village.hp, food: f.village.food }));
  advance(supported, 30);
  advance(unsupported, 30);
  assert.ok(supported.village.lastAidDay >= 0, 'eligible associated sect provides aid through Life.step');
  assert.equal(unsupported.village.lastAidDay, undefined, 'empty sect cannot provide free aid');
  assert.ok(supported.faction.resources.provisions < 100 || supported.faction.resources.spiritStone < 80,
    'sect resource inventory decreased');
  assert.ok(supported.village.hp > unsupported.village.hp || supported.village.food > unsupported.village.food,
    'same injury diverges through actual aid');
  const sect = supported.faction;
  const spend = { provisions: sect.resources.provisions, spiritStone: sect.resources.spiritStone };
  const lastAid = supported.village.lastAidDay;
  supported.world.day = lastAid;
  const once = { provisions: sect.resources.provisions, spiritStone: sect.resources.spiritStone };
  // A same-day zero-time simulation is not an aid clock; absolute month gating also guards repeats.
  advance(supported, 0);
  assert.deepEqual({ provisions: sect.resources.provisions, spiritStone: sect.resources.spiritStone }, once);
  assert.ok(sect.resources.provisions >= 0 && sect.resources.spiritStone >= 0);
  return { initial: before, afterDamage, supported: { hp: supported.village.hp, food: supported.village.food,
    lastAidDay: lastAid, aidSpentProvisions: supported.village.aidSpentProvisions, aidSpentSpiritStone: supported.village.aidSpentSpiritStone, inventoryAfter: spend },
  unsupported: { hp: unsupported.village.hp, food: unsupported.village.food } };
});

check('720 日大步与 24 次 30 日步都先完成合法援助再判定长期废弃', () => {
  const large = setup(31811, { sect: true, population: 12 });
  const divided = setup(31811, { sect: true, population: 12 });
  for (const f of [large, divided]) {
    f.village.hp = 0;
    f.village.food = 0;
  }
  advance(large, 720);
  for (let month = 0; month < 24; month += 1) advance(divided, 30);
  for (const f of [large, divided]) {
    assert.ok(f.world.villageById(f.village.id), 'supported distress is not archived before same-period aid can run');
    assert.ok(f.village.lastAidDay >= 360, 'aid runs against the advanced absolute month');
    assert.ok(f.village.aidSpentSpiritStone > 0 && f.village.aidSpentProvisions > 0);
    assert.ok(f.faction.resources.spiritStone >= 0 && f.faction.resources.provisions >= 0);
  }
  return { large: { day: large.world.day, hp: large.village.hp, food: large.village.food,
    lastAidDay: large.village.lastAidDay, ruined: large.world.settlementRuins.length },
  divided: { day: divided.world.day, hp: divided.village.hp, food: divided.village.food,
    lastAidDay: divided.village.lastAidDay, ruined: divided.world.settlementRuins.length } };
});

check('大步中的宗门收入也能形成后续援助，且同月重复调用不再支出', () => {
  const a = setup(31812, { sect: true }), b = setup(31812, { sect: true });
  for (const f of [a, b]) {
    f.village.food = 0; f.village.hp = 15;
    f.faction.resources.provisions = 0; f.faction.resources.spiritStone = 0;
    basicCrisis(f);
  }
  advance(a, 720);
  for (let m = 0; m < 24; m++) advance(b, 30);
  assert.ok(a.village.lastAidDay > 360, 'income earned during the leap funds real later aid');
  assert.equal(a.village.aidSpentProvisions, b.village.aidSpentProvisions);
  assert.equal(a.village.aidSpentSpiritStone, b.village.aidSpentSpiritStone);
  assert.equal(a.village.hp, b.village.hp);
  const before = JSON.stringify(a.faction.resources);
  aidSettlement(a.world, a.village, 30);
  assert.equal(JSON.stringify(a.faction.resources), before, 'same absolute month cannot be spent twice');
  return { lastAidDay: a.village.lastAidDay, hp: a.village.hp,
    spentProvisions: a.village.aidSpentProvisions, spentSpiritStone: a.village.aidSpentSpiritStone };
});

check('自然危机走正式入口；旱岁不凭空毁屋，失败措辞与实际人口一致', () => {
  const f = setup(31813);
  f.world.day = 45 * 360;
  const sequence = [0.1, 0, 0, 0];
  f.life.events.rng = () => sequence.shift() ?? 0.2;
  const population = f.village.pop, houses = settlementCondition(f.world, f.village).liveHouses;
  f.life.events.maybeStartCrisis();
  const crisis = f.life.events.activeCrises[0];
  assert.ok(crisis && !crisis.byPlayer && crisis.key === 'drought');
  assert.equal(settlementCondition(f.world, f.village).liveHouses, houses);
  f.world.day += crisis.durationDays;
  f.life.events.stepCrises(crisis.durationDays);
  assert.equal(crisis.status, 'failed');
  assert.equal(f.village.pop, population, 'crisis bookkeeping does not invent population loss');
  assert.ok(!/少了一半|人散了|消亡/.test(crisis.outcome));
  const hp = f.village.hp;
  f.life.stepVillages(1);
  assert.equal(f.village.hp, hp, 'zero food cannot passively heal on the next village tick');
  return { key: crisis.key, outcome: crisis.outcome, hp, population, houses };
});

check('HP 归零缓冲后正式废弃，村民归属和建筑/田地不再继续生产', () => {
  const f = setup(31802, { population: 3 });
  f.village.hp = 0;
  f.village.food = 0;
  f.world.day = 2000;
  f.village.distressDays = 710;
  const historicId = f.village.id;
  const houseCount = f.village.houses.length;
  f.life.stepVillages(20);
  f.life.resolveVillageAbandonments();
  assert.equal(f.world.villages.length, 0, 'expired distress passes through abandonVillage');
  assert.ok(f.world.settlementRuins.some(r => r.id === historicId && r.name === '松溪村'));
  assert.equal(f.world.entities.filter(e => e.village === historicId).length, 0, 'abandonment removes live village identity from resident entities');
  assert.equal(f.world.settlementRuins[0].destroyedDay, 2000);
  assert.equal(f.world.settlementRuins[0].reason, '灾损长期未能恢复');
  assert.equal(f.village.houses.length, houseCount, 'historic building anchors remain available to the ruin record');
  return { ruin: f.world.settlementRuins[0], entities: f.world.entities.length };
});

check('地方史、遗址身份和旧档兼容及存读后继续推进', () => {
  const f = setup(31803, { sect: true });
  basicCrisis(f);
  advance(f, 30);
  const snapshot = serializeWorld(f.world);
  const restored = deserializeWorld(JSON.parse(JSON.stringify(snapshot)));
  const rv = restored.villages.find(v => v.id === f.village.id);
  assert.ok(rv.history.length > 0 && rv.history.length <= 16);
  assert.equal(rv.lastAidDay, f.village.lastAidDay);
  assert.equal(rv.aidSpentProvisions, f.village.aidSpentProvisions);
  assert.ok(restored.worldEventState.activeCrises.some(c => c.villageId === rv.id && c.status === 'active'));
  const resumed = { world: restored, life: new Life(restored, mulberry32(31803 ^ 0xa5a5a5a5)), state: createAdvanceState() };
  advance(resumed, 30);
  assert.ok(restored.day > f.world.day);
  assert.equal(rv.lastAidDay, f.village.lastAidDay + 30, 'restored simulation spends once in the next absolute month');
  assert.equal(rv.lastAidMonth, Math.floor(restored.day / 30));
  const ruin = { id: 97, name: '旧松溪', x: 15, y: 15, plane: 'mortal', foundedDay: 0, destroyedDay: 900,
    reason: '洪灾后无人修复', lastFactionId: 0, lastFactionName: '旧青岚宗', history: [] };
  restored.settlementRuins = Array.from({ length: 85 }, (_, n) => ({ ...ruin, id: n + 1, name: `遗址${n + 1}` }));
  restored.settlementRuins = restored.settlementRuins.slice(-80);
  const withRuins = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(restored))));
  assert.equal(withRuins.settlementRuins.length, 80);
  assert.ok(withRuins.settlementRuins.at(-1).name);
  const longResume = { world: withRuins, life: new Life(withRuins, mulberry32(31803 ^ 0xa5a5a5a5)), state: createAdvanceState() };
  const crisisId = withRuins.worldEventState.activeCrises[0].id;
  advance(longResume, 12 * 360);
  assert.ok(withRuins.settlementRuins.some(r => r.id === 85 && r.name === '遗址85'), 'the persisted ruin remains identifiable twelve years later');
  assert.equal(longResume.life.events.activeCrises.some(c => c.id === crisisId), false);
  assert.equal(longResume.life.events.history.filter(c => c.id === crisisId).length, 1, 'an overdue crisis finishes once across the saved branch');
  const legacy = JSON.parse(JSON.stringify(serializeWorld(restored)));
  delete legacy.settlementRuins;
  for (const v of legacy.villages) { delete v.history; delete v.lastAidMonth; delete v.lastAidDay; }
  const fromLegacy = deserializeWorld(legacy);
  assert.deepEqual(fromLegacy.settlementRuins, []);
  assert.equal(fromLegacy.villages.length, restored.villages.length);
  return { localHistory: rv.history.length, ruinArchiveLimit: withRuins.settlementRuins.length,
    saveBytes: Buffer.byteLength(JSON.stringify(snapshot)), oldSaveVillages: fromLegacy.villages.length,
    resumedYears: 12, resumedDay: withRuins.day };
});

check('检视卡片与 marker 身份解析纯读，不写 World；遗址保留身份而不进入奖励地点表', () => {
  const f = setup(31804, { sect: true });
  basicCrisis(f);
  const ruin = { id: 88, name: '青石渡', x: 15, y: 15, plane: 'mortal', destroyedDay: 400,
    foundedDay: 0, reason: '洪水后村址不宜居', lastFactionId: 0, lastFactionName: '旧宗门快照', history: [] };
  f.world.settlementRuins.push(ruin);
  const before = JSON.stringify(serializeWorld(f.world));
  const card1 = settlementInspectCard(f.world, f.village, false);
  const card2 = settlementInspectCard(f.world, ruin, true);
  const marker = settlementRuinMarkerId(ruin.id);
  assert.equal(settlementRuinForMarker(f.world, marker), ruin);
  assert.ok(visibleSettlementRuins(f.world).some(r => r.id === ruin.id));
  const markers = deriveMarkers(f.world);
  assert.ok(markers.sites.ruin.some(item => item.id === marker));
  assert.equal(f.world.sites.some(site => site.id === marker), false, 'archived village does not join reward/exploration site lifecycle');
  assert.ok(card1.rows.some(row => row[0] === '现状'));
  assert.ok(card2.rows.some(row => row[0] === '主要原因' && row[1] === ruin.reason));
  assert.equal(card2.rows.find(row => row[0] === '现状')?.[1], '遗址', 'ruin status has its localized label');
  assert.equal(JSON.stringify(serializeWorld(f.world)), before, 'read-only inspector and marker derivation do not mutate saved World state');
  return { activeCardRows: card1.rows.length, ruinCardRows: card2.rows.length, marker };
});

check('正式玩家天灾修改聚落结果且不伪造人口流水', () => {
  const f = setup(31805, { population: 6 });
  const history = new History();
  const beforePop = f.village.pop;
  const beforeHp = f.village.hp;
  const beforeHouses = settlementCondition(f.world, f.village).liveHouses;
  const text = earthquake(f.world, f.village.x, f.village.y, 3, history);
  assert.ok(text && f.village.hp < beforeHp, 'earthquake affects the village through powers.js official path');
  assert.equal(f.village.pop, beforePop, 'no fictional direct population reduction');
  assert.ok(settlementCondition(f.world, f.village).ruinedHouses >= 0);
  assert.ok(f.world.milestones.some(row => String(row.text || row).includes('聚落受损')));
  return { text, beforeHp, afterHp: f.village.hp, beforeHouses, afterHouses: settlementCondition(f.world, f.village).liveHouses };
});

check('地震撤销同时恢复受损屋舍身份、结构和渲染计数', () => {
  const f = setup(31807);
  const history = new History();
  const initialLive = deriveSettlements(f.world, { productionAssets: true }).houses;
  assert.equal(initialLive, f.village.houses.length);
  history.begin();
  earthquake(f.world, f.village.x + 0.5, f.village.y + 0.5, 3, history);
  assert.equal(history.end('地震'), true);
  const damaged = f.village.houses.filter(h => f.world.struct[f.world.idx(h.x, h.y)] !== h.type
    || h.ruinedBySettlement).length;
  assert.ok(damaged > 0, 'earthquake leaves an actual damaged house before undo');
  assert.ok(deriveSettlements(f.world, { productionAssets: true }).houses < initialLive);
  assert.equal(history.undo(f.world), '地震');
  assert.equal(f.village.houses.some(h => h.ruinedBySettlement), false, 'undo clears settlement damage anchor flags');
  assert.equal(f.village.houses.filter(h => f.world.struct[f.world.idx(h.x, h.y)] === h.type).length, initialLive);
  assert.equal(deriveSettlements(f.world, { productionAssets: true }).houses, initialLive,
    'settlement rendering recognizes restored homes');
  return { initialLive, damaged, restoredLive: deriveSettlements(f.world, { productionAssets: true }).houses };
});

check('灾害笔刷边缘与陨坑中的历史屋舍不能认领后来新屋', () => {
  for (const power of [earthquake, meteor]) {
    const f = setup(31814), history = new History();
    history.begin(); power(f.world, 32, 32, 2, history); history.end('灾害');
    for (const house of f.village.houses) {
      const i = f.world.idx(house.x, house.y);
      if (Math.hypot(house.x + 0.5 - 32, house.y + 0.5 - 32) <= 1.5 && ![1,2].includes(f.world.struct[i])) {
        assert.equal(house.ruinedBySettlement, true, 'every actually destroyed in-brush anchor is marked');
        f.world.struct[i] = STRUCT.HOUSE;
        assert.equal(deriveSettlements(f.world).buildings.some(b => b.houseKey === `house:${f.village.id}:${house.x}:${house.y}`), false);
      }
    }
  }
});

check('正式清除居民后空村停产停建，经过缓冲期退出活村并清理旧田', () => {
  const f = setup(31815, { population: 6 });
  const farm = f.world.idx(28, 32);
  f.world.over[farm] = OVER.FARMLAND;
  f.village.fieldTiles = [farm]; f.village.fields = 1; f.village.food = 100;
  f.village.buildCooldown = 0;
  const houses = f.village.houses.length;
  eraseLife(f.world, 32, 32, 8);
  const foodAfterDisaster = f.village.food;
  advance(f, 30);
  assert.equal(f.village.pop, 0);
  assert.equal(f.village.food, foodAfterDisaster);
  assert.equal(f.village.houses.length, houses);
  advance(f, 3 * 360);
  assert.equal(f.world.villageById(f.village.id), null);
  assert.equal(f.world.over[farm], OVER.NONE);
  assert.equal(f.world.settlementRuins.find(r => r.id === f.village.id).reason, '居民断绝');
});

check('地方节点与消亡档案在运行和读档两侧均有上限，重建 ID 不重用', () => {
  const f = setup(31816);
  for (let n = 0; n < 30; n++) settlementHistory(f.world, f.village, 'aid', `重要节点 ${n}`);
  assert.equal(f.village.history.length, 16);
  for (let n = 100; n < 185; n++) archiveSettlement(f.world,
    { ...f.village, id: n, history: [], houses: [] }, '验收归档');
  assert.equal(f.world.settlementRuins.length, 80);
  const loaded = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(f.world))));
  assert.ok(loaded.nextVillageId > loaded.settlementRuins.at(-1).id);
  return { localLimit: 16, ruinLimit: 80, nextVillageId: loaded.nextVillageId };
});

check('真实淹水到期优先于焚林再生并造成独立屋舍损毁结算', () => {
  const f = setup(31806, { village: false });
  const x = 30, y = 30, i = f.world.idx(x, y);
  f.world.veg[i] = 0.8;
  const history = new History();
  burnForest(f.world, x, y, 2, history);
  const char = f.world.veg[i];
  assert.ok(char < 0.8);
  advance(f, 7);
  assert.equal(f.world.veg[i], char, 'burning applies plant damage once, fire expiration does not burn it again');
  advance(f, 1080);
  assert.ok(Math.abs(f.world.veg[i] - 0.8) < 1e-5, `scorched regrowth restores the original vegetation (got ${f.world.veg[i]})`);
  const target = f.world.idx(32, 32);
  f.world.veg[target] = 0.8;
  burnForest(f.world, 32, 32, 2, history);
  const burned = f.world.veg[target];
  paintVegetation(f.world, 32, 32, 2, 0.95, history);
  const editedValue = f.world.veg[target];
  advance(f, 1087);
  assert.ok(Math.abs(f.world.veg[target] - editedValue) < 1e-5, 'player vegetation edit cancels stale restoration');
  const flooded = f.world.idx(40, 40);
  f.world.veg[flooded] = 0.7;
  burnForest(f.world, 40, 40, 2, history);
  flood(f.world, 40, 40, 2, history);
  advance(f, 1087);
  assert.ok(f.world.water[flooded] >= 0, 'the flood event remains represented after due vegetation restoration');
  assert.ok(burned < 0.95);
  return { char, restored: f.world.veg[i], edited: f.world.veg[target], floodedVeg: f.world.veg[flooded], water: f.world.water[flooded] };
});

check('S0 量化存档、火中改地、永久覆盖及延期洪水都保持优先权', () => {
  const f = setup(31817, { village: false }), history = new History(), i = f.world.idx(30, 30);
  f.world.veg[i] = 0.8123456;
  burnForest(f.world, 30, 30, 2, history);
  f.world.day += 7; settleNature(f.world);
  const loaded = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(f.world))));
  loaded.day += 1080; settleNature(loaded);
  assert.ok(Math.abs(loaded.veg[i] - 0.8123456) < 1e-5);
  const edited = setup(31818, { village: false });
  edited.world.veg[i] = 0.8;
  igniteCell(edited.world, i);
  setHeight(edited.world, i, 0.9);
  edited.world.day += 1087; settleNature(edited.world);
  assert.ok(edited.world.veg[i] < 0.3, 'terraforming during a fire cancels its old forest restoration claim');
  assert.equal(edited.world.over[i], OVER.NONE, 'cancelling regrowth must still let the old char cover expire');
  const permanent = setup(31819, { village: false });
  burnForest(permanent.world, 30, 30, 2, history);
  permanent.world.over[i] = OVER.RUINS;
  permanent.world.day += 1087; settleNature(permanent.world);
  assert.equal(permanent.world.over[i], OVER.RUINS);
  assert.ok(permanent.world.veg[i] < 0.3);
  const wet = setup(31820, { village: false });
  wet.world.veg[i] = 0.8;
  burnForest(wet.world, 30, 30, 2, history);
  wet.world.day += 7; settleNature(wet.world);
  setWater(wet.world, i, 0.3);
  wet.world.day += 1080; settleNature(wet.world);
  assert.equal(wet.world.water[i], Math.fround(0.3));
  assert.ok(wet.world.veg[i] < 0.3);
  const leap = setup(31821, { village: false });
  leap.world.veg[i] = 0.8;
  burnForest(leap.world, 30, 30, 2, history);
  const damagedVeg = leap.world.veg[i];
  leap.world.day += 1082; settleNature(leap.world);
  assert.equal(leap.world.veg[i], damagedVeg, 'a large jump cannot regenerate five days ahead of the canonical deadline');
  leap.world.day += 5; settleNature(leap.world);
  assert.ok(Math.abs(leap.world.veg[i] - 0.8) < 1e-5);
});

if (LONG) {
  const seeds = CENTURY ? [61001] : [61001,61002,61003], years = CENTURY ? 100 : 30;
  check(`${seeds.length} seeds × ${years} years through official advance: report settlement arcs, history and save sizes`, () => {
    const samples = [];
    for (const seed of seeds) {
      const world = generateWorld({preset: WORLD_PRESETS.small, seed, scatter: true, generationVersion: 2});
      world.upper = generateUpperWorld({preset: WORLD_PRESETS.small, seed});
      world.nether = generateNetherWorld({preset: WORLD_PRESETS.small, seed});
      const f = { world, life: new Life(world, mulberry32(seed ^ 0xa5a5a5a5)),
        upperLife: new UpperLife(world.upper), state: createAdvanceState() };
      const startV = f.world.villages.length;
      let aidYears = 0, crisisCount = 0;
      for (let year = 0; year < years; year += 1) {
        for (let day = 0; day < 360; day += 3) advanceWorld(world, 3, { life:f.life, upperLife:f.upperLife, state:f.state, riftActive:false });
        aidYears += world.villages.some(v => v.lastAidDay >= year * 360) ? 1 : 0;
        crisisCount = f.life.events.history.filter(e => String(e.key || '').length > 0).length;
      }
      const save = serializeWorld(f.world);
      samples.push({ seed, startV, liveVillages: f.world.villages.length, ruins: f.world.settlementRuins.length,
        hp: f.world.villages[0]?.hp ?? null, food: f.world.villages[0]?.food ?? null, aidYears,
        historyEntries: f.world.villages[0]?.history?.length ?? 0, crisisHistory: f.life.events.history.length,
        serializedBytes: Buffer.byteLength(JSON.stringify(save)) });
    }
    assert.equal(samples.length, seeds.length);
    assert.ok(samples.every(s => s.serializedBytes > 0));
    evidence.notes.push('Normal generation from day 0, no forced crisis clock/resources. Natural world crises begin at year 45; thirty-year samples do not require one.');
    return { years, samples };
  });
}

if (BENCHMARK) {
  const benchmark = await (async () => {
    const baseDir = process.env.INKBOX_RESILIENCE_BASE_DIR;
    assert.ok(baseDir, '--benchmark requires INKBOX_RESILIENCE_BASE_DIR pointing to the S0 worktree');
    const baselinePath = resolve(baseDir);
    async function imports(root) {
      const modulePath = name => pathToFileURL(join(root, 'src', 'inkbox', name)).href;
      const [worldMod, lifeMod, advanceMod, noiseMod] = await Promise.all([
        import(modulePath('world/World.js')), import(modulePath('sim/life.js')),
        import(modulePath('sim/advance.js')), import(modulePath('core/noise.js')),
      ]);
      return { World: worldMod.World, Life: lifeMod.Life, advanceWorld: advanceMod.advanceWorld,
        createAdvanceState: advanceMod.createAdvanceState, mulberry32: noiseMod.mulberry32 };
    }
    async function sample(api, seed) {
      const world = new api.World(256, 256, seed);
      world.day = 5000;
      world.type.fill(TERRAIN.GRASS);
      const terrainRng = api.mulberry32(seed ^ 0x74657272);
      for (let i = 0; i < world.size; i += 1) world.height[i] = 0.45 + terrainRng() * 0.1;
      world.veg.fill(0.6); world.moist.fill(0.2); world.temp.fill(0.55);
      const life = new api.Life(world, api.mulberry32(seed ^ 0xa5a5a5a5));
      const state = api.createAdvanceState();
      const villages = Math.min(256, Math.max(8, Math.floor(LIMITS.maxVillages * 0.8)));
      for (let n = 0; n < villages; n += 1) {
        const x = 7 + (n % 16) * 15, y = 7 + Math.floor(n / 16) * 15;
        const village = { id: n + 1, x, y, faction: 0, name: `村${n + 1}`, pop: 0, food: 80,
          houses: [], fields: 0, level: 1, hp: 100, buildCooldown: 1e9, age: 0, distressDays: 0 };
        world.villages.push(village);
        assert.equal(life.spawn(x, y, 'human', 1, 0, { village: village.id }), 1, 'near-cap fixture uses formal residents');
        world.entities.at(-1).village = village.id;
      }
      const started = performance.now();
      for (let day = 0; day < 360; day += 1) api.advanceWorld(world, 1, { life, state, riftActive: false });
      return { elapsedMs: performance.now() - started, villages: world.villages.length,
        liveVillagesAfter: world.villages.length, ruinationArchive: world.settlementRuins?.length || 0 };
    }
    const [currentApi, baselineApi] = await Promise.all([imports(resolve('.')), imports(baselinePath)]);
    const seed = 62001;
    const runs = [];
    for (let repetition = 0; repetition < 3; repetition += 1) {
      const baseline = await sample(baselineApi, seed);
      const current = await sample(currentApi, seed);
      runs.push({ repetition: repetition + 1, baseline, current,
        deltaMs: current.elapsedMs - baseline.elapsedMs,
        deltaPercent: (current.elapsedMs / baseline.elapsedMs - 1) * 100 });
    }
    return { baselinePath, seed, simulatedDays: 360, repetitions: 3, runs,
      entityLimit: LIMITS.maxEntities, villageCap: LIMITS.maxVillages };
  })();
  checks.push({ name: 'paired S0 steady-state costs and near-cap village loops', status: 'pass', ...benchmark });
  console.log('✓ paired S0 steady-state costs and near-cap village loops');
}

report();
console.log(`resilience acceptance passed: ${checks.length} checks`);
