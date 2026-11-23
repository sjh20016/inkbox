// A read-only projection of existing identities. Counts here never own people.
import { TIME } from '../../core/config.js';

const yearDays = TIME.daysPerYear;
const human = entity => entity.sp === 'human' || entity.sp === 'cultivator';
const live = entity => entity.hp > 0 && !entity._ascended && entity.age < entity.lifespan;
const origin = entity => {
  const value = entity.birthOrigin;
  return value?.villageId ?? value?.birthPlaceId ?? value?.village ?? 'unknown';
};

function planeOf(entity, plane) {
  return entity.realm ?? entity.plane ?? plane;
}

export function projectJointBuckets(world, { ageGrainDays = yearDays, includeOrigin = true } = {}) {
  if (!(ageGrainDays > 0)) throw new RangeError('ageGrainDays must be positive');
  const buckets = new Map();
  const planes = [['mortal', world], ['upper', world.upper], ['nether', world.nether]];
  let living = 0;
  let records = 0;
  let unknownOrigin = 0;
  for (const [planeName, plane] of planes) {
    if (!plane?.entities) continue;
    for (const entity of plane.entities) {
      records++;
      const alive = live(entity);
      if (alive) living++;
      const isHuman = human(entity);
      const age = Number.isFinite(entity.age) ? entity.age : null;
      const ageBand = age === null ? 'unknown' : Math.floor(age / ageGrainDays);
      const adult = age !== null && age >= 18 * yearDays;
      const fertileAge = adult && age < 50 * yearDays;
      const birthSource = includeOrigin ? origin(entity) : 'omitted';
      if (birthSource === 'unknown') unknownOrigin++;
      const birthDay = Number.isFinite(entity.birthOrigin?.day) ? entity.birthOrigin.day : null;
      const birthCohort = birthDay === null ? 'unknown' : Math.floor(birthDay / ageGrainDays);
      const attributes = {
        plane: planeOf(entity, planeName), village: entity.village ?? 0,
        faction: entity.faction ?? 0, species: entity.sp ?? 'unknown',
        alive, human: isHuman, level: isHuman && Number.isFinite(entity.level) ? entity.level : 0,
        practicing: isHuman && entity.level > 0,
        adult, fertileAge, ageBand, birthSource, birthCohort
      };
      const key = JSON.stringify(Object.values(attributes));
      const bucket = buckets.get(key);
      if (bucket) bucket.count++;
      else buckets.set(key, { ...attributes, count: 1 });
    }
  }
  return { source: 'existing-identities', ageGrainDays, records, living, unknownOrigin, buckets };
}

export function jointMarginals(projection) {
  const villages = new Map();
  const sects = new Map();
  const planes = new Map();
  const facts = () => ({ residents: 0, humans: 0, mortals: 0, practitioners: 0,
    mortalAdults: 0, fertileMortals: 0, fertileHumans: 0, followers: 0, pop: 0 });
  for (const bucket of projection.buckets.values()) {
    const villageRows = villages.get(bucket.plane) ?? new Map();
    const sectRows = sects.get(bucket.plane) ?? new Map();
    const village = villageRows.get(bucket.village) ?? facts();
    const sect = sectRows.get(bucket.faction) ?? facts();
    const plane = planes.get(bucket.plane) ?? facts();
    const mortal = bucket.human && !bucket.practicing;
    for (const target of [village, sect, plane]) {
      if (!bucket.alive) continue;
      target.residents += bucket.count;
      if (bucket.human) target.humans += bucket.count;
      if (mortal) target.mortals += bucket.count;
      if (bucket.practicing) target.practitioners += bucket.count;
      if (mortal && bucket.adult) target.mortalAdults += bucket.count;
      if (mortal && bucket.fertileAge) target.fertileMortals += bucket.count;
      if (bucket.human && bucket.fertileAge) target.fertileHumans += bucket.count;
    }
    if (bucket.plane === 'mortal' && bucket.faction) {
      sect.followers += bucket.count;
      if (bucket.practicing && bucket.alive) sect.pop += bucket.count;
    } else if (bucket.plane === 'upper' && bucket.faction) {
      // UpperLife.stepSects counts every assigned entity and keeps followers at zero.
      sect.pop += bucket.count;
    }
    villageRows.set(bucket.village, village);
    sectRows.set(bucket.faction, sect);
    villages.set(bucket.plane, villageRows);
    sects.set(bucket.plane, sectRows);
    planes.set(bucket.plane, plane);
  }
  return { villages, sects, planes };
}
