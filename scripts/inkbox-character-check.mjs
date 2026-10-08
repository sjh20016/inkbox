// Character-G0/G0.5 executable invariants. No DOM, browser, or simulated RNG.
import assert from 'node:assert/strict';
import { characterCandidatesAt } from '../src/inkbox/ui/characterPick.js';
import { characterSnapshot } from '../src/inkbox/ui/characterCardData.js';
import { applyHeavenEdict } from '../src/inkbox/sim/heavenEdicts.js';
import { expToNext } from '../src/inkbox/core/cultivation.js';
import { openCharacterCard, refreshCharacterCard, closeCharacterCard } from '../src/inkbox/ui/characterPanel.js';

assert.equal(typeof openCharacterCard, 'function');
assert.equal(typeof refreshCharacterCard, 'function');
assert.equal(typeof closeCharacterCard, 'function');
const entity = id => ({
  id, sp: 'cultivator', x: 1.25, y: 2.25, hp: 150, maxHp: 150, age: 3600,
  lifespan: 36000, level: 4, exp: 7, root: { rootName: '木灵根', quality: 2, bonus: .04 },
  dao: null, fortune: 42, mind: 64, heartDemon: 0, pollution: 0, karma: 0,
  name: '测试修士' + id, techniques: [], artifacts: [], relations: new Map(),
  log: [], faction: 0, bloodline: null, madUntil: -1, restUntil: -1,
});
const a = entity(1), b = entity(2);
const world = {
  w: 4, h: 4, day: 0, plane: 'mortal', qi: new Float32Array(16).fill(.5),
  height: new Float32Array(16), entities: [a,b], chronicle: [],
  record(text, kind, person) {
    this.chronicle.push({ day: this.day, text, kind });
    person.log.push({ day: this.day, text, kind });
  }
};
const before = characterSnapshot(world, a);
assert.equal(before.id, 1);
assert.equal(before.exp, 7);
assert.equal(before.target, expToNext(4));
assert.ok(before.rate > 0);
assert.ok(before.combat > 0);
assert.ok(before.traits.some(t => t.name === '木灵根' && t.type === '实效'));
assert.equal(characterSnapshot(world, a).percent, before.percent);
const baseOther = JSON.stringify({ exp: b.exp, fortune: b.fortune, mind: b.mind });
const exp = applyHeavenEdict(world, { targetId: 1, action: 'cultivation' });
assert.equal(exp.ok, true);
assert.equal(exp.axis, 'exp');
assert.equal(exp.before, 7);
assert.equal(a.exp, 7 + Math.round(expToNext(a.level)*.25));
assert.equal(characterSnapshot(world, a).exp, a.exp);
assert.equal(world.chronicle.length, 1);
assert.match(a.log[0].text, /【天道敕令】/);
assert.deepEqual(JSON.stringify({ exp: b.exp, fortune: b.fortune, mind: b.mind }), baseOther);
assert.equal(applyHeavenEdict(world, { targetId: 1, action: 'fortune' }).after, 50);
assert.equal(applyHeavenEdict(world, { targetId: 1, action: 'mind' }).after, 72);
assert.equal(applyHeavenEdict(world, { targetId: 88, action: 'mind' }).ok, false);
assert.equal(applyHeavenEdict(world, { targetId: 1, action: 'not-listed' }).ok, false);
const logLength = a.log.length;
a.fortune = 100;
assert.equal(applyHeavenEdict(world, { targetId: 1, action: 'fortune' }).ok, false);
assert.equal(a.log.length, logLength);
const normal = { fortune: a.fortune, mind: a.mind, exp: a.exp };
const snapAfter = characterSnapshot(world, a);
assert.equal(a.fortune, normal.fortune);
assert.equal(a.mind, normal.mind);
assert.equal(a.exp, normal.exp);
assert.equal(snapAfter.percent > before.percent, true);
// Mortal must not gain EXP by edict before awakening.
const mortal = { ...entity(3), sp: 'human', level: 0, root: null, exp: 0 };
world.entities.push(mortal);
assert.equal(characterSnapshot(world, mortal).awakened, false);
assert.equal(applyHeavenEdict(world, { targetId: 3, action: 'cultivation' }).ok, false);
// Screen distance and stable ID tiebreak, not strongest-neighbour selection.
const camera = { tileScreen(x,y) { return [x*10, y*10]; } };
const list = characterCandidatesAt(world,camera,12.5,22.5,7);
assert.deepEqual(list.map(e => e.id),[1,2,3]);
const far = characterCandidatesAt(world,camera,800,800,7);
assert.equal(far.length,0);
console.log('Character-G0/G0.5: 22 identity, EXP, edict, log, purity and picking checks passed');
