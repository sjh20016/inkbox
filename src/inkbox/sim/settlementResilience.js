import { OVER, markDirty, recomputeRect, slopeAt } from '../world/terrain.js';
import { isHabitableSettlementCenter, liveSettlementHouseType, SETTLEMENT_FLOOD_DEPTH } from '../world/settlementState.js';

export const LOCAL_HISTORY_LIMIT = 16;
export const SETTLEMENT_RUINS_LIMIT = 80;

export function settlementHistory(world, village, type, text, faction = null) {
  const history = village.history || (village.history = []);
  history.push({ day: world.day, type, text, settlementId: village.id,
    factionId: faction?.id || 0, factionName: faction?.name || null });
  if (history.length > LOCAL_HISTORY_LIMIT) history.splice(0, history.length - LOCAL_HISTORY_LIMIT);
}

export function ruinSettlementHouse(world, village, housePredicate = () => true) {
  const house = village.houses?.find((h) => liveSettlementHouseType(world, h) && housePredicate(h));
  if (!house) return false;
  const index = world.idx(Math.floor(house.x), Math.floor(house.y));
  house.ruinedBySettlement = true;
  world.struct[index] = 5;
  world.over[index] = OVER.RUINS;
  markDirty(world, index);
  recomputeRect(world, Math.floor(house.x), Math.floor(house.y), Math.floor(house.x), Math.floor(house.y));
  return true;
}

export function damageSettlement(world, village, {
  hp = 0, food = 0, reason = '灾害', ruinHouse = false, housePredicate,
} = {}) {
  if (!village || !world.villageById(village.id)) return false;
  for (const house of village.houses || []) {
    if (!housePredicate || !housePredicate(house)) continue;
    const x = Math.floor(house.x);
    const y = Math.floor(house.y);
    if (!world.inside(x, y)) continue;
    const index = world.idx(x, y);
    // The brush may already have removed a house (meteor) or left a ruin
    // (earthquake). Keep that old anchor from claiming a later new building.
    if (world.struct[index] !== 1 && world.struct[index] !== 2) house.ruinedBySettlement = true;
  }
  village.hp = Math.max(0, Math.min(100, village.hp - Math.max(0, hp)));
  if (village.hp < 60) village.recoveryRecorded = false;
  village.food = Math.max(0, village.food - Math.max(0, food));
  village.lastDamageDay = world.day;
  village.lastDamageReason = reason;
  if (ruinHouse) ruinSettlementHouse(world, village, housePredicate);
  if (!village.damageEpisode || world.day - village.damageEpisode > 360) {
    settlementHistory(world, village, 'disaster', `${reason}，聚落受损`);
    village.damageEpisode = world.day;
  }
  return true;
}

export function repairSettlementHouse(world, village) {
  for (const house of village.houses) {
    if (!house.ruinedBySettlement && !house.floodRuined) continue;
    const x = Math.floor(house.x);
    const y = Math.floor(house.y);
    if (!world.inside(x, y)) continue;
    const index = world.idx(x, y);
    if (world.struct[index] !== 5 || world.over[index] !== OVER.RUINS
      || !world.isWalkable(index) || world.fire[index] > 0.4
      || world.water[index] >= SETTLEMENT_FLOOD_DEPTH
      || world.height[index] > 0.62 || slopeAt(world, x, y) > 0.076) continue;
    world.struct[index] = house.type === 2 ? 2 : 1;
    world.over[index] = OVER.NONE;
    delete house.ruinedBySettlement;
    delete house.floodRuined;
    delete house.floodDays;
    markDirty(world, index);
    recomputeRect(world, x, y, x, y);
    return true;
  }
  return false;
}

export function aidSettlement(world, village, dtDays = 0) {
  const month = Math.floor(world.day / 30);
  const first = Math.max(
    Number.isInteger(village.lastAidMonth) ? village.lastAidMonth + 1
      : Math.floor((world.day - dtDays) / 30) + 1,
    Number.isFinite(village.foundedDay) ? Math.floor(village.foundedDay / 30) + 1 : 0,
    Number.isFinite(village.lastDamageDay) ? Math.floor(village.lastDamageDay / 30) : 0,
  );
  if (first > month) return;
  village.lastAidMonth = month;
  const sect = village.faction ? world.factionById(village.faction) : null;
  if (!sect || sect.destroyedDay >= 0 || !sect.villages?.includes(village.id)
    || sect.stability < 25 || sect.pop < 1 || sect.war?.size > 0 || village.pop <= 0) return;
  const center = world.idx(Math.floor(village.x), Math.floor(village.y));
  if (!isHabitableSettlementCenter(world, center)) return;
  const resources = sect.resources;
  if (!resources) return;
  for (let m = first; m <= month; m += 1) {
    const strained = village.hp < 75 || village.food < 25
      || village.houses.some((h) => h.ruinedBySettlement || h.floodRuined);
    if (!strained) break;
    let spentFood = 0;
    let spentStone = 0;
    if (village.food < 40 && resources.provisions >= 4) {
      resources.provisions -= 4;
      village.food = Math.min(400, village.food + 12);
      spentFood = 4;
    }
    if (village.hp < 90 && resources.spiritStone >= 2) {
      resources.spiritStone -= 2;
      village.hp = Math.min(100, village.hp + 7);
      repairSettlementHouse(world, village);
      spentStone = 2;
    }
    if (!spentFood && !spentStone) break;
    village.lastAidDay = m * 30;
    village.aidSpentProvisions = (village.aidSpentProvisions || 0) + spentFood;
    village.aidSpentSpiritStone = (village.aidSpentSpiritStone || 0) + spentStone;
    village.lastFactionId = sect.id;
    village.lastFactionName = sect.name;
    village.lastAidFactionId = sect.id;
    village.lastAidFactionName = sect.name;
    if (!village.aidEpisode || world.day - village.aidEpisode > 360) {
      settlementHistory(world, village, 'aid', `${sect.name}调拨物资援助`, sect);
      village.aidEpisode = world.day;
    }
  }
}

export function archiveSettlement(world, village, reason) {
  const sect = world.factionById(village.faction);
  settlementHistory(world, village, 'abandoned', `聚落荒废：${reason}`, sect);
  const ruins = world.settlementRuins || (world.settlementRuins = []);
  ruins.push({ id: village.id, name: village.name, x: village.x, y: village.y,
    plane: world.plane || 'mortal', foundedDay: village.foundedDay ?? null,
    level: village.level || 1, destroyedDay: world.day, reason,
    ruinedHouses: village.houses.length,
    lastFactionId: sect?.id || village.lastFactionId || 0,
    lastFactionName: sect?.name || village.lastFactionName || null,
    lastAidDay: village.lastAidDay ?? -1,
    lastAidFactionId: village.lastAidFactionId || 0,
    lastAidFactionName: village.lastAidFactionName || null,
    history: village.history.slice(-LOCAL_HISTORY_LIMIT) });
  if (ruins.length > SETTLEMENT_RUINS_LIMIT) ruins.splice(0, ruins.length - SETTLEMENT_RUINS_LIMIT);
}
