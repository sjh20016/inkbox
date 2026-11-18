import { SPECIES, TIME } from './config.js';

export const ADULT_AGE_DAYS = 18 * TIME.daysPerYear;
export const FERTILITY_END_DAYS = 50 * TIME.daysPerYear;

/** Age is elapsed game days from birth; longevity never changes adulthood. */
export function isAdult(entity) {
  return Number.isFinite(entity?.age) && entity.age >= ADULT_AGE_DAYS;
}

export function isFertileAge(entity) {
  return isAdult(entity) && entity.age < FERTILITY_END_DAYS;
}

export function isHumanPerson(entity) {
  return entity?.sp === SPECIES.HUMAN || entity?.sp === SPECIES.CULTIVATOR;
}

/** A remembered identity or spiritual root alone is not cultivated attainment. */
export function isMortalHuman(entity) {
  return isHumanPerson(entity) && !(entity.level > 0);
}

export function isPracticingHuman(entity) {
  return isHumanPerson(entity) && entity.level > 0;
}

export function isLivingHuman(entity) {
  return isHumanPerson(entity) && entity.hp > 0 && !entity._ascended
    && Number.isFinite(entity.age) && entity.age < entity.lifespan;
}

export function hasMortalResidents(world, villageId) {
  return world.entities.some(entity => entity.village === villageId
    && isMortalHuman(entity) && isLivingHuman(entity));
}
