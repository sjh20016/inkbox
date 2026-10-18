import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { World } from '../src/inkbox/world/World.js';
import { MANUALS } from '../src/inkbox/core/lore.js';
import { canAccess } from '../src/inkbox/core/mapAccess.js';
import { placeCave, placeSecret } from '../src/inkbox/sim/divine.js';
import { enterSite, plantSite, spawnCave, spawnSecretRealm, stepSites, SITE_LIFESPAN_YEARS } from '../src/inkbox/sim/sites.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';

const report = { suite: 'G2.5 布缘天地', checks: [] };
function check(name, fn) {
  fn();
  report.checks.push({ name, pass: true });
  console.log(`PASS ${name}`);
}
function worldOf() {
  const world = new World(40, 40, 2505);
  world.type.fill(5);
  world.height.fill(0.5);
  world.qi.fill(0.8);
  world.mapProgress = { stage: 3 };
  return world;
}
function actor(id, techniques = []) {
  return { id, name: `修士${id}`, x: 20, y: 20, sp: 'human', hp: 60, maxHp: 100,
    level: 8, exp: 0, fortune: 60, mind: 60, heartDemon: 0, techniques, log: [] };
}
const rng = (...values) => {
  let at = 0;
  return () => values[Math.min(at++, values.length - 1)];
};

check('随机主题保留目录抽签，显式主题仍消耗同一签并取正式主题', () => {
  const world = worldOf();
  const natural = spawnSecretRealm(world, rng(0.5, 0.5, 0.4, 0.5, 0.5));
  assert.equal(natural.sub, 'formation');
  const next = worldOf();
  let draws = 0;
  const stream = () => { draws++; return 0.5; };
  const chosen = spawnSecretRealm(next, stream, null, 'sword');
  assert.equal(chosen.sub, 'sword');
  assert.equal(draws, 4, 'two location draws, one type draw, one omen draw');
  assert.equal(chosen.reward, '剑意传承');
});

check('剑冢实际偏授正式剑诀；丹阁同抽签比通用秘境修为多且养元有界', () => {
  const swordWorld = worldOf();
  const sword = spawnSecretRealm(swordWorld, rng(0.5), null, 'sword');
  const cultivator = actor(1);
  assert.equal(enterSite(swordWorld, cultivator, sword, rng(0, 0.5, 0, 0.8)).ok, true);
  assert.equal(cultivator.techniques[0].name, MANUALS.find((item) => item.kind === 'sword').name);
  assert(swordWorld.chronicle.some((row) => row.text.includes('太虚剑诀') && row.x === sword.x && row.y === sword.y));
  assert(cultivator.log.some((row) => row.text.includes('太虚剑诀') && row.plane === 'mortal' && row.x === sword.x));

  const alchemyWorld = worldOf(), genericWorld = worldOf();
  const alchemy = spawnSecretRealm(alchemyWorld, rng(0.5), null, 'alchemy');
  const generic = { ...alchemy, rewardMode: undefined };
  const alchemist = actor(2), genericVisitor = actor(3);
  alchemist.hp = genericVisitor.hp = 95;
  const alchemyResult = enterSite(alchemyWorld, alchemist, alchemy, rng(0, 0.5, 0.9));
  enterSite(genericWorld, genericVisitor, generic, rng(0, 0.5, 0.9));
  assert(alchemist.exp > genericVisitor.exp);
  assert.equal(alchemist.hp, 100);
  assert.equal(genericVisitor.hp, 95);
  assert.match(alchemyResult.gain, /修为增进.*养元恢复气血/);
  assert(alchemyWorld.chronicle.some((row) => row.text.includes('养元恢复气血') && row.x === alchemy.x));
});

check('失败仍可重伤致死，且不领取洞府传承', () => {
  const world = worldOf(), cave = spawnCave(world, rng(0.5));
  const visitor = actor(4);
  visitor.hp = 1;
  assert.equal(enterSite(world, visitor, cave, rng(0.99, 0.99)).ok, false);
  assert(visitor.hp <= 0);
  assert.equal(cave.inheritanceClaimedBy, null);
  assert.equal(cave.inheritanceExhausted, false);
  assert.equal(visitor.techniques.length, 0);
});

check('满槽或重复不虚报得书；首位可学者取得后他人不能再取', () => {
  const world = worldOf(), cave = spawnCave(world, rng(0.5));
  assert(MANUALS.some((item) => item.name === cave.inheritanceManual));
  const full = actor(5, MANUALS.slice(0, 3));
  const repeat = actor(6, [MANUALS.find((item) => item.name === cave.inheritanceManual)]);
  const fullResult = enterSite(world, full, cave, rng(0, 0.5));
  const repeatResult = enterSite(world, repeat, cave, rng(0, 0.5));
  assert.match(fullResult.gain, /功法已满，未能取走/);
  assert.match(repeatResult.gain, /已习此法，未能取走/);
  assert.equal(cave.inheritanceExhausted, false);
  assert.equal(cave.inheritanceClaimedBy, null);
  assert(!world.chronicle.some((row) => row.text.includes('取走前人传承')));
  const winner = actor(7), late = actor(8);
  enterSite(world, winner, cave, rng(0, 0.5));
  const lateResult = enterSite(world, late, cave, rng(0, 0.5));
  assert.match(lateResult.gain, /传承已被取走/);
  assert.equal(cave.inheritanceClaimedBy, winner.id);
  assert.equal(cave.inheritanceExhausted, true);
  assert.equal(winner.techniques[0].name, cave.inheritanceManual);
  assert.equal(late.techniques.length, 0);
  assert.equal(cave.reward, '传承已被取走');
  assert.equal(world.chronicle.filter((row) => row.text.includes('取走前人传承')).length, 1);
  assert(!world.chronicle.some((row) => /修士5|修士6|修士8/.test(row.text) && row.text.includes('取走前人传承')));
  assert(!world.chronicle.some((row) => /修士5|修士6|修士8/.test(row.text) && /得《[^》]+》/.test(row.text)));
});

check('旧档缺新字段保留通用抽签且存读不会刷出第二本；新洞府状态完整往返', () => {
  const world = worldOf();
  const cave = spawnCave(world, rng(0.5));
  const winner = actor(9);
  world.entities.push(winner);
  enterSite(world, winner, cave, rng(0, 0.5));
  const loaded = deserializeWorld(serializeWorld(world));
  const restored = loaded.siteById(cave.id);
  assert.equal(restored.inheritanceManual, cave.inheritanceManual);
  assert.equal(restored.inheritanceClaimedBy, winner.id);
  assert.equal(restored.inheritanceExhausted, true);
  assert.equal(restored.reward, '传承已被取走');
  assert(loaded.chronicle.some((row) => row.text.includes('取走前人传承') && row.x === cave.x && row.y === cave.y));
  assert(loaded.entities.find((entity) => entity.id === winner.id).log
    .some((row) => row.text.includes('取走前人传承') && row.x === cave.x && row.plane === 'mortal'));
  const late = actor(10);
  enterSite(loaded, late, restored, rng(0, 0.5));
  assert.equal(late.techniques.length, 0);

  const oldWorld = worldOf();
  oldWorld.addSite({ kind: 'cave', x: 20, y: 20, name: '旧洞府', reward: '感悟', age: 0, visits: 0 });
  const oldLoaded = deserializeWorld(serializeWorld(oldWorld));
  const oldSite = oldLoaded.sites[0], oldVisitor = actor(11);
  assert.equal(Object.hasOwn(oldSite, 'inheritanceManual'), false);
  enterSite(oldLoaded, oldVisitor, oldSite, rng(0, 0.5, 0, 0));
  assert.equal(oldVisitor.techniques.length, 1);
  assert.equal(Object.hasOwn(oldSite, 'inheritanceManual'), false);
  const oldSecret = oldWorld.addSite({ kind: 'secret', sub: 'alchemy', x: 22, y: 22,
    name: '旧丹阁', reward: '丹道真解', age: 0, visits: 0 });
  const legacyVisitor = actor(13);
  legacyVisitor.hp = 50;
  enterSite(oldWorld, legacyVisitor, oldSecret, rng(0, 0.5, 0.9));
  assert.equal(legacyVisitor.hp, 50, 'old secret without rewardMode uses generic outcome');
});

check('秘境两访闭合及地点自然寿命继续生效', () => {
  const world = worldOf(), site = spawnSecretRealm(world, rng(0.5));
  const visitor = actor(12);
  visitor.x = site.x; visitor.y = site.y;
  world.entities.push(visitor);
  stepSites(world, 360, rng(0));
  assert.equal(site.visits, 1);
  stepSites(world, 360, rng(0));
  assert.equal(world.sites.includes(site), false);
  assert(world.chronicle.some((row) => row.text.includes('闭合') && row.x === site.x));
  const cave = spawnCave(world, rng(0.5));
  world.entities.length = 0;
  stepSites(world, SITE_LIFESPAN_YEARS.cave * 360 + 1, rng(0.99));
  assert.equal(world.sites.includes(cave), false);
});

check('工具反馈真实落点坐标与主题；锁区不落点，自然生成不全局过滤', () => {
  const world = worldOf();
  world.mapProgress = { stage: 0 };
  assert.equal(placeSecret(world, 27, 20, rng(0.99), 'sword'), '此处落不下秘境');
  assert.equal(world.sites.length, 0);
  const natural = spawnSecretRealm(world, rng(0.99, 0.5), { x: 27, y: 20, radius: 3 }, 'sword');
  assert(natural && !canAccess(world, natural.x, natural.y));

  const placedWorld = worldOf();
  placedWorld.mapProgress = { stage: 0 };
  const text = placeSecret(placedWorld, 20, 20, rng(0.5), 'alchemy');
  const placed = placedWorld.sites[0];
  assert.match(text, new RegExp(`丹阁.*\\(${placed.x}, ${placed.y}\\)`));
  assert.equal(placed.sub, 'alchemy');
  assert(canAccess(placedWorld, placed.x, placed.y));
  const caveWorld = worldOf();
  const caveText = placeCave(caveWorld, 20, 20, rng(0.5));
  assert(caveText.includes(`(${caveWorld.sites[0].x}, ${caveWorld.sites[0].y})`));
  assert(plantSite(worldOf(), rng(0.5), 'secret', 20, 20, 'sword').sub === 'sword');
  const upper = worldOf();
  upper.plane = 'upper';
  const upperSite = spawnSecretRealm(upper, rng(0.5));
  enterSite(upper, actor(14), upperSite, rng(0, 0.5, 0.9));
  assert(upper.chronicle.some((row) => row.text.includes('修士14') && row.plane === 'upper'));
});

report.pass = true;
const directory = path.resolve('reports/g25');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'sites.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`G2.5 布缘天地：${report.checks.length} 项通过`);
