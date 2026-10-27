#!/usr/bin/env node
// G8-B · 凡间生息：进食不再永久削减植被（S0 静态草木契约），分村落点不被耗尽。
//
// 根因（见 docs/development/G8_DELIVERY.md）：S0 移除了推进路径上的连续
// `stepVegetation` 再生，但 `Life.stepEntity` 的「进食减 veg」仍在，于是植被只减
// 不增 → 肥力 ≥ 0.34 的分村落点在数十年内耗尽 → 村落只灭不生 → 人口长期萎缩。
// 本测试只验证机制契约，长程人口证据由 nightly `inkbox:longrun` 与
// `scripts/inkbox-g8-demography-probe.mjs` 提供。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rngStream } from '../src/inkbox/core/noise.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { WORLD_PRESETS, TIME } from '../src/inkbox/core/config.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { isHumanPerson } from '../src/inkbox/core/demographics.js';

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`  ✓ ${name}`); };

const YEARS = 12, STEP = 3, SEED = 20260914;
const world = generateWorld({ preset: WORLD_PRESETS.small, seed: SEED, scatter: true });
world.wanling = { ...(world.wanling || {}), enabled: false }; // 隔离 W0.1 兽群啃食（其自有契约见 W0.1）
const life = new Life(world, rngStream(world.seed ^ 0xa5a5a5a5));
const spawnRng = rngStream(4242);
for (let g = 0; g < 4; g += 1) {
  const x = 20 + Math.floor(spawnRng() * (world.w - 40)), y = 20 + Math.floor(spawnRng() * (world.h - 40));
  world.pendingSpawns.push({ x, y, species: 'human', count: 14 });
}
const fertileLand = () => {
  let n = 0;
  for (let i = 0; i < world.size; i += 1) if (world.isWalkable(i) && world.fertility(i) >= 0.34) n += 1;
  return n;
};
const adv = createAdvanceState();
advanceWorld(world, STEP, { life, state: adv, nether: false, wraith: false });
const veg0 = Float32Array.from(world.veg), fertile0 = fertileLand();
let fedSteps = 0;
const origStep = Life.prototype.stepEntity;
Life.prototype.stepEntity = function (e, ...rest) {
  if (isHumanPerson(e) && world.fertility(this.tileAt(e.x, e.y)) > 0.2) fedSteps += 1;
  return origStep.call(this, e, ...rest);
};
for (let d = 0; d < YEARS * TIME.daysPerYear; d += STEP) advanceWorld(world, STEP, { life, state: adv, nether: false, wraith: false });
Life.prototype.stepEntity = origStep;

check('凡人确实在肥地上进食过（负对照：机制被触发）', () => {
  assert(fedSteps > 10000, `fed steps ${fedSteps}`);
  assert(world.entities.filter(isHumanPerson).length > 0);
});
check('进食不改写植被：无落笔、无到期事件时 veg 逐格不变', () => {
  let changed = 0;
  for (let i = 0; i < world.size; i += 1) if (world.veg[i] !== veg0[i]) changed += 1;
  assert.equal(changed, 0, `${changed} cells changed`);
});
check('分村落点（肥力 ≥ 0.34 的可行地）不被进食耗尽', () => {
  assert.equal(fertileLand(), fertile0);
  assert(fertile0 > world.size * 0.05, `fertile ${fertile0}`);
});
check('源码不再出现进食写 veg 的单向漏斗', () => {
  const src = readFileSync(new URL('../src/inkbox/sim/life.js', import.meta.url), 'utf8');
  assert(!/world\.veg\[here\]\s*=/.test(src), 'Life must not write world.veg at the feeding site');
});
console.log(`G8 demography contract: ${checks} checks passed`);
