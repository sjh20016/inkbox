#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP, WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'inkbox.html'), 'utf8');
const htmlVersion = html.match(/<html[^>]*data-app-version="([^"]+)"/)?.[1];

if (packageJson.version !== APP.version || htmlVersion !== APP.version) {
  throw new Error(`版本身份不一致：package=${packageJson.version} / APP=${APP.version} / HTML=${htmlVersion}`);
}

const world = generateWorld({ preset: WORLD_PRESETS.small, seed: 20260924, scatter: false });
const life = new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5));
const advanced = advanceWorld(world, 30, {
  life,
  state: createAdvanceState(),
  riftActive: false,
  nether: false,
});

if (!advanced || world.day !== 30 || world.year !== 0 || !world.worldEventState) {
  throw new Error('Inkbox 最小世界无法推进 30 日或未初始化可存档的 WorldEvents 状态');
}

console.log(`Inkbox core OK · v${APP.version} · ${world.w}×${world.h} · 推进 ${world.day} 日 · WorldEvents 已挂接`);
