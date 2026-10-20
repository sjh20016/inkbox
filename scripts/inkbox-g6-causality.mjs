import assert from 'node:assert/strict';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { World } from '../src/inkbox/world/World.js';
import { onDeathRelations, stepRelations, RELATION_TYPES as R } from '../src/inkbox/sim/relations.js';
import { MERCY, MERCY_SEED_KEY } from '../src/inkbox/sim/life.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { compileBiography, recordLifeEvent } from '../src/inkbox/sim/biography.js';
import { buildCharacterViewModel, characterKey } from '../src/inkbox/g1/characterRuntime.js';

let groups = 0;
function check(name, run) { run(); groups++; console.log(`PASS ${name}`); }
const cause = e => (e.log || []).filter(row => row.text.includes('结下仇怨'));
const outcome = e => (e.log || []).filter(row => row.text.includes('旧怨暂歇'));
const noRng = () => { throw new Error('death relation hook drew RNG'); };

// Explicitly controlled formal Life fixture: real spawned characters, fixed
// positions/health/parent IDs, and a chosen existing mercy stream outcome.
// This proves causality and reachability, not a natural-run incidence rate.
function mercySeed(fatal) {
  for (let seed = 1; seed < 10000; seed++) {
    const rng = mulberry32(seed ^ MERCY_SEED_KEY);
    if ((rng() >= MERCY) === fatal && (!fatal || rng() >= MERCY)) return seed;
  }
  throw new Error('No controlled mercy seed');
}
function chainFixture(fatal = true) {
  const f = fixture(916), w = f.world, avenger = f.entity;
  const extra = [];
  for (let n = 0; n < 3; n++) {
    let ok = false;
    for (let k = 0; k < 100 && !ok; k++) ok = f.life.spawn(avenger.x, avenger.y, 'cultivator', 1) > 0;
    assert.ok(ok); extra.push(w.entities.at(-1));
  }
  const [killer, victim, neutral] = extra;
  w.entities = [avenger, killer, victim, neutral]; w.pendingSpawns = [];
  w.seed = mercySeed(fatal); w.day = 100;
  for (const e of w.entities) {
    e.hp = e.maxHp = 2000; e.age = 10; e.lifespan = 1e8;
    e.restUntil = 0; e.madUntil = 0; e.faction = 0; e.village = 0;
    e.x = avenger.x; e.y = avenger.y; e.tx = e.x; e.ty = e.y;
    e.relations = new Map(); e.artifacts = []; e.techniques = [];
    e.level = 1; e.exp = 0; e.log = []; e.timer = 100;
  }
  avenger.level = 10; avenger.parentA = victim.id;
  victim.hp = .001;
  return { ...f, avenger, killer, victim, neutral };
}

check('受控正式 attack→step死亡清扫→ENMITY→findEnemy目标改变→step真实斩杀闭环', () => {
  const f = chainFixture(), { life, world: w, avenger, killer, victim, neutral } = f;
  // Mature characters already have a full retained log. The causal records
  // must survive insertion without lifting the existing 32-entry cap.
  for (const e of [avenger, killer]) {
    for (let n = 0; n < 32; n++) recordLifeEvent(w, e, 'breakthrough', `受控既有破境经历 ${n}`, { importance: 59 });
    assert.equal(e.log.length, 32);
  }
  life.rebuildGrid(); assert.equal(life.findEnemy(avenger, 9), null);
  life.attack(killer, victim, 1);
  assert.ok(victim.hp <= 0); assert.equal(victim.killedBy.id, killer.id);
  assert.equal(cause(avenger).length, 0, 'attack alone has not processed death relations');
  life.step(0);
  assert.ok(!w.entities.includes(victim));
  assert.equal(avenger.relations.get(killer.id).type, R.ENMITY);
  assert.ok(avenger.relations.get(killer.id).score <= -60);
  assert.equal(life.findEnemy(avenger, 9), killer);
  assert.equal(avenger.relations.has(neutral.id), false);
  assert.equal(cause(avenger).length, 1); assert.equal(cause(killer).length, 1);
  for (const e of [avenger, killer]) {
    assert.equal(e.log.length, 32); assert.equal(cause(e)[0].importance, 60);
    assert.ok(buildCharacterViewModel(w, characterKey('mortal', e.id)).history.some(r => r.text.includes('结下仇怨')));
  }
  const row = cause(avenger)[0];
  assert.equal(row.x, Math.floor(victim.x)); assert.equal(row.y, Math.floor(victim.y)); assert.equal(row.plane, 'mortal');
  assert.ok(w.dead.some(e => e.id === victim.id));
  onDeathRelations(w, victim, noRng);
  assert.equal(cause(avenger).length, 1, 'repeated death hook does not repeat unchanged enmity');

  const saved = serializeWorld(w), loaded = deserializeWorld(saved);
  assert.equal(serializeWorld(loaded).v, saved.v);
  const restored = loaded.entities.find(e => e.id === avenger.id);
  assert.equal(restored.relations.get(killer.id).type, R.ENMITY);
  assert.equal(restored.relations.get(killer.id).score, avenger.relations.get(killer.id).score);
  assert.equal(restored.relations.get(killer.id).since, 0, 'existing save format does not persist relation since');
  assert.deepEqual(restored.log, avenger.log);
  assert.deepEqual(loaded.entities.find(e => e.id === killer.id).log, killer.log);
  const before = JSON.stringify(serializeWorld(loaded));
  assert.ok(buildCharacterViewModel(loaded, characterKey('mortal', avenger.id)).history.some(r => r.text.includes('结下仇怨')));
  assert.ok(compileBiography(loaded, restored).includes('结下仇怨'));
  assert.equal(JSON.stringify(serializeWorld(loaded)), before);

  killer.hp = .001;
  life.step(.1);
  assert.equal(avenger.state, 'fight'); assert.ok(killer.hp <= 0);
  assert.equal(killer.killedBy.id, avenger.id);
  assert.equal(outcome(avenger).length, 1);
  assert.equal(outcome(avenger)[0].importance, 60); assert.equal(avenger.log.length, 32);
  assert.equal(avenger.relations.has(killer.id), false, 'existing death cleanup removes resolved edge');
  const after = JSON.stringify(serializeWorld(w)), draws = f.draws();
  assert.ok(buildCharacterViewModel(w, characterKey('mortal', avenger.id)).history.some(r => r.text.includes('旧怨暂歇')));
  assert.ok(compileBiography(w, avenger).includes('旧怨暂歇'));
  assert.equal(JSON.stringify(serializeWorld(w)), after); assert.equal(f.draws(), draws);
  const concluded = deserializeWorld(serializeWorld(w));
  assert.equal(serializeWorld(concluded).v, saved.v);
  assert.deepEqual(concluded.entities.find(e => e.id === avenger.id).log, avenger.log);
  const beforeRead = JSON.stringify(serializeWorld(concluded));
  assert.ok(buildCharacterViewModel(concluded, characterKey('mortal', avenger.id)).history.some(r => r.text.includes('旧怨暂歇')));
  assert.equal(JSON.stringify(serializeWorld(concluded)), beforeRead);
});

function hookFixture() {
  const world = new World(8, 8, 71);
  const person = (id, name) => ({ id, name, sp: 'cultivator', hp: 100, age: 1, lifespan: 100, x: 3, y: 4, relations: new Map(), log: [] });
  const victim = person(1, '故人'), killer = person(2, '凶手'), survivor = person(3, '幸存者');
  victim.hp = 0; victim.killedBy = { id: killer.id, name: killer.name };
  survivor.parentA = victim.id; world.entities = [victim, killer, survivor];
  return { world, victim, killer, survivor };
}
check('stepRelations原结怨不覆写任一方向ENMITY；普通RIVAL仍生成且均恰好抽5签', () => {
  for (const direction of ['forward', 'reverse', 'none']) {
    const { world, survivor: a, killer: b } = hookFixture();
    world.entities = [a, b]; a.level = b.level = 4;
    if (direction !== 'none') {
      a.relations.set(b.id, { type: direction === 'forward' ? R.ENMITY : R.RIVAL, score: -60, since: 1 });
      b.relations.set(a.id, { type: direction === 'reverse' ? R.ENMITY : R.RIVAL, score: -60, since: 2 });
    }
    const beforeA = structuredClone(Array.from(a.relations)), beforeB = structuredClone(Array.from(b.relations));
    const rolls = [1, 1, 0, 0, .75]; let calls = 0;
    stepRelations(world, null, 1, () => { assert.ok(calls < rolls.length); return rolls[calls++]; });
    assert.equal(calls, 5);
    if (direction === 'none') {
      assert.equal(a.relations.get(b.id).type, R.RIVAL); assert.equal(a.relations.get(b.id).score, -30);
      assert.equal(b.relations.get(a.id).type, R.RIVAL); assert.equal(b.relations.get(a.id).score, -30);
    } else {
      assert.deepEqual(Array.from(a.relations), beforeA); assert.deepEqual(Array.from(b.relations), beforeB);
    }
  }
});
check('仅正式直系亲属/强亲密关系；双向敌意最低-60且不额外抽RNG', () => {
  for (const type of [R.KIN, R.LOVER, R.MENTOR, R.DISCIPLE, 'parent', 'child']) {
    const f = hookFixture(); delete f.survivor.parentA;
    if (type === 'parent') f.victim.parentB = f.survivor.id;
    else if (type === 'child') f.survivor.parentB = f.victim.id;
    else f.survivor.relations.set(f.victim.id, { type, score: 50 });
    onDeathRelations(f.world, f.victim, noRng);
    assert.equal(f.survivor.relations.get(f.killer.id)?.type, R.ENMITY, type);
  }
  const f = hookFixture();
  f.survivor.relations.set(f.killer.id, { type: R.RIVAL, score: 20, since: 2 });
  f.killer.relations.set(f.survivor.id, { type: R.ENMITY, score: -90, since: 3 });
  onDeathRelations(f.world, f.victim, noRng);
  assert.equal(f.survivor.relations.get(f.killer.id).score, -60);
  assert.equal(f.killer.relations.get(f.survivor.id).score, -90);
  assert.equal(f.survivor.relations.get(f.killer.id).since, 2);
});
check('不向无证据/不可行动者/非人类归罪；所有非敌意边含非对称peer均保留', () => {
  const invalid = [
    f => delete f.victim.killedBy, f => { f.victim.killedBy.id = 999; },
    f => { f.victim.killedBy.id = f.victim.id; }, f => { f.victim.killedBy.id = f.survivor.id; },
    f => { f.killer.hp = 0; }, f => { f.killer._ascended = true; },
    f => { f.killer.age = f.killer.lifespan; }, f => { f.survivor.hp = 0; },
    f => { f.survivor._ascended = true; }, f => { f.survivor.age = f.survivor.lifespan; },
    f => { f.killer.sp = 'beast'; }, f => { f.survivor.sp = 'spirit'; },
    f => { delete f.survivor.parentA; },
    f => { delete f.survivor.parentA; f.survivor.relations.set(f.victim.id, { type: R.LOVER, score: 49 }); },
    f => { delete f.survivor.parentA; f.survivor.relations.set(f.victim.id, { type: R.PEER, score: 100 }); },
  ];
  for (const mutate of invalid) {
    const f = hookFixture(); mutate(f); onDeathRelations(f.world, f.victim, noRng);
    assert.equal(cause(f.survivor).length, 0); assert.equal(f.survivor.relations.has(f.killer.id), false);
  }
  for (const type of Object.values(R).filter(type => ![R.RIVAL, R.ENMITY].includes(type))) {
    for (const reverse of [false, true]) {
      const f = hookFixture(), owner = reverse ? f.killer : f.survivor, target = reverse ? f.survivor : f.killer;
      owner.relations.set(target.id, { type, score: 60 });
      onDeathRelations(f.world, f.victim, noRng);
      assert.deepEqual(owner.relations.get(target.id), { type, score: 60 });
      assert.equal(cause(f.survivor).length, 0);
    }
  }
});
check('真实mercy留命、普通击杀和RIVAL击杀均无旧怨结局；留命不成立亲友仇怨', () => {
  const f = chainFixture(false);
  f.killer.relations.set(f.victim.id, { type: R.ENMITY, score: -60 });
  f.life.attack(f.killer, f.victim, 1);
  assert.ok(f.victim.hp > 0); assert.ok(f.victim.restUntil > f.world.day);
  assert.equal(f.victim.killedBy, undefined); assert.equal(outcome(f.killer).length, 0);
  assert.equal(cause(f.avenger).length, 0);
  for (const type of [null, R.RIVAL]) {
    const g = chainFixture();
    if (type) g.killer.relations.set(g.victim.id, { type, score: -80 });
    g.life.attack(g.killer, g.victim, 1);
    assert.ok(g.victim.hp <= 0); assert.equal(outcome(g.killer).length, 0);
  }
});
console.log(`G6 causal contracts: ${groups}/${groups} groups passed (controlled fixtures; no natural frequency claim)`);
