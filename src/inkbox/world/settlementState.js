import { STRUCT } from '../core/config.js';
import { OVER, slopeAt } from './terrain.js';

// Shared read-only settlement facts; presentation does not import simulation.

// Shallow surface water is useful to fields; sustained water at this depth is
// visibly inundating a settlement tile.
export const SETTLEMENT_FLOOD_DEPTH = 0.02;
export const HOUSE_FLOOD_DAYS = 12;

export function isDryBuildableSettlementTile(world, index) {
  return world.isBuildable(index) && world.over[index] === OVER.NONE
    && world.water[index] < SETTLEMENT_FLOOD_DEPTH;
}

export function isHabitableSettlementCenter(world, index) {
  if (index < 0 || index >= world.size || !world.isWalkable(index)
    || world.fire[index] > 0.4 || world.water[index] >= SETTLEMENT_FLOOD_DEPTH
    || world.height[index] > 0.62) return false;
  return slopeAt(world, index % world.w, Math.floor(index / world.w)) <= 0.076;
}

// House records are historical anchors. Renderers and flood damage must read
// the current structure rather than the type stored when the house was built.
export function liveSettlementHouseType(world, house) {
  if (!house || house.floodRuined || house.ruinedBySettlement
    || !Number.isFinite(house.x) || !Number.isFinite(house.y)) return STRUCT.NONE;
  const x = Math.floor(house.x);
  const y = Math.floor(house.y);
  if (!world.inside(x, y)) return STRUCT.NONE;
  const type = world.struct[world.idx(x, y)];
  return type === STRUCT.HOUSE || type === STRUCT.HALL ? type : STRUCT.NONE;
}

export function settlementCondition(world, village) {
  if (!village) return null;
  const ruin = Number.isFinite(village.destroyedDay);
  const liveHouses = ruin ? 0 : (village.houses || []).reduce((n, house) =>
    n + (liveSettlementHouseType(world, house) ? 1 : 0), 0);
  const ruinedHouses = ruin ? (village.ruinedHouses || 0)
    : (village.houses?.length || 0) - liveHouses;
  const activeCrises = ruin ? 0 : (world.worldEventState?.activeCrises || [])
    .filter((c) => c.villageId === village.id && c.status === 'active').length;
  const index = world.inside(Math.floor(village.x), Math.floor(village.y))
    ? world.idx(Math.floor(village.x), Math.floor(village.y)) : -1;
  const unsafe = !ruin && !isHabitableSettlementCenter(world, index);
  const reasons = [];
  if (activeCrises) reasons.push('灾祸未平');
  if (unsafe) reasons.push('村址不可居');
  if (!ruin && village.pop <= 0) reasons.push('没有居民');
  if (!ruin && village.food < 12) reasons.push('存粮不足');
  if (!ruin && !liveHouses && village.age > 90) reasons.push('无可用房屋');
  const status = ruin ? 'ruins' : activeCrises || unsafe ? 'disaster'
    : village.hp < 25 || village.pop <= 0 ? 'declining'
      : village.hp < 80 || ruinedHouses > 0 ? 'recovering' : 'normal';
  return { status, reasons, hp: village.hp ?? 0, pop: village.pop ?? 0,
    food: village.food ?? 0, liveHouses, ruinedHouses, activeCrises,
    hasAid: Number.isFinite(village.lastAidDay) && village.lastAidDay >= 0,
    lastAidDay: village.lastAidDay ?? -1,
    aidSpentProvisions: village.aidSpentProvisions || 0,
    aidSpentSpiritStone: village.aidSpentSpiritStone || 0 };
}
