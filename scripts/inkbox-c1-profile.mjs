#!/usr/bin/env node
// C1 diagnostic profile. It runs only with --run; normal invocation prepares the
// profile without advancing a world. All game time goes through advanceWorld.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { WORLD_PRESETS, LIMITS, SPECIES, SPECIES_INFO, TERRAIN, TIME } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life, POP_SOFT_CAP } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { isAdult, isHumanPerson, isMortalHuman, isPracticingHuman } from '../src/inkbox/core/demographics.js';
import { diedOfOldAge } from '../src/inkbox/sim/reincarnation.js';
import { villageSocieties, sectSupplyStatus } from '../src/inkbox/sim/sectEconomy.js';
import { natureState } from '../src/inkbox/sim/nature.js';
import { foundSect } from '../src/inkbox/sim/sects.js';
import { placeLeyline } from '../src/inkbox/sim/divine.js';
import { History, flood, removeWater } from '../src/inkbox/sim/powers.js';
import { World } from '../src/inkbox/world/World.js';
import { OVER } from '../src/inkbox/world/terrain.js';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const YEAR_DAYS = TIME.daysPerYear;
const SEEDS = arg('seeds', '61001,61002,61003').split(',').map(Number);
const OUT = arg('out', 'reports/local/c1/profile');
const NATURAL_YEARS = Number(arg('years', 300));
const CHECKPOINTS = new Set([0, 30, 100, 200, 300]);
mkdirSync(OUT, { recursive: true });

function wrap(object, key, handler) {
  const original = object[key];
  assert.equal(typeof original, 'function', `expected ${key} hook`);
  Object.defineProperty(object, key, { configurable: true, writable: true, enumerable: false,
    value: function (...args) { return handler.call(this, original, args); } });
}

function emptyHumanTally() {
  return { deaths: 0, ageDays: 0, naturalDeaths: 0, naturalAgeDays: 0,
    causes: {}, warDeaths: 0, combatDeaths: 0,
    mortal: { deaths: 0, ageDays: 0, naturalDeaths: 0, naturalAgeDays: 0, causes: {} } };
}

function collectDeath(tally, entity, world) {
  if (!isHumanPerson(entity)) return;
  const natural = diedOfOldAge(entity);
  const cause = natural ? '寿终' : entity.diedOf === 'war' ? '战殁'
    : entity.killedBy ? '战斗殁' : entity.diedOf || '其他殁';
  tally.deaths += 1;
  tally.ageDays += Math.max(0, Number(entity.age) || 0);
  tally.causes[cause] = (tally.causes[cause] || 0) + 1;
  if (natural) {
    tally.naturalDeaths += 1;
    tally.naturalAgeDays += Math.max(0, Number(entity.age) || 0);
  }
  if (isMortalHuman(entity)) {
    tally.mortal.deaths += 1;
    tally.mortal.ageDays += Math.max(0, Number(entity.age) || 0);
    tally.mortal.causes[cause] = (tally.mortal.causes[cause] || 0) + 1;
    if (natural) {
      tally.mortal.naturalDeaths += 1;
      tally.mortal.naturalAgeDays += Math.max(0, Number(entity.age) || 0);
    }
  }
  if (entity.diedOf === 'war') tally.warDeaths += 1;
  if (entity.killedBy) tally.combatDeaths += 1;
  if (entity._c1PeaceCohort) {
    tally.peaceCohortDeaths ||= { n: 0, ageDays: 0, causes: {} };
    tally.peaceCohortDeaths.n += 1;
    tally.peaceCohortDeaths.ageDays += Math.max(0, Number(entity.age) || 0);
    tally.peaceCohortDeaths.causes[cause] = (tally.peaceCohortDeaths.causes[cause] || 0) + 1;
  }
}

function addCounters(target, source, keys) {
  for (const key of keys) target[key] += Number(source?.[key]) || 0;
}

function makeObservers(world, life) {
  const tally = {
    births: { village: 0, genesis: 0, placed: 0, fixture: 0, other: 0 },
    awaken: 0, deaths: emptyHumanTally(), warCasualtiesAtStart: Number(world.warLog?.casualties) || 0,
    maxEntities: world.entities.length, maxVillages: world.villages.length,
  };
  const deadIds = new Set();
  const sectRefs = new Map();
  const villageRefs = new Map();
  const sectTotals = { supplied: 0, foodTransferred: 0, consumed: 0, unmet: 0, recruited: 0 };
  const aidTotals = { provisions: 0, spiritStone: 0 };
  let lastSectSnapshot = new Map();
  let lastAidSnapshot = new Map();

  for (const plane of [world, world.upper, world.nether].filter(Boolean)) {
    wrap(plane, 'record', function (original, args) {
      if (plane === world && args[1] === 'awaken') tally.awaken += 1;
      return original.apply(this, args);
    });
  }
  wrap(life, 'spawn', function (original, args) {
    const before = world.entities.length;
    const created = original.apply(this, args);
    for (let i = before; i < world.entities.length; i += 1) {
      if (!isHumanPerson(world.entities[i])) continue;
      const origin = world.entities[i].birthOrigin?.kind || 'other';
      tally.births[Object.hasOwn(tally.births, origin) ? origin : 'other'] += 1;
    }
    return created;
  });
  wrap(life, 'onDeath', function (original, args) {
    const entity = args[0];
    if (entity && !deadIds.has(entity.id)) {
      deadIds.add(entity.id);
      collectDeath(tally.deaths, entity, world);
    }
    return original.apply(this, args);
  });

  function observeLedger() {
    for (const sect of world.factions) sectRefs.set(sect.id, sect);
    for (const village of world.villages) villageRefs.set(village.id, village);
    const sectValues = new Map();
    for (const [id, sect] of sectRefs) {
      const e = sect.economy || {};
      sectValues.set(id, Object.fromEntries(['supplied', 'foodTransferred', 'consumed', 'unmet', 'recruited']
        .map((key) => [key, Number(e[key]) || 0])));
    }
    const aidValues = new Map();
    for (const [id, village] of villageRefs) aidValues.set(id, {
      provisions: Number(village.aidSpentProvisions) || 0,
      spiritStone: Number(village.aidSpentSpiritStone) || 0,
    });
    // Counters are cumulative and monotone. Difference sampling preserves totals
    // across sect/village removal without relying on capped histories.
    for (const [id, now] of sectValues) {
      const old = lastSectSnapshot.get(id) || {};
      for (const key of Object.keys(sectTotals)) sectTotals[key] += Math.max(0, now[key] - (old[key] || 0));
    }
    for (const [id, now] of aidValues) {
      const old = lastAidSnapshot.get(id) || {};
      for (const key of Object.keys(aidTotals)) aidTotals[key] += Math.max(0, now[key] - (old[key] || 0));
    }
    lastSectSnapshot = sectValues;
    lastAidSnapshot = aidValues;
    tally.maxEntities = Math.max(tally.maxEntities, world.entities.length);
    tally.maxVillages = Math.max(tally.maxVillages, world.villages.length);
  }
  observeLedger();
  return { tally, observeLedger, sectRefs, villageRefs, sectTotals, aidTotals };
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

function profilePopulation(world) {
  const alive = world.entities.filter((e) => e.hp > 0 && !e._ascended && e.age < e.lifespan);
  const humans = alive.filter(isHumanPerson);
  const mortals = humans.filter(isMortalHuman);
  const adults = mortals.filter(isAdult);
  const cultivators = humans.filter(isPracticingHuman);
  const villageCounts = villageSocieties(world);
  return {
    entities: alive.length,
    humans: humans.length,
    mortals: mortals.length,
    mortalAdultsAndLaborEligible: adults.length,
    practicingCultivators: cultivators.length,
    meanMortalAgeYears: mean(mortals.map((e) => e.age / YEAR_DAYS)),
    villages: world.villages.length,
    villageResidents: [...villageCounts.values()].reduce((sum, item) => sum + item.humans, 0),
    villageMortals: [...villageCounts.values()].reduce((sum, item) => sum + item.mortals, 0),
    villageAdults: [...villageCounts.values()].reduce((sum, item) => sum + item.mortalAdults, 0),
    villageFood: world.villages.reduce((sum, village) => sum + (Number(village.food) || 0), 0),
    villageFoodAverage: world.villages.length
      ? world.villages.reduce((sum, village) => sum + (Number(village.food) || 0), 0) / world.villages.length : null,
  };
}

function sectProfile(world) {
  const current = world.factions.map((sect) => {
    const members = world.entities.filter((e) => e.faction === sect.id && isPracticingHuman(e)
      && e.hp > 0 && e.age < e.lifespan && !e._ascended).length;
    return { id: sect.id, name: sect.name, disciples: members, resources: { ...(sect.resources || {}) },
      economy: { ...(sect.economy || {}) }, supply: sectSupplyStatus(world, sect) };
  });
  return { count: current.length, disciples: current.reduce((sum, sect) => sum + sect.disciples, 0), current };
}

function runNatural(seed, duration = NATURAL_YEARS) {
  assert.ok(Number.isInteger(seed) && seed > 0);
  const started = performance.now();
  const world = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: true,
    generationVersion: 2, terrainPreset: 'standard' });
  world.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed });
  world.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed });
  const life = new Life(world, mulberry32(seed ^ 0xa5a5a5a5));
  const upperLife = new UpperLife(world.upper);
  const state = createAdvanceState();
  const observers = makeObservers(world, life);
  const result = { seed, preset: 'small', generationVersion: 2, terrainPreset: 'standard', years: duration,
    checkpoints: [], final: null };

  const sample = () => {
    observers.observeLedger();
    const save = JSON.stringify(serializeWorld(world));
    const pop = profilePopulation(world);
    const sects = sectProfile(world);
    const death = observers.tally.deaths;
    const entry = {
      year: world.year, day: world.day, elapsedMs: performance.now() - started,
      population: pop,
      birthsByOrigin: { ...observers.tally.births },
      awakenings: observers.tally.awaken,
      humanDeaths: { total: death.deaths, meanAgeYearsAllCause: death.deaths ? death.ageDays / YEAR_DAYS / death.deaths : null,
        causeCounts: { ...death.causes }, formalWarDeaths: death.warDeaths, combatDeaths: death.combatDeaths,
        allHumanNatural: { count: death.naturalDeaths, meanActualAgeYears: death.naturalDeaths
          ? death.naturalAgeDays / YEAR_DAYS / death.naturalDeaths : null },
        mortalNatural: { count: death.mortal.naturalDeaths, meanActualAgeYears: death.mortal.naturalDeaths
          ? death.mortal.naturalAgeDays / YEAR_DAYS / death.mortal.naturalDeaths : null,
        },
        mortalAllCause: { count: death.mortal.deaths, meanAgeYears: death.mortal.deaths
          ? death.mortal.ageDays / YEAR_DAYS / death.mortal.deaths : null, causeCounts: { ...death.mortal.causes } },
      },
      warfare: { cumulativeCasualties: Math.max(0, (Number(world.warLog?.casualties) || 0) - observers.tally.warCasualtiesAtStart),
        measuredHumanWarDeaths: death.warDeaths },
      sects,
      sectEconomyCumulativeAcrossObservedSects: { ...observers.sectTotals },
      villageAidCumulativeAcrossObservedSettlements: { ...observers.aidTotals },
      capacities: { entitiesHard: LIMITS.maxEntities, populationSoft: POP_SOFT_CAP,
        maxEntitiesObserved: observers.tally.maxEntities, maxVillages: LIMITS.maxVillages,
        maxVillagesObserved: observers.tally.maxVillages },
      save: { utf8Bytes: Buffer.byteLength(save, 'utf8'), jsCodeUnits: save.length },
    };
    result.checkpoints.push(structuredClone(entry));
    if (CHECKPOINTS.has(entry.year)) writeFileSync(`${OUT}/natural-${seed}-year${entry.year}.json`, save);
    writeFileSync(`${OUT}/natural-${seed}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ seed, year: entry.year, population: pop.humans, mortals: pop.mortals,
      villages: pop.villages, sects: sects.count, deaths: death.deaths,
      naturalMeanAge: entry.humanDeaths.mortalNatural.meanActualAgeYears,
      saveBytes: entry.save.utf8Bytes, elapsedMs: Math.round(entry.elapsedMs) }));
  };

  sample();
  for (let day = 0; day < duration * YEAR_DAYS; day += 3) {
    advanceWorld(world, 3, { life, upperLife, state });
    observers.observeLedger();
    const year = world.year;
    if (CHECKPOINTS.has(year) && result.checkpoints.at(-1)?.year !== year) sample();
  }
  result.final = result.checkpoints.at(-1);
  writeFileSync(`${OUT}/natural-${seed}.json`, JSON.stringify(result, null, 2));
  return result;
}

function findSafeTile(world) {
  for (let y = 20; y < world.h - 20; y += 1) for (let x = 20; x < world.w - 20; x += 1) {
    const i = world.idx(x, y);
    if (world.type[i] === TERRAIN.GRASS && world.isBuildable(i) && world.water[i] < 0.001) return [x, y];
  }
  throw new Error('no dry buildable tile for controlled peace test');
}

function runPeacefulCohort() {
  const seed = 61004;
  const rng = () => 0.999999999;
  const world = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: false,
    generationVersion: 2, terrainPreset: 'standard' });
  // Replace generated geography with a uniform, dry, fertile experimental plane:
  // the cohort measures aging and mortality, not terrain-dependent starvation.
  world.height.fill(0.55);
  world.type.fill(TERRAIN.GRASS);
  world.water.fill(0);
  world.riverBase.fill(0);
  world.fire.fill(0);
  world.veg.fill(1);
  world.struct.fill(0);
  world.over.fill(0);
  world.flow.fill(0);
  world.entities.length = 0;
  world.pendingSpawns.length = 0;
  world.factions.length = 0;
  natureState(world).events.length = 0;
  const life = new Life(world, rng);
  // Controlled exclusions: no timed world-event crises, no wildlife births or
  // predation, no parallel realms, no open rifts. All formal human life clocks,
  // village economy, births, aging and deaths still run normally.
  life.events.step = () => {};
  life.stepWildlife = () => {};
  const [x, y] = findSafeTile(world);
  const village = life.foundVillage(x + 0.5, y + 0.5, 0);
  assert.ok(village);
  village.food = 400;
  for (let dy = -6; dy <= 6; dy += 1) for (let dx = -6; dx <= 6; dx += 1) {
    const fx = x + dx; const fy = y + dy;
    if (fx < 1 || fy < 1 || fx >= world.w - 1 || fy >= world.h - 1) continue;
    const i = world.idx(fx, fy);
    if (world.type[i] === TERRAIN.GRASS && world.isBuildable(i)) {
      world.over[i] = OVER.FARMLAND;
      village.fieldTiles.push(i);
    }
  }
  village.fields = village.fieldTiles.length;
  const initialCount = 48;
  assert.equal(life.spawn(x + 0.5, y + 0.5, SPECIES.HUMAN, initialCount, 0, { village: village.id }), initialCount);
  const cohortIds = new Set();
  for (const entity of world.entities) {
    entity.age = (18 + (entity.id % 8)) * YEAR_DAYS;
    entity.lifespan = SPECIES_INFO.human.lifespan * (0.96 + rng() * 0.08);
    entity._c1PeaceCohort = true;
    cohortIds.add(entity.id);
  }
  const initial = { count: cohortIds.size, day: world.day, ids: [...cohortIds] };
  const upperLife = undefined;
  const state = createAdvanceState();
  const observers = makeObservers(world, life);
  const cohorts = { dead: 0, ageDays: 0, causes: {} };
  let maxDays = 100 * YEAR_DAYS;
  let checkpoints = [];
  const checkpoint = () => {
    const livingInitial = world.entities.filter((e) => cohortIds.has(e.id) && e.hp > 0 && e.age < e.lifespan).length;
    const mortalAges = world.entities.filter((e) => isMortalHuman(e) && e.hp > 0).map((e) => e.age / YEAR_DAYS);
    const record = { year: world.year, livingInitialCohort: livingInitial, totalHumans: world.entities.filter(isHumanPerson).length,
      mortals: mortalAges.length, villageFood: village.food, naturalEvents: world.nature?.events?.length || 0,
      factions: world.factions.length, warDeclared: world.warLog?.declared || 0,
      deathCauseCounts: { ...observers.tally.deaths.causes },
      cohortDeaths: observers.tally.deaths.peaceCohortDeaths || { n: 0, ageDays: 0, causes: {} },
      observedMeanNaturalDeathAgeYears: observers.tally.deaths.naturalDeaths
        ? observers.tally.deaths.naturalAgeDays / YEAR_DAYS / observers.tally.deaths.naturalDeaths : null,
    };
    checkpoints.push(record);
    return livingInitial;
  };
  checkpoint();
  while (world.day < maxDays) {
    advanceWorld(world, 3, { life, state, upper: false, nether: false, wraith: false, riftActive: false });
    observers.observeLedger();
    if (world.day % YEAR_DAYS < 3) {
      const living = checkpoint();
      if (living === 0) break;
    }
  }
  const c = observers.tally.deaths.peaceCohortDeaths || { n: 0, ageDays: 0, causes: {} };
  const report = {
    seed, yearsRun: world.day / YEAR_DAYS, initialCohort: { count: initial.count, ids: initial.ids,
      allDeparted: !world.entities.some((e) => cohortIds.has(e.id)) },
    controlledConditions: {
      worldSize: `${world.w}x${world.h}`, terrain: 'generated v2 standard small, no initial population; one dry village, ample initial food and surrounding fields',
      disabled: ['WorldEvents timed crises/encounters', 'wildlife births and predation', 'upper/nether populations and clocks', 'rift and wraith clocks'],
      verified: { naturalNatureEventsEver: (world.nature?.events?.length || 0) === 0, factions: world.factions.length,
        warsDeclared: world.warLog?.declared || 0, wildlifeEntities: world.entities.filter((e) => e.sp === SPECIES.BEAST || e.sp === SPECIES.SPIRIT).length,
        nonNaturalCohortDeaths: Object.entries(c.causes).filter(([cause]) => cause !== '寿终').reduce((sum, [, n]) => sum + n, 0) },
      awakeningSuppression: 'constant Life RNG 0.999999999; formal level-0 awakening checks execute and never pass; no production thresholds changed',
    },
    cohortDeaths: { n: c.n, meanActualAgeYears: c.n ? c.ageDays / YEAR_DAYS / c.n : null,
      causeCounts: c.causes, targetMinimumYears: 40, passes: c.n === initial.count && c.causes['寿终'] === initial.count
        && c.ageDays / YEAR_DAYS / Math.max(1, c.n) >= 40 },
    checkpoints,
    methodologyLimit: 'Controlled exclusions and constant RNG are a mechanism test, not an estimate of natural world mortality; only the initial tagged cohort determines the 40-year criterion.',
  };
  writeFileSync(`${OUT}/peaceful-cohort.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ peaceful: true, years: report.yearsRun, initial: initial.count,
    cohortDeaths: c.n, meanAge: report.cohortDeaths.meanActualAgeYears, passes: report.cohortDeaths.passes }));
  return report;
}

function makeSupplyWorld({ seed, workers }) {
  const world = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: false,
    generationVersion: 2, terrainPreset: 'standard' });
  world.height.fill(0.55); world.type.fill(TERRAIN.GRASS); world.water.fill(0);
  world.riverBase.fill(0); world.fire.fill(0); world.veg.fill(1); world.struct.fill(0); world.over.fill(0);
  const life = new Life(world, () => 0.999999999);
  life.events.step = () => {};
  life.stepWildlife = () => {};
  const [x, y] = findSafeTile(world);
  const village = life.foundVillage(x + 0.5, y + 0.5, 0);
  assert.ok(village);
  village.food = 240;
  // The same established fields exist in both cases; only living adult labor differs.
  for (let dy = -6; dy <= 6; dy += 1) for (let dx = -6; dx <= 6; dx += 1) {
    const fx = x + dx; const fy = y + dy;
    if (fx < 1 || fy < 1 || fx >= world.w - 1 || fy >= world.h - 1) continue;
    const i = world.idx(fx, fy);
    if (world.isBuildable(i)) { world.over[i] = OVER.FARMLAND; village.fieldTiles.push(i); }
  }
  village.fields = village.fieldTiles.length;
  const rng = () => 0.999999999;
  const humanSpawned = life.spawn(x + 0.5, y + 0.5, SPECIES.HUMAN, workers, 0, { village: village.id });
  assert.equal(humanSpawned, workers);
  for (const entity of world.entities) {
    if (!isHumanPerson(entity)) continue;
    entity.age = 25 * YEAR_DAYS;
    entity.lifespan = SPECIES_INFO.human.lifespan;
  }
  const founderSpawned = life.spawn(x + 0.5, y + 0.5, SPECIES.CULTIVATOR, 3);
  assert.equal(founderSpawned, 3);
  const members = world.entities.slice(-3);
  for (const [index, entity] of members.entries()) {
    entity.age = (30 + index) * YEAR_DAYS;
    entity.level = index === 0 ? 10 : 1;
    entity.lifespan = 240 * YEAR_DAYS;
    entity.hp = entity.maxHp;
  }
  const sect = foundSect(world, x, y, members[0], rng);
  assert.ok(sect);
  sect.resources.provisions = 2;
  sect.resources.spiritStone = 20;
  sect.pop = 3;
  sect.followers = workers + 3;
  sect.stability = 40;
  const leylineText = placeLeyline(world, x, y, rng);
  const line = world.leylines.at(-1);
  assert.ok(line, leylineText);
  line.owner = sect.id;
  sect.leylines.push(line.id);
  village.faction = sect.id;
  sect.villages.push(village.id);
  for (const entity of world.entities) if (entity.village === village.id) entity.faction = sect.id;
  world.touch();
  return { world, life, village, sect, members, line };
}

function runSupplyContrast() {
  const seed = 61005;
  const cases = {
    worked: makeSupplyWorld({ seed, workers: 30 }),
    noLabor: makeSupplyWorld({ seed, workers: 0 }),
  };
  const states = Object.fromEntries(Object.entries(cases).map(([key, f]) => [key, {
    state: createAdvanceState(), observers: makeObservers(f.world, f.life), history: new History(),
    departedIds: new Set(), samples: [],
  }]));
  const report = { seed, years: 15, setup: {
    matched: ['same seed and uniform dry/fertile geography', 'same one formal leyline location and strength',
      'same actual founder and two existing disciple entities', 'same initial provisions (2) and spirit stones (20)',
      'same mature village food (240), field tiles, village/sect ownership and stability'],
    difference: 'worked has 30 real level-0 age-25 villagers and working adults; noLabor has 0; no hidden population pool or added people during advance.',
    control: ['WorldEvents and wildlife spawning disabled', 'no upper/nether/rift/wraith clocks', 'same deterministic Life RNG suppresses random awakenings and fractional births', 'official advanceWorld in 3-day increments still runs Life, village economy, sect upkeep and actual nature settling'],
    sourceLine: Object.fromEntries(Object.entries(cases).map(([key, f]) => [key, { id: f.line.id, x: f.line.x, y: f.line.y, strength: f.line.strength }]))
  }, phases: [] };

  const capture = (label) => {
    for (const [key, f] of Object.entries(cases)) {
      const ctx = states[key]; ctx.observers.observeLedger();
      const society = villageSocieties(f.world).get(f.village.id);
      const status = sectSupplyStatus(f.world, f.sect);
      const active = f.world.entities.filter((e) => e.faction === f.sect.id && isPracticingHuman(e)
        && e.hp > 0 && e.age < e.lifespan && !e._ascended);
      const record = { case: key, label, day: f.world.day, year: f.world.year,
        village: { humans: society.humans, mortals: society.mortals, mortalAdults: society.mortalAdults,
          food: f.village.food, hp: f.village.hp, fields: f.village.fields,
          aidProvisionsCumulative: f.village.aidSpentProvisions || 0,
          aidSpiritStoneCumulative: f.village.aidSpentSpiritStone || 0 },
        sect: { livingDisciples: active.length, provisions: f.sect.resources.provisions,
          spiritStone: f.sect.resources.spiritStone, recruited: f.sect.economy?.recruited || 0,
          supplied: f.sect.economy?.supplied || 0, consumed: f.sect.economy?.consumed || 0,
          unmet: f.sect.economy?.unmet || 0, foodTransferred: f.sect.economy?.foodTransferred || 0,
          unfedDays: f.sect.economy?.unfedDays || 0,
          potentialSupplyPerDay: status.potentialPerDay, measuredSupplyPerDay: status.suppliedPerDay,
          measuredConsumptionPerDay: status.consumedPerDay, netPerDay: status.netPerDay,
          reserveDays: status.reserveDays, canRecruit: status.canRecruit,
          departedSinceStart: [...ctx.departedIds] },
        deaths: { human: ctx.observers.tally.deaths.deaths,
          causes: { ...ctx.observers.tally.deaths.causes }, warCasualties: f.world.warLog?.casualties || 0 },
        population: { totalLiving: f.world.entities.length, maxEntitiesObserved: ctx.observers.tally.maxEntities,
          birthsVillage: ctx.observers.tally.births.village, awakenings: ctx.observers.tally.awaken },
        nature: { activeFloodCells: f.world.nature?.floods?.size || 0,
          activeEvents: (f.world.nature?.events || []).length },
      };
      ctx.samples.push(record);
    }
    report.phases.push({ label, day: cases.worked.world.day, year: cases.worked.world.year,
      cases: Object.fromEntries(Object.entries(states).map(([key, ctx]) => [key, structuredClone(ctx.samples.at(-1))])) });
  };

  for (const ctx of Object.values(states)) {
    const world = Object.values(cases)[Object.values(states).indexOf(ctx)].world;
    ctx.previousMemberIds = new Set(world.entities.filter((e) => e.faction).map((e) => e.id));
  }
  capture('start');
  const totalDays = report.years * YEAR_DAYS;
  let floodApplied = false, waterRemoved = false;
  for (let elapsed = 0; elapsed < totalDays; elapsed += 3) {
    for (const [key, f] of Object.entries(cases)) {
      const ctx = states[key];
      advanceWorld(f.world, 3, { life: f.life, state: ctx.state, nether: false, wraith: false, riftActive: false });
      ctx.observers.observeLedger();
      for (const e of f.world.entities) if (ctx.previousMemberIds.has(e.id) && e.faction !== f.sect.id) ctx.departedIds.add(e.id);
      ctx.previousMemberIds = new Set(f.world.entities.filter((e) => e.faction === f.sect.id).map((e) => e.id));
    }
    const day = cases.worked.world.day;
    if (day === 5 * YEAR_DAYS) {
      capture('year-5-before-flood');
      for (const [key, f] of Object.entries(cases)) {
        const history = states[key].history; history.begin({ toolId: 'flood', x: f.village.x, y: f.village.y, radius: 5 });
        flood(f.world, f.village.x, f.village.y, 5, history); history.end('C1供给对照正式洪水');
      }
      floodApplied = true; capture('formal-flood');
    }
    if (day === 5 * YEAR_DAYS + 15) {
      for (const [key, f] of Object.entries(cases)) {
        const history = states[key].history; history.begin({ toolId: 'water', x: f.village.x, y: f.village.y, radius: 5 });
        removeWater(f.world, f.village.x, f.village.y, 5, 0.2, history); history.end('C1供给对照抽水');
      }
      waterRemoved = true; capture('formal-pump-after-15-days');
    }
    if (day % (5 * YEAR_DAYS) === 0 && day > 0 && day !== 5 * YEAR_DAYS) capture(`year-${day / YEAR_DAYS}`);
  }
  capture('final');
  report.controlledActions = { floodApplied, waterRemoved,
    floodsCreated: Object.fromEntries(Object.entries(cases).map(([key, f]) => [key, f.world.nature?.nextId - 1 || 0])),
    pumpIsPlayerEdit: true, estimatedNaturalRecoveryAfterPump: 'Measured by continuing formal nature/Life clocks; terrain and village flows are not force-restored.' };
  report.interpretation = {
    actualSupplyDiffAtStart: report.phases[0].cases.worked.sect.potentialSupplyPerDay > report.phases[0].cases.noLabor.sect.potentialSupplyPerDay,
    cutoffAtStart: { worked: report.phases[0].cases.worked.sect.canRecruit, noLabor: report.phases[0].cases.noLabor.sect.canRecruit },
    strictAB: false,
    note: 'A paired controlled contrast verifies direction and real clocks, not an identical future-world counterfactual: once populations diverge, official settlement, births, disease-free mortality and sect clocks follow their own states.'
  };
  writeFileSync(`${OUT}/supply-contrast.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ supplyContrast: true, years: report.years,
    initialSupply: { worked: report.phases[0].cases.worked.sect.potentialSupplyPerDay,
      noLabor: report.phases[0].cases.noLabor.sect.potentialSupplyPerDay },
    final: { worked: report.phases.at(-1).cases.worked.sect, noLabor: report.phases.at(-1).cases.noLabor.sect },
    floodApplied, waterRemoved }));
  return report;
}

if (process.argv.includes('--peace-only')) {
  runPeacefulCohort();
} else if (process.argv.includes('--supply-only')) {
  runSupplyContrast();
} else if (process.argv.includes('--run')) {
  const report = { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    startedAt: new Date().toISOString(), methodology: [
      'Natural profile: official v2/standard small worldgen, seeds 61001/2/3, no added population or forced crisis; every clock uses advanceWorld in 3-day increments.',
      'All human births observed by a transparent Life.spawn wrapper and birthOrigin; all deaths by a transparent Life.onDeath wrapper before original call, using formal diedOfOldAge plus per-entity causal markers. Bounded dead/chronicle lists are never used as lifetime totals.',
      'Awakening is counted from mortal world.record(kind=awaken); economy is read from actual sect.economy cumulative counters and current sect membership; village aid retained through object references even after abandonment.',
      'Elapsed time includes wrappers, checkpoint census and serialization. Save size reports serialized UTF-8 bytes and JavaScript UTF-16 code units.',
    ], runs: [] };
  for (const seed of SEEDS) {
    const run = runNatural(seed);
    report.runs.push(run);
    writeFileSync(`${OUT}/profile.json`, JSON.stringify(report, null, 2));
  }
  runPeacefulCohort();
  report.peacefulCohort = 'see peaceful-cohort.json';
  writeFileSync(`${OUT}/profile.json`, JSON.stringify(report, null, 2));
} else {
  console.log('Prepared only. Use --run for three natural seeds × 300 years plus the peaceful cohort, --peace-only for the peaceful cohort, or --supply-only for the finite sect supply contrast.');
}
