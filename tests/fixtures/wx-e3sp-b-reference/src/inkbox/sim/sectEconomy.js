import { isAdult, isFertileAge, isHumanPerson, isMortalHuman, isPracticingHuman } from '../core/demographics.js';
import { OVER } from '../world/terrain.js';
import { isHabitableSettlementCenter, SETTLEMENT_FLOOD_DEPTH } from '../world/settlementState.js';

// P0 aid converts four stores of provisions to twelve village food. Keeping the
// same units on the return journey prevents an aid/tribute food-creation loop.
export const FOOD_PER_PROVISION = 3;
export const SECT_FOOD_PER_DISCIPLE_DAY = 0.0025;
export const VILLAGE_RESERVE_DAYS = 90;
const FOOD_PER_PERSON_DAY = 0.0085;
const COUNTER_CAP = Number.MAX_SAFE_INTEGER;

function living(e) {
  return !(e.hp <= 0) && !(Number.isFinite(e.lifespan) && e.age >= e.lifespan) && !e._ascended;
}

function emptySociety() {
  return { humans: 0, mortals: 0, mortalAdults: 0, practitioners: 0, fertileMortals: 0 };
}

/** Derived counts only: entities remain the sole population authority. */
export function villageSocieties(world) {
  const societies = new Map(world.villages.map((v) => [v.id, emptySociety()]));
  for (const e of world.entities) {
    const s = societies.get(e.village);
    if (!s || !isHumanPerson(e) || !living(e)) continue;
    s.humans += 1;
    if (isMortalHuman(e)) {
      s.mortals += 1;
      if (isAdult(e)) s.mortalAdults += 1;
      if (isFertileAge(e)) s.fertileMortals += 1;
    } else if (isPracticingHuman(e)) s.practitioners += 1;
  }
  return societies;
}

function withSupply(world, village, society) {
  const workingFields = [...new Set(village.fieldTiles || [])].reduce((n, index) => n + (
    Number.isInteger(index) && index >= 0 && index < world.size
    && world.over[index] === OVER.FARMLAND && !world.struct[index]
    && world.water[index] < SETTLEMENT_FLOOD_DEPTH ? 1 : 0), 0);
  const reserveFood = Math.max(50, society.humans * FOOD_PER_PERSON_DAY * VILLAGE_RESERVE_DAYS)
    + (100 - Math.max(0, Math.min(100, village.hp ?? 100))) * 0.2;
  const surplusFood = Math.max(0, (village.food || 0) - reserveFood);
  const center = world.idx(Math.floor(village.x), Math.floor(village.y));
  const health = Math.max(0, Math.min(1, ((village.hp ?? 100) - 35) / 65));
  const farmSupport = Math.min(1, 0.25 + workingFields / Math.max(1, society.mortalAdults * 0.5));
  const tributePerDay = isHabitableSettlementCenter(world, center)
    ? society.mortalAdults * 0.0018 * farmSupport * health : 0;
  return { ...society, workingFields, reserveFood, surplusFood, tributePerDay };
}

/** Pure UI/inspection reader; no RNG, cache writes or synthetic population. */
export function villageSociety(world, village) {
  return withSupply(world, village, villageSocieties(world).get(village.id) || emptySociety());
}

function members(world, sect) {
  let practitioners = 0;
  for (const e of world.entities) {
    if (e.faction === sect.id && isPracticingHuman(e) && living(e)) practitioners += 1;
  }
  return practitioners;
}

function ownedSupply(world, sect, societies) {
  let mortalAdults = 0;
  let suppliedPerDay = 0;
  for (const village of world.villages) {
    if (village.faction !== sect.id || !sect.villages.includes(village.id)) continue;
    const s = withSupply(world, village, societies.get(village.id) || emptySociety());
    mortalAdults += s.mortalAdults;
    if (s.surplusFood > 0) suppliedPerDay += s.tributePerDay;
  }
  return { mortalAdults, suppliedPerDay };
}

export function sectSupplyStatus(world, sect, societies = villageSocieties(world)) {
  const practitioners = members(world, sect);
  const { mortalAdults, suppliedPerDay: potentialPerDay } = ownedSupply(world, sect, societies);
  const demandPerDay = practitioners * SECT_FOOD_PER_DISCIPLE_DAY;
  const provisions = Math.max(0, sect.resources?.provisions || 0);
  const reserveDays = demandPerDay > 0 ? provisions / demandPerDay : null;
  const measured = sect.economy?.lastDt > 0;
  const suppliedPerDay = measured ? sect.economy.lastSupplied / sect.economy.lastDt : null;
  const consumedPerDay = measured ? sect.economy.lastConsumed / sect.economy.lastDt : null;
  return { practitioners, mortalAdults, suppliedPerDay, consumedPerDay,
    netPerDay: measured ? suppliedPerDay - consumedPerDay : null, reserveDays, potentialPerDay, demandPerDay,
    supplyCutOff: potentialPerDay <= 0,
    canRecruit: mortalAdults > 0 && potentialPerDay > 0
      && provisions >= (practitioners + 1) * SECT_FOOD_PER_DISCIPLE_DAY * 30,
    recruitedTotal: sect.economy?.recruited ?? null, sinceDay: sect.economy?.sinceDay ?? null,
    measuredDay: measured ? sect.economy.lastDay : null };
}

export function canSupportRecruitment(world, sect) {
  return !!sect && sect.destroyedDay < 0 && sectSupplyStatus(world, sect).canRecruit;
}

export function ensureSectEconomy(sect) {
  const e = sect.economy || (sect.economy = {});
  for (const key of ['supplied', 'consumed', 'unmet', 'foodTransferred', 'recruited', 'unfedDays']) {
    if (!Number.isFinite(e[key]) || e[key] < 0) e[key] = 0;
  }
  return e;
}

function add(economy, key, amount) {
  economy[key] = Math.min(COUNTER_CAP, economy[key] + amount);
}

function recordAdmission(world, sect) {
  const economy = ensureSectEconomy(sect);
  if (!Number.isFinite(economy.sinceDay)) economy.sinceDay = world.day;
  add(economy, 'recruited', 1);
  economy.lastRecruitDay = world.day;
}

/** Village protection is civil affiliation, not automatic disciple recruitment. */
export function affiliateSectResident(world, entity, sect) {
  if (!sect || !entity || sect.destroyedDay >= 0 || entity.faction || !world.entities.includes(entity)
    || !living(entity)) return false;
  if (isMortalHuman(entity)) {
    entity.faction = sect.id;
    return true;
  }
  if (!isPracticingHuman(entity) || !canSupportRecruitment(world, sect)) return false;
  entity.faction = sect.id;
  recordAdmission(world, sect);
  return true;
}

/** Called once at a formal successful awakening; civil affiliation is not entry. */
export function recordSectDisciple(world, entity) {
  if (!isPracticingHuman(entity) || !living(entity)) return false;
  const sect = world.factionById(entity.faction);
  if (!sect || sect.destroyedDay >= 0) return false;
  // Awakening callers already have the new practitioner in this faction.
  // Unlike recruiting a lone cultivator, no extra hypothetical person is due.
  const supply = sectSupplyStatus(world, sect);
  const provisionNeed = supply.practitioners * SECT_FOOD_PER_DISCIPLE_DAY * 30;
  if (!(supply.mortalAdults > 0 && supply.potentialPerDay > 0
    && sect.resources.provisions >= provisionNeed)) {
    // Residence and protection may predate actual entry into cultivation.
    // A hungry sect cannot turn that old civil affiliation into a new disciple.
    entity.faction = 0;
    return false;
  }
  recordAdmission(world, sect);
  return true;
}

/** Real tribute, then finite upkeep. No entity creation or direct hunger damage. */
export function stepSectEconomy(world, sect, dtDays, societies = villageSocieties(world)) {
  if (!(dtDays > 0)) return;
  const economy = ensureSectEconomy(sect);
  if (!Number.isFinite(economy.sinceDay)) economy.sinceDay = world.day - dtDays;
  let supplied = 0;
  for (const village of world.villages) {
    if (village.faction !== sect.id || !sect.villages.includes(village.id)) continue;
    const s = withSupply(world, village, societies.get(village.id) || emptySociety());
    const amount = Math.max(0, Math.min(s.surplusFood / FOOD_PER_PROVISION,
      s.tributePerDay * dtDays, 9999 - sect.resources.provisions));
    village.food -= amount * FOOD_PER_PROVISION;
    sect.resources.provisions += amount;
    supplied += amount;
  }
  const demand = members(world, sect) * SECT_FOOD_PER_DISCIPLE_DAY * dtDays;
  const consumed = Math.min(Math.max(0, sect.resources.provisions), demand);
  sect.resources.provisions -= consumed;
  add(economy, 'supplied', supplied);
  add(economy, 'foodTransferred', supplied * FOOD_PER_PROVISION);
  add(economy, 'consumed', consumed);
  add(economy, 'unmet', demand - consumed);
  economy.unfedDays = consumed + 1e-12 < demand ? Math.min(COUNTER_CAP, economy.unfedDays + dtDays) : 0;
  economy.lastDay = world.day;
  economy.lastSupplied = supplied;
  economy.lastConsumed = consumed;
  economy.lastDt = dtDays;
}
