// Finite CPU comparison, separate from GPU and long-run demographic claims.
// Extract E0 src/ and package.json into --baseline=<directory> before running.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const arg = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const out = arg('out', 'reports/local/c1/cpu');
fs.mkdirSync(out, { recursive: true });
async function modules(root) {
  const load = file => import(pathToFileURL(path.resolve(root, 'src/inkbox', file)).href);
  const [config, gen, upper, nether, life, upperLife, advance, noise, save] = await Promise.all([
    load('core/config.js'), load('world/worldgen.js'), load('world/worldgenUpper.js'), load('world/worldgenNether.js'),
    load('sim/life.js'), load('sim/upperLife.js'), load('sim/advance.js'), load('core/noise.js'), load('io/save.js'),
  ]);
  return { ...config, ...gen, ...upper, ...nether, ...life, ...upperLife, ...advance, ...noise, ...save };
}
const candidate = await modules('.');
const baseline = await modules(arg('baseline', 'reports/local/c1/e0-cpu-baseline'));
const seed = 61001;
const world = candidate.generateWorld({ preset: candidate.WORLD_PRESETS.expanse, seed, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
world.upper = candidate.generateUpperWorld({ preset: candidate.WORLD_PRESETS.expanse, seed });
world.nether = candidate.generateNetherWorld({ preset: candidate.WORLD_PRESETS.expanse, seed });
const initialLife = new candidate.Life(world, candidate.mulberry32(seed ^ 0xa5a5a5a5));
const initialUpper = new candidate.UpperLife(world.upper), initialState = candidate.createAdvanceState();
for (let day = 0; day < 30 * 360; day += 3) candidate.advanceWorld(world, 3, { life: initialLife, upperLife: initialUpper, state: initialState });
const snapshot = candidate.serializeWorld(world);
const report = { seed, dimensions: [world.w, world.h], initialYear: world.year, initialEntities: world.entities.length,
  methodology: 'Identical C1 year-30 serialized world loaded independently by E0/C1; warm 120 days, measure 720 days in three-day ticks. Three alternating pairs. Full official clocks; CPU only, no rendering. Divergent subsequent rules are not a demographic A/B.',
  node: process.version, samples: [] };
const quantile = (values, p) => [...values].sort((a,b) => a-b)[Math.floor((values.length-1)*p)];
for (let round = 0; round < 3; round += 1) {
  for (const label of round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
    const mod = label === 'baseline' ? baseline : candidate;
    const w = mod.deserializeWorld(structuredClone(snapshot));
    const life = new mod.Life(w, mod.mulberry32(seed ^ 0xa5a5a5a5));
    const upperLife = new mod.UpperLife(w.upper), state = mod.createAdvanceState();
    for (let i=0;i<40;i++) mod.advanceWorld(w,3,{life,upperLife,state});
    const durations=[];
    for (let i=0;i<240;i++) {
      const start=performance.now();mod.advanceWorld(w,3,{life,upperLife,state});durations.push(performance.now()-start);
    }
    const sample={round,label,steps:durations.length,totalMs:durations.reduce((a,b)=>a+b,0),
      meanStepMs:durations.reduce((a,b)=>a+b,0)/durations.length,p95StepMs:quantile(durations,.95),
      entities:w.entities.length,villages:w.villages.length,sects:w.factions.length};
    report.samples.push(sample);console.log(JSON.stringify(sample));
    assert.ok(w.entities.length<=mod.LIMITS.maxEntities);
  }
}
report.medianMeanRatio = quantile(report.samples.filter(s=>s.label==='candidate').map(s=>s.meanStepMs),.5)
  / quantile(report.samples.filter(s=>s.label==='baseline').map(s=>s.meanStepMs),.5);
fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({medianMeanRatio:report.medianMeanRatio,out}));
