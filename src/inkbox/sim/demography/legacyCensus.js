import { TIME } from '../../core/config.js';

const blank = () => ({ total: 0, living: 0, humans: 0, mortals: 0, practitioners: 0, mortalAdults: 0, fertileMortals: 0, fertileHumans: 0, nonHuman: 0, dead: 0, ascended: 0 });
const village = () => ({ ...blank(), society: { humans: 0, mortals: 0, mortalAdults: 0, practitioners: 0, fertileMortals: 0 }, legacyVillage: { pop: 0, humans: 0, mortals: 0, adults: 0, fertile: 0 } });
const sect = () => ({ ...blank(), followers: 0, pop: 0, storedCache: null });

function add(facts, entity) {
  facts.total += 1;
  const human = entity.sp === 'human' || entity.sp === 'cultivator';
  const mortal = human && !(entity.level > 0);
  const living = entity.hp > 0 && !entity._ascended && !(entity.age >= entity.lifespan);
  if (entity._ascended) facts.ascended += 1;
  if (!living) { if (!entity._ascended) facts.dead += 1; return { human, mortal, living }; }
  facts.living += 1;
  if (human) {
    facts.humans += 1;
    if (mortal) facts.mortals += 1;
    else facts.practitioners += 1;
    if (Number.isFinite(entity.age) && entity.age >= 18 * TIME.daysPerYear && mortal) facts.mortalAdults += 1;
    if (Number.isFinite(entity.age) && entity.age >= 18 * TIME.daysPerYear && entity.age < 50 * TIME.daysPerYear) {
      facts.fertileHumans += 1;
      if (mortal) facts.fertileMortals += 1;
    }
  } else facts.nonHuman += 1;
  return { human, mortal, living };
}

function planeEntries(world) {
  return [['mortal', world], ['upper', world.upper], ['nether', world.nether]].filter(([, plane]) => plane && Array.isArray(plane.entities));
}

/** Independent one-pass grouping over authoritative entities. Never touches the world. */
export function buildPopulationCensus(world, phase = 'unspecified') {
  const villages = new Map(world.villages.map(row => [row.id, village()]));
  const sects = new Map(world.factions.map(row => [row.id, sect()]));
  const byPlane = new Map();
  const upperSects = new Map((world.upper?.factions ?? []).map(row => [row.id, {
    pop: 0, followers: 0, storedCache: { pop: row.pop, followers: row.followers }
  }]));
  const global = blank();
  const unassigned = { village: 0, sect: 0, invalidVillage: 0, invalidSect: 0 };
  for (const [planeName, plane] of planeEntries(world)) {
    const planeFacts = blank();
    byPlane.set(planeName, planeFacts);
    for (const entity of plane.entities) {
      add(global, entity);
      add(planeFacts, entity);
      if (planeName === 'upper') {
        const upperSect = upperSects.get(entity.faction);
        if (upperSect) upperSect.pop += 1;
      }
      if (planeName !== 'mortal') continue;
      const v = villages.get(entity.village);
      if (v) {
        const {human, mortal} = add(v, entity);
        const legacyLiving = !!entity.village && entity.hp > 0 && !entity._ascended && !(entity.age >= entity.lifespan);
        const societyLiving = !(entity.hp <= 0) && !(Number.isFinite(entity.lifespan) && entity.age >= entity.lifespan) && !entity._ascended;
        if (legacyLiving) {
          v.legacyVillage.pop += 1;
          if (human) {
            v.legacyVillage.humans += 1;
            if (Number.isFinite(entity.age) && entity.age >= 18 * TIME.daysPerYear && entity.age < 50 * TIME.daysPerYear) v.legacyVillage.fertile += 1;
            if (mortal) {
              v.legacyVillage.mortals += 1;
              if (Number.isFinite(entity.age) && entity.age >= 18 * TIME.daysPerYear) {
                v.legacyVillage.adults += 1;
              }
            }
          }
        }
        if (societyLiving && human) {
          v.society.humans += 1;
          if (mortal) {
            v.society.mortals += 1;
            if (Number.isFinite(entity.age) && entity.age >= 18 * TIME.daysPerYear) v.society.mortalAdults += 1;
            if (Number.isFinite(entity.age) && entity.age >= 18 * TIME.daysPerYear && entity.age < 50 * TIME.daysPerYear) v.society.fertileMortals += 1;
          } else {
            v.society.practitioners += 1;
          }
        }
      } else if (entity.village) unassigned.invalidVillage += 1;
      else unassigned.village += 1;
      const s = sects.get(entity.faction);
      if (s) {
        add(s, entity);
        s.followers += 1;
        if ((entity.sp === 'human' || entity.sp === 'cultivator') && entity.level > 0 && entity.hp > 0 && entity.age < entity.lifespan && !entity._ascended) s.pop += 1;
      } else if (entity.faction) unassigned.invalidSect += 1;
      else unassigned.sect += 1;
    }
  }
  for (const row of world.factions) sects.get(row.id).storedCache = {followers: row.followers, pop: row.pop};
  return {source: 'legacy-entities', phase, worldDay: world.day, worldGeneration: null, villages, sects, upperSects, byPlane, global, unassigned};
}

/** Legacy caches are compared only at the phase where their writer has completed. */
export function compareCensusToLegacy(world, census, phase = census.phase) {
  const differences = [];
  const push = (kind, id, field, legacy, shadow, stable) => { if (legacy !== shadow) differences.push({worldDay: world.day, phase, kind, id, field, legacy, shadow, classification: stable ? 'unexpected-divergence' : 'expected-stale'}); };
  for (const row of world.villages) {
    const value = census.villages.get(row.id);
    push('village', row.id, 'pop', row.pop, value.legacyVillage.pop,
      phase === 'after-first-village-sync');
  }
  for (const row of world.factions) {
    const value = census.sects.get(row.id);
    const stable = phase === 'after-sect-census';
    push('sect', row.id, 'followers', row.followers, value.followers, stable);
    push('sect', row.id, 'pop', row.pop, value.pop, stable);
  }
  return differences;
}
