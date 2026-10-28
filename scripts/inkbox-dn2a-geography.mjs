import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { generateNetherStrataCandidate, getNetherStrataMetadata, NETHER_STRATA_VERSION } from '../src/inkbox/world/netherStrataCandidate.js';

const fields = ['height', 'water', 'veg', 'type', 'temp', 'moist', 'riverBase', 'qi'];
function digest(world) {
  const hash = createHash('sha256');
  for (const key of fields) hash.update(Buffer.from(world[key].buffer));
  return hash.digest('hex');
}
function components(world, wet) {
  const seen = new Uint8Array(world.size), sizes = [];
  for (let i = 0; i < world.size; i++) {
    if (seen[i] || (world.water[i] > 0.0015) !== wet) continue;
    const queue = [i]; seen[i] = 1;
    for (let q = 0; q < queue.length; q++) {
      const v = queue[q], x = v % world.w, y = (v / world.w) | 0;
      for (const n of [x > 0 ? v - 1 : -1, x + 1 < world.w ? v + 1 : -1,
        y > 0 ? v - world.w : -1, y + 1 < world.h ? v + world.w : -1]) {
        if (n >= 0 && !seen[n] && (world.water[n] > 0.0015) === wet) { seen[n] = 1; queue.push(n); }
      }
    }
    sizes.push(queue.length);
  }
  return sizes.sort((a, b) => b - a);
}
function coarseHeights(world) {
  const out = [];
  for (let by = 0; by < 6; by++) for (let bx = 0; bx < 9; bx++) {
    const x0 = Math.floor(bx * world.w / 9), x1 = Math.floor((bx + 1) * world.w / 9);
    const y0 = Math.floor(by * world.h / 6), y1 = Math.floor((by + 1) * world.h / 6);
    let sum = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += world.height[y * world.w + x];
    out.push(sum / ((x1 - x0) * (y1 - y0)));
  }
  return out;
}
const families = new Set(), signatures = new Set(), macro = new Map();
for (const name of ['small', 'medium', 'large', 'expanse']) for (const seed of [0, 1, 42, 20260914, -2147483648, 2147483647, 0xffffffff]) {
  const preset = WORLD_PRESETS[name];
  const before = digest(generateNetherWorld({ preset, seed }));
  const a = generateNetherStrataCandidate({ preset, seed });
  const b = generateNetherStrataCandidate({ preset, seed });
  assert.equal(digest(a), digest(b), `deterministic ${name}/${seed}`);
  assert.equal(before, digest(generateNetherWorld({ preset, seed })), 'legacy remains unchanged');
  const info = getNetherStrataMetadata(a);
  assert.equal(info.version, NETHER_STRATA_VERSION);
  assert.equal(info.landmarks.length, 3);
  families.add(info.family);
  for (const field of fields) assert.equal(a[field].length, a.size);
  let high = 0, middle = 0, bottom = 0;
  for (const value of a.height) {
    assert.ok(Number.isFinite(value) && value >= 0.059 && value <= 1.241, 'bounded height');
    if (value > 0.95) high++;
    else if (value >= 0.65 && value <= 0.85) middle++;
    else if (value >= 0.33 && value < 0.42) bottom++;
  }
  assert.ok(high > a.size * 0.015 && middle > a.size * 0.01 && bottom > a.size * 0.08, 'three readable elevation tiers');
  const cliff = info.landmarks.find(p => p.kind === 'cliff');
  assert.ok(a.height[cliff.y * a.w + cliff.x] > 0.85, 'cliff landmark stands on the upper rim');
  const cliffLow = Math.min(a.height[cliff.y * a.w + cliff.x - 3], a.height[cliff.y * a.w + cliff.x + 3],
    a.height[(cliff.y - 3) * a.w + cliff.x], a.height[(cliff.y + 3) * a.w + cliff.x]);
  assert.ok(a.height[cliff.y * a.w + cliff.x] - cliffLow > 0.35, 'major scarp drops within three cells');
  const abyss = info.landmarks.find(p => p.kind === 'abyss');
  let abyssFloor = 2, abyssRim = 0;
  for (let y = Math.max(0, abyss.y - 16); y <= Math.min(a.h - 1, abyss.y + 16); y++)
    for (let x = Math.max(0, abyss.x - 16); x <= Math.min(a.w - 1, abyss.x + 16); x++) {
      abyssFloor = Math.min(abyssFloor, a.height[y * a.w + x]);
      abyssRim = Math.max(abyssRim, a.height[y * a.w + x]);
    }
  assert.ok(abyssFloor < 0.20 && abyssRim > 0.85, 'abyss cuts into upper ground');
  const wetParts = components(a, true), landParts = components(a, false);
  assert.equal(wetParts.length, 1, `connected Huangquan ${name}/${seed}`);
  assert.ok(landParts.slice(2).reduce((sum, n) => sum + n, 0) < a.size * 0.01, 'land fragments');
  if (name === 'medium') { signatures.add(digest(a)); macro.set(seed, coarseHeights(a)); }
  console.log(name, seed, info.family, 'height', Math.min(...a.height.slice(0, 100)).toFixed(3), 'river', wetParts[0]);
}
assert.ok(families.size >= 3, 'three macro families');
assert.ok(signatures.size >= 5, 'distinct seed signatures');
for (const [aSeed, bSeed] of [[1, 42], [1, 20260914], [42, 20260914]]) {
  const a = macro.get(aSeed), b = macro.get(bSeed);
  const rms = Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0) / a.length);
  assert.ok(rms > 0.04, `macro difference ${aSeed}/${bSeed}: ${rms.toFixed(3)}`);
}
const originalRandom = Math.random;
try {
  Math.random = () => { throw new Error('runtime random used by candidate'); };
  assert.equal(digest(generateNetherStrataCandidate({ preset: WORLD_PRESETS.small, seed: 42 })),
    digest(generateNetherStrataCandidate({ preset: WORLD_PRESETS.small, seed: 42 })));
} finally { Math.random = originalRandom; }
console.log('D-N2A geography: pass');
