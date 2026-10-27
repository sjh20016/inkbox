#!/usr/bin/env node
// G8 · 上界法宝经裂隙落入凡间时必须重赋凡间 id（与其余三个跨界方向对称）。
//
// 800 年长测在凡间人口恢复后首次暴露：上界 `forgeArtifact` 用 `upper.nextArtifactId`
// 从 1 起编号，`leakUpperArtifact` 原样把这件法宝推进 `world.artifacts`，于是凡间
// 出现两件同 id 的法宝（长测「法宝归属两份记录互相吻合」变红；按 id 拾取会拿错件）。
import assert from 'node:assert/strict';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { openRifts, stepRifts, RIFT_PERIOD_DAYS } from '../src/inkbox/sim/rifts.js';

const preset = WORLD_PRESETS.small, seed = 8088;
const world = generateWorld({ preset, seed, scatter: false });
world.upper = generateUpperWorld({ preset, seed });
const r = openRifts(world, { x0: 80, y0: 50, x1: 119, y1: 79 });
assert(r.opened >= 1, 'fixture opens one upper rift');
const rift = world.rifts[0];
const art = (id, x, y, extra = {}) => ({ id, name: `器${id}`, ownerId: 0, ownerName: null, lostDay: 0, x, y,
  grade: 1, power: 1, history: [], spirit: null, ...extra });
// 凡间已有 id 1..6 的地上法宝；上界在缝口放同号的无主法宝。
for (let id = 1; id <= 6; id += 1) world.artifacts.push(art(id, 5 + id, 5));
world.nextArtifactId = 7;
for (let id = 1; id <= 6; id += 1) world.upper.artifacts.push(art(id, rift.x, rift.y));
world.upper.nextArtifactId = 7;

const before = world.artifactLog?.riftIn || 0;
for (let k = 0; k < 4000 && (world.artifactLog?.riftIn || 0) === before; k += 1) {
  world.day += RIFT_PERIOD_DAYS; world.upper.day = world.day; stepRifts(world);
  if (!world.rifts.length) break;
}
const leaked = (world.artifactLog?.riftIn || 0) - before;
assert(leaked >= 1, 'fixture really leaks at least one upper artifact (mechanism exercised)');
const ids = world.artifacts.map(a => a.id);
assert.equal(new Set(ids).size, ids.length, `mortal ground artifact ids are unique: ${ids.join(',')}`);
for (const a of world.artifacts.slice(6)) {
  assert(a.id >= 7, 'leaked artifact takes a fresh mortal id');
  assert(!a.ownerId, 'leaked artifact stays unowned');
}
assert(world.nextArtifactId >= 7 + leaked, 'mortal id counter advanced past the leaked artifacts');
console.log(`G8 rift artifact ids: ${leaked} upper→mortal leak(s), ids unique · passed`);
