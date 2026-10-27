#!/usr/bin/env node
// G8 · 人口因果漏斗探针（只读诊断，不进 Fast/Heavy）。
// 与 inkbox-longrun.mjs 同一世界线：同 seed、同 STEP、同裂缝开窗时间表。
// 只包裹 Life/UpperLife 原型方法做计数，不抽任何随机数、不改世界。
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld, recomputeUpperQi } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { WORLD_PRESETS, TIME } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife, isUpperMortal } from '../src/inkbox/sim/upperLife.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { openRifts } from '../src/inkbox/sim/rifts.js';
import { isDryBuildableSettlementTile } from '../src/inkbox/world/settlementState.js';
import { isAdult, isFertileAge, isHumanPerson, isMortalHuman } from '../src/inkbox/core/demographics.js';

const arg = (n, f) => { const h = process.argv.find(v => v.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : f; };
const YEARS = Number(arg('years', '300')), SEED = Number(arg('seed', '20260914'));
const STEP = Number(arg('step', '3')), BUCKET = Number(arg('bucket', '25'));
const OUT = arg('out', '');
const PRESET = WORLD_PRESETS[arg('preset', 'medium')];

const world = generateWorld({ preset: PRESET, seed: SEED, scatter: true });
const life = new Life(world, mulberry32(world.seed ^ 0xa5a5a5a5));
const upper = generateUpperWorld({ preset: PRESET, seed: SEED }); recomputeUpperQi(upper); world.upper = upper;
const upperLife = new UpperLife(upper);
world.nether = generateNetherWorld({ preset: PRESET, seed: SEED });
const adv = createAdvanceState();
const scatterRng = mulberry32(4242);
for (let g = 0; g < 5; g += 1) {
  const x = 20 + Math.floor(scatterRng() * (world.w - 40)), y = 20 + Math.floor(scatterRng() * (world.h - 40));
  world.pendingSpawns.push({ x, y, species: 'human', count: 14 });
}
const RIFT_SITES = [[40, 50], [220, 70], [60, 120]];
const NETHER_SITES = [[127, 45], [192, 30], [66, 46], [101, 100], [189, 101], [261, 101]];
const viewOpen = y => (y - 1) % 20 < 5;

let B = null; const rows = [];
const fresh = () => ({ villageSteps: 0, gateCap: 0, gateFood: 0, gateNoMortal: 0, gateFertile: 0, gateOpen: 0,
  ledgerPairButNoLocal: 0, birthsRequested: 0, birthsCreated: 0, pairFail: 0, spotFail: 0,
  deathMinorMortal: 0, deathAdultMortal: 0, deathOldMortal: 0, deathViolentMortal: 0, deathCult: 0, deathCultFertile: 0,
  deathFertileMortal: 0, awakened: 0, awakenedFertile: 0, ascended: 0,
  upCalls: 0, upCapBlock: 0, upAdultBlock: 0, upBirths: 0, upMortalArrived: 0, upArrivalAges: [], upMortalPeak: 0, upFertileOverlapTicks: 0,
  upDeaths: 0, upAwakened: 0, splitEligible: 0, splitExpected: 0, splitMigrantShort: 0, splitDone: 0, founded: 0, abandoned: {} });
B = fresh();

// ── 包裹（只读计数）──
const origSpawn = Life.prototype.spawn;
Life.prototype.spawn = function (x, y, sp, count, f, opts = {}) {
  const natural = opts.allowSouls === true;
  const created = origSpawn.call(this, x, y, sp, count, f, opts);
  if (natural) {
    B.birthsRequested += count; B.birthsCreated += created;
    if (!created) { if (!opts.parents?.[0] || !opts.parents?.[1]) B.pairFail += count; else B.spotFail += count; }
    else if (created < count) B.spotFail += count - created;
  }
  return created;
};
const origDeath = Life.prototype.onDeath;
Life.prototype.onDeath = function (e) {
  if (isHumanPerson(e)) {
    if (isMortalHuman(e)) {
      if (!isAdult(e)) B.deathMinorMortal += 1; else B.deathAdultMortal += 1;
      if (isFertileAge(e)) B.deathFertileMortal += 1;
      if (e.age >= e.lifespan) B.deathOldMortal += 1; else B.deathViolentMortal += 1;
    } else { B.deathCult += 1; if (isFertileAge(e)) B.deathCultFertile += 1; }
  }
  return origDeath.call(this, e);
};
const origVillages = Life.prototype.stepVillages;
Life.prototype.stepVillages = function (dt) {
  for (const v of this.world.villages) {
    const s = this.villageDemographics.get(v.id) || { mortals: 0, fertile: 0 };
    if (v.pop <= 0) continue;
    B.villageSteps += 1;
    const cap = 10 + v.level * 10;
    if (v.pop >= cap) B.gateCap += 1; else if (!(v.food > 20)) B.gateFood += 1;
    else if (!(s.mortals > 0)) B.gateNoMortal += 1; else if (!(s.fertile > 1)) B.gateFertile += 1;
    else {
      B.gateOpen += 1;
      let local = 0;
      this.forEachNear(v.x, v.y, 12, e => { if (e.village === v.id && isHumanPerson(e) && isFertileAge(e) && e.hp > 0 && !e._ascended && e.age < e.lifespan) local += 1; return false; });
      if (local < 2) B.ledgerPairButNoLocal += 1;
    }
  }
  return origVillages.call(this, dt);
};
const origSplit = Life.prototype.maybeSplitVillage;
Life.prototype.maybeSplitVillage = function (village, dt) {
  const cap = 10 + village.level * 10;
  const before = this.world.villages.length;
  if (village.pop >= cap - 4 && village.food >= 60 && this.world.villages.length < 220 && this.world.entities.length < 1400) {
    B.splitEligible += 1; B.splitExpected += dt * 0.00016;
    let m = 0; this.forEachNear(village.x, village.y, 14, e => { if (e.village === village.id && isAdult(e) && isMortalHuman(e) && isFertileAge(e) && e.hp > 0) m += 1; return false; });
    if (m < 2) B.splitMigrantShort += 1;
  }
  const r = origSplit.call(this, village, dt);
  if (this.world.villages.length > before) B.splitDone += 1;
  return r;
};
const origFound = Life.prototype.foundVillage;
Life.prototype.foundVillage = function (...a) { const v = origFound.apply(this, a); if (v) B.founded += 1; return v; };
const origAbandon = Life.prototype.abandonVillage;
Life.prototype.abandonVillage = function (v, reason) { const k = String(reason || '长期衰败').slice(0, 12); B.abandoned[k] = (B.abandoned[k] || 0) + 1; return origAbandon.call(this, v, reason); };
const origUpMortal = UpperLife.prototype.maybeBornMortals;
UpperLife.prototype.maybeBornMortals = function () {
  B.upCalls += 1;
  const ms = this.upper.entities.filter(isUpperMortal);
  const ad = ms.filter(e => isFertileAge(e) && e.hp > 0 && e.age < e.lifespan);
  if (ad.length >= 2) B.upFertileOverlapTicks += 1;
  if (ms.length >= 120) B.upCapBlock += 1; else if (ad.length < 2) B.upAdultBlock += 1;
  const before = this.upper.popLog?.bornMortal || 0;
  const r = origUpMortal.call(this);
  B.upBirths += (this.upper.popLog?.bornMortal || 0) - before;
  return r;
};

let prevMortal = new Map(), prevUpMortal = new Set(), upSeen = new Set(upper.entities.map(e => e.id));
let prevAscended = world.ascended.length;
function snapshot(y) {
  const ents = world.entities.filter(e => isHumanPerson(e) && e.hp > 0);
  const mortals = ents.filter(isMortalHuman);
  const band = (a) => mortals.filter(e => e.age >= a[0] * 360 && e.age < a[1] * 360).length;
  const inVillage = mortals.filter(e => e.village).length;
  const fert = ents.filter(isFertileAge);
  const vs = world.villages.map(v => ({ id: v.id, pop: v.pop, food: Math.round(v.food), level: v.level,
    fertile: life.villageDemographics.get(v.id)?.fertile || 0, mortals: life.villageDemographics.get(v.id)?.mortals || 0 }));
  let land = 0, vegSum = 0, fert34 = 0;
  for (let i = 0; i < world.size; i += 1) { if (!world.isWalkable(i)) continue; land += 1; vegSum += world.veg[i]; if (world.fertility(i) >= 0.34) fert34 += 1; }
  const ring = world.villages.map(v => { let ok = 0, dry = 0;
    for (let dy = -34; dy <= 34; dy += 1) for (let dx = -34; dx <= 34; dx += 1) { const d = Math.hypot(dx, dy); if (d < 16 || d > 34) continue;
      const x = v.x + dx, y = v.y + dy; if (!world.inside(x, y)) continue; const i = world.idx(x, y);
      if (!isDryBuildableSettlementTile(world, i) || life.villageNear(x, y, 13)) continue; dry += 1; if (world.fertility(i) >= 0.34) ok += 1; }
    return [dry, ok]; });
  const upM = upper.entities.filter(isUpperMortal);
  const row = { meanVeg: +(vegSum / land).toFixed(3), fert34Share: +(fert34 / land).toFixed(3), splitRing: ring, year: y, humans: ents.length, mortals: mortals.length, cultivators: ents.length - mortals.length,
    m0_18: band([0, 18]), m18_50: band([18, 50]), m50p: band([50, 999]), fertileAll: fert.length,
    fertileMortal: fert.filter(isMortalHuman).length, mortalsInVillage: inVillage, villages: world.villages.length,
    villageDetail: vs.slice(0, 12), factions: world.factions.length,
    meanMortalLifespanY: mortals.length ? +(mortals.reduce((s, e) => s + e.lifespan, 0) / mortals.length / 360).toFixed(1) : null,
    upperTotal: upper.entities.length, upperMortals: upM.length, upperFertileMortals: upM.filter(isFertileAge).length,
    ...B, upArrivalAges: B.upArrivalAges.slice(0, 20) };
  rows.push(row);
  console.log(JSON.stringify({ y, veg: row.meanVeg, f34: row.fert34Share, ring: row.splitRing, humans: row.humans, mortals: row.mortals, cult: row.cultivators, m0_18: row.m0_18, m18_50: row.m18_50, m50p: row.m50p,
    fertMort: row.fertileMortal, inVil: row.mortalsInVillage, vil: row.villages, born: B.birthsCreated, req: B.birthsRequested, pairFail: B.pairFail, spotFail: B.spotFail,
    gate: [B.gateCap, B.gateFood, B.gateNoMortal, B.gateFertile, B.gateOpen, B.ledgerPairButNoLocal],
    dMinor: B.deathMinorMortal, dAdult: B.deathAdultMortal, dOld: B.deathOldMortal, dViol: B.deathViolentMortal, dFertM: B.deathFertileMortal, dCult: B.deathCult,
    split: [B.splitEligible, +B.splitExpected.toFixed(1), B.splitMigrantShort, B.splitDone], founded: B.founded, abandoned: B.abandoned,
    awake: B.awakened, awakeFert: B.awakenedFertile, asc: B.ascended,
    up: { tot: row.upperTotal, mort: row.upperMortals, fert: row.upperFertileMortals, arrived: B.upMortalArrived, ages: B.upArrivalAges.slice(0, 8), calls: B.upCalls, adultBlock: B.upAdultBlock, overlap: B.upFertileOverlapTicks, births: B.upBirths, deaths: B.upDeaths, awake: B.upAwakened } }));
  B = fresh();
}
const t0 = Date.now();
for (let y = 1; y <= YEARS; y += 1) {
  for (let d = 0; d < TIME.daysPerYear; d += STEP) advanceWorld(world, STEP, { life, upperLife, state: adv, riftActive: viewOpen(y) });
  world.year = Math.floor(world.day / TIME.daysPerYear);
  if (viewOpen(y)) {
    if ((y - 1) % 20 === 0) for (const [ox, oy] of RIFT_SITES) openRifts(world, { x0: ox, y0: oy, x1: ox + 39, y1: oy + 29 });
    for (const [nx, ny] of NETHER_SITES) openRifts(world, { x0: nx, y0: ny, x1: nx, y1: ny }, 'nether');
  }
  // 年度：觉醒、飞升、上界到达/死亡/觉醒
  const now = new Map(); for (const e of world.entities) if (isHumanPerson(e)) now.set(e.id, e);
  for (const [id, wasFert] of prevMortal) { const e = now.get(id); if (e && (e.level || 0) > 0) { B.awakened += 1; if (wasFert) B.awakenedFertile += 1; } }
  prevMortal = new Map(); for (const e of now.values()) if (isMortalHuman(e)) prevMortal.set(e.id, isFertileAge(e));
  B.ascended += world.ascended.length - prevAscended; prevAscended = world.ascended.length;
  const upNow = new Map(upper.entities.map(e => [e.id, e]));
  for (const e of upper.entities) if (!upSeen.has(e.id)) { upSeen.add(e.id); if (isUpperMortal(e) && e.birthOrigin?.kind !== 'upper-village') { B.upMortalArrived += 1; B.upArrivalAges.push(+(e.age / 360).toFixed(1)); } }
  for (const id of prevUpMortal) { const e = upNow.get(id); if (!e) B.upDeaths += 1; else if ((e.level || 0) > 0) B.upAwakened += 1; }
  prevUpMortal = new Set(upper.entities.filter(isUpperMortal).map(e => e.id));
  if (y % BUCKET === 0 || y === YEARS) snapshot(y);
}
console.error(`done ${YEARS}y in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (OUT) { const fs = await import('node:fs'); fs.writeFileSync(OUT, JSON.stringify(rows, null, 1)); }
