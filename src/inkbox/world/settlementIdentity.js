// Render aliases never enter world.sites or its exploration/reward lifecycle.
const RUIN_PREFIX = 'settlement-ruin:';

export function settlementRuinMarkerId(id) {
  return `${RUIN_PREFIX}${id}`;
}

export function settlementRuinForMarker(world, markerId) {
  if (typeof markerId !== 'string' || !markerId.startsWith(RUIN_PREFIX)) return null;
  return world?.settlementRuins?.find(ruin => settlementRuinMarkerId(ruin.id) === markerId) || null;
}

export function visibleSettlementRuins(world) {
  if (!world || (world.plane && world.plane !== 'mortal')) return [];
  return (world.settlementRuins || []).filter(ruin => settlementRuinIsVisible(world, ruin));
}

export function settlementRuinIsVisible(world, ruin) {
  return !!(world && (!world.plane || world.plane === 'mortal') && ruin && Number.isFinite(ruin.x)
    && Number.isFinite(ruin.y) && world.inside(Math.floor(ruin.x), Math.floor(ruin.y))
    && (!ruin.plane || ruin.plane === 'mortal')
    && !world.villages?.some(village => village.x === ruin.x && village.y === ruin.y));
}
