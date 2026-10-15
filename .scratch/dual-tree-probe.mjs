// B2 · 双树等价探针（CP1 用，不属于产品代码）
// 在「纯基线树」与「插桩树」各跑一次，比较 digest 是否逐字节相同。
// 语义与 scripts/experiment/world-factory.mjs + runner.mjs 的自然 profile 对齐：
//   v2 / standard / medium / scatter:true / 无 mapProgress / ecoRng=mulberry32(12345)
//   advanceWorld(chunk=3 日) + riftActive:false（natural 视界恒闭）
import { createHash } from 'node:crypto';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld, recomputeUpperQi } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { createMapProgress } from '../src/inkbox/world/mapProgress.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { createAdvanceState, advanceWorld } from '../src/inkbox/sim/advance.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { readTelemetry } from '../src/inkbox/sim/telemetry.js';

const seed = Number(process.argv[2] || 20260914);
const years = Number(process.argv[3] || 1);
const preset = WORLD_PRESETS.medium;
const world = generateWorld({ preset, seed, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
createMapProgress(world, false);
const lifeRng = mulberry32(world.seed ^ 0xa5a5a5a5);
const life = new Life(world, lifeRng);
const upper = generateUpperWorld({ preset, seed });
recomputeUpperQi(upper);
world.upper = upper;
const upperLife = new UpperLife(upper);
const nether = generateNetherWorld({ preset, seed });
world.nether = nether;
const advanceState = createAdvanceState();
const ecoRng = mulberry32(12345);
const stepDays = 3;
for (let y = 1; y <= years; y += 1) {
  for (let d = 0; d < 360; d += stepDays) {
    const chunk = Math.min(stepDays, 360 - d);
    advanceWorld(world, chunk, {
      life, upperLife, rng: ecoRng, state: advanceState, riftActive: false,
    });
  }
}
const tel = (typeof readTelemetry === 'function') ? readTelemetry(world) : null;
const payload = JSON.stringify(serializeWorld(world));
const digest = createHash('sha256').update(payload, 'utf8').digest('hex');
console.log(JSON.stringify({ seed, years, digest, day: world.day, bytes: Buffer.byteLength(payload, 'utf8'), telemetry: tel }));
