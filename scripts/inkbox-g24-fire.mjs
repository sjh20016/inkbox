import assert from 'node:assert/strict';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { findCombatRoots } from './inkbox-g2-fixtures.mjs';
import { SEA_LEVEL, TERRAIN } from '../src/inkbox/core/config.js';
import { combatIgnitionRoll, tryCombatIgnition } from '../src/inkbox/sim/combatEnvironment.js';
import { configureCombatPresentation } from '../src/inkbox/sim/presentation.js';
import { drainRuntimeEvents, peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { stepFire, stepVegetation } from '../src/inkbox/sim/ecology.js';
import { OVER } from '../src/inkbox/world/terrain.js';
import { deserializeWorld, serializeWorld } from '../src/inkbox/io/save.js';
import { Life } from '../src/inkbox/sim/life.js';

const roots = findCombatRoots();
const checks = [];
function check(name, fn) { fn(); checks.push(name); console.log(`✓ ${name}`); }

function combat(seed = 82401) {
  const f = fixture(seed), { world: w, life } = f;
  const a = f.entity;
  a.level = 10; a.root = roots.fire.root; a.hp = a.maxHp = 100000; a.age = 0; a.restUntil = 0;
  assert.equal(life.spawn(a.x, a.y, 'cultivator', 1), 1, 'formal Life.spawn target');
  const b = w.entities.at(-1);
  w.entities = [a, b]; w.pendingSpawns = [];
  for (const e of [a, b]) { e.hp = e.maxHp = 100000; e.age = 0; e.restUntil = 0; e.madUntil = 0; e.lifespan = 1e9; }
  a.x = 20.15; a.y = 20.5; b.x = 20.85; b.y = 20.5;
  a.tx = a.x; a.ty = a.y; b.tx = b.x; b.ty = b.y;
  drainRuntimeEvents(w);
  return { ...f, a, b };
}

function fertile(w, x = 21, y = 20) {
  for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
    const i = w.idx(xx, yy);
    w.height[i] = SEA_LEVEL + 0.1; w.water[i] = 0; w.type[i] = TERRAIN.GRASS;
    w.veg[i] = 0.8; w.moist[i] = 0.2; w.fire[i] = 0; w.over[i] = OVER.NONE;
  }
}

function candidateCells(w, target) {
  const cx = Math.round(target.x), cy = Math.round(target.y);
  return [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]]
    .map(([dx, dy]) => ({ x: cx + dx, y: cy + dy, i: w.idx(cx + dx, cy + dy) }));
}

function actualHit(f, { day = null, dt = 0.1 } = {}) {
  const { world: w, a, b, life } = f;
  if (day !== null) w.day = day;
  const hpBefore = b.hp, draws = f.draws();
  life.attack(a, b, dt);
  return { hpBefore, hpAfter: b.hp, drawDelta: f.draws() - draws };
}

function successfulDay(w, a, b, from = 0) {
  for (let day = from; day < from + 500; day++) {
    if (combatIgnitionRoll(w.seed, a.id, b.id, day) < 0.25) return day;
  }
  throw new Error('Could not find bounded deterministic success day');
}

check('正式 Life.attack：合格火根命中点燃真实格，冷却与世界/个人史事带坐标', () => {
  const f = combat(), { world: w, a, b, life } = f;
  fertile(w); w.day = successfulDay(w, a, b);
  const beforeDraws = f.draws(), hp = b.hp;
  life.attack(a, b, 0.1);
  assert.ok(b.hp < hp, 'real attack reduced HP');
  assert.equal(f.draws() - beforeDraws, 1, 'only ordinary combat damage uses the World/Life RNG');
  assert.equal(a.lastFireCastDay, w.day);
  const lit = Array.from(w.fire).filter(v => v > 0.01).length;
  assert.ok(lit >= 1 && lit <= 3, `ignited ${lit} cells`);
  const event = peekRuntimeEvents(w).find(e => e.type === 'combat-hit');
  assert.ok(event?.data?.ignition);
  const fact = event.data.ignition;
  assert.equal(fact.actorId, a.id); assert.equal(fact.targetId, b.id); assert.equal(fact.day, w.day);
  assert.equal(fact.plane, 'mortal'); assert.equal(w.fire[w.idx(fact.x, fact.y)] > 0.01, true);
  const matches = list => list.find(x => x.kind === 'combat-fire');
  for (const list of [w.chronicle, w.milestones, a.log]) {
    const row = matches(list); assert.ok(row, 'combat-fire history row exists');
    assert.deepEqual({ x: row.x, y: row.y, plane: row.plane }, { x: fact.x, y: fact.y, plane: 'mortal' });
  }
  w.day += 1;
  const nextHp = b.hp;
  life.attack(a, b, 0.1);
  assert.ok(b.hp < nextHp); assert.equal(a.lastFireCastDay, w.day - 1, 'cooldown blocks next-day cast');
});

check('资格、真实扣血、距离、死目标、地表阻断与冷却门槛', () => {
  const noIgnition = (name, mutate, options = {}) => {
    const seed = 82500 + checks.length * 20 + noIgnition.index++;
    const control = combat(seed); fertile(control.world);
    control.world.day = successfulDay(control.world, control.a, control.b);
    control.life.attack(control.a, control.b, 0.1);
    assert.ok(Array.from(control.world.fire).some(v => v > 0.01), `${name}: matched positive control can ignite`);
    const f = combat(seed);
    const { world: w, a, b } = f;
    fertile(w); const day = successfulDay(w, a, b); mutate(f);
    const hp = b.hp, result = actualHit(f, { day, ...options });
    if (options.dt === 0 || options.expectNoHit) assert.equal(result.hpAfter, hp, `${name}: rejected attack does not damage`);
    else assert.ok(result.hpAfter < hp, `${name}: real attack deals damage`);
    assert.equal(a.lastFireCastDay, -1e9, `${name}: no attempt/cooldown recorded`);
    assert.equal(Array.from(w.fire).filter(v => v > 0.01).length, 0, `${name}: no terrain fire`);
  };
  noIgnition.index = 0;
  noIgnition('non-cultivator', ({ a }) => { a.sp = 'beast'; });
  noIgnition('no fire affinity', ({ a }) => { a.root = roots.blade.root; });
  noIgnition('level below 10', ({ a }) => { a.level = 9; });
  noIgnition('dead-at-entry target hpBefore=0', ({ b }) => { b.hp = 0; });
  noIgnition('dt=0 produces no hit', () => {}, { dt: 0 });
  noIgnition('out of range', ({ b }) => { b.x += 2; b.tx = b.x; }, { expectNoHit: true });
  noIgnition('non-mortal plane', ({ world }) => { world.plane = 'upper'; });

  const fakeControl = combat(82588); fertile(fakeControl.world);
  fakeControl.world.day = successfulDay(fakeControl.world, fakeControl.a, fakeControl.b);
  fakeControl.life.attack(fakeControl.a, fakeControl.b, 0.1);
  assert.ok(Array.from(fakeControl.world.fire).some(v => v > 0.01), 'fake-target membership case has a matched real ignition control');
  const fake = combat(82588), fakeTarget = { ...fake.b, id: fake.b.id + 10000, hp: 1 };
  fertile(fake.world); fake.world.day = successfulDay(fake.world, fake.a, fake.b);
  assert.equal(tryCombatIgnition(fake.world, fake.a, fakeTarget, 1, 2), null,
    'real entities except the fake target are registered; membership guard rejects it');

  const terrainRejects = [
    ['water above threshold', (w, i) => { w.water[i] = 0.01; }],
    ['World.isWater shallow edge water=0.002', (w, i) => { w.water[i] = 0.002; }],
    ['low fuel', (w, i) => { w.veg[i] = 0.1; }],
    ['wet terrain', (w, i) => { w.moist[i] = 0.8; }],
    ['lava', (w, i) => { w.type[i] = TERRAIN.LAVA; }],
    ['sub-sea terrain', (w, i) => { w.height[i] = SEA_LEVEL; }],
  ];
  for (const [name, block] of terrainRejects) {
    const seed = 82600 + terrainRejects.findIndex(x => x[0] === name);
    const control = combat(seed); fertile(control.world);
    control.world.day = successfulDay(control.world, control.a, control.b);
    control.life.attack(control.a, control.b, 0.1);
    assert.ok(Array.from(control.world.fire).some(v => v > 0.01), `${name}: matched positive control can ignite`);
    const f = combat(seed);
    const { world: w, a, b } = f; fertile(w);
    for (const { i } of candidateCells(w, b)) block(w, i);
    const day = successfulDay(w, a, b), hp = b.hp;
    actualHit(f, { day });
    assert.ok(b.hp < hp, `${name}: positive real hit control`);
    assert.equal(a.lastFireCastDay, -1e9, `${name}: blocked all nine possible candidate cells`);
    assert.equal(Array.from(w.fire).filter(v => v > 0.01).length, 0, name);
  }

  for (const ago of [89, 90]) {
    const f = combat(82620 + ago), { world: w, a, b } = f; fertile(w);
    const day = successfulDay(w, a, b, 100); w.day = day; a.lastFireCastDay = day - ago;
    const hp = b.hp; actualHit(f);
    assert.ok(b.hp < hp, `cooldown day ${ago}: real hit`);
    if (ago === 89) {
      assert.equal(a.lastFireCastDay, day - ago); assert.equal(Array.from(w.fire).filter(v => v > 0.01).length, 0);
    } else {
      assert.equal(a.lastFireCastDay, day); assert.ok(Array.from(w.fire).some(v => v > 0.01));
    }
  }
});

check('hash失败消耗尝试冷却但不抽RNG；表现关闭不关闭真实环境后果；相同种子可复现', () => {
  const f = combat(82402), { world: w, a, b, life } = f;
  fertile(w);
  w.day = Array.from({ length: 500 }, (_, day) => day).find(day => combatIgnitionRoll(w.seed, a.id, b.id, day) >= 0.25);
  assert.ok(Number.isFinite(w.day));
  const draws = f.draws();
  const hp = b.hp; life.attack(a, b, 0.1);
  assert.ok(b.hp < hp); assert.equal(a.lastFireCastDay, w.day);
  assert.equal(f.draws() - draws, 1, 'failed pure hash draw adds no RNG call');
  assert.equal(Array.from(w.fire).filter(v => v > 0.01).length, 0);

  const g = combat(82403), { world: z, a: c, b: d, life: otherLife } = g;
  fertile(z); z.day = successfulDay(z, c, d); configureCombatPresentation(z, { enabled: false });
  otherLife.attack(c, d, 0.1);
  assert.ok(Array.from(z.fire).some(v => v > 0.01));
  assert.equal(peekRuntimeEvents(z).length, 0, 'FX/presentation gate does not gate the World change');

  const run = () => { const q = combat(82404); fertile(q.world); q.world.day = successfulDay(q.world, q.a, q.b); q.life.attack(q.a, q.b, 0.1); return { fire: Array.from(q.world.fire), last: q.a.lastFireCastDay }; };
  assert.deepEqual(run(), run(), 'same seed, IDs and day reproduce fire state');
});

check('真实火势蔓延、燃尽留焦土、植被恢复褪去焦土', () => {
  const f = combat(82405), { world: w, a, b, life } = f; fertile(w);
  w.day = successfulDay(w, a, b); life.attack(a, b, 0.1);
  const source = w.idx(Math.round(b.x), Math.round(b.y));
  const neighbour = w.idx(Math.round(b.x) + 1, Math.round(b.y));
  assert.ok(w.fire[source] > 0.01, 'real attack made the initial fire');
  let spreadSeen = false;
  let calls = 0;
  const ecologyRng = () => { calls += 1; return calls === 1 ? 0 : 0.999999; };
  for (let n = 0; n < 80 && Array.from(w.fire).some(v => v > 0.01); n++) {
    stepFire(w, 0.8, ecologyRng);
    if (w.fire[neighbour] > 0.01) spreadSeen = true;
  }
  assert.ok(spreadSeen, 'real stepFire spread from the actual combat ignition');
  assert.equal(Array.from(w.fire).filter(v => v > 0.01).length, 0, 'bounded ecology steps naturally extinguish finite fuel');
  assert.ok(Array.from(w.over).some(v => v === OVER.SCORCHED), 'burning left real scorched terrain');
  const scorched = Array.from({ length: w.size }, (_, i) => i).filter(i => w.over[i] === OVER.SCORCHED);
  for (const i of scorched) { w.moist[i] = 0.9; w.temp[i] = 0.8; }
  for (let n = 0; n < 40 && scorched.some(i => w.over[i] === OVER.SCORCHED); n++) stepVegetation(w, 360, () => 0.5);
  assert.ok(scorched.some(i => w.veg[i] > 0.35));
  assert.ok(scorched.some(i => w.over[i] === OVER.NONE), 'real vegetation regrowth clears scorched overlay');
});

check('当前与旧格式存读档保留 lastFireCastDay、actor 与火史坐标', () => {
  const f = combat(82406), { world: w, a, b, life } = f;
  fertile(w); w.day = successfulDay(w, a, b); life.attack(a, b, 0.1);
  const saved = JSON.parse(JSON.stringify(serializeWorld(w)));
  const row = saved.entities.find(entity => entity[0] === a.id);
  assert.equal(row[69], a.lastFireCastDay);
  const loaded = deserializeWorld(saved), loadedActor = loaded.entities.find(e => e.id === a.id);
  assert.equal(loadedActor.lastFireCastDay, a.lastFireCastDay);
  const milestone = loaded.milestones.find(e => e.kind === 'combat-fire');
  const chronicle = loaded.chronicle.find(e => e.kind === 'combat-fire');
  const log = loadedActor.log.find(e => e.kind === 'combat-fire');
  assert.ok(milestone && chronicle && log);
  for (const row of [milestone, chronicle, log]) assert.deepEqual({ x: row.x, y: row.y, plane: row.plane },
    { x: milestone.x, y: milestone.y, plane: 'mortal' });
  const factIndex = w.idx(milestone.x, milestone.y);
  assert.ok(Math.abs(loaded.fire[factIndex] - w.fire[factIndex]) <= 1 / 65535,
    'JSON save/load preserves quantized fire fact within codec resolution');
  const fireBefore = Array.from(loaded.fire), historyBefore = {
    milestones: loaded.milestones.length, chronicle: loaded.chronicle.length, log: loadedActor.log.length,
  };
  const loadedTarget = loaded.entities.find(e => e.id === b.id);
  const replayLife = new Life(loaded, () => 0.5);
  replayLife.attack(loadedActor, loadedTarget, 0.1);
  assert.equal(loadedActor.lastFireCastDay, loaded.day, 'same-day post-load hit is still inside cooldown');
  assert.deepEqual(Array.from(loaded.fire), fireBefore, 'same-day attack cannot add fire after load');
  assert.deepEqual({ milestones: loaded.milestones.length, chronicle: loaded.chronicle.length, log: loadedActor.log.length },
    historyBefore, 'same-day post-load attack adds no fire history');
  const old = structuredClone(saved); for (const row of old.entities) row.length = 69;
  const oldLoaded = deserializeWorld(old);
  assert.ok(oldLoaded.entities.every(e => e.lastFireCastDay === -1e9), 'old 69-column entity rows default the appended cast day');
  assert.ok(oldLoaded.entities.some(e => e.id === b.id));
});

console.log(`G2.4 CPU fire checks: ${checks.length} groups passed.`);
