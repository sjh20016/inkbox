#!/usr/bin/env node
import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { TERRAIN, STRUCT } from '../src/inkbox/core/config.js';
import { History, flood, removeWater } from '../src/inkbox/sim/powers.js';
import { readObserveEcho, focusSettlement, clearSettlementFocus, settlementRevisit,
  markRevisit, resolveObservedSettlement } from '../src/inkbox/sim/observeEcho.js';
import { settlementHistory, archiveSettlement } from '../src/inkbox/sim/settlementResilience.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';

let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }
function fixture(seed = 61001) {
  const world = new World(64, 64, seed);
  world.height.fill(0.48); world.type.fill(TERRAIN.GRASS);
  world.veg.fill(0.5); world.moist.fill(0.2); world.temp.fill(0.55);
  const raw = mulberry32(seed); let draws = 0;
  const life = new Life(world, () => { draws += 1; return raw(); });
  const village = { id: 7, name: '松溪村', x: 32, y: 32, faction: 0, pop: 0, food: 40,
    hp: 100, houses: [], fields: 0, fieldTiles: [], level: 1, age: 90, foundedDay: 0,
    distressDays: 0, history: [], buildCooldown: 1e9 };
  world.villages.push(village); world.nextVillageId = 8;
  for (let n = 0; n < 4; n += 1) {
    const x = 31 + n % 2, y = 31 + Math.floor(n / 2), type = n ? STRUCT.HOUSE : STRUCT.HALL;
    village.houses.push({ x, y, type }); world.struct[world.idx(x, y)] = type;
  }
  for (let n = 0; n < 12; n += 1) {
    life.spawn(30 + n % 5, 30 + Math.floor(n / 5), 'human', 1, 0, { village: village.id });
    world.entities.at(-1).village = village.id;
  }
  life.syncVillagePops();
  const state = createAdvanceState();
  return { world, life, village, draws: () => draws,
    advance: (days) => advanceWorld(world, days, { life, state, riftActive: false }) };
}
function drain(f, history = new History(), metadata = true) {
  history.begin(metadata ? { toolId: 'drain', x: 32.5, y: 32.5, radius: 5 } : undefined);
  removeWater(f.world, 32.5, 32.5, 5, 0.08, history);
  history.end('抽水');
  return history;
}
function disaster(f) {
  const h = new History(); h.begin(); flood(f.world, 32.5, 32.5, 5, h); h.end('洪水');
}

check('合法洪灾、真实抽水与正式推进：观察和笔录零新增 RNG、零模拟副作用', () => {
  const observed = fixture(), control = fixture();
  disaster(observed); disaster(control);
  assert.ok(observed.world.water.some((water) => water > 0));
  assert.ok(observed.village.hp < 100);
  focusSettlement(observed.world, 7);
  drain(observed); drain(control, new History(), false);
  const mark = readObserveEcho(observed.world).marks[0];
  assert.equal(mark.settlementId, 7); assert.ok(mark.changedCells > 0);
  assert.ok(mark.waterBefore > mark.waterAfter);
  assert.equal(mark.before.id, mark.after.id);
  const draws = observed.draws();
  readObserveEcho(observed.world); settlementRevisit(observed.world); markRevisit(observed.world, mark);
  assert.equal(observed.draws(), draws);
  observed.advance(30); control.advance(30);
  assert.equal(observed.draws(), control.draws());
  const a = serializeWorld(observed.world), b = serializeWorld(control.world); delete a.observeEcho;
  assert.deepEqual(a, b);
  assert.equal(markRevisit(observed.world, mark).history.fromDay, mark.day);
});

check('相同合法洪灾的介入与旁观对照：仅一支抽水，正式推进后如实报告', () => {
  const intervention = fixture(61002), spectator = fixture(61002);
  disaster(intervention); disaster(spectator);
  assert.deepEqual(serializeWorld(intervention.world), serializeWorld(spectator.world),
    'same seeded fixtures and formal disaster produce identical initial state');
  assert.equal(intervention.draws(), spectator.draws(), 'initial random streams have equal draw counts');
  const center = intervention.world.idx(32, 32);
  const beforeWater = intervention.world.water[center];
  assert.ok(beforeWater > 0, 'the legal flood actually inundates the center');
  const beforeDraws = intervention.draws();
  drain(intervention);
  assert.equal(intervention.draws(), beforeDraws, 'the intervention itself consumes no Life draws');
  assert.ok(intervention.world.water[center] < spectator.world.water[center]);
  assert.equal(spectator.world.water[center], beforeWater, 'spectator leaves initial flood untouched');
  assert.ok(intervention.world.water.some((water, index) => water !== spectator.world.water[index]));
  const sample = (f) => {
    const current = resolveObservedSettlement(f.world, 7);
    return { day: f.world.day, water: f.world.water[center], kind: current.kind,
      status: current.settlement?.status ?? null, pop: current.settlement?.pop ?? null,
      hp: current.settlement?.hp ?? null, food: current.settlement?.food ?? null,
      liveHouses: current.settlement?.houses ?? null, ruinedHouses: current.settlement?.ruinedHouses ?? null };
  };
  const observations = [{ elapsedDays: 0, intervention: sample(intervention), spectator: sample(spectator) }];
  for (let month = 1; month <= 24; month += 1) {
    intervention.advance(30); spectator.advance(30);
    if (month === 3 || month === 12 || month === 24) {
      observations.push({ elapsedDays: month * 30, intervention: sample(intervention), spectator: sample(spectator) });
    }
  }
  assert.equal(intervention.world.day, 720); assert.equal(spectator.world.day, 720);
  assert.equal(readObserveEcho(intervention.world).marks.length, 1);
  assert.equal(readObserveEcho(spectator.world).marks.length, 0);
  console.log(`  同seed独立新局，未经过读档；只核对初态与即时水层差，不预设后续获救：${JSON.stringify(observations)}`);
});

check('同日旧沿革不冒充此后变化；滚动窗口丢失锚点诚实提示', () => {
  const f = fixture();
  settlementHistory(f.world, f.village, 'old', '记挂前同日事件');
  focusSettlement(f.world, 7);
  assert.deepEqual(settlementRevisit(f.world).history.entries, []);
  settlementHistory(f.world, f.village, 'new', '记挂后同日事件');
  assert.deepEqual(settlementRevisit(f.world).history.entries.map((n) => n.type), ['new']);
  for (let n = 0; n < 20; n += 1) settlementHistory(f.world, f.village, 'later', `后续${n}`);
  const revisit = settlementRevisit(f.world);
  assert.equal(revisit.history.windowMayBeIncomplete, true);
  assert.match(revisit.history.note, /可能未保留/);
  assert.deepEqual(revisit.history.entries, [], 'unknown same-day ordering is not invented');
});

check('记挂旧村严格以 ID 回访遗址；同名新村不串；旧遗址未知援助不补零', () => {
  const f = fixture(); focusSettlement(f.world, 7);
  f.village.aidSpentProvisions = 12; f.village.aidSpentSpiritStone = 4;
  archiveSettlement(f.world, f.village, '测试身份归档'); f.world.villages.length = 0;
  f.world.villages.push({ ...f.village, id: 8, history: [], hp: 100, name: '松溪村' });
  const visit = settlementRevisit(f.world);
  assert.equal(visit.current.kind, 'ruin'); assert.equal(visit.current.settlement.id, 7);
  assert.equal(visit.current.settlement.hp, null); assert.equal(visit.aidDelta.provisions, 12);
  delete f.world.settlementRuins[0].aidSpentProvisions;
  assert.equal(settlementRevisit(f.world).aidDelta.provisions, null);
  assert.equal(focusSettlement(f.world, 7).snapshot.status, 'ruins');
  assert.equal(resolveObservedSettlement(f.world, 9).kind, 'missing');
  f.world.settlementRuins.length = 0;
  assert.equal(settlementRevisit(f.world).current.kind, 'missing');
  clearSettlementFocus(f.world); assert.equal(readObserveEcho(f.world).focus, null);
});

check('一事务一笔；无水 no-op、旧 begin 和取消不登记；undo 成功与拒绝可查', () => {
  const f = fixture();
  drain(f); assert.equal(readObserveEcho(f.world).marks.length, 0);
  assert.equal(Object.hasOwn(f.world, 'observeEcho'), false);
  disaster(f); drain(f, new History(), false); assert.equal(readObserveEcho(f.world).marks.length, 0);
  const canceled = new History(); canceled.begin({ toolId: 'drain' }); canceled.cancel(); canceled.end('取消');
  assert.equal(readObserveEcho(f.world).marks.length, 0);
  const history = drain(f), mark = f.world.observeEcho.marks[0];
  assert.equal(history.stack.at(-1).observeMarkId, mark.id);
  const first = [...history.stack.at(-1).after.keys()][0];
  const value = f.world.height[first]; f.world.height[first] += 0.01;
  assert.equal(history.undo(f.world), null); assert.equal(mark.status, 'undo-refused');
  assert.ok(mark.undoReason); assert.equal(mark.undoAvailable, true);
  f.world.height[first] = value;
  assert.equal(history.undo(f.world), '抽水'); assert.equal(mark.status, 'undone');
  assert.equal(mark.undoAvailable, false); assert.equal(history.undo(f.world), null);
});

check('笔录最多32条、淘汰可查；撤销栈清除/淘汰正确失效', () => {
  const f = fixture(), history = new History(2);
  for (let n = 0; n < 36; n += 1) {
    f.world.water[f.world.idx(32, 32)] = 0.2;
    drain(f, history);
  }
  const state = readObserveEcho(f.world);
  assert.equal(state.marks.length, 32); assert.equal(state.discardedMarks, 4);
  assert.equal(state.marks[0].id, 5); assert.equal(state.nextMarkId, 37);
  assert.equal(state.marks.filter((mark) => mark.undoAvailable).length, 2);
  history.clear(); assert.equal(readObserveEcho(f.world).marks.some((mark) => mark.undoAvailable), false);
});

check('长拖笔录只关联真实变水的村心/屋舍，干村起点与记挂均不抢关联', () => {
  const f = fixture(); focusSettlement(f.world, 7);
  const history = new History();
  f.world.water[f.world.idx(10, 10)] = 0.2;
  history.begin({ toolId: 'drain', x: 32.5, y: 32.5, radius: 1 });
  removeWater(f.world, 32.5, 32.5, 1, 0.08, history);
  removeWater(f.world, 10.5, 10.5, 1, 0.08, history);
  history.end('长拖到野外');
  assert.equal(f.world.observeEcho.marks.at(-1).settlementId, null);
  f.world.water[f.world.idx(32, 32)] = 0.2;
  history.begin({ toolId: 'drain', x: 2.5, y: 2.5, radius: 1 });
  removeWater(f.world, 2.5, 2.5, 1, 0.08, history);
  removeWater(f.world, 32.5, 32.5, 1, 0.08, history);
  history.end('长拖到村心');
  const mark = f.world.observeEcho.marks.at(-1);
  assert.equal(mark.settlementId, 7);
  assert.ok(mark.before.water > mark.after.water);
  assert.equal(Object.hasOwn(mark, 'candidates'), false);
});

check('新档保留纯数据事实且读档不能伪撤销；旧档不生成观察字段；无共享引用', () => {
  const f = fixture(); disaster(f); focusSettlement(f.world, 7); drain(f);
  const payload = serializeWorld(f.world);
  const serialized = JSON.parse(JSON.stringify(payload));
  const clone = deserializeWorld(serialized);
  const expected = readObserveEcho(f.world); expected.marks.forEach((mark) => { mark.undoAvailable = false; });
  assert.deepEqual(readObserveEcho(clone), expected);
  assert.equal(new History().undo(clone), null);
  const old = { ...serialized }; delete old.observeEcho;
  const legacy = deserializeWorld(old);
  assert.equal(Object.hasOwn(legacy, 'observeEcho'), false);
  assert.equal(Object.hasOwn(serializeWorld(legacy), 'observeEcho'), false);
  payload.observeEcho.focus.snapshot.name = '改 payload';
  assert.equal(f.world.observeEcho.focus.snapshot.name, '松溪村');
  const view = readObserveEcho(f.world); view.marks[0].before.name = '改 UI';
  assert.equal(f.world.observeEcho.marks[0].before.name, '松溪村');
  assert.equal(f.world.entities.some((entity) => entity.watch), false);
});

console.log(`观世回声数据/事务 ${checks} 项通过`);
