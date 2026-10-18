import { STRUCT } from '../core/config.js';

// Shallow surface water is useful to fields; sustained water at this depth is
// visibly inundating a settlement tile.
export const SETTLEMENT_FLOOD_DEPTH = 0.02;
export const HOUSE_FLOOD_DAYS = 12;

export function isDryBuildableSettlementTile(world, index) {
  return world.isBuildable(index) && world.water[index] < SETTLEMENT_FLOOD_DEPTH;
}

// House records are historical anchors. Renderers and flood damage must read
// the current structure rather than the type stored when the house was built.
export function liveSettlementHouseType(world, house) {
  if (!house || house.floodRuined || !Number.isFinite(house.x) || !Number.isFinite(house.y)) return STRUCT.NONE;
  const x = Math.floor(house.x);
  const y = Math.floor(house.y);
  if (!world.inside(x, y)) return STRUCT.NONE;
  const type = world.struct[world.idx(x, y)];
  return type === STRUCT.HOUSE || type === STRUCT.HALL ? type : STRUCT.NONE;
}
