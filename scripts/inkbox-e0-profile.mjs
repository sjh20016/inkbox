#!/usr/bin/env node
// Diagnostic only. Formal clocks, natural generation, no population supplementation.
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { SOUL_CAP, reincarnationStats } from '../src/inkbox/sim/reincarnation.js';
import { necrologyStats, DEAD_CAP } from '../src/inkbox/sim/necrology.js';
import { netherEcoStats, netherGhostStats } from '../src/inkbox/sim/netherLife.js';
import { openRifts, riftStats } from '../src/inkbox/sim/rifts.js';
import { SECT_HISTORY_CAP } from '../src/inkbox/sim/sects.js';
import { MILESTONE_CAP } from '../src/inkbox/world/World.js';
import { LOG_CAP } from '../src/inkbox/sim/biography.js';
import { LOCAL_HISTORY_LIMIT, SETTLEMENT_RUINS_LIMIT } from '../src/inkbox/sim/settlementResilience.js';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const years = Number(arg('years', 300));
const stressYears = Number(arg('stress-years', 100));
const seeds = arg('seeds', '61001,61002,61003').split(',').map(Number);
const out = arg('out', 'reports/local/e0/profile');
mkdirSync(out, { recursive: true });
const report = { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), startedAt: new Date().toISOString(),
  methodology: [
    'Natural: v2/standard small, scatter=true, no added population, no forced crisis/resources; official advanceWorld 3-day steps.',
    'Stress: same natural population; upper/nether windows open first 5 years of each 20-year cycle (25% duty), formal openRifts; no added population.',
    'Diagnostic wrappers call original instance functions/array methods unchanged, no RNG calls; elapsed includes observer and serialization cost, not production performance.',
    'Mortal births: successful Life.spawn with opts.allowSouls===true (formal village birth path, parents may be null), separate initial/tool/animal creation. Mortal deaths: formal necrology total minus ascended. Awaken: record(kind=awaken) events; upper awakening has no formal event and is not retained.',
    'Soul push counts real accepted insertions before cap; splice at length > SOUL_CAP is cap eviction, dueDay <= day is due extraction; remaining removals unclassified. Route log is a route census, NOT pool entries.',
    'Village split/abandon wrappers count formal method success. Individual migration observed at 3-day boundaries is a lower bound; transient moves may be missed.',
    'Sect identity sampled each 3-day step; same-step create/dissolve may be missed. Resource net is endpoint stock change per surviving sect, not gross income/expense.',
    'Bounded histories are retained rows only; missing older details are not retained, never inferred as zero.'
  ], runs: [] };
function wrap(object, key, handler) {
  const original = object[key];
  Object.defineProperty(object, key, { configurable: true, writable: true, enumerable: false,
    value: function (...args) { return handler.call(this, original, args); } });
}
function run(seed, mode, duration) {
  const started = performance.now();
  const world = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
  world.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed });
  world.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed });
  const life = new Life(world, mulberry32(seed ^ 0xa5a5a5a5));
  const upperLife = new UpperLife(world.upper), state = createAdvanceState();
  const tally = { births: 0, otherSpawns: 0, awaken: { mortal: 0, upper: 0, nether: 0 }, splits: 0, abandoned: 0,
    observedResidentMigrations: 0, souls: { entered: 0, dueExited: 0, capEvicted: 0, otherExited: 0, reachedCap: 0, max: 0 },
    sectCreated: [], sectRemoved: [], opened: { upper: 0, nether: 0 } };
  for (const [plane, w] of [['mortal', world], ['upper', world.upper], ['nether', world.nether]]) {
    wrap(w, 'record', function (original, args) { if (args[1] === 'awaken') tally.awaken[plane]++; return original.apply(this, args); });
  }
  wrap(life, 'spawn', function (original, args) {
    const n = original.apply(this, args); if (args[5]?.allowSouls === true) tally.births += n; else tally.otherSpawns += n; return n;
  });
  for (const [name, counter] of [['maybeSplitVillage', 'splits'], ['abandonVillage', 'abandoned']]) {
    if (typeof life[name] === 'function') wrap(life, name, function (original, args) {
      const before = world.villages.length, result = original.apply(this, args);
      // abandonVillage archives/clears; its caller removes the array row afterwards.
      tally[counter] += name === 'abandonVillage' ? 1 : Math.max(0, world.villages.length - before); return result;
    });
  }
  wrap(world.souls, 'push', function (original, args) {
    const result = original.apply(this, args); tally.souls.entered += args.length;
    if (this.length >= SOUL_CAP) tally.souls.reachedCap++;
    tally.souls.max = Math.max(tally.souls.max, Math.min(this.length, SOUL_CAP)); return result;
  });
  wrap(world.souls, 'splice', function (original, args) {
    const cap = this.length > SOUL_CAP, result = original.apply(this, args);
    for (const soul of result) { if (cap) tally.souls.capEvicted++; else if (soul.dueDay <= world.day) tally.souls.dueExited++; else tally.souls.otherExited++; }
    return result;
  });
  let prevEntities = new Map(), prevSects = new Map(world.factions.map(s => [s.id, s]));
  const seenSects = new Set(prevSects.keys());
  const initialResources = new Map(world.factions.map(s => [s.id, { ...s.resources }]));
  let prevUpperSects = new Map(world.upper.factions.map(s => [s.id, s]));
  const upperInitialResources = new Map(world.upper.factions.map(s => [s.id, { ...s.resources }]));
  const upperSectLifecycle = { created: [], removed: [] };
  const result = { seed, mode, preset: 'small', generationVersion: 2, terrainPreset: 'standard', years: duration, samples: [] };
  const sample = () => {
    const payload = JSON.stringify(serializeWorld(world));
    const planeStats = w => ({ population: w.entities.filter(e => e.alive !== false && e.hp > 0).length,
      cultivation: w === world.nether ? null : w.cultivationStats(), dead: necrologyStats(w),
      deathsExcludingAscended: w === world.nether ? null : (w.deadLog?.total ?? 0) - (w.deadLog?.ascended ?? 0), popLog: w.popLog ?? null,
      retained: { chronicle: w.chronicle.length, milestones: w.milestones.length, dead: w.dead.length,
        maxLivingLog: Math.max(0, ...w.entities.map(e => e.log?.length ?? 0)), maxDeadLog: Math.max(0, ...w.dead.map(e => e.log?.length ?? 0)) } });
    assert.equal(tally.souls.entered - tally.souls.dueExited - tally.souls.capEvicted - tally.souls.otherExited, world.souls.length, 'observed actual soul flows balance');
    const entry = { year: world.year, day: world.day, elapsedMs: performance.now() - started,
      mortal: planeStats(world), upper: planeStats(world.upper), nether: { ...planeStats(world.nether), ghosts: netherGhostStats(world.nether), ecology: netherEcoStats(world.nether) },
      villages: world.villages.map(v => ({ id: v.id, faction: v.faction, pop: v.pop, hp: v.hp, food: v.food, historyRetained: v.history?.length ?? 0 })),
      ruinsRetained: world.settlementRuins?.length ?? 0,
      sects: world.factions.map(s => ({ id: s.id, name: s.name, foundedDay: s.foundedDay, stability: s.stability, villages: s.villages,
        resources: s.resources, resourceNetSinceFirstObserved: Object.fromEntries(Object.entries(s.resources ?? {}).map(([k, v]) => [k, v - (initialResources.get(s.id)?.[k] ?? 0)])), historyRetained: s.history?.length ?? 0 })),
      upperSects: world.upper.factions.map(s => ({ id: s.id, name: s.name, stability: s.stability ?? null, villages: s.villages ?? [], resources: s.resources,
        resourceNetSinceFirstObserved: Object.fromEntries(Object.entries(s.resources ?? {}).map(([k, v]) => [k, v - (upperInitialResources.get(s.id)?.[k] ?? 0)])), historyRetained: s.history?.length ?? 0 })),
      upperSectLifecycle, netherSects: world.nether.factions,
      soulPool: { waiting: world.souls.length, cap: SOUL_CAP, ...tally.souls, routeCensus: { ...world.soulLog }, reincarnation: reincarnationStats(world),
        estimatedCapEvictionsByConservation: tally.souls.entered - tally.souls.dueExited - tally.souls.otherExited - world.souls.length },
      tally: structuredClone(tally), awakenCoverage: { mortal: 'formal awaken records', upper: 'not retained; tally counts records only', nether: 'not applicable: ghost entries, not awakening' },
      save: { utf8Bytes: Buffer.byteLength(payload, 'utf8'), jsCodeUnits: payload.length },
      capacities: { chronicle: 400, dead: DEAD_CAP, personalLog: LOG_CAP, milestones: MILESTONE_CAP, sectHistory: SECT_HISTORY_CAP, upperSectHistory: 40, localHistory: LOCAL_HISTORY_LIMIT, ruins: SETTLEMENT_RUINS_LIMIT },
      missingHistory: 'Older rows beyond bounded capacities not retained; no full lifetime reconstruction. Upper/nether awaken events not formally retained.' };
    // Snapshot mutable diagnostic fields, retaining exact checkpoint values.
    result.samples.push(structuredClone(entry));
    if ([0, 100, 300].includes(world.year)) writeFileSync(`${out}/${mode}-${seed}-year${world.year}.json`, payload);
    writeFileSync(`${out}/${mode}-${seed}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ seed, mode, year: world.year, population: entry.mortal.population, upper: entry.upper.population, nether: entry.nether.population,
      villages: entry.villages.length, sects: entry.sects.length, souls: entry.soulPool.waiting, bytes: entry.save.utf8Bytes, elapsedMs: Math.round(entry.elapsedMs) }));
  };
  sample();
  for (let year = 1; year <= duration; year++) {
    const viewOpen = mode === 'window-stress' && (year - 1) % 20 < 5;
    if (viewOpen && (year - 1) % 20 === 0) for (const target of ['upper', 'nether']) {
      const r = openRifts(world, { x0: 15, y0: 15, x1: world.w - 15, y1: world.h - 15 }, target);
      tally.opened[target] += r.opened;
    }
    for (let day = 0; day < 360; day += 3) {
      advanceWorld(world, 3, { life, upperLife, state, riftActive: viewOpen });
      const current = new Map();
      for (const e of world.entities) {
        const previous = prevEntities.get(e.id);
        if (previous != null && e.village !== previous && previous) tally.observedResidentMigrations++;
        current.set(e.id, e.village);
      }
      prevEntities = current;
      const nextSects = new Map(world.factions.map(s => [s.id, s]));
      for (const s of world.factions) if (!seenSects.has(s.id)) {
        seenSects.add(s.id); initialResources.set(s.id, { ...s.resources }); tally.sectCreated.push({ id: s.id, day: world.day, name: s.name });
      }
      for (const [id, s] of prevSects) if (!nextSects.has(id)) tally.sectRemoved.push({ id, day: world.day, name: s.name, destroyReason: s.destroyReason ?? null, resourcesAtLastObservation: { ...s.resources } });
      prevSects = nextSects;
      const nextUpperSects = new Map(world.upper.factions.map(s => [s.id, s]));
      for (const [id, s] of nextUpperSects) if (!upperInitialResources.has(id)) {
        upperInitialResources.set(id, { ...s.resources }); upperSectLifecycle.created.push({ id, day: world.day });
      }
      for (const [id] of prevUpperSects) if (!nextUpperSects.has(id)) upperSectLifecycle.removed.push({ id, day: world.day });
      prevUpperSects = nextUpperSects;
    }
    if ([30, 100, 200, 300, duration].includes(year)) sample();
  }
  return result;
}
if (!process.argv.includes('--run')) {
  console.log('Prepared only. Use --run after stage A approval; defaults: 3 natural seeds × 300 years + 1 window-stress × 100 years.');
} else {
  for (const seed of seeds) { report.runs.push(run(seed, 'natural', years)); writeFileSync(`${out}/profile.json`, JSON.stringify(report, null, 2)); }
  if (stressYears > 0) { report.runs.push(run(seeds[0], 'window-stress', stressYears)); writeFileSync(`${out}/profile.json`, JSON.stringify(report, null, 2)); }
}
